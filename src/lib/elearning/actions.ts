// Client callers for the E-Learning server actions (api/_razorpay/elearn.ts,
// routed through api/razorpay.ts). Amounts always come from Firestore on the
// server; the client only names the course.
import { openRazorpayCheckout } from "@/lib/ecommerce/payments";
import { uploadPaymentProof } from "@/lib/classes/upiPayments";
import { parseVimeoUrl, vimeoOembedUrl, youTubeOembedUrl } from "./helpers";

export { uploadPaymentProof };

const postJson = async <T>(action: string, idToken: string, payload: unknown): Promise<T> => {
  const response = await fetch(`/api/razorpay/${action}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.error === "string" && data.error.trim()
      ? data.error
      : response.status === 401
        ? "Please sign in again and retry."
        : "Something went wrong. Please try again.";
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return data as T;
};

// ── elearn-order ───────────────────────────────────────────────────────────
// courseIds: 1-5 master classes bought together in one payment.

export interface ElearnOrderResponse {
  free?: undefined;
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  enrollmentId: string;
  enrollmentIds: string[];
  courseTitle: string;
}

/** A 100% coupon: no payment; it waits for staff approval in Purchases. */
export interface ElearnFreeResponse {
  free: true;
  status: "processing";
  enrollmentId: string;
  enrollmentIds: string[];
  courseIds: string[];
}

export const createElearnOrder = (idToken: string, courseIds: string[], couponCode?: string | null) =>
  postJson<ElearnOrderResponse | ElearnFreeResponse>("elearn-order", idToken, { courseIds, ...(couponCode ? { couponCode } : {}) });

// ── elearn-coupon (price preview; the server re-checks it on order/UPI) ─────

export interface ElearnCouponPreview {
  ok: true;
  priceInPaise: number;
  couponCode: string;
  discountInPaise: number;
  finalInPaise: number;
  /** The coupon covers the whole price. */
  free: boolean;
}

export const previewElearnCoupon = (idToken: string, courseIds: string[], couponCode: string) =>
  postJson<ElearnCouponPreview>("elearn-coupon", idToken, { courseIds, couponCode });

// ── elearn-verify ──────────────────────────────────────────────────────────

export interface ElearnVerifyRequest {
  courseIds: string[];
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface ElearnVerifyResponse {
  verified: boolean;
  status: "active" | "processing";
  enrollmentId: string;
  enrollmentIds?: string[];
  /** ISO string, or null for lifetime access. */
  expiresAt: string | null;
  alreadyActive?: boolean;
  /** Given by a 100% coupon (no payment was taken). */
  free?: boolean;
}

export const verifyElearnPayment = (idToken: string, payload: ElearnVerifyRequest) =>
  postJson<ElearnVerifyResponse>("elearn-verify", idToken, payload);

/**
 * The whole online purchase: create the order, open Razorpay checkout, verify on
 * the server. Resolves once access is active. Rejects with the checkout's
 * message if the buyer closes it or the payment fails (the webhook still
 * activates a payment that was captured but not verified here). When a coupon
 * makes the total 0 the server gives access at once and checkout never opens.
 */
export const buyCourseWithRazorpay = async ({
  idToken,
  courseIds,
  couponCode,
  prefill,
  themeColor = "#8B1A1A",
}: {
  idToken: string;
  courseIds: string[];
  couponCode?: string | null;
  prefill?: { name?: string; email?: string; contact?: string };
  themeColor?: string;
}): Promise<ElearnVerifyResponse> => {
  const order = await createElearnOrder(idToken, courseIds, couponCode);
  if (!("orderId" in order)) {
    return { verified: false, status: "processing", enrollmentId: order.enrollmentId, enrollmentIds: order.enrollmentIds, expiresAt: null, free: true };
  }
  const result = await openRazorpayCheckout({
    key: order.keyId,
    amount: order.amount,
    currency: order.currency,
    order_id: order.orderId,
    name: "Javani Spiritual Hub",
    description: order.courseTitle,
    prefill,
    notes: { kind: "elearn", courseId: courseIds[0] },
    theme: { color: themeColor },
  });
  return verifyElearnPayment(idToken, {
    courseIds,
    razorpay_order_id: result.razorpay_order_id,
    razorpay_payment_id: result.razorpay_payment_id,
    razorpay_signature: result.razorpay_signature,
  });
};

// ── elearn-submit-upi ──────────────────────────────────────────────────────

export interface ElearnSubmitUpiRequest {
  courseIds: string[];
  /** From uploadPaymentProof(file): https on our Cloudinary cloud. */
  proofUrl: string;
  /** Required: the 12-digit UTR / UPI reference number (spaces/dashes allowed, the server strips them). */
  upiRef: string;
  /** A coupon the buyer applied; the server re-checks it and saves the discounted amount. */
  couponCode?: string;
}

export interface ElearnSubmitUpiResponse {
  ok: true;
  enrollmentId: string;
  status: "processing";
}

export const submitElearnUpi = (idToken: string, payload: ElearnSubmitUpiRequest) =>
  postJson<ElearnSubmitUpiResponse>("elearn-submit-upi", idToken, payload);

// ── elearn-review (staff) ──────────────────────────────────────────────────

export type ElearnReviewRequest =
  | { op: "approve"; enrollmentId: string }
  | { op: "reject"; enrollmentId: string; reason?: string }
  | { op: "revoke"; enrollmentId: string; reason?: string }
  /** Delete a revoked / rejected record so that account can buy again. */
  | { op: "reopen"; enrollmentId: string }
  /** Give free access: by `email` (looked up in Firebase Auth) or `uid`. */
  | { op: "grant"; courseId: string; email?: string; uid?: string; accessDays?: number };

export interface ElearnReviewResponse {
  ok: true;
  enrollmentId: string;
  status: "active" | "rejected" | "revoked" | "reopened";
  alreadyActive?: boolean;
}

export const reviewElearnEnrollment = (idToken: string, payload: ElearnReviewRequest) =>
  postJson<ElearnReviewResponse>("elearn-review", idToken, payload);

// ── Vimeo oEmbed (admin auto-fill) ─────────────────────────────────────────

export interface VimeoOembedInfo {
  title: string;
  durationSec: number;
  thumbnailUrl: string;
}

/**
 * Title / duration / thumbnail from Vimeo's or YouTube's public oEmbed; null on
 * any failure. YouTube gives no duration (durationSec 0: the admin types it).
 */
export const fetchVimeoOembed = async (link: string): Promise<VimeoOembedInfo | null> => {
  const url = parseVimeoUrl(link) ? vimeoOembedUrl(link) : youTubeOembedUrl(link);
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return {
      title: typeof data?.title === "string" ? data.title.trim() : "",
      durationSec: Math.max(0, Math.round(Number(data?.duration) || 0)),
      thumbnailUrl: typeof data?.thumbnail_url === "string" ? data.thumbnail_url : "",
    };
  } catch {
    return null;
  }
};
