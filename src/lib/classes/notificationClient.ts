// Thin client wrappers for the Classes payment + notification API endpoints.
import { openRazorpayCheckout, type RazorpaySuccessResponse } from "@/lib/ecommerce";

export type ClassFeeNotifyEvent = "fee-paid" | "fee-reminder" | "fee-failed";

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
      : "Request failed. Please try again.";
    throw new Error(message);
  }

  return data as T;
};

export interface CreateFeeOrderResponse {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  feePaymentId: string;
}

// Target an existing fee doc (subsequent months / "Pay Now") OR an enrollment
// (server creates the fee doc on the fly for the first payment). For term
// courses, `kind` chooses pay-full vs an EMI installment.
export type FeeOrderTarget =
  | { feePaymentId: string }
  | { enrollmentId: string; kind?: "monthly" | "full" | "emi"; installmentNumber?: number };

/** Create a one-time Razorpay order for a single month's fee (manual pay). */
export const createFeeOrder = (idToken: string, target: FeeOrderTarget) =>
  postJson<CreateFeeOrderResponse>("/api/razorpay/create-fee-order", idToken, target);

/** Create the order then open Razorpay Checkout. Resolves on payment success. */
export const payFeeNow = async ({
  idToken,
  feePaymentIdOrEnrollment,
  name,
  description,
  prefill,
}: {
  idToken: string;
  feePaymentIdOrEnrollment: FeeOrderTarget;
  name?: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
}): Promise<RazorpaySuccessResponse> => {
  const order = await createFeeOrder(idToken, feePaymentIdOrEnrollment);
  return openRazorpayCheckout({
    key: order.keyId,
    amount: order.amount,
    currency: order.currency,
    order_id: order.orderId,
    name: name || "Javani Spiritual Hub",
    description: description || "Monthly class fee",
    prefill,
    notes: { feePaymentId: order.feePaymentId, kind: "class-fee" },
  });
};

export interface ClassFeeNotifyResponse {
  ok: boolean;
  feePaymentId: string;
  result?: unknown;
  warnings?: string[];
}

/** Admin/owner-triggered re-send of a fee notification (e.g. resend reminder). */
export const notifyClassFee = (idToken: string, feePaymentId: string, event: ClassFeeNotifyEvent = "fee-reminder") =>
  postJson<ClassFeeNotifyResponse>("/api/classes/notify", idToken, { feePaymentId, event });

export interface CollectCashResponse {
  ok: boolean;
  enrollmentId: string;
  feePaymentId: string;
  notification?: unknown;
}

/** Admin: collect cash from a pending enrollment. Activates enrollment + creates cash fee + sends WhatsApp. */
export const collectCashPayment = (idToken: string, enrollmentId: string) =>
  postJson<CollectCashResponse>("/api/classes/collect-cash", idToken, { enrollmentId });
