import { getFirebaseAdminAuth, getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { addMonths, monthKeyFor } from "../_lib/class-fees.js";
import {
  countSlotSeatOnce,
  ensureCustomFeePayment,
  ensureFeePayment,
  ENROLLMENTS_COLLECTION,
  FEE_PAYMENTS_COLLECTION,
  isPrepaymentEnrollment,
  notificationContextFromFee,
  type EnrollmentRecord,
} from "../_lib/fee-store.js";
import { sendClassFeeNotifications } from "../_lib/notify.js";
import { isStaffForPage } from "../_lib/staff.js";

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

    // Admin, or a manager granted Sign Up / Fee Collections.
    const userSnapshot = await db.doc(`users/${decoded.uid}`).get();
    const callerData = userSnapshot.data();
    if (!isStaffForPage(callerData, "fee-collections") && !isStaffForPage(callerData, "enrollments")) {
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

    // Which fee is being collected?
    //  • Prepayment enrolment still PENDING → the standalone Pre-payment (not a
    //    month's fee — fixed structure). The joining month's fee arrives next
    //    month via the arrears roll-forward.
    //  • Prepayment enrolment already ACTIVE → the current arrears due; never
    //    the joining month itself (nothing is due until the month after).
    //  • Everything else → the current month's fee (unchanged).
    const prepay = isPrepaymentEnrollment(enrollment) && enrollment.status === "pending";
    let feeId: string;
    if (prepay) {
      const result = await ensureCustomFeePayment(db, enrollment, {
        suffix: "prepayment",
        amountInPaise: Math.max(0, Math.round(Number(enrollment.monthlyFeeInPaise || 0))),
        periodLabel: "Pre-payment",
        dueDate: new Date().toISOString().slice(0, 10),
      });
      feeId = result.id;
    } else {
      let monthKey = monthKeyFor(new Date());
      if (isPrepaymentEnrollment(enrollment)) {
        const firstBillable = addMonths(String(enrollment.startMonthKey || monthKey), 1);
        if (monthKey < firstBillable) monthKey = firstBillable;
      }
      const result = await ensureFeePayment(db, enrollment, monthKey);
      feeId = result.id;
    }

    // Mark it as cash-paid.
    const feeRef = db.collection(FEE_PAYMENTS_COLLECTION).doc(feeId);
    const feeSnapshot = await feeRef.get();
    const feeData = feeSnapshot.data() || {};
    const prepaymentUpdate: Record<string, unknown> = prepay ? { prepayment: true } : {};

    if (feeData.status !== "paid") {
      await feeRef.update({
        status: "paid",
        paymentMethod: "cash",
        paidAt: FieldValue.serverTimestamp(),
        ...prepaymentUpdate,
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
    const updatedFee = { ...feeData, ...prepaymentUpdate, status: "paid", paymentMethod: "cash" };
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
