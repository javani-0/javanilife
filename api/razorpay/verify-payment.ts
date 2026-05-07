import { getFirebaseAdminAuth, getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { createRazorpayClient, getRazorpayCurrency, verifyRazorpaySignature } from "../_lib/razorpay.js";

interface VerifyRazorpayPaymentBody {
  orderDocumentId?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
}

interface RazorpayPaymentFetchResponse {
  order_id?: string;
  amount?: number;
  currency?: string;
  status?: string;
}

interface StoredOrderData {
  customerId?: string;
  totalInPaise?: number;
  payment?: {
    method?: string;
    razorpayOrderId?: string;
  };
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

    const body = await readJsonBody<VerifyRazorpayPaymentBody>(request);
    const orderDocumentId = body.orderDocumentId || "";
    const razorpayOrderId = body.razorpayOrderId || body.razorpay_order_id || "";
    const razorpayPaymentId = body.razorpayPaymentId || body.razorpay_payment_id || "";
    const razorpaySignature = body.razorpaySignature || body.razorpay_signature || "";

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      sendError(response, 400, "Missing Razorpay verification fields.");
      return;
    }

    const decodedToken = await getFirebaseAdminAuth().verifyIdToken(token);

    const orderReference = orderDocumentId ? getFirebaseAdminDb().collection("orders").doc(orderDocumentId) : null;
    let orderData: StoredOrderData | null = null;
    if (orderReference) {
      const orderSnapshot = await orderReference.get();
      if (!orderSnapshot.exists) {
        sendError(response, 404, "Order was not found.");
        return;
      }

      orderData = (orderSnapshot.data() || {}) as StoredOrderData;
      if (orderData.customerId !== decodedToken.uid) {
        sendError(response, 403, "Authenticated user does not own this order.");
        return;
      }
      if (orderData.payment?.method !== "razorpay" || orderData.payment?.razorpayOrderId !== razorpayOrderId) {
        sendError(response, 409, "Razorpay order does not match the stored order.");
        return;
      }
    }

    const verified = verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature });
    if (!verified) {
      if (orderReference) {
        await orderReference.update({
          "payment.status": "failed",
          "payment.razorpayPaymentId": razorpayPaymentId,
          "payment.razorpaySignatureVerified": false,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      sendError(response, 400, "Razorpay signature verification failed.");
      return;
    }

    const payment = await createRazorpayClient().payments.fetch(razorpayPaymentId) as RazorpayPaymentFetchResponse;
    if (payment.order_id !== razorpayOrderId) {
      sendError(response, 409, "Razorpay payment does not belong to this order.");
      return;
    }
    if (!orderDocumentId) {
      if (!payment.currency || !["captured", "authorized"].includes(String(payment.status || ""))) {
        sendError(response, 409, "Razorpay payment is not successful yet.");
        return;
      }
      sendJson(response, 200, { verified: true, paymentStatus: payment.status });
      return;
    }

    if (!orderReference || !orderData) {
      sendError(response, 400, "Missing order context for Razorpay verification.");
      return;
    }
    if (payment.currency !== getRazorpayCurrency().toUpperCase() || Number(payment.amount) !== Number(orderData.totalInPaise)) {
      sendError(response, 409, "Razorpay payment amount does not match the stored order total.");
      return;
    }
    if (!["captured", "authorized"].includes(String(payment.status || ""))) {
      sendError(response, 409, "Razorpay payment is not successful yet.");
      return;
    }

    await orderReference.update({
      "payment.status": "paid",
      "payment.razorpayPaymentId": razorpayPaymentId,
      "payment.razorpaySignatureVerified": true,
      "payment.paidAt": FieldValue.serverTimestamp(),
      timeline: FieldValue.arrayUnion({
        status: "placed",
        label: "Online payment received",
        note: "Razorpay payment signature was verified on the server.",
        createdAt: new Date().toISOString(),
        createdBy: decodedToken.uid,
      }),
      updatedAt: FieldValue.serverTimestamp(),
    });

    sendJson(response, 200, { verified: true, paymentStatus: payment.status });
  } catch (error) {
    console.error("Unable to verify Razorpay payment", error);
    if (isFirebaseAuthError(error)) {
      sendError(response, 401, "Invalid Firebase authentication token.");
      return;
    }
    sendError(response, 500, error instanceof Error ? error.message : "Unable to verify Razorpay payment.");
  }
}