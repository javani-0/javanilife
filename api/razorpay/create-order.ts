import { getFirebaseAdminAuth } from "../_lib/firebase-admin.ts";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.ts";
import { createRazorpayClient, getRazorpayCredentials, getRazorpayCurrency } from "../_lib/razorpay.ts";

interface CreateRazorpayOrderBody {
  amountInPaise?: number;
  orderNumber?: string;
  customerId?: string;
  customerName?: string;
}

const normalizeReceipt = (orderNumber: string) => {
  const normalized = orderNumber.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return normalized || `JAV-${Date.now()}`.slice(0, 40);
};

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requirePost(request, response)) return;

  try {
    const token = getBearerToken(request);
    if (!token) {
      sendError(response, 401, "Missing Firebase authentication token.");
      return;
    }

    const body = await readJsonBody<CreateRazorpayOrderBody>(request);
    const amountInPaise = Number(body.amountInPaise);
    const customerId = body.customerId || "";
    const orderNumber = body.orderNumber || "";

    if (!Number.isInteger(amountInPaise) || amountInPaise < 100) {
      sendError(response, 400, "Invalid Razorpay order amount.");
      return;
    }
    if (!customerId || !orderNumber) {
      sendError(response, 400, "Missing order or customer information.");
      return;
    }

    const decodedToken = await getFirebaseAdminAuth().verifyIdToken(token);
    if (decodedToken.uid !== customerId) {
      sendError(response, 403, "Authenticated user does not match the order customer.");
      return;
    }

    const razorpay = createRazorpayClient();
    const { keyId } = getRazorpayCredentials();
    const currency = getRazorpayCurrency();
    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency,
      receipt: normalizeReceipt(orderNumber),
      notes: {
        orderNumber,
        customerId,
        customerName: body.customerName || "",
      },
    });

    sendJson(response, 200, {
      keyId,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      receipt: razorpayOrder.receipt,
      status: razorpayOrder.status,
    });
  } catch (error) {
    console.error("Unable to create Razorpay order", error);
    sendError(response, 500, error instanceof Error ? error.message : "Unable to create Razorpay order.");
  }
}