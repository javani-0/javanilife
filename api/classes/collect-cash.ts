import { getFirebaseAdminAuth, getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { monthKeyFor } from "../_lib/class-fees.js";
import {
  countSlotSeatOnce,
  ensureFeePayment,
  ENROLLMENTS_COLLECTION,
  FEE_PAYMENTS_COLLECTION,
  notificationContextFromFee,
  type EnrollmentRecord,
} from "../_lib/fee-store.js";
import { sendClassFeeNotifications } from "../_lib/notify.js";

interface CollectCashBody {
  enrollmentId?: string;
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requirePost(request, response)) return;

  const idToken = getBearerToken(request);
  if (!idToken) {
    sendError(response, 401, "Missing Authorization bearer token.");
    return;
  }

  try {
    const decoded = await getFirebaseAdminAuth().verifyIdToken(idToken);
    const db = getFirebaseAdminDb();

    // Only admins can collect cash.
    const userSnapshot = await db.doc(`users/${decoded.uid}`).get();
    if (userSnapshot.data()?.role !== "admin") {
      sendError(response, 403, "Only admins can collect cash payments.");
      return;
    }

    const body = await readJsonBody<CollectCashBody>(request);
    const enrollmentId = (body.enrollmentId || "").trim();
    if (!enrollmentId) {
      sendError(response, 400, "enrollmentId is required.");
      return;
    }

    const enrollmentRef = db.collection(ENROLLMENTS_COLLECTION).doc(enrollmentId);
    const enrollmentSnapshot = await enrollmentRef.get();
    if (!enrollmentSnapshot.exists) {
      sendError(response, 404, "Enrollment was not found.");
      return;
    }

    const enrollment = { id: enrollmentSnapshot.id, ...(enrollmentSnapshot.data() as Omit<EnrollmentRecord, "id">) };

    // Create / reuse the fee doc for the current month.
    const monthKey = monthKeyFor(new Date());
    const { id: feeId } = await ensureFeePayment(db, enrollment, monthKey);

    // Mark it as cash-paid.
    const feeRef = db.collection(FEE_PAYMENTS_COLLECTION).doc(feeId);
    const feeSnapshot = await feeRef.get();
    const feeData = feeSnapshot.data() || {};

    if (feeData.status !== "paid") {
      await feeRef.update({
        status: "paid",
        paymentMethod: "cash",
        paidAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // Activate the enrollment.
    if (enrollment.status === "pending" || enrollment.status === "paused") {
      await enrollmentRef.update({
        status: "active",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // Count the slot seat (idempotent).
    await countSlotSeatOnce(db, enrollmentId);

    // Send WhatsApp + push notification to parent (cash paid confirmation).
    const updatedFee = { ...feeData, status: "paid", paymentMethod: "cash" };
    const notificationResult = await sendClassFeeNotifications(
      "paid",
      notificationContextFromFee(feeId, updatedFee),
    ).catch((error) => {
      console.error("Cash collection notification failed", { feeId, error });
      return { warning: "Notification failed" };
    });

    sendJson(response, 200, {
      ok: true,
      enrollmentId,
      feePaymentId: feeId,
      notification: notificationResult,
    });
  } catch (error) {
    console.error("Unable to collect cash payment", error);
    sendError(response, 500, error instanceof Error ? error.message : "Unable to collect cash payment.");
  }
}
