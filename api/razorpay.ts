import type { ApiRequest, ApiResponse } from "./_lib/http.js";

// @ts-ignore
import cancelSubscription from "./_razorpay/cancel-subscription.js";
// @ts-ignore
import createFeeOrder from "./_razorpay/create-fee-order.js";
// @ts-ignore
import createOrder from "./_razorpay/create-order.js";
// @ts-ignore
import createSubscription from "./_razorpay/create-subscription.js";
// @ts-ignore
import verifyPayment from "./_razorpay/verify-payment.js";
// @ts-ignore
// @ts-ignore
import webhook from "./_razorpay/webhook.js";
// @ts-ignore
import createEmiSubscription from "./_razorpay/create-emi-subscription.js";
// @ts-ignore
import payEmiInstallment from "./_razorpay/pay-emi-installment.js";

export default async function handler(request: ApiRequest, response: ApiResponse) {
  const url = request.url || "";
  const action = request.query?.action;

  if (action === "cancel-subscription" || url.includes("/cancel-subscription")) {
    return cancelSubscription(request, response);
  }
  if (action === "create-fee-order" || url.includes("/create-fee-order")) {
    return createFeeOrder(request, response);
  }
  if (action === "create-order" || url.includes("/create-order")) {
    return createOrder(request, response);
  }
  if (action === "create-subscription" || url.includes("/create-subscription")) {
    return createSubscription(request, response);
  }
  if (action === "create-emi-subscription" || url.includes("/create-emi-subscription")) {
    return createEmiSubscription(request, response);
  }
  if (action === "pay-emi-installment" || url.includes("/pay-emi-installment")) {
    return payEmiInstallment(request, response);
  }
  if (action === "verify-payment" || url.includes("/verify-payment")) {
    return verifyPayment(request, response);
  }
  if (action === "webhook" || url.includes("/webhook")) {
    return webhook(request, response);
  }

  response.status(404).json({ error: "Razorpay route not found" });
}
