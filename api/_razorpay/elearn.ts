import type { Firestore } from "firebase-admin/firestore";
import { getFirebaseAdminAuth, getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { createRazorpayClient, getRazorpayCredentials, getRazorpayCurrency, verifyRazorpaySignature } from "../_lib/razorpay.js";
import { isStaffForPage } from "../_lib/staff.js";
import { createHash } from "node:crypto";
import { computeElearnCouponDiscount, loadCouponByCode, normalizeCouponCodeServer } from "../_lib/coupons.js";
import {
  availablePaymentModes,
  clampAccessDays,
  ELEARN_UPI_PROOFS,
  ELEARN_UPI_REFS,
  hasActiveAccess,
  isAllowedProofUrl,
  normalizeUpiUtr,
  type UpiSettingsLike,
} from "../_lib/elearn-core.js";
import {
  activateEnrollment,
  activateFromRazorpay,
  ElearnError,
  enrollmentRef,
  identityFromToken,
  loadBuyerIdentity,
  loadSaleCourse,
} from "../_lib/elearn.js";

// ---------------------------------------------------------------------------
// E-Learning actions (routed by api/razorpay.ts — no extra Vercel function):
//   POST /api/razorpay/elearn-coupon      { courseId, couponCode }  (price preview)
//   POST /api/razorpay/elearn-order       { courseId, couponCode? }
//   POST /api/razorpay/elearn-verify      { courseId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
//   POST /api/razorpay/elearn-submit-upi  { courseId, proofUrl, upiRef, couponCode? }  (upiRef = 12-digit UTR)
//   POST /api/razorpay/elearn-review      staff: approve | reject | revoke | grant
// Every amount comes from Firestore; the client only names the course.
// ---------------------------------------------------------------------------

export type ElearnAction = "elearn-coupon" | "elearn-order" | "elearn-verify" | "elearn-submit-upi" | "elearn-review";

const isFirebaseAuthError = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  return code.startsWith("auth/");
};

const cleanId = (value: unknown, max = 200) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= max && !text.includes("/") ? text : "";
};

const loadUpiSettings = async (db: Firestore): Promise<UpiSettingsLike | null> => {
  const snapshot = await db.doc("siteSettings/payment").get();
  return snapshot.exists ? (snapshot.data() as UpiSettingsLike) : null;
};

const toIso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

// Coupon on a course price: always re-checked on the server, so the amount the
// buyer pays (Razorpay order / UPI record) can never be lowered by the client.
interface PricedCourse { priceInPaise: number; couponCode: string | null; discountInPaise: number; finalInPaise: number }
const priceWithCoupon = async (db: Firestore, course: { id: string; priceInPaise: number }, rawCode: unknown): Promise<PricedCourse> => {
  const code = typeof rawCode === "string" ? normalizeCouponCodeServer(rawCode.slice(0, 60)) : "";
  if (!code) return { priceInPaise: course.priceInPaise, couponCode: null, discountInPaise: 0, finalInPaise: course.priceInPaise };
  const coupon = await loadCouponByCode(db, code);
  if (!coupon) throw new ElearnError(400, "This coupon code is not valid.");
  const result = computeElearnCouponDiscount(coupon, course.priceInPaise, { courseId: course.id });
  if (result.discountInPaise <= 0) throw new ElearnError(400, result.reason || "This coupon can't be used for this master class.");
  return {
    priceInPaise: course.priceInPaise,
    couponCode: coupon.code,
    discountInPaise: result.discountInPaise,
    finalInPaise: course.priceInPaise - result.discountInPaise,
  };
};

const previewCoupon = async (db: Firestore, body: Record<string, unknown>) => {
  const courseId = cleanId(body.courseId, 120);
  const course = courseId ? await loadSaleCourse(db, courseId) : null;
  if (!course || course.status !== "published" || course.priceInPaise <= 0) throw new ElearnError(404, "This master class is not available.");
  const priced = await priceWithCoupon(db, course, body.couponCode);
  if (!priced.couponCode) throw new ElearnError(400, "Enter a coupon code.");
  return { ok: true as const, ...priced };
};

// ── elearn-order ───────────────────────────────────────────────────────────
const createOrder = async (db: Firestore, uid: string, identity: ReturnType<typeof identityFromToken>, body: Record<string, unknown>) => {
  const courseId = cleanId(body.courseId, 120);
  const course = courseId ? await loadSaleCourse(db, courseId) : null;
  if (!course || course.status !== "published") throw new ElearnError(404, "This master class is not available.");
  if (course.priceInPaise <= 0) throw new ElearnError(400, "This master class cannot be bought online.");
  if (!availablePaymentModes(course, null).razorpay) throw new ElearnError(400, "Online payment is not available for this master class.");

  const ref = enrollmentRef(db, uid, course.id);
  const before = (await ref.get()).data();
  if (before && hasActiveAccess(before)) throw new ElearnError(409, "You already have access to this master class.");
  if (before?.status === "revoked") throw new ElearnError(403, "Your access to this master class was removed. Please contact us.");

  const priced = await priceWithCoupon(db, course, body.couponCode);
  const currency = getRazorpayCurrency();
  const order = await createRazorpayClient().orders.create({
    amount: priced.finalInPaise,
    currency,
    receipt: `el_${Date.now().toString(36)}_${uid.slice(0, 8)}`.slice(0, 40),
    notes: { kind: "elearn", uid, courseId: course.id, ...(priced.couponCode ? { couponCode: priced.couponCode } : {}) },
  });

  const buyer = await loadBuyerIdentity(db, uid, identity);
  // Re-read inside a transaction: a payment (verify/webhook) or a staff action
  // may have landed while the Razorpay order was being created.
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const existing = snapshot.exists ? snapshot.data() || {} : null;
    if (existing && hasActiveAccess(existing)) throw new ElearnError(409, "You already have access to this master class.");
    if (existing?.status === "revoked") throw new ElearnError(403, "Your access to this master class was removed. Please contact us.");
    const keepStatus = existing?.status === "processing" || existing?.status === "active";
    tx.set(ref, {
      uid,
      courseId: course.id,
      courseTitle: course.title,
      ...buyer,
      // A pending QR proof stays visible to staff (and an expired "active" keeps
      // its history); otherwise mark the new attempt.
      ...(keepStatus ? {} : { status: "awaiting-payment" }),
      ...(existing?.status === "rejected" ? { previousStatus: "rejected" } : {}),
      razorpayOrderId: order.id,
      razorpayOrderAmountInPaise: priced.finalInPaise,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
  });

  return {
    keyId: getRazorpayCredentials().keyId,
    orderId: order.id,
    amount: priced.finalInPaise,
    currency,
    enrollmentId: ref.id,
    courseTitle: course.title,
  };
};

// ── elearn-verify ──────────────────────────────────────────────────────────
const verify = async (db: Firestore, uid: string, body: Record<string, unknown>) => {
  const courseId = cleanId(body.courseId, 120);
  const razorpayOrderId = cleanId(body.razorpay_order_id, 80);
  const razorpayPaymentId = cleanId(body.razorpay_payment_id, 80);
  const razorpaySignature = cleanId(body.razorpay_signature, 200);
  if (!courseId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw new ElearnError(400, "Missing payment details.");
  }
  if (!verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature })) {
    throw new ElearnError(400, "Payment signature could not be verified.");
  }
  const result = await activateFromRazorpay(db, {
    razorpayOrderId,
    razorpayPaymentId,
    expected: { uid, courseId },
  });
  if (result.status !== "active") {
    throw new ElearnError(403, "Payment received, but your access to this master class was removed. Please contact us for a refund.");
  }
  return {
    verified: true,
    status: "active" as const,
    enrollmentId: result.enrollmentId,
    expiresAt: toIso(result.expiresAtMs),
    ...(result.alreadyActive ? { alreadyActive: true } : {}),
  };
};

// ── elearn-submit-upi ──────────────────────────────────────────────────────
const submitUpi = async (db: Firestore, uid: string, identity: ReturnType<typeof identityFromToken>, body: Record<string, unknown>) => {
  const courseId = cleanId(body.courseId, 120);
  const proofUrl = typeof body.proofUrl === "string" ? body.proofUrl.trim() : "";
  const upiRef = normalizeUpiUtr(body.upiRef);
  if (!isAllowedProofUrl(proofUrl)) throw new ElearnError(400, "Please upload the payment screenshot again.");
  if (!upiRef) throw new ElearnError(400, "Enter the 12-digit UTR / UPI reference number from your payment app.");
  const cleanProofUrl = new URL(proofUrl).href;
  const proofKey = createHash("sha256").update(cleanProofUrl).digest("hex");

  const course = courseId ? await loadSaleCourse(db, courseId) : null;
  if (!course || course.status !== "published") throw new ElearnError(404, "This master class is not available.");
  const priced = await priceWithCoupon(db, course, body.couponCode);
  const settings = await loadUpiSettings(db);
  if (!availablePaymentModes(course, settings).upi) throw new ElearnError(400, "QR payment is not available for this master class.");

  const ref = enrollmentRef(db, uid, course.id);
  const utrRef = db.collection(ELEARN_UPI_REFS).doc(upiRef);
  const proofRef = db.collection(ELEARN_UPI_PROOFS).doc(proofKey);
  const buyer = await loadBuyerIdentity(db, uid, identity);
  await db.runTransaction(async (tx) => {
    const [snapshot, utrSnap, proofSnap] = await Promise.all([tx.get(ref), tx.get(utrRef), tx.get(proofRef)]);
    const existing = snapshot.exists ? snapshot.data() || {} : null;
    if (existing && hasActiveAccess(existing)) throw new ElearnError(409, "You already have access to this master class.");
    if (existing?.status === "revoked") throw new ElearnError(403, "Your access to this master class was removed. Please contact us.");
    // One UPI payment can unlock only one purchase (resubmitting the same
    // payment for the same course after a rejection is fine).
    if (utrSnap.exists && utrSnap.data()?.enrollmentId !== ref.id) {
      throw new ElearnError(409, "This UTR number was already used for another purchase.");
    }
    if (proofSnap.exists && proofSnap.data()?.enrollmentId !== ref.id) {
      throw new ElearnError(409, "This screenshot was already used for another purchase. Upload your own payment screenshot.");
    }
    const claim = { enrollmentId: ref.id, uid, courseId: course.id, createdAt: FieldValue.serverTimestamp() };
    if (!utrSnap.exists) tx.set(utrRef, { ...claim, utr: upiRef });
    if (!proofSnap.exists) tx.set(proofRef, { ...claim, proofUrl: cleanProofUrl });
    tx.set(ref, {
      uid,
      courseId: course.id,
      courseTitle: course.title,
      ...buyer,
      status: "processing",
      method: "upi",
      amountInPaise: priced.finalInPaise,
      ...(priced.couponCode
        ? { couponCode: priced.couponCode, listPriceInPaise: priced.priceInPaise, discountInPaise: priced.discountInPaise }
        : { couponCode: FieldValue.delete(), listPriceInPaise: FieldValue.delete(), discountInPaise: FieldValue.delete() }),
      upiProofUrl: cleanProofUrl,
      upiRef,
      submittedAt: FieldValue.serverTimestamp(),
      ...(existing?.status === "rejected"
        ? { previousStatus: "rejected", previousRejectReason: String(existing.rejectReason || "") }
        : {}),
      rejectReason: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
  });
  return { ok: true as const, enrollmentId: ref.id, status: "processing" as const };
};

// ── elearn-review (staff) ──────────────────────────────────────────────────
const review = async (db: Firestore, staffUid: string, body: Record<string, unknown>) => {
  const staffData = (await db.doc(`users/${staffUid}`).get()).data();
  if (!isStaffForPage(staffData, "elearning")) throw new ElearnError(403, "Only staff with E-Learning access can do this.");
  const op = String(body.op || "");
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";

  if (op === "grant") {
    const courseId = cleanId(body.courseId, 120);
    const course = courseId ? await loadSaleCourse(db, courseId) : null;
    if (!course) throw new ElearnError(404, "Course not found.");
    let uid = cleanId(body.uid, 128);
    let fallback = { name: "", email: "", phone: "" };
    if (!uid) {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!email) throw new ElearnError(400, "Enter the student's email.");
      try {
        const user = await getFirebaseAdminAuth().getUserByEmail(email);
        uid = user.uid;
        fallback = { name: user.displayName || "", email: user.email || email, phone: user.phoneNumber || "" };
      } catch (error) {
        if ((error as { code?: string })?.code === "auth/user-not-found") {
          throw new ElearnError(404, "No account with this email. Ask the student to sign up first.");
        }
        throw error;
      }
    }
    const days = body.accessDays === undefined || body.accessDays === null || body.accessDays === ""
      ? undefined
      : clampAccessDays(body.accessDays);
    const result = await activateEnrollment(db, {
      uid,
      course,
      method: "grant",
      amountInPaise: 0,
      identity: await loadBuyerIdentity(db, uid, fallback),
      reviewedBy: staffUid,
      accessDaysOverride: days,
    });
    return { ok: true as const, enrollmentId: result.enrollmentId, status: "active" as const, ...(result.alreadyActive ? { alreadyActive: true } : {}) };
  }

  const enrollmentId = cleanId(body.enrollmentId, 260);
  if (!enrollmentId) throw new ElearnError(400, "Missing enrollment.");
  const ref = db.collection("elearnEnrollments").doc(enrollmentId);

  if (op === "approve") {
    const data = (await ref.get()).data();
    if (!data) throw new ElearnError(404, "Enrollment not found.");
    if (hasActiveAccess(data)) {
      return { ok: true as const, enrollmentId, status: "active" as const, alreadyActive: true };
    }
    if (data.status !== "processing") throw new ElearnError(409, "Only a payment waiting for review can be approved.");
    const course = (await loadSaleCourse(db, String(data.courseId || "")))
      || { id: String(data.courseId || ""), title: String(data.courseTitle || ""), accessDays: 0 };
    const result = await activateEnrollment(db, {
      uid: String(data.uid || ""),
      course,
      method: "upi",
      amountInPaise: Math.max(0, Math.round(Number(data.amountInPaise) || 0)),
      couponCode: typeof data.couponCode === "string" && data.couponCode ? data.couponCode : undefined,
      reviewedBy: staffUid,
      // Re-checked inside the transaction: a reject/revoke in another tab wins.
      requireStatus: ["processing"],
    });
    return { ok: true as const, enrollmentId: result.enrollmentId, status: "active" as const, ...(result.alreadyActive ? { alreadyActive: true } : {}) };
  }

  if (op === "reject" || op === "revoke") {
    const next = op === "reject" ? "rejected" : "revoked";
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const data = snapshot.data();
      if (!data) throw new ElearnError(404, "Enrollment not found.");
      if (op === "reject" && data.status !== "processing") {
        throw new ElearnError(409, data.status === "active" ? "This student already has access. Use Revoke instead." : "Only a payment waiting for review can be rejected.");
      }
      if (op === "revoke" && data.status !== "active") throw new ElearnError(409, "Only active access can be revoked.");
      tx.update(ref, {
        status: next,
        rejectReason: reason || FieldValue.delete(),
        reviewedBy: staffUid,
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return { ok: true as const, enrollmentId, status: next as "rejected" | "revoked" };
  }

  // Clear a revoked / rejected record so that account can buy the course again
  // (a revoked record otherwise blocks every new purchase). Used UTRs and proofs
  // stay blocked: they live in their own collections.
  if (op === "reopen") {
    await db.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data();
      if (!data) throw new ElearnError(404, "Enrollment not found.");
      if (data.status !== "revoked" && data.status !== "rejected") {
        throw new ElearnError(409, "Only a revoked or rejected record can be cleared.");
      }
      tx.delete(ref);
    });
    return { ok: true as const, enrollmentId, status: "reopened" as const };
  }

  throw new ElearnError(400, "Unknown review action.");
};

export default async function handler(request: ApiRequest, response: ApiResponse, action: ElearnAction) {
  if (!requirePost(request, response)) return;
  try {
    const token = getBearerToken(request);
    if (!token) {
      sendError(response, 401, "Missing Firebase authentication token.");
      return;
    }
    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    const body = (await readJsonBody<Record<string, unknown>>(request)) || {};
    const db = getFirebaseAdminDb();
    const identity = identityFromToken(decoded);

    if (action === "elearn-coupon") return sendJson(response, 200, await previewCoupon(db, body));
    if (action === "elearn-order") return sendJson(response, 200, await createOrder(db, decoded.uid, identity, body));
    if (action === "elearn-verify") return sendJson(response, 200, await verify(db, decoded.uid, body));
    if (action === "elearn-submit-upi") return sendJson(response, 200, await submitUpi(db, decoded.uid, identity, body));
    if (action === "elearn-review") return sendJson(response, 200, await review(db, decoded.uid, body));
    sendError(response, 404, "E-Learning route not found");
  } catch (error) {
    if (error instanceof ElearnError) {
      sendError(response, error.status, error.message);
      return;
    }
    if (isFirebaseAuthError(error)) {
      sendError(response, 401, "Please sign in again and retry.");
      return;
    }
    if (error instanceof SyntaxError) {
      sendError(response, 400, "Invalid request body.");
      return;
    }
    console.error(`[${action}]`, error);
    sendError(response, 500, "Something went wrong. Please try again.");
  }
}
