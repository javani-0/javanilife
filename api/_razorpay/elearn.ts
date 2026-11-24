import type { Firestore } from "firebase-admin/firestore";
import { getFirebaseAdminAuth, getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { createRazorpayClient, getRazorpayCredentials, getRazorpayCurrency, verifyRazorpaySignature } from "../_lib/razorpay.js";
import { isStaffForPage } from "../_lib/staff.js";
import { createHash } from "node:crypto";
import { computeElearnBundleDiscount, loadCouponByCode, normalizeCouponCodeServer } from "../_lib/coupons.js";
import {
  availablePaymentModes,
  clampAccessDays,
  ELEARN_ENROLLMENTS,
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
  type SaleCourse,
} from "../_lib/elearn.js";

// ---------------------------------------------------------------------------
// E-Learning actions (routed by api/razorpay.ts — no extra Vercel function):
//   POST /api/razorpay/elearn-coupon      { courseIds, couponCode }  (price preview)
//   POST /api/razorpay/elearn-order       { courseIds, couponCode? }  (total 0 → access at once, no payment)
//   POST /api/razorpay/elearn-verify      { courseIds, razorpay_order_id, razorpay_payment_id, razorpay_signature }
//   POST /api/razorpay/elearn-submit-upi  { courseIds, proofUrl, upiRef, couponCode? }  (upiRef = 12-digit UTR)
//   POST /api/razorpay/elearn-review      staff: approve | reject | revoke | reopen | grant
// courseIds = 1-5 master classes bought together (a single courseId still works).
// Every amount comes from Firestore; the client only names the courses.
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

// Coupon on the price: always re-checked on the server, so the amount the
// buyer pays (Razorpay order / UPI record) can never be lowered by the client.
// Several master classes can be bought together (one payment, one coupon).
const MAX_TOGETHER = 5;

const parseCourseIds = (body: Record<string, unknown>): string[] => {
  const raw = Array.isArray(body.courseIds) ? body.courseIds : [body.courseId];
  const ids = [...new Set(raw.map((value) => cleanId(value, 120)).filter(Boolean))];
  if (!ids.length) throw new ElearnError(400, "Choose a master class.");
  if (ids.length > MAX_TOGETHER) throw new ElearnError(400, `You can buy up to ${MAX_TOGETHER} master classes at once.`);
  return ids;
};

const loadForSale = async (db: Firestore, ids: string[]): Promise<SaleCourse[]> => {
  const courses = await Promise.all(ids.map((id) => loadSaleCourse(db, id)));
  return courses.map((course) => {
    if (!course || course.status !== "published" || course.priceInPaise <= 0) {
      throw new ElearnError(404, ids.length > 1
        ? "One of these master classes is not available now. Refresh the page and try again."
        : "This master class is not available.");
    }
    return course;
  });
};

const assertCanBuy = (existing: Record<string, unknown> | null | undefined, title: string, several: boolean) => {
  if (existing && hasActiveAccess(existing)) {
    throw new ElearnError(409, several ? `You already have access to "${title}". Remove it and try again.` : "You already have access to this master class.");
  }
  if (existing?.status === "revoked") {
    throw new ElearnError(403, several ? `Your access to "${title}" was removed. Please contact us.` : "Your access to this master class was removed. Please contact us.");
  }
};

interface PricedItem { course: SaleCourse; priceInPaise: number; discountInPaise: number; finalInPaise: number }
interface PricedPurchase { items: PricedItem[]; couponCode: string | null; priceInPaise: number; discountInPaise: number; finalInPaise: number }

const pricePurchase = async (db: Firestore, courses: SaleCourse[], rawCode: unknown): Promise<PricedPurchase> => {
  const code = typeof rawCode === "string" ? normalizeCouponCodeServer(rawCode.slice(0, 60)) : "";
  let perCourse: Record<string, number> = {};
  let couponCode: string | null = null;
  if (code) {
    const coupon = await loadCouponByCode(db, code);
    if (!coupon) throw new ElearnError(400, "This coupon code is not valid.");
    const result = computeElearnBundleDiscount(coupon, courses.map((course) => ({ courseId: course.id, priceInPaise: course.priceInPaise })));
    if (result.reason || result.discountInPaise <= 0) throw new ElearnError(400, result.reason || "This coupon can't be used for this master class.");
    perCourse = result.perCourse;
    couponCode = coupon.code;
  }
  const items = courses.map((course) => {
    const discountInPaise = Math.min(course.priceInPaise, perCourse[course.id] || 0);
    return { course, priceInPaise: course.priceInPaise, discountInPaise, finalInPaise: course.priceInPaise - discountInPaise };
  });
  const total = (key: "priceInPaise" | "discountInPaise" | "finalInPaise") => items.reduce((sum, item) => sum + item[key], 0);
  return { items, couponCode, priceInPaise: total("priceInPaise"), discountInPaise: total("discountInPaise"), finalInPaise: total("finalInPaise") };
};

const previewCoupon = async (db: Firestore, body: Record<string, unknown>) => {
  const courses = await loadForSale(db, parseCourseIds(body));
  const priced = await pricePurchase(db, courses, body.couponCode);
  if (!priced.couponCode) throw new ElearnError(400, "Enter a coupon code.");
  return {
    ok: true as const,
    couponCode: priced.couponCode,
    priceInPaise: priced.priceInPaise,
    discountInPaise: priced.discountInPaise,
    finalInPaise: priced.finalInPaise,
    free: priced.finalInPaise === 0,
  };
};

// ── elearn-order ───────────────────────────────────────────────────────────
// Total 0 (a 100% coupon): no payment, access is given at once (method "coupon").
const createOrder = async (db: Firestore, uid: string, identity: ReturnType<typeof identityFromToken>, body: Record<string, unknown>) => {
  const ids = parseCourseIds(body);
  const courses = await loadForSale(db, ids);
  const several = courses.length > 1;
  const refs = courses.map((course) => enrollmentRef(db, uid, course.id));
  const before = await Promise.all(refs.map((ref) => ref.get()));
  before.forEach((snapshot, index) => assertCanBuy(snapshot.data(), courses[index].title, several));

  const priced = await pricePurchase(db, courses, body.couponCode);
  const buyer = await loadBuyerIdentity(db, uid, identity);
  const titles = courses.map((course) => course.title);

  if (priced.finalInPaise === 0 && priced.couponCode) {
    const bundle = several
      ? { id: `free_${Date.now().toString(36)}_${uid.slice(0, 8)}`, courseTitles: titles, totalInPaise: 0 }
      : undefined;
    const enrollmentIds: string[] = [];
    for (const [index, item] of priced.items.entries()) {
      const result = await activateEnrollment(db, {
        uid,
        course: item.course,
        method: "coupon",
        amountInPaise: 0,
        identity: buyer,
        couponCode: priced.couponCode,
        countCoupon: index === 0,
        enforceCouponLimit: true,
        bundle,
        blockStatus: ["revoked"],
      });
      enrollmentIds.push(result.enrollmentId);
    }
    return { free: true as const, status: "active" as const, enrollmentId: enrollmentIds[0], enrollmentIds, courseIds: ids };
  }

  for (const course of courses) {
    if (!availablePaymentModes(course, null).razorpay) {
      throw new ElearnError(400, several ? `Online payment is not available for "${course.title}".` : "Online payment is not available for this master class.");
    }
  }
  const joinedIds = courses.map((course) => course.id).join(",");
  if (joinedIds.length > 250) throw new ElearnError(400, "Too many master classes at once. Please buy them in two parts.");
  const currency = getRazorpayCurrency();
  const order = await createRazorpayClient().orders.create({
    amount: priced.finalInPaise,
    currency,
    receipt: `el_${Date.now().toString(36)}_${uid.slice(0, 8)}`.slice(0, 40),
    notes: {
      kind: "elearn",
      uid,
      courseId: courses[0].id,
      ...(several ? { courseIds: joinedIds, amounts: priced.items.map((item) => item.finalInPaise).join(",") } : {}),
      ...(priced.couponCode ? { couponCode: priced.couponCode } : {}),
    },
  });

  // Re-read inside a transaction: a payment (verify/webhook) or a staff action
  // may have landed while the Razorpay order was being created.
  await db.runTransaction(async (tx) => {
    const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
    snapshots.forEach((snapshot, index) => assertCanBuy(snapshot.exists ? snapshot.data() : null, courses[index].title, several));
    snapshots.forEach((snapshot, index) => {
      const existing = snapshot.exists ? snapshot.data() || {} : null;
      const keepStatus = existing?.status === "processing" || existing?.status === "active";
      tx.set(refs[index], {
        uid,
        courseId: courses[index].id,
        courseTitle: courses[index].title,
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
  });

  return {
    keyId: getRazorpayCredentials().keyId,
    orderId: order.id,
    amount: priced.finalInPaise,
    currency,
    enrollmentId: refs[0].id,
    enrollmentIds: refs.map((ref) => ref.id),
    courseTitle: several ? `${courses.length} master classes` : courses[0].title,
  };
};

// ── elearn-verify ──────────────────────────────────────────────────────────
const verify = async (db: Firestore, uid: string, body: Record<string, unknown>) => {
  const courseIds = parseCourseIds(body);
  const razorpayOrderId = cleanId(body.razorpay_order_id, 80);
  const razorpayPaymentId = cleanId(body.razorpay_payment_id, 80);
  const razorpaySignature = cleanId(body.razorpay_signature, 200);
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw new ElearnError(400, "Missing payment details.");
  }
  if (!verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature })) {
    throw new ElearnError(400, "Payment signature could not be verified.");
  }
  const results = await activateFromRazorpay(db, {
    razorpayOrderId,
    razorpayPaymentId,
    expected: { uid, courseIds },
  });
  if (results.some((result) => result.status !== "active")) {
    throw new ElearnError(403, "Payment received, but your access to a master class was removed. Please contact us for a refund.");
  }
  return {
    verified: true,
    status: "active" as const,
    enrollmentId: results[0].enrollmentId,
    enrollmentIds: results.map((result) => result.enrollmentId),
    expiresAt: toIso(results[0].expiresAtMs),
    ...(results.every((result) => result.alreadyActive) ? { alreadyActive: true } : {}),
  };
};

// ── elearn-submit-upi ──────────────────────────────────────────────────────
// Several master classes in one QR payment: one record per course (each with
// its share), linked by bundleId; staff approve or reject them together.
const submitUpi = async (db: Firestore, uid: string, identity: ReturnType<typeof identityFromToken>, body: Record<string, unknown>) => {
  const ids = parseCourseIds(body);
  const proofUrl = typeof body.proofUrl === "string" ? body.proofUrl.trim() : "";
  const upiRef = normalizeUpiUtr(body.upiRef);
  if (!isAllowedProofUrl(proofUrl)) throw new ElearnError(400, "Please upload the payment screenshot again.");
  if (!upiRef) throw new ElearnError(400, "Enter the 12-digit UTR / UPI reference number from your payment app.");
  const cleanProofUrl = new URL(proofUrl).href;
  const proofKey = createHash("sha256").update(cleanProofUrl).digest("hex");

  const courses = await loadForSale(db, ids);
  const several = courses.length > 1;
  const priced = await pricePurchase(db, courses, body.couponCode);
  if (priced.finalInPaise === 0) throw new ElearnError(400, "This coupon makes it free: press \"Get it free\" instead of paying.");
  const settings = await loadUpiSettings(db);
  for (const course of courses) {
    if (!availablePaymentModes(course, settings).upi) {
      throw new ElearnError(400, several ? `QR payment is not available for "${course.title}".` : "QR payment is not available for this master class.");
    }
  }

  const refs = courses.map((course) => enrollmentRef(db, uid, course.id));
  const refIds = refs.map((ref) => ref.id);
  const utrRef = db.collection(ELEARN_UPI_REFS).doc(upiRef);
  const proofRef = db.collection(ELEARN_UPI_PROOFS).doc(proofKey);
  const buyer = await loadBuyerIdentity(db, uid, identity);
  const bundleFields = several
    ? { bundleId: `upi_${upiRef}`, bundleCourseTitles: courses.map((course) => course.title), bundleTotalInPaise: priced.finalInPaise }
    : { bundleId: FieldValue.delete(), bundleCourseTitles: FieldValue.delete(), bundleTotalInPaise: FieldValue.delete() };
  // A used UTR / screenshot may only be reused for the same purchase (a
  // resubmit after a rejection), never for another one.
  const ownsClaim = (data: Record<string, unknown> | undefined) => {
    const owned = Array.isArray(data?.enrollmentIds) ? data!.enrollmentIds as unknown[] : [data?.enrollmentId];
    return refIds.every((id) => owned.includes(id));
  };
  await db.runTransaction(async (tx) => {
    const [utrSnap, proofSnap, ...snapshots] = await Promise.all([tx.get(utrRef), tx.get(proofRef), ...refs.map((ref) => tx.get(ref))]);
    snapshots.forEach((snapshot, index) => assertCanBuy(snapshot.exists ? snapshot.data() : null, courses[index].title, several));
    if (utrSnap.exists && !ownsClaim(utrSnap.data())) {
      throw new ElearnError(409, "This UTR number was already used for another purchase.");
    }
    if (proofSnap.exists && !ownsClaim(proofSnap.data())) {
      throw new ElearnError(409, "This screenshot was already used for another purchase. Upload your own payment screenshot.");
    }
    const claim = { enrollmentId: refIds[0], enrollmentIds: refIds, uid, courseId: courses[0].id, courseIds: ids, createdAt: FieldValue.serverTimestamp() };
    if (!utrSnap.exists) tx.set(utrRef, { ...claim, utr: upiRef });
    if (!proofSnap.exists) tx.set(proofRef, { ...claim, proofUrl: cleanProofUrl });
    snapshots.forEach((snapshot, index) => {
      const existing = snapshot.exists ? snapshot.data() || {} : null;
      const item = priced.items[index];
      tx.set(refs[index], {
        uid,
        courseId: item.course.id,
        courseTitle: item.course.title,
        ...buyer,
        status: "processing",
        method: "upi",
        amountInPaise: item.finalInPaise,
        ...(priced.couponCode
          ? { couponCode: priced.couponCode, listPriceInPaise: item.priceInPaise, discountInPaise: item.discountInPaise }
          : { couponCode: FieldValue.delete(), listPriceInPaise: FieldValue.delete(), discountInPaise: FieldValue.delete() }),
        ...bundleFields,
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
  });
  return { ok: true as const, enrollmentId: refIds[0], enrollmentIds: refIds, status: "processing" as const };
};

// The other records of a QR payment that covered several master classes.
const bundleSiblings = async (db: Firestore, data: Record<string, unknown>, selfId: string) => {
  const bundleId = typeof data.bundleId === "string" ? data.bundleId : "";
  if (!bundleId) return [];
  const query = await db.collection(ELEARN_ENROLLMENTS).where("bundleId", "==", bundleId).limit(10).get();
  return query.docs.filter((doc) => doc.id !== selfId && doc.data().uid === data.uid).map((doc) => doc.ref);
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
    // One QR payment for several master classes: approve them all together.
    const siblings = await bundleSiblings(db, data, enrollmentId);
    const records = [{ ref, data }];
    for (const siblingRef of siblings) {
      const siblingData = (await siblingRef.get()).data();
      if (siblingData?.status === "processing") records.push({ ref: siblingRef, data: siblingData });
    }
    const enrollmentIds: string[] = [];
    let alreadyActive = true;
    for (const [index, record] of records.entries()) {
      const course = (await loadSaleCourse(db, String(record.data.courseId || "")))
        || { id: String(record.data.courseId || ""), title: String(record.data.courseTitle || ""), accessDays: 0 };
      const result = await activateEnrollment(db, {
        uid: String(record.data.uid || ""),
        course,
        method: "upi",
        amountInPaise: Math.max(0, Math.round(Number(record.data.amountInPaise) || 0)),
        couponCode: typeof record.data.couponCode === "string" && record.data.couponCode ? record.data.couponCode : undefined,
        // One coupon use per payment, however many master classes it covered.
        countCoupon: index === 0,
        reviewedBy: staffUid,
        // Re-checked inside the transaction: a reject/revoke in another tab wins.
        requireStatus: ["processing"],
      });
      enrollmentIds.push(result.enrollmentId);
      alreadyActive = alreadyActive && Boolean(result.alreadyActive);
    }
    return { ok: true as const, enrollmentId, enrollmentIds, status: "active" as const, ...(alreadyActive ? { alreadyActive: true } : {}) };
  }

  if (op === "reject" || op === "revoke") {
    const next = op === "reject" ? "rejected" : "revoked";
    const first = (await ref.get()).data();
    const siblings = op === "reject" && first ? await bundleSiblings(db, first, enrollmentId) : [];
    const enrollmentIds = await db.runTransaction(async (tx) => {
      const [snapshot, ...siblingSnaps] = await Promise.all([tx.get(ref), ...siblings.map((siblingRef) => tx.get(siblingRef))]);
      const data = snapshot.data();
      if (!data) throw new ElearnError(404, "Enrollment not found.");
      if (op === "reject" && data.status !== "processing") {
        throw new ElearnError(409, data.status === "active" ? "This student already has access. Use Revoke instead." : "Only a payment waiting for review can be rejected.");
      }
      if (op === "revoke" && data.status !== "active") throw new ElearnError(409, "Only active access can be revoked.");
      const update = {
        status: next,
        rejectReason: reason || FieldValue.delete(),
        reviewedBy: staffUid,
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      tx.update(ref, update);
      const ids = [enrollmentId];
      // A rejected QR payment covered every master class bought with it.
      siblingSnaps.forEach((siblingSnap) => {
        if (siblingSnap.data()?.status === "processing" && siblingSnap.data()?.bundleId === data.bundleId) {
          tx.update(siblingSnap.ref, update);
          ids.push(siblingSnap.id);
        }
      });
      return ids;
    });
    return { ok: true as const, enrollmentId, enrollmentIds, status: next as "rejected" | "revoked" };
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
