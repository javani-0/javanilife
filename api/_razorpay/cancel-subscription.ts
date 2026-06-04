import { getFirebaseAdminAuth, getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { createRazorpayClient } from "../_lib/razorpay.js";
import { cancelSubscription } from "../_lib/razorpay-subscriptions.js";
import { ENROLLMENTS_COLLECTION, type EnrollmentRecord } from "../_lib/fee-store.js";
import { sendAutopayCancelledNotifications } from "../_lib/notify.js";

interface CancelSubscriptionBody {
  enrollmentId?: string;
  cancelAtCycleEnd?: boolean;
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

    const body = await readJsonBody<CancelSubscriptionBody>(request);
    const enrollmentId = (body.enrollmentId || "").trim();
    if (!enrollmentId) {
      sendError(response, 400, "enrollmentId is required.");
      return;
    }

    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    const db = getFirebaseAdminDb();
    const [enrollmentSnapshot, userSnapshot] = await Promise.all([
      db.collection(ENROLLMENTS_COLLECTION).doc(enrollmentId).get(),
      db.doc(`users/${decoded.uid}`).get(),
    ]);

    if (!enrollmentSnapshot.exists) {
      sendError(response, 404, "Enrollment was not found.");
      return;
    }

    const enrollment = enrollmentSnapshot.data() as EnrollmentRecord;
    const isAdmin = userSnapshot.data()?.role === "admin";
    const isOwner = enrollment.parentUserId === decoded.uid;
    if (!isAdmin && !isOwner) {
      sendError(response, 403, "You do not have permission to cancel this autopay.");
      return;
    }

    const subscriptionId = enrollment.autopay?.razorpaySubscriptionId;
    if (subscriptionId) {
      try {
        const razorpay = createRazorpayClient() as unknown as Parameters<typeof cancelSubscription>[0];
        await cancelSubscription(razorpay, subscriptionId, body.cancelAtCycleEnd === true);
      } catch (error) {
        // If Razorpay already cancelled it (or it never activated), continue and
        // still reflect the cancellation locally.
        console.warn("Razorpay subscription cancel warning", { subscriptionId, error });
      }
    }

    await enrollmentSnapshot.ref.update({
      "autopay.enabled": false,
      "autopay.mandateStatus": "cancelled",
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Tell the parent and the admin the mandate was turned off. Awaited (with a
    // guard) so the serverless function isn't killed before the messages send;
    // a notification failure must not fail the cancellation itself.
    await sendAutopayCancelledNotifications({
      enrollmentId,
      className: enrollment.className || "your class",
      studentName: enrollment.student?.name || "the student",
      parentName: enrollment.parent?.name || "there",
      parentUserId: enrollment.parentUserId,
      parentPhone: enrollment.parent?.phone,
      parentWhatsApp: enrollment.parent?.whatsappNumber,
      cancelledBy: isAdmin ? "admin" : "parent",
    }).catch((error) => console.error("Autopay cancelled notification failed", { enrollmentId, error }));

    sendJson(response, 200, { ok: true });
  } catch (error) {
    console.error("Unable to cancel class subscription", error);
    if (isFirebaseAuthError(error)) {
      sendError(response, 401, "Invalid Firebase authentication token.");
      return;
    }
    sendError(response, 500, error instanceof Error ? error.message : "Unable to cancel subscription.");
  }
}
