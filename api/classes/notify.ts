import { getFirebaseAdminAuth, getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { daysUntil } from "../_lib/class-fees.js";
import { FEE_PAYMENTS_COLLECTION, notificationContextFromFee } from "../_lib/fee-store.js";
import { sendClassFeeNotifications, type ClassFeeNotificationEvent } from "../_lib/notify.js";
import { isStaffForPage } from "../_lib/staff.js";

interface NotifyClassFeeBody {
  feePaymentId?: string;
  event?: string;
}

const eventMap: Record<string, ClassFeeNotificationEvent> = {
  "fee-paid": "paid",
  "fee-reminder": "reminder",
  "fee-failed": "failed",
  "fee-collection-undone": "collection-undone",
};

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requirePost(request, response)) return;

  const idToken = getBearerToken(request);
  if (!idToken) {
    sendError(response, 401, "Missing Authorization bearer token.");
    return;
  }

  try {
    const body = await readJsonBody<NotifyClassFeeBody>(request);
    const feePaymentId = (body.feePaymentId || "").trim();
    const event = eventMap[body.event || "fee-reminder"] || "reminder";
    if (!feePaymentId) {
      sendError(response, 400, "feePaymentId is required.");
      return;
    }

    const decoded = await getFirebaseAdminAuth().verifyIdToken(idToken);
    const db = getFirebaseAdminDb();
    const [feeSnapshot, userSnapshot] = await Promise.all([
      db.collection(FEE_PAYMENTS_COLLECTION).doc(feePaymentId).get(),
      db.doc(`users/${decoded.uid}`).get(),
    ]);

    if (!feeSnapshot.exists) {
      sendError(response, 404, "Fee record was not found.");
      return;
    }

    const fee = feeSnapshot.data() || {};
    // Admin, or a manager granted Fee Collections, or the fee's own parent.
    const isStaff = isStaffForPage(userSnapshot.data(), "fee-collections");
    const isOwner = fee.parentUserId === decoded.uid;
    if (!isStaff && !isOwner) {
      sendError(response, 403, "You do not have permission to notify this fee.");
      return;
    }
    // Only staff can announce a collection reversal.
    if (event === "collection-undone" && !isStaff) {
      sendError(response, 403, "Only an admin can send this notification.");
      return;
    }

    const daysLeft = daysUntil(String(fee.dueDate || ""), new Date());
    const result = await sendClassFeeNotifications(event, {
      ...notificationContextFromFee(feePaymentId, fee),
      daysUntilDue: daysLeft ?? undefined,
    });

    if (event === "reminder") {
      await feeSnapshot.ref.update({
        "reminders.preDebitSentAt": new Date().toISOString(),
        "reminders.preDebitMonthKey": String(fee.monthKey || ""),
        "reminders.count": FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    sendJson(response, 200, { ok: true, feePaymentId, result });
  } catch (error) {
    console.error("Unable to send class fee notification", error);
    sendError(response, 500, error instanceof Error ? error.message : "Unable to send class fee notification.");
  }
}
