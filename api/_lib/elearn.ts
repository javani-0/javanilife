import type { DecodedIdToken } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "./firebase-admin.js";
import { createRazorpayClient, getRazorpayCurrency } from "./razorpay.js";
import {
  computeExpiresAt,
  clampAccessDays,
  ELEARN_COURSES,
  ELEARN_ENROLLMENTS,
  elearnDocId,
  hasActiveAccess,
  toMillis,
  type ElearnPaymentMethod,
  type PaymentModes,
} from "./elearn-core.js";

// ---------------------------------------------------------------------------
// E-Learning server logic shared by api/_razorpay/elearn.ts (the four actions)
// and the Razorpay webhook. Enrollment docs are written ONLY here (Admin SDK);
// the Firestore rules forbid every client write to elearnEnrollments.
// ---------------------------------------------------------------------------

/** An error that maps straight to an HTTP status in the handlers. */
export class ElearnError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export interface SaleCourse {
  id: string;
  title: string;
  status: string;
  priceInPaise: number;
  paymentModes: PaymentModes;
  accessDays: number;
}

/** The money-relevant fields of a course, read from Firestore (never the client). */
export const loadSaleCourse = async (db: Firestore, courseId: string): Promise<SaleCourse | null> => {
  if (!courseId || courseId.includes("/")) return null;
  const snapshot = await db.collection(ELEARN_COURSES).doc(courseId).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() || {};
  const modes = (data.paymentModes || {}) as Partial<PaymentModes>;
  return {
    id: snapshot.id,
    title: String(data.title || "").trim() || snapshot.id,
    status: String(data.status || "draft"),
    priceInPaise: Math.max(0, Math.round(Number(data.priceInPaise) || 0)),
    paymentModes: { razorpay: modes.razorpay !== false, upi: modes.upi === true },
    accessDays: clampAccessDays(data.accessDays),
  };
};

export interface BuyerIdentity {
  userName: string;
  userEmail: string;
  userPhone: string;
}

/** Name / email / phone for the admin's purchase list: users/{uid} first, then the token or auth record. */
export const loadBuyerIdentity = async (
  db: Firestore,
  uid: string,
  fallback?: { name?: string; email?: string; phone?: string },
): Promise<BuyerIdentity> => {
  const profile = (await db.doc(`users/${uid}`).get()).data() || {};
  const pick = (...values: unknown[]) => String(values.find((value) => typeof value === "string" && value.trim()) || "").trim();
  return {
    userName: pick(profile.username, profile.name, fallback?.name).slice(0, 120),
    userEmail: pick(profile.email, fallback?.email).slice(0, 200),
    userPhone: pick(profile.phone, profile.whatsappNumber, fallback?.phone).slice(0, 30),
  };
};

export const identityFromToken = (decoded: DecodedIdToken) => ({
  name: typeof decoded.name === "string" ? decoded.name : "",
  email: typeof decoded.email === "string" ? decoded.email : "",
  phone: typeof decoded.phone_number === "string" ? decoded.phone_number : "",
});

export const enrollmentRef = (db: Firestore, uid: string, courseId: string) =>
  db.collection(ELEARN_ENROLLMENTS).doc(elearnDocId(uid, courseId));

export interface ActivationInput {
  uid: string;
  course: Pick<SaleCourse, "id" | "title" | "accessDays">;
  method: ElearnPaymentMethod;
  amountInPaise: number;
  identity?: BuyerIdentity;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  reviewedBy?: string;
  /** Staff grant only: override the course's access days (0 = lifetime). */
  accessDaysOverride?: number;
  /** Activate only if the stored status is one of these (checked inside the transaction). */
  requireStatus?: string[];
  /** Never activate over these stored statuses; a Razorpay payment is kept in extraPaymentIds for a refund. */
  blockStatus?: string[];
}

export interface ActivationResult {
  enrollmentId: string;
  alreadyActive: boolean;
  /** ms since epoch, or null for lifetime. */
  expiresAtMs: number | null;
  /** The enrollment status after this call. */
  status: string;
}

/**
 * Turn an enrollment ACTIVE. Idempotent and race-safe (one transaction):
 * • an enrollment that already has access is never changed (never downgraded,
 *   expiry never shortened); a second, different Razorpay payment is only
 *   noted in `extraPaymentIds` so staff can refund it;
 * • the same Razorpay payment can never activate twice (e.g. a webhook replay
 *   after the access expired).
 */
export const activateEnrollment = async (db: Firestore, input: ActivationInput): Promise<ActivationResult> => {
  const ref = enrollmentRef(db, input.uid, input.course.id);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const existing = snapshot.exists ? snapshot.data() || {} : null;
    const paymentId = input.razorpayPaymentId || "";
    const usedPaymentIds: string[] = Array.isArray(existing?.razorpayPaymentIds) ? existing.razorpayPaymentIds : [];

    if (existing && paymentId && usedPaymentIds.includes(paymentId)) {
      return {
        enrollmentId: ref.id,
        alreadyActive: hasActiveAccess(existing),
        expiresAtMs: toMillis(existing.expiresAt),
        status: String(existing.status || ""),
      };
    }

    if (existing && hasActiveAccess(existing)) {
      if (paymentId) {
        tx.update(ref, {
          extraPaymentIds: FieldValue.arrayUnion(paymentId),
          razorpayPaymentIds: FieldValue.arrayUnion(paymentId),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      return { enrollmentId: ref.id, alreadyActive: true, expiresAtMs: toMillis(existing.expiresAt), status: "active" };
    }

    const storedStatus = existing ? String(existing.status || "") : "";
    if (input.requireStatus && !input.requireStatus.includes(storedStatus)) {
      throw new ElearnError(409, "This purchase changed meanwhile. Refresh and try again.");
    }
    if (existing && input.blockStatus?.includes(storedStatus)) {
      if (paymentId) {
        tx.update(ref, {
          extraPaymentIds: FieldValue.arrayUnion(paymentId),
          razorpayPaymentIds: FieldValue.arrayUnion(paymentId),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      return { enrollmentId: ref.id, alreadyActive: false, expiresAtMs: null, status: storedStatus };
    }

    const days = clampAccessDays(input.accessDaysOverride !== undefined ? input.accessDaysOverride : input.course.accessDays);
    const expiresAt = computeExpiresAt(days, new Date());
    const record: Record<string, unknown> = {
      uid: input.uid,
      courseId: input.course.id,
      courseTitle: input.course.title,
      status: "active",
      method: input.method,
      amountInPaise: Math.max(0, Math.round(input.amountInPaise)),
      activatedAt: FieldValue.serverTimestamp(),
      expiresAt,
      rejectReason: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (input.identity) Object.assign(record, input.identity);
    if (input.razorpayOrderId) record.razorpayOrderId = input.razorpayOrderId;
    if (paymentId) {
      record.razorpayPaymentId = paymentId;
      record.razorpayPaymentIds = FieldValue.arrayUnion(paymentId);
    }
    if (input.reviewedBy) {
      record.reviewedBy = input.reviewedBy;
      record.reviewedAt = FieldValue.serverTimestamp();
    }
    if (!snapshot.exists) record.createdAt = FieldValue.serverTimestamp();
    if (storedStatus && storedStatus !== "active") record.previousStatus = storedStatus;
    tx.set(ref, record, { merge: true });
    return { enrollmentId: ref.id, alreadyActive: false, expiresAtMs: expiresAt ? expiresAt.getTime() : null, status: "active" };
  });
};

interface RazorpayEntity {
  id?: string;
  order_id?: string;
  amount?: number | string;
  currency?: string;
  status?: string;
  notes?: Record<string, unknown> | unknown[];
}

const notesOf = (entity: RazorpayEntity | null | undefined): Record<string, string> => {
  const notes = entity?.notes;
  if (!notes || Array.isArray(notes) || typeof notes !== "object") return {};
  return Object.fromEntries(Object.entries(notes).map(([key, value]) => [key, String(value ?? "")]));
};

/**
 * Activate from a Razorpay payment after checking it against OUR order (which
 * this server created with the course price from Firestore):
 * payment.order_id matches, the order is an "elearn" order for this uid +
 * course, amount and currency equal the order's, status captured/authorized.
 * `expected` pins the uid/course for the signed-in verify call.
 */
export const activateFromRazorpay = async (
  db: Firestore,
  args: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    payment?: RazorpayEntity;
    expected?: { uid: string; courseId: string };
  },
): Promise<ActivationResult> => {
  const razorpay = createRazorpayClient();
  const payment = (args.payment && args.payment.id === args.razorpayPaymentId && args.payment.order_id
    ? args.payment
    : await razorpay.payments.fetch(args.razorpayPaymentId)) as RazorpayEntity;
  if (payment.order_id !== args.razorpayOrderId) throw new ElearnError(409, "Razorpay payment does not belong to this order.");

  const order = (await razorpay.orders.fetch(args.razorpayOrderId)) as RazorpayEntity;
  const notes = notesOf(order);
  const uid = notes.uid || "";
  const courseId = notes.courseId || "";
  if (notes.kind !== "elearn" || !uid || !courseId) throw new ElearnError(409, "This is not a course purchase order.");
  if (args.expected && (args.expected.uid !== uid || args.expected.courseId !== courseId)) {
    throw new ElearnError(403, "This payment belongs to another purchase.");
  }

  const currency = getRazorpayCurrency().toUpperCase();
  const orderAmount = Math.round(Number(order.amount));
  if (!Number.isFinite(orderAmount) || orderAmount <= 0
    || Math.round(Number(payment.amount)) !== orderAmount
    || String(payment.currency || "").toUpperCase() !== currency
    || String(order.currency || "").toUpperCase() !== currency) {
    throw new ElearnError(409, "Razorpay payment amount does not match the order.");
  }
  let paymentStatus = String(payment.status || "");
  if (paymentStatus === "authorized") {
    // Only captured money unlocks a course: an authorized payment that is never
    // captured is auto-refunded by Razorpay, so capture it now.
    const captured = (await razorpay.payments.capture(args.razorpayPaymentId, orderAmount, currency)) as RazorpayEntity;
    paymentStatus = String(captured?.status || "");
  }
  if (paymentStatus !== "captured") {
    throw new ElearnError(409, "Razorpay payment is not successful yet.");
  }

  const course = await loadSaleCourse(db, courseId);
  const stored = (await enrollmentRef(db, uid, courseId).get()).data() || {};
  const identity = await loadBuyerIdentity(db, uid, {
    name: String(stored.userName || ""),
    email: String(stored.userEmail || ""),
    phone: String(stored.userPhone || ""),
  });
  return activateEnrollment(db, {
    uid,
    // A course deleted after payment still activates (the money was taken).
    course: course || { id: courseId, title: String(stored.courseTitle || courseId), accessDays: 0 },
    method: "razorpay",
    amountInPaise: orderAmount,
    identity,
    razorpayOrderId: args.razorpayOrderId,
    razorpayPaymentId: args.razorpayPaymentId,
    // Staff revoked this student: the money is noted for a refund, no access.
    blockStatus: ["revoked"],
  });
};

/** Webhook `payment.captured` for an elearn order (backup to elearn-verify). The ORDER's
 *  notes (written by this server) decide uid + course; the payment's notes are not trusted. */
export const activateElearnFromWebhook = async (db: Firestore, payment: RazorpayEntity) => {
  if (!payment?.id || !payment.order_id) return null;
  return activateFromRazorpay(db, {
    razorpayOrderId: payment.order_id,
    razorpayPaymentId: payment.id,
    payment,
  });
};

/**
 * Webhook `refund.processed`: a FULL refund of the payment that unlocked a
 * course revokes that access (a partial refund leaves it alone).
 */
export const revokeElearnForRefund = async (
  db: Firestore,
  refund: { payment_id?: string; amount?: number | string } | null | undefined,
) => {
  const paymentId = String(refund?.payment_id || "");
  if (!paymentId) return null;
  const matches = await db.collection(ELEARN_ENROLLMENTS).where("razorpayPaymentId", "==", paymentId).limit(1).get();
  if (matches.empty) return null;
  const ref = matches.docs[0].ref;
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const data = snapshot.data();
    if (!data || data.status !== "active" || data.method !== "razorpay" || data.razorpayPaymentId !== paymentId) return null;
    const paid = Math.round(Number(data.amountInPaise) || 0);
    const refunded = Math.round(Number(refund?.amount) || 0);
    if (paid > 0 && refunded < paid) return null;
    tx.update(ref, {
      status: "revoked",
      previousStatus: "active",
      rejectReason: "Payment refunded",
      refundedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { enrollmentId: ref.id };
  });
};
