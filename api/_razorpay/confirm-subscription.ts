import { getFirebaseAdminAuth, getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { createRazorpayClient, verifyRazorpaySubscriptionSignature } from "../_lib/razorpay.js";
import { getSubscription } from "../_lib/razorpay-subscriptions.js";
import { ENROLLMENTS_COLLECTION, type EnrollmentRecord } from "../_lib/fee-store.js";

// ---------------------------------------------------------------------------
// Confirm a class autopay mandate right after Razorpay Checkout succeeds.
// ---------------------------------------------------------------------------
// The webhook is the long-term source of truth, but it can lag or be missed
// (mis-configured endpoint, network blip, UPI redirect quirks on mobile). The
// client calls this immediately after the checkout `handler` fires so the
// enrolment reflects the live mandate without waiting on the webhook. Both
// paths write the same fields and are idempotent.
// ---------------------------------------------------------------------------

interface ConfirmSubscriptionBody {
  enrollmentId?: string;
  razorpay_payment_id?: string;
  razorpay_subscription_id?: string;
  razorpay_signature?: string;
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

    const body = await readJsonBody<ConfirmSubscriptionBody>(request);
    const enrollmentId = (body.enrollmentId || "").trim();
    const paymentId = (body.razorpay_payment_id || "").trim();
    const signature = (body.razorpay_signature || "").trim();
    const bodySubscriptionId = (body.razorpay_subscription_id || "").trim();
    if (!enrollmentId) {
      sendError(response, 400, "enrollmentId is required.");
      return;
    }

    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    const db = getFirebaseAdminDb();
    const enrollmentRef = db.collection(ENROLLMENTS_COLLECTION).doc(enrollmentId);
    const enrollmentSnapshot = await enrollmentRef.get();
    if (!enrollmentSnapshot.exists) {
      sendError(response, 404, "Enrollment was not found.");
      return;
    }

    const enrollment = { id: enrollmentSnapshot.id, ...(enrollmentSnapshot.data() as Omit<EnrollmentRecord, "id">) } as EnrollmentRecord & {
      parentUserId?: string;
      autopay?: { razorpaySubscriptionId?: string };
    };
    if (enrollment.parentUserId !== decoded.uid) {
      sendError(response, 403, "You do not own this enrollment.");
      return;
    }

    // Trust the subscription id stored on the enrolment (set server-side at
    // create time) over anything the client sends.
    const subscriptionId = (enrollment.autopay?.razorpaySubscriptionId || bodySubscriptionId || "").trim();
    if (!subscriptionId) {
      sendError(response, 400, "No autopay subscription is associated with this enrollment.");
      return;
    }
    if (bodySubscriptionId && enrollment.autopay?.razorpaySubscriptionId && bodySubscriptionId !== enrollment.autopay.razorpaySubscriptionId) {
      sendError(response, 409, "Subscription does not match this enrollment.");
      return;
    }

    // Verify the checkout signature when present (defence in depth — the
    // authoritative status still comes from the fetch below).
    const signatureValid = paymentId && signature
      ? verifyRazorpaySubscriptionSignature({ razorpayPaymentId: paymentId, razorpaySubscriptionId: subscriptionId, razorpaySignature: signature })
      : false;

    // Fetch the live subscription from Razorpay — this is the real status.
    const razorpay = createRazorpayClient() as unknown as Parameters<typeof getSubscription>[0];
    const subscription = await getSubscription(razorpay, subscriptionId);
    const status = String(subscription.status || "").toLowerCase();

    const isAuthorized = status === "authenticated" || status === "active" || (signatureValid && status !== "cancelled" && status !== "expired");

    if (status === "cancelled" || status === "expired") {
      await enrollmentRef.update({
        "autopay.mandateStatus": "cancelled",
        "autopay.enabled": false,
        updatedAt: FieldValue.serverTimestamp(),
      });
      sendJson(response, 200, { enabled: false, mandateStatus: "cancelled" });
      return;
    }

    if (status === "halted" || status === "pending") {
      await enrollmentRef.update({
        "autopay.mandateStatus": "halted",
        "autopay.enabled": false,
        updatedAt: FieldValue.serverTimestamp(),
      });
      sendJson(response, 200, { enabled: false, mandateStatus: "halted" });
      return;
    }

    if (isAuthorized) {
      const mandateStatus = status === "active" ? "active" : "authenticated";
      await enrollmentRef.update({
        "autopay.enabled": true,
        "autopay.method": "upi",
        "autopay.mandateStatus": mandateStatus,
        "autopay.authorizedAt": FieldValue.serverTimestamp(),
        ...(subscription.charge_at ? { "autopay.nextChargeAt": new Date(subscription.charge_at * 1000).toISOString() } : {}),
        status: "active",
        updatedAt: FieldValue.serverTimestamp(),
      });
      sendJson(response, 200, { enabled: true, mandateStatus });
      return;
    }

    // Still "created" with no valid signature — leave as-is; the webhook will
    // reconcile when the mandate authenticates.
    sendJson(response, 200, { enabled: false, mandateStatus: "created" });
  } catch (error) {
    console.error("Unable to confirm class subscription", error);
    if (isFirebaseAuthError(error)) {
      sendError(response, 401, "Invalid Firebase authentication token.");
      return;
    }
    sendError(response, 500, error instanceof Error ? error.message : "Unable to confirm subscription.");
  }
}
