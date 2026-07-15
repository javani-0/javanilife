import { getFirebaseAdminAuth, getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { monthKeyFor, termPayFullAmountInPaise } from "../_lib/class-fees.js";
import { computeClassCouponDiscount, loadCouponByCode } from "../_lib/coupons.js";
import {
  CLASSES_COLLECTION,
  ensureCustomFeePayment,
  ensureFeePayment,
  ENROLLMENTS_COLLECTION,
  FEE_PAYMENTS_COLLECTION,
  isTermEnrollment,
  type EnrollmentRecord,
} from "../_lib/fee-store.js";

// ---------------------------------------------------------------------------
// POST /api/razorpay/submit-upi-payment
// ---------------------------------------------------------------------------
// The manual-UPI flow (req 1). A signed-in parent has paid the fee to the
// admin's UPI id / QR and now uploads a screenshot. We resolve/create the fee
// doc and park it at status "processing" with the proof attached, awaiting an
// admin approval (→ paid) or rejection (→ back to pending). No Razorpay order
// is created — this is the low-commission rail.
// ---------------------------------------------------------------------------

interface SubmitBody {
  feePaymentId?: string;
  enrollmentId?: string;
  kind?: "monthly" | "full";
  monthKey?: string; // "YYYY-MM" — pay this specific month in advance (monthly only)
  proofUrl?: string;
  upiRef?: string;
  couponCode?: string;
}

// Accept a "YYYY-MM" no more than 12 months ahead of now; else fall back to now.
const resolveMonthKey = (raw: unknown): string => {
  const value = typeof raw === "string" ? raw : "";
  if (!/^\d{4}-\d{2}$/.test(value)) return monthKeyFor(new Date());
  const now = monthKeyFor(new Date());
  const maxAhead = monthKeyFor(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
  if (value < now) return now;        // never bill a past month
  if (value > maxAhead) return now;   // guard against absurd future months
  return value;
};

const isFirebaseAuthError = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  return code.startsWith("auth/");
};

const isHttpUrl = (value: string) => /^https?:\/\/\S+$/i.test(value);

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requirePost(request, response)) return;

  try {
    const token = getBearerToken(request);
    if (!token) {
      sendError(response, 401, "Missing Firebase authentication token.");
      return;
    }

    const body = await readJsonBody<SubmitBody>(request);
    const proofUrl = (body.proofUrl || "").trim();
    if (!proofUrl || !isHttpUrl(proofUrl)) {
      sendError(response, 400, "A payment screenshot is required.");
      return;
    }
    const upiRef = (body.upiRef || "").trim().slice(0, 40);

    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    const uid = decoded.uid;
    const db = getFirebaseAdminDb();

    let feePaymentId = (body.feePaymentId || "").trim();
    const enrollmentId = (body.enrollmentId || "").trim();
    // A NEW student's enrolment-time monthly payment is a "Pre-payment" (req):
    // tag the fee so history + the WhatsApp confirmation show it as such.
    let isPrepayment = false;

    // Bootstrap path: create / reuse the fee doc for an enrollment.
    if (!feePaymentId && enrollmentId) {
      const enrollmentSnapshot = await db.collection(ENROLLMENTS_COLLECTION).doc(enrollmentId).get();
      if (!enrollmentSnapshot.exists) {
        sendError(response, 404, "Enrollment was not found.");
        return;
      }
      const enrollment = { id: enrollmentSnapshot.id, ...(enrollmentSnapshot.data() as Omit<EnrollmentRecord, "id">) };
      if (enrollment.parentUserId !== uid) {
        sendError(response, 403, "You do not own this enrollment.");
        return;
      }

      if (isTermEnrollment(enrollment)) {
        // Only the "pay full" term rail uses manual UPI; EMI stays on Razorpay.
        let fullAmountInPaise = Math.max(0, Math.round(Number(enrollment.termFeeInPaise || 0)));
        if (enrollment.classId) {
          const classSnapshot = await db.collection(CLASSES_COLLECTION).doc(enrollment.classId).get();
          if (classSnapshot.exists) {
            const discounted = termPayFullAmountInPaise(classSnapshot.data() || {});
            if (discounted > 0) fullAmountInPaise = discounted;
          }
        }
        const { id } = await ensureCustomFeePayment(db, enrollment, {
          suffix: "full",
          amountInPaise: fullAmountInPaise,
          periodLabel: "Full course fee",
          dueDate: monthKeyFor(new Date()) + "-01",
        });
        feePaymentId = id;
      } else {
        // Monthly: current month by default, or a chosen future month (advance).
        const { id } = await ensureFeePayment(db, enrollment, resolveMonthKey(body.monthKey));
        feePaymentId = id;
        // Enrolment-time payment (no explicit monthKey) by a NEW student → Pre-payment.
        isPrepayment = !body.monthKey && enrollment.studentStatus === "new";
      }
    }

    if (!feePaymentId) {
      sendError(response, 400, "feePaymentId or enrollmentId is required.");
      return;
    }

    const feeRef = db.collection(FEE_PAYMENTS_COLLECTION).doc(feePaymentId);
    const feeSnapshot = await feeRef.get();
    if (!feeSnapshot.exists) {
      sendError(response, 404, "Fee record was not found.");
      return;
    }

    const fee = feeSnapshot.data() || {};
    if (fee.parentUserId !== uid) {
      sendError(response, 403, "You do not own this fee record.");
      return;
    }
    if (fee.status === "paid" || fee.status === "waived") {
      sendError(response, 409, "This fee is already settled.");
      return;
    }

    // Server-authoritative coupon discount (req 2). Re-compute against the
    // ORIGINAL fee amount so re-submits never compound, and clamp so a tampered
    // client can't under-charge.
    const couponCode = (body.couponCode || "").trim();
    const baseAmountInPaise = Math.max(0, Math.round(Number(fee.originalAmountInPaise ?? fee.amountInPaise ?? 0)));
    const couponUpdate: Record<string, unknown> = {};
    if (couponCode) {
      const coupon = await loadCouponByCode(db, couponCode);
      if (coupon) {
        const { discountInPaise } = computeClassCouponDiscount(coupon, baseAmountInPaise, { classId: String(fee.classId || "") });
        if (discountInPaise > 0) {
          couponUpdate.originalAmountInPaise = baseAmountInPaise;
          couponUpdate.amountInPaise = Math.max(100, baseAmountInPaise - discountInPaise);
          couponUpdate.couponCode = coupon.code;
          couponUpdate.couponDiscountInPaise = discountInPaise;
        }
      }
    }

    // Pre-payment tag: enriching periodLabel propagates to the user's history
    // AND the WhatsApp paid confirmation ({{5}} = periodLabel) — no template edit.
    const currentPeriodLabel = String(fee.periodLabel || "");
    const prepaymentUpdate: Record<string, unknown> = isPrepayment
      ? {
          prepayment: true,
          ...(currentPeriodLabel && !currentPeriodLabel.includes("Pre-payment")
            ? { periodLabel: `${currentPeriodLabel} · Pre-payment` }
            : {}),
        }
      : {};

    await feeRef.update({
      status: "processing",
      paymentMethod: "upi",
      upiProofUrl: proofUrl,
      upiRef: upiRef || FieldValue.delete(),
      upiSubmittedAt: FieldValue.serverTimestamp(),
      upiRejectedReason: FieldValue.delete(),
      ...prepaymentUpdate,
      ...couponUpdate,
      updatedAt: FieldValue.serverTimestamp(),
    });

    sendJson(response, 200, { ok: true, feePaymentId, ...(couponUpdate.couponDiscountInPaise ? { couponDiscountInPaise: couponUpdate.couponDiscountInPaise } : {}) });
  } catch (error) {
    console.error("Unable to submit UPI payment", error);
    if (isFirebaseAuthError(error)) {
      sendError(response, 401, "Invalid Firebase authentication token.");
      return;
    }
    sendError(response, 500, error instanceof Error ? error.message : "Unable to submit the payment.");
  }
}
