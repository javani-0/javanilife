import type { CheckoutAddress } from "./types";

const RAZORPAY_CHECKOUT_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

interface RazorpayCheckoutInstance {
  open: () => void;
  on?: (event: "payment.failed", handler: (response: RazorpayFailureResponse) => void) => void;
}

export interface RazorpaySuccessResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayFailureResponse {
  error?: {
    code?: string;
    description?: string;
    reason?: string;
    source?: string;
    step?: string;
  };
}

export interface RazorpayCreateOrderResponse {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  receipt?: string;
  status?: string;
}

export interface RazorpayVerifyPaymentResponse {
  verified: boolean;
}

export interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
  };
  modal?: {
    ondismiss?: () => void;
  };
  handler?: (response: RazorpaySuccessResponse) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance;
  }
}

let razorpayScriptPromise: Promise<void> | null = null;

const postJson = async <T>(url: string, idToken: string, payload: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof data?.error === "string" && data.error.trim()
      ? data.error
      : response.status === 401
        ? "Please sign in again before starting online payment."
        : "Unable to start Razorpay payment. Please try again.";
    throw new Error(message);
  }

  return data as T;
};

export const createRazorpayReceipt = (orderNumber: string): string => {
  const normalized = orderNumber.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return normalized || `JAV-${Date.now()}`.slice(0, 40);
};

export const createRazorpayPrefill = (address: CheckoutAddress, fallbackEmail?: string | null) => ({
  name: address.fullName,
  email: address.email || fallbackEmail || "",
  contact: address.phone,
});

export const createRazorpayOrder = ({
  idToken,
  amountInPaise,
  orderNumber,
  customerId,
  customerName,
}: {
  idToken: string;
  amountInPaise: number;
  orderNumber: string;
  customerId: string;
  customerName: string;
}) => postJson<RazorpayCreateOrderResponse>("/api/razorpay/create-order", idToken, {
  amountInPaise,
  amount: amountInPaise,
  orderNumber: createRazorpayReceipt(orderNumber),
  receipt: createRazorpayReceipt(orderNumber),
  currency: "INR",
  customerId,
  customerName,
});

export const verifyRazorpayPayment = ({
  idToken,
  orderDocumentId,
  response,
}: {
  idToken: string;
  orderDocumentId: string;
  response: RazorpaySuccessResponse;
}) => postJson<RazorpayVerifyPaymentResponse>("/api/razorpay/verify-payment", idToken, {
  orderDocumentId,
  razorpayOrderId: response.razorpay_order_id,
  razorpayPaymentId: response.razorpay_payment_id,
  razorpaySignature: response.razorpay_signature,
  razorpay_order_id: response.razorpay_order_id,
  razorpay_payment_id: response.razorpay_payment_id,
  razorpay_signature: response.razorpay_signature,
});

export const loadRazorpayCheckout = () => {
  if (typeof window === "undefined") return Promise.reject(new Error("Razorpay checkout can only run in the browser."));
  if (window.Razorpay) return Promise.resolve();
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = RAZORPAY_CHECKOUT_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      razorpayScriptPromise = null;
      reject(new Error("Unable to load Razorpay checkout. Please check your connection and try again."));
    };
    document.body.appendChild(script);
  });

  return razorpayScriptPromise;
};

export const openRazorpayCheckout = async (options: RazorpayCheckoutOptions): Promise<RazorpaySuccessResponse> => {
  await loadRazorpayCheckout();

  if (!window.Razorpay) {
    throw new Error("Razorpay checkout was not available after loading.");
  }

  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      ...options,
      handler: resolve,
      modal: {
        ...options.modal,
        ondismiss: () => reject(new Error("Razorpay checkout was cancelled. Your order is saved as payment pending.")),
      },
    });

    checkout.on?.("payment.failed", (response) => {
      const description = response.error?.description || response.error?.reason || "Razorpay payment failed. Your order is saved as payment pending.";
      reject(new Error(description));
    });

    checkout.open();
  });
};