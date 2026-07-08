import { getFirebaseAdminAuth, getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import {
  countSlotSeatOnce,
  ENROLLMENTS_COLLECTION,
  FEE_PAYMENTS_COLLECTION,
  notificationContextFromFee,
} from "../_lib/fee-store.js";
import { sendClassFeeNotifications } from "../_lib/notify.js";

// ---------------------------------------------------------------------------
// POST /api/razorpay/approve-payment  (admin only)
// ---------------------------------------------------------------------------
// Approve or reject a manual-UPI payment (req 1). Approving marks the fee paid,
// activates a still-pending enrolment, books the seat, and notifies the parent.
// Rejecting sends the fee back to "pending" with a reason so the parent can
// re-submit their screenshot.
// ---------------------------------------------------------------------------

interface ApproveBody {
  feePaymentId?: string;
  approve?: boolean;
  adminNote?: string;
}

const isFirebaseAuthError = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  return code.startsWith("auth/");
};

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requirePost(request, response)) return;

  try {
    const token = getBearerToken(request);
    if (!token) {
      sendError(response, 401, "Missing Firebase authentication token.");
      return;
    }

    const body = await readJsonBody<ApproveBody>(request);
    const feePaymentId = (body.feePaymentId || "").trim();
    if (!feePaymentId) {
      sendError(response, 400, "feePaymentId is required.");
      return;
    }
    const approve = body.approve !== false; // default to approve
    const adminNote = (body.adminNote || "").trim().slice(0, 200);

    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    const db = getFirebaseAdminDb();

    // Admin-only.
    const userSnapshot = await db.doc(`users/${decoded.uid}`).get();
    if (String(userSnapshot.data()?.role || "") !== "admin") {
      sendError(response, 403, "Only an admin can approve payments.");
      return;
    }

    const feeRef = db.collection(FEE_PAYMENTS_COLLECTION).doc(feePaymentId);
    const feeSnapshot = await feeRef.get();
    if (!feeSnapshot.exists) {
      sendError(response, 404, "Fee record was not found.");
      return;
    }
    const fee = feeSnapshot.data() || {};

    if (!approve) {
      await feeRef.update({
        status: "pending",
        upiRejectedReason: adminNote || "Payment could not be verified. Please pay again and re-upload the receipt.",
        ...(adminNote ? { adminNote } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
      sendJson(response, 200, { ok: true, feePaymentId, status: "pending" });
      return;
    }

    if (fee.status === "paid" || fee.status === "waived") {
      sendJson(response, 200, { ok: true, feePaymentId, status: fee.status, alreadySettled: true });
      return;
    }

    await feeRef.update({
      status: "paid",
      paymentMethod: "upi",
      paidAt: FieldValue.serverTimestamp(),
      approvedBy: decoded.uid,
      approvedAt: FieldValue.serverTimestamp(),
      upiRejectedReason: FieldValue.delete(),
      ...(adminNote ? { adminNote } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Activate a still-pending enrolment + book the seat.
    const enrollmentId = String(fee.enrollmentId || "");
    if (enrollmentId) {
      try {
        const enrollmentRef = db.collection(ENROLLMENTS_COLLECTION).doc(enrollmentId);
        const enrollmentSnap = await enrollmentRef.get();
        if (enrollmentSnap.exists && enrollmentSnap.data()?.status === "pending") {
          await enrollmentRef.update({ status: "active", updatedAt: FieldValue.serverTimestamp() });
        }
        await countSlotSeatOnce(db, enrollmentId);
      } catch (activationError) {
        console.error("UPI approval: enrolment activation failed", { enrollmentId, activationError });
      }
    }

    // Notify the parent their payment is confirmed (best-effort).
    const warnings: string[] = [];
    try {
      await sendClassFeeNotifications("paid", notificationContextFromFee(feePaymentId, { ...fee, status: "paid" }));
    } catch (notifyError) {
      console.error("UPI approval: notification failed", notifyError);
      warnings.push("Payment approved but the confirmation message could not be sent.");
    }

    sendJson(response, 200, { ok: true, feePaymentId, status: "paid", warnings });
  } catch (error) {
    console.error("Unable to approve/reject UPI payment", error);
    if (isFirebaseAuthError(error)) {
      sendError(response, 401, "Invalid Firebase authentication token.");
      return;
    }
    sendError(response, 500, error instanceof Error ? error.message : "Unable to process the approval.");
  }
}
