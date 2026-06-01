import { getFirebaseAdminAuth, getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { createRazorpayClient, getRazorpayCredentials, getRazorpayCurrency } from "../_lib/razorpay.js";
import { monthKeyFor } from "../_lib/class-fees.js";
import { ensureFeePayment, ENROLLMENTS_COLLECTION, FEE_PAYMENTS_COLLECTION, type EnrollmentRecord } from "../_lib/fee-store.js";

interface CreateFeeOrderBody {
  feePaymentId?: string;
  enrollmentId?: string;
}

const isFirebaseAuthError = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  return code.startsWith("auth/");
};

const normalizeReceipt = (value: string) => {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return normalized || `FEE-${Date.now()}`.slice(0, 40);
};

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requirePost(request, response)) return;

  try {
    const token = getBearerToken(request);
    if (!token) {
      sendError(response, 401, "Missing Firebase authentication token.");
      return;
    }

    const body = await readJsonBody<CreateFeeOrderBody>(request);
    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    const uid = decoded.uid;
    const db = getFirebaseAdminDb();

    let feePaymentId = (body.feePaymentId || "").trim();
    const enrollmentId = (body.enrollmentId || "").trim();

    // Bootstrap path: create / reuse the current-month fee doc for an enrollment.
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

      const monthKey = monthKeyFor(new Date());
      const { id } = await ensureFeePayment(db, enrollment, monthKey);
      feePaymentId = id;

      // Manual enrolment becomes active once the parent starts paying.
      if (enrollment.status === "pending") {
        await enrollmentSnapshot.ref.update({ status: "active", updatedAt: FieldValue.serverTimestamp() });
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
      sendError(response, 409, "This month's fee is already settled.");
      return;
    }

    const amountInPaise = Math.round(Number(fee.amountInPaise || 0));
    if (!Number.isInteger(amountInPaise) || amountInPaise < 100) {
      sendError(response, 400, "Invalid fee amount.");
      return;
    }

    const razorpay = createRazorpayClient();
    const { keyId } = getRazorpayCredentials();
    const currency = getRazorpayCurrency().toUpperCase();

    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency,
      receipt: normalizeReceipt(feePaymentId),
      notes: {
        kind: "class-fee",
        feePaymentId,
        enrollmentId: String(fee.enrollmentId || enrollmentId || ""),
        monthKey: String(fee.monthKey || ""),
        parentUserId: uid,
      },
    });

    await feeRef.update({
      razorpayOrderId: razorpayOrder.id,
      paymentMethod: "manual",
      updatedAt: FieldValue.serverTimestamp(),
    });

    sendJson(response, 200, {
      keyId,
      orderId: razorpayOrder.id,
      order_id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      feePaymentId,
    });
  } catch (error) {
    console.error("Unable to create class fee order", error);
    if (isFirebaseAuthError(error)) {
      sendError(response, 401, "Invalid Firebase authentication token.");
      return;
    }
    sendError(response, 500, error instanceof Error ? error.message : "Unable to create class fee order.");
  }
}
