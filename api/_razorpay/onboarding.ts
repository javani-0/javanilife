import { getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { createRazorpayClient, getRazorpayCredentials, getRazorpayCurrency, verifyRazorpaySignature } from "../_lib/razorpay.js";

// ---------------------------------------------------------------------------
// Public onboarding-link actions (req 2). The parent is NOT signed in — the
// unguessable link token is the capability. Three actions share this handler
// (routed by api/razorpay.ts):
//   onboarding-submit — record a UPI-screenshot payment or a pay-at-counter choice
//   onboarding-order  — create a Razorpay order for the (server-priced) total
//   onboarding-verify — verify the Razorpay signature and mark the link paid
// All writes go through here (Admin SDK); the link doc itself is read-only to
// the public client.
// ---------------------------------------------------------------------------

const ONBOARDING_LINKS = "onboardingLinks";
const STUDENTS = "students";

interface OnboardingBody {
  token?: string;
  method?: "qr" | "counter";
  proofUrl?: string;
  upiRef?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
}

const isHttpUrl = (value: string) => /^https?:\/\/\S+$/i.test(value);
const getString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);

const loadLink = async (db: FirebaseFirestore.Firestore, token: string) => {
  if (!token || token.length < 16) return null;
  const snapshot = await db.collection(ONBOARDING_LINKS).doc(token).get();
  return snapshot.exists ? { ref: snapshot.ref, data: snapshot.data() || {} } : null;
};

/** Mirror a status change onto the admin-side student doc (best-effort). */
const updateStudentDoc = async (
  db: FirebaseFirestore.Firestore,
  studentDocId: string,
  patch: Record<string, unknown>,
): Promise<void> => {
  if (!studentDocId) return;
  try {
    await db.collection(STUDENTS).doc(studentDocId).set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch (error) {
    console.error("Onboarding: student doc mirror failed", { studentDocId, error });
  }
};

export default async function handler(request: ApiRequest, response: ApiResponse, action: string) {
  if (!requirePost(request, response)) return;

  try {
    const body = await readJsonBody<OnboardingBody>(request);
    const token = (body.token || "").trim();
    const db = getFirebaseAdminDb();

    const link = await loadLink(db, token);
    if (!link) {
      sendError(response, 404, "This payment link is invalid or has been replaced. Please ask us for a fresh link.");
      return;
    }
    const status = getString(link.data.status, "awaiting-payment");
    const studentDocId = getString(link.data.studentDocId);

    if (status === "approved" && action !== "onboarding-verify") {
      sendError(response, 409, "This admission is already approved — your login details are on the link page.");
      return;
    }

    // ── Record a QR-screenshot payment or a pay-at-counter choice ──
    if (action === "onboarding-submit") {
      const method = body.method === "counter" ? "counter" : "qr";
      if (method === "qr") {
        const proofUrl = (body.proofUrl || "").trim();
        if (!proofUrl || !isHttpUrl(proofUrl)) {
          sendError(response, 400, "Please upload the payment screenshot.");
          return;
        }
        const upiRef = (body.upiRef || "").trim().slice(0, 40);
        await link.ref.set({
          status: "payment-submitted",
          rejectReason: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        await updateStudentDoc(db, studentDocId, {
          onboardingStatus: "payment-submitted",
          proofUrl,
          ...(upiRef ? { upiRef } : {}),
          paidVia: "qr",
          rejectReason: FieldValue.delete(),
        });
        sendJson(response, 200, { ok: true, status: "payment-submitted" });
        return;
      }

      await link.ref.set({
        status: "counter-chosen",
        rejectReason: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      await updateStudentDoc(db, studentDocId, { onboardingStatus: "counter-chosen", paidVia: "counter", rejectReason: FieldValue.delete() });
      sendJson(response, 200, { ok: true, status: "counter-chosen" });
      return;
    }

    // ── Create a Razorpay order for the onboarding total ──
    if (action === "onboarding-order") {
      const methods = (link.data.methods || {}) as Record<string, unknown>;
      if (methods.razorpay !== true) {
        sendError(response, 400, "Online payment isn't enabled for this link.");
        return;
      }
      const amountInPaise = Math.max(0, Math.round(Number(link.data.totalInPaise || 0)));
      if (amountInPaise < 100) {
        sendError(response, 400, "There is nothing to pay online on this link.");
        return;
      }
      const razorpay = createRazorpayClient();
      const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: getRazorpayCurrency(),
        receipt: `onb_${token.slice(0, 24)}`,
        notes: { purpose: "student-onboarding", onboardingToken: token },
      });
      await link.ref.set({ razorpayOrderId: order.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      sendJson(response, 200, {
        orderId: order.id,
        amountInPaise,
        currency: getRazorpayCurrency(),
        keyId: getRazorpayCredentials().keyId,
      });
      return;
    }

    // ── Verify the checkout result and mark the link paid online ──
    if (action === "onboarding-verify") {
      const razorpayOrderId = (body.razorpay_order_id || "").trim();
      const razorpayPaymentId = (body.razorpay_payment_id || "").trim();
      const razorpaySignature = (body.razorpay_signature || "").trim();
      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        sendError(response, 400, "Missing payment confirmation details.");
        return;
      }
      if (!verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature })) {
        sendError(response, 400, "Payment could not be verified. If you were charged, please contact us.");
        return;
      }
      // The signature proves authenticity; the order note proves it was THIS
      // link's order (a signature from some other checkout can't be replayed).
      const razorpay = createRazorpayClient();
      const order = await razorpay.orders.fetch(razorpayOrderId);
      const orderToken = getString((order.notes || {} as Record<string, unknown>).onboardingToken as string);
      if (orderToken !== token) {
        sendError(response, 400, "This payment does not belong to this admission link.");
        return;
      }

      await link.ref.set({
        status: "approved" === status ? status : "paid-online",
        razorpayOrderId,
        razorpayPaymentId,
        rejectReason: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (status !== "approved") {
        await updateStudentDoc(db, studentDocId, {
          onboardingStatus: "paid-online",
          paidVia: "razorpay",
          razorpayPaymentId,
          rejectReason: FieldValue.delete(),
        });
      }
      sendJson(response, 200, { ok: true, status: "paid-online" });
      return;
    }

    sendError(response, 404, "Unknown onboarding action.");
  } catch (error) {
    console.error("Onboarding action failed", { action, error });
    sendError(response, 500, error instanceof Error ? error.message : "Something went wrong. Please try again.");
  }
}
