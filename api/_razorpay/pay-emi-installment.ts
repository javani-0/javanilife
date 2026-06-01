import { getFirebaseAdminAuth, getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { createRazorpayClient, getRazorpayCredentials, getRazorpayCurrency } from "../_lib/razorpay.js";

interface PayEmiInstallmentBody {
  orderDocumentId?: string;
  installmentNumber?: number;
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

    const body = await readJsonBody<PayEmiInstallmentBody>(request);
    const orderDocumentId = (body.orderDocumentId || "").trim();
    const installmentNumber = Number(body.installmentNumber);

    if (!orderDocumentId || !installmentNumber) {
      sendError(response, 400, "orderDocumentId and installmentNumber are required.");
      return;
    }

    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    const db = getFirebaseAdminDb();
    const orderRef = db.collection("orders").doc(orderDocumentId);
    const orderSnapshot = await orderRef.get();

    if (!orderSnapshot.exists) {
      sendError(response, 404, "Order was not found.");
      return;
    }

    const orderData = orderSnapshot.data() || {};
    
    if (orderData.timeline && Array.isArray(orderData.timeline)) {
      const placedEvent = orderData.timeline.find((t: any) => t.status === "placed");
      if (placedEvent && placedEvent.createdBy && placedEvent.createdBy !== decoded.uid) {
        sendError(response, 403, "You do not own this order.");
        return;
      }
    }

    const paymentInfo = orderData.payment || {};
    if (paymentInfo.method !== "razorpay" || paymentInfo.plan !== "installment") {
      sendError(response, 400, "This order is not an EMI order.");
      return;
    }

    const installmentPlan = paymentInfo.installmentPlan;
    if (!installmentPlan || !Array.isArray(installmentPlan.installments)) {
      sendError(response, 400, "EMI installment plan not found on order.");
      return;
    }

    const targetInstallment = installmentPlan.installments.find((inst: any) => inst.installmentNumber === installmentNumber);
    if (!targetInstallment) {
      sendError(response, 404, "Installment not found.");
      return;
    }

    if (targetInstallment.status === "paid") {
      sendError(response, 400, "This installment is already paid.");
      return;
    }

    const amountInPaise = targetInstallment.amountInPaise;
    const orderNumber = orderData.orderNumber || "JAV-EMI";

    const razorpay = createRazorpayClient();
    const { keyId } = getRazorpayCredentials();

    const receiptId = `EMI-${orderDocumentId.slice(0, 10)}-${installmentNumber}`;

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: getRazorpayCurrency().toUpperCase(),
      receipt: receiptId,
      notes: {
        kind: "emi-installment",
        orderDocumentId,
        installmentNumber: String(installmentNumber)
      },
    });

    sendJson(response, 200, {
      keyId,
      orderId: order.id,
      amount: amountInPaise,
      currency: order.currency,
      receipt: order.receipt,
    });
  } catch (error) {
    console.error("Unable to create EMI installment payment order", error);
    if (isFirebaseAuthError(error)) {
      sendError(response, 401, "Invalid Firebase authentication token.");
      return;
    }
    sendError(response, 500, error instanceof Error ? error.message : "Unable to process payment.");
  }
}
