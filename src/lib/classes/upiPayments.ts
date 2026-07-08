import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@/lib/cloudinary";

// Client wrappers for the manual-UPI payment flow (req 1). The student pays to
// the admin's UPI id / QR, uploads a screenshot (to Cloudinary), and submits it
// for admin approval. No Razorpay commission on this rail.

export type UpiPaymentTarget =
  | { feePaymentId: string }
  // `monthKey` ("YYYY-MM") lets a monthly student pay a specific (future) month
  // in advance; omit it to target the current month.
  | { enrollmentId: string; kind: "monthly" | "full"; monthKey?: string };

const postJson = async <T>(url: string, idToken: string, payload: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.error === "string" && data.error.trim() ? data.error : "Request failed. Please try again.";
    throw new Error(message);
  }
  return data as T;
};

/** Upload a payment screenshot to Cloudinary; returns the hosted image URL. */
export const uploadPaymentProof = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", "payment-proofs");
  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) throw new Error("Could not upload the screenshot. Please try again.");
  const data = await response.json();
  const url = typeof data?.secure_url === "string" ? data.secure_url : typeof data?.url === "string" ? data.url : "";
  if (!url) throw new Error("Upload succeeded but no image URL was returned.");
  return url;
};

export interface SubmitUpiResponse { ok: boolean; feePaymentId: string }

/** Submit a UPI payment screenshot for admin approval. */
export const submitUpiPayment = (
  idToken: string,
  target: UpiPaymentTarget,
  proofUrl: string,
  upiRef?: string,
  couponCode?: string,
): Promise<SubmitUpiResponse> =>
  postJson<SubmitUpiResponse>("/api/razorpay/submit-upi-payment", idToken, { ...target, proofUrl, upiRef, couponCode });

export interface ApprovePaymentResponse { ok: boolean; feePaymentId: string; status: string; warnings?: string[] }

/** Admin: approve (→ paid) or reject (→ pending) a submitted UPI payment. */
export const approveUpiPayment = (
  idToken: string,
  feePaymentId: string,
  approve: boolean,
  adminNote?: string,
): Promise<ApprovePaymentResponse> =>
  postJson<ApprovePaymentResponse>("/api/razorpay/approve-payment", idToken, { feePaymentId, approve, adminNote });
