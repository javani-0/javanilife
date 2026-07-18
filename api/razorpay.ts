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
import confirmSubscription from "./_razorpay/confirm-subscription.js";
// @ts-ignore
import verifyPayment from "./_razorpay/verify-payment.js";
// @ts-ignore
// @ts-ignore
import webhook from "./_razorpay/webhook.js";
// @ts-ignore
import createEmiSubscription from "./_razorpay/create-emi-subscription.js";
// @ts-ignore
import payEmiInstallment from "./_razorpay/pay-emi-installment.js";
// @ts-ignore
import submitUpiPayment from "./_razorpay/submit-upi-payment.js";
// @ts-ignore
import approvePayment from "./_razorpay/approve-payment.js";
// @ts-ignore
import createPartnerLogin from "./_razorpay/create-partner-login.js";
// @ts-ignore
import createManagerLogin from "./_razorpay/create-manager-login.js";
// @ts-ignore
import onboarding from "./_razorpay/onboarding.js";
// @ts-ignore
import approveOnboarding from "./_razorpay/approve-onboarding.js";
// @ts-ignore
import deleteStudent from "./_razorpay/delete-student.js";
// Folded into this router (not a separate function) to stay within the Hobby
// plan's 12-serverless-function limit. Reached via /api/partner/summary (see
// vercel.json rewrite). Not razorpay-related, but this is the project's shared
// multi-action function.
import partnerSummary from "./_lib/partner-summary.js";

export default async function handler(request: ApiRequest, response: ApiResponse) {
  const url = request.url || "";
  const action = request.query?.action;

  if (action === "partner-summary" || url.includes("/partner/summary")) {
    return partnerSummary(request, response);
  }
  if (action === "cancel-subscription" || url.includes("/cancel-subscription")) {
    return cancelSubscription(request, response);
  }
  if (action === "create-fee-order" || url.includes("/create-fee-order")) {
    return createFeeOrder(request, response);
  }
  if (action === "submit-upi-payment" || url.includes("/submit-upi-payment")) {
    return submitUpiPayment(request, response);
  }
  if (action === "approve-payment" || url.includes("/approve-payment")) {
    return approvePayment(request, response);
  }
  if (action === "create-partner-login" || url.includes("/create-partner-login")) {
    return createPartnerLogin(request, response);
  }
  if (action === "create-manager-login" || url.includes("/create-manager-login")) {
    return createManagerLogin(request, response);
  }
  if (action === "approve-onboarding" || url.includes("/approve-onboarding")) {
    return approveOnboarding(request, response);
  }
  if (action === "delete-student" || url.includes("/delete-student")) {
    return deleteStudent(request, response);
  }
  // The three public onboarding-link actions share one handler (passed the action).
  if (action === "onboarding-submit" || url.includes("/onboarding-submit")) {
    return onboarding(request, response, "onboarding-submit");
  }
  if (action === "onboarding-order" || url.includes("/onboarding-order")) {
    return onboarding(request, response, "onboarding-order");
  }
  if (action === "onboarding-verify" || url.includes("/onboarding-verify")) {
    return onboarding(request, response, "onboarding-verify");
  }
  if (action === "create-order" || url.includes("/create-order")) {
    return createOrder(request, response);
  }
  if (action === "create-subscription" || url.includes("/create-subscription")) {
    return createSubscription(request, response);
  }
  if (action === "confirm-subscription" || url.includes("/confirm-subscription")) {
    return confirmSubscription(request, response);
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
