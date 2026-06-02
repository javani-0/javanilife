import { getFirebaseAdminAuth, getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { createRazorpayClient, getRazorpayCredentials } from "../_lib/razorpay.js";
import { createSubscription, ensureClassPlan } from "../_lib/razorpay-subscriptions.js";
import { countSlotSeatOnce, ENROLLMENTS_COLLECTION, type EnrollmentRecord } from "../_lib/fee-store.js";

interface CreateSubscriptionBody {
  enrollmentId?: string;
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

    const body = await readJsonBody<CreateSubscriptionBody>(request);
    const enrollmentId = (body.enrollmentId || "").trim();
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

    const enrollment = { id: enrollmentSnapshot.id, ...(enrollmentSnapshot.data() as Omit<EnrollmentRecord, "id">) };
    if (enrollment.parentUserId !== decoded.uid) {
      sendError(response, 403, "You do not own this enrollment.");
      return;
    }
    if (!enrollment.classId) {
      sendError(response, 400, "Enrollment is missing a class reference.");
      return;
    }

    const razorpay = createRazorpayClient() as unknown as Parameters<typeof ensureClassPlan>[0];
    const { keyId } = getRazorpayCredentials();

    const { planId } = await ensureClassPlan(razorpay, db, enrollment.classId);
    const subscription = await createSubscription(razorpay, {
      planId,
      enrollmentId,
      classId: enrollment.classId,
      parentUserId: decoded.uid,
    });

    await enrollmentRef.update({
      "autopay.method": "upi",
      "autopay.razorpaySubscriptionId": subscription.id,
      "autopay.mandateStatus": "created",
      "autopay.shortUrl": subscription.short_url || "",
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Book the chosen slot's seat (idempotent — guarded by seatCounted).
    await countSlotSeatOnce(db, enrollment.id);

    sendJson(response, 200, {
      subscriptionId: subscription.id,
      keyId,
      shortUrl: subscription.short_url || "",
    });
  } catch (error) {
    console.error("Unable to create class subscription", error);
    if (isFirebaseAuthError(error)) {
      sendError(response, 401, "Invalid Firebase authentication token.");
      return;
    }
    sendError(response, 500, error instanceof Error ? error.message : "Unable to create subscription.");
  }
}
