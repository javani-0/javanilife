import { loadRazorpayCheckout } from "@/lib/ecommerce";

// Razorpay Checkout success payload differs for subscriptions (no order id;
// carries a subscription id instead).
export interface RazorpaySubscriptionSuccess {
  razorpay_payment_id?: string;
  razorpay_subscription_id?: string;
  razorpay_signature?: string;
}

export interface CreateSubscriptionResponse {
  subscriptionId: string;
  keyId: string;
  shortUrl?: string;
}

const postJson = async <T>(url: string, idToken: string, payload: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof data?.error === "string" && data.error.trim()
      ? data.error
      : response.status === 401
        ? "Please sign in again before setting up autopay."
        : "Unable to set up autopay. Please try again.";
    throw new Error(message);
  }

  return data as T;
};

/** Ask the server to create a Razorpay plan (if needed) + customer + subscription. */
export const createSubscription = (idToken: string, enrollmentId: string) =>
  postJson<CreateSubscriptionResponse>("/api/razorpay/create-subscription", idToken, { enrollmentId });

/** Ask the server to cancel/pause an existing mandate. */
export const cancelSubscription = (idToken: string, enrollmentId: string, cancelAtCycleEnd = false) =>
  postJson<{ ok: boolean }>("/api/razorpay/cancel-subscription", idToken, { enrollmentId, cancelAtCycleEnd });

/** Open Razorpay Checkout in subscription (mandate authorisation) mode. */
export const openSubscriptionCheckout = ({
  subscriptionId,
  keyId,
  name,
  description,
  prefill,
}: {
  subscriptionId: string;
  keyId: string;
  name?: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
}): Promise<RazorpaySubscriptionSuccess> =>
  loadRazorpayCheckout().then(() => {
    if (!window.Razorpay) throw new Error("Razorpay checkout was not available after loading.");

    return new Promise<RazorpaySubscriptionSuccess>((resolve, reject) => {
      const checkout = new window.Razorpay({
        key: keyId,
        subscription_id: subscriptionId,
        name: name || "Javani Spiritual Hub",
        description: description || "Monthly class fee autopay",
        prefill,
        handler: (response) => resolve(response as RazorpaySubscriptionSuccess),
        modal: {
          ondismiss: () => reject(new Error("Autopay setup was cancelled. You can enable it again anytime.")),
        },
      });

      checkout.on?.("payment.failed", (response) => {
        const description = response.error?.description || response.error?.reason || "Autopay authorisation failed. Please try again.";
        reject(new Error(description));
      });

      checkout.open();
    });
  });
