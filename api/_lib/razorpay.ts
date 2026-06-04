import crypto from "node:crypto";
import Razorpay from "razorpay";

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
}

export const getRazorpayCredentials = (): RazorpayCredentials => {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() || "";

  if (!keyId || !keySecret || keyId.startsWith("FILL_IN_") || keySecret.startsWith("FILL_IN_") || keyId === "rzp_test_replace_me" || keySecret === "replace_me") {
    throw new Error("Razorpay server credentials are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Vercel environment variables.");
  }

  return { keyId, keySecret };
};

export const getRazorpayCurrency = () => (process.env.RAZORPAY_CURRENCY || "INR").trim().toUpperCase();

export const createRazorpayClient = () => {
  const { keyId, keySecret } = getRazorpayCredentials();
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

export const verifyRazorpaySignature = ({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) => {
  const { keySecret } = getRazorpayCredentials();
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  const actualBuffer = Buffer.from(razorpaySignature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
};

// Subscription (autopay mandate) checkout returns a different signature payload:
// HMAC( razorpay_payment_id + "|" + razorpay_subscription_id ).
export const verifyRazorpaySubscriptionSignature = ({
  razorpayPaymentId,
  razorpaySubscriptionId,
  razorpaySignature,
}: {
  razorpayPaymentId: string;
  razorpaySubscriptionId: string;
  razorpaySignature: string;
}) => {
  if (!razorpayPaymentId || !razorpaySubscriptionId || !razorpaySignature) return false;
  const { keySecret } = getRazorpayCredentials();
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpayPaymentId}|${razorpaySubscriptionId}`)
    .digest("hex");

  const actualBuffer = Buffer.from(razorpaySignature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
};