import { getFirebaseAdminAuth } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { createRazorpayClient, getRazorpayCredentials, getRazorpayCurrency } from "../_lib/razorpay.js";

interface CreateRazorpayOrderBody {
  amountInPaise?: number;
  amount?: number;
  currency?: string;
  receipt?: string;
  orderNumber?: string;
  customerId?: string;
  customerName?: string;
}

const normalizeReceipt = (orderNumber: string) => {
  const normalized = orderNumber.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return normalized || `JAV-${Date.now()}`.slice(0, 40);
};

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

    const body = await readJsonBody<CreateRazorpayOrderBody>(request);
    const decodedToken = await getFirebaseAdminAuth().verifyIdToken(token);
    const amountInPaise = Number(body.amountInPaise ?? body.amount);
    const customerId = body.customerId || decodedToken.uid;
    const orderNumber = body.orderNumber || body.receipt || "";

    if (!Number.isInteger(amountInPaise) || amountInPaise < 100) {
      sendError(response, 400, "Invalid Razorpay order amount.");
      return;
    }
    if (!orderNumber) {
      sendError(response, 400, "Missing Razorpay order receipt.");
      return;
    }

    if (decodedToken.uid !== customerId) {
      sendError(response, 403, "Authenticated user does not match the order customer.");
      return;
    }

    const razorpay = createRazorpayClient();
    const { keyId } = getRazorpayCredentials();
    const configuredCurrency = getRazorpayCurrency().toUpperCase();
    const currency = (body.currency || configuredCurrency).toUpperCase();
    if (currency !== configuredCurrency) {
      sendError(response, 400, "Unsupported Razorpay currency.");
      return;
    }
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
      order_id: razorpayOrder.id,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      receipt: razorpayOrder.receipt,
      status: razorpayOrder.status,
    });
  } catch (error: any) {
    console.error("Unable to create Razorpay order", error);
    if (isFirebaseAuthError(error)) {
      sendError(response, 401, "Invalid Firebase authentication token.");
      return;
    }
    
    // Extract Razorpay SDK errors if present
    let message = "Unable to create Razorpay order.";
    if (error?.error?.description) {
      message = error.error.description;
    } else if (error?.description) {
      message = error.description;
    } else if (error instanceof Error) {
      message = error.message;
    }
    
    sendError(response, 500, message);
  }
}