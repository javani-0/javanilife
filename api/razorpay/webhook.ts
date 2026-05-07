import crypto from "node:crypto";
import { getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";

// ---------------------------------------------------------------------------
// Razorpay Webhook Handler
// ---------------------------------------------------------------------------
// Razorpay sends a POST to this endpoint whenever a payment event occurs.
// We handle `payment.captured` to mark orders paid even if the user's browser
// closed before our client-side verify-payment flow could run.
//
// Env var required: RAZORPAY_WEBHOOK_SECRET  (set in Vercel + Razorpay dashboard)
// ---------------------------------------------------------------------------

interface RazorpayWebhookPayload {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        currency?: string;
        status?: string;
      };
    };
  };
}

function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(signature, "hex");
  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

async function getRawBody(request: ApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk: Buffer | string) => {
      data += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    request.on("end", () => resolve(data));
    request.on("error", reject);
  });
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requirePost(request, response)) return;

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || "";
  if (!webhookSecret) {
    // If the secret isn't configured, reject all webhook requests for security.
    sendError(response, 500, "Webhook secret is not configured.");
    return;
  }

  const rawBody = await getRawBody(request);
  const signature = (request.headers["x-razorpay-signature"] as string) || "";

  if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    sendError(response, 400, "Invalid webhook signature.");
    return;
  }

  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
  } catch {
    sendError(response, 400, "Invalid JSON payload.");
    return;
  }

  const event = payload.event || "";
  const payment = payload.payload?.payment?.entity;

  // Only act on payment.captured (money successfully received)
  if (event === "payment.captured" && payment) {
    const razorpayOrderId = payment.order_id || "";
    const razorpayPaymentId = payment.id || "";

    if (razorpayOrderId) {
      try {
        const db = getFirebaseAdminDb();

        // Find the order by its Razorpay order ID
        const ordersQuery = await db
          .collection("orders")
          .where("payment.razorpayOrderId", "==", razorpayOrderId)
          .limit(1)
          .get();

        if (!ordersQuery.empty) {
          const orderDoc = ordersQuery.docs[0];
          const orderData = orderDoc.data() || {};

          // Only update if not already marked paid (idempotency)
          if (orderData.status !== "paid" && orderData.status !== "processing" && orderData.status !== "shipped" && orderData.status !== "delivered") {
            await orderDoc.ref.update({
              status: "paid",
              "payment.razorpayPaymentId": razorpayPaymentId,
              "payment.paidAt": FieldValue.serverTimestamp(),
              "payment.verifiedVia": "webhook",
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        }
      } catch (error) {
        // Log the error but still return 200 so Razorpay doesn't retry endlessly
        console.error("Webhook: error updating order", { razorpayOrderId, error });
      }
    }
  }

  // Always return 200 to acknowledge receipt (even for events we don't handle)
  sendJson(response, 200, { received: true });
}
