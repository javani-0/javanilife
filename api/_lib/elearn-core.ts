// ---------------------------------------------------------------------------
// E-Learning: pure rules shared by the server actions (api/_lib/elearn.ts) and
// the website (src/lib/elearning re-exports these). No Firebase imports, so
// they are unit-tested in src/lib/elearning/helpers.test.ts — same pattern as
// api/_lib/seo-pages.ts.
// ---------------------------------------------------------------------------

export const ELEARN_COURSES = "elearnCourses";
export const ELEARN_CONTENT = "elearnContent";
export const ELEARN_ENROLLMENTS = "elearnEnrollments";
export const ELEARN_PROGRESS = "elearnProgress";

/** Public Cloudinary cloud the payment screenshots are uploaded to. Keep in sync
 *  with src/lib/cloudinary.ts (a test pins them equal). Not a secret. */
export const ELEARN_CLOUDINARY_CLOUD = "dxeyhsuyr";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ElearnEnrollmentStatus = "awaiting-payment" | "processing" | "active" | "rejected" | "revoked";
export type ElearnPaymentMethod = "razorpay" | "upi" | "grant";

export const ELEARN_ENROLLMENT_STATUSES: ElearnEnrollmentStatus[] = ["awaiting-payment", "processing", "active", "rejected", "revoked"];

/** Enrollment / progress doc id: one per user per course. */
export const elearnDocId = (uid: string, courseId: string) => `${uid}_${courseId}`;

/** Milliseconds from a Firestore Timestamp (client or admin), Date, {seconds}, or number. */
export const toMillis = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "object") {
    const candidate = value as { toMillis?: () => number; seconds?: unknown; _seconds?: unknown };
    if (typeof candidate.toMillis === "function") return candidate.toMillis();
    const seconds = typeof candidate.seconds === "number" ? candidate.seconds : typeof candidate._seconds === "number" ? candidate._seconds : null;
    if (seconds !== null) return seconds * 1000;
  }
  return null;
};

/** When access ends: `accessDays` after `from`; 0 / missing / negative = lifetime (null). */
export const computeExpiresAt = (accessDays: unknown, from: Date = new Date()): Date | null => {
  const days = Math.floor(Number(accessDays) || 0);
  if (days <= 0) return null;
  return new Date(from.getTime() + days * DAY_MS);
};

/** The one access check: status "active" and not past `expiresAt` (null/missing = lifetime). */
export const hasActiveAccess = (
  enrollment: { status?: unknown; expiresAt?: unknown } | null | undefined,
  now: number = Date.now(),
): boolean => {
  if (!enrollment || enrollment.status !== "active") return false;
  const expires = toMillis(enrollment.expiresAt);
  return expires === null || expires > now;
};

export interface PaymentModes { razorpay: boolean; upi: boolean }

export interface UpiSettingsLike {
  manualPaymentsEnabled?: boolean;
  upiId?: string;
  qrImageUrl?: string;
}

/**
 * Which ways to pay are actually offered for a course right now. QR (manual UPI)
 * needs the course switch AND the global switch AND a UPI id or QR image. A free
 * (price 0) course has no purchase path; staff grant access instead.
 */
export const availablePaymentModes = (
  course: { priceInPaise?: unknown; paymentModes?: Partial<PaymentModes> | null },
  settings: UpiSettingsLike | null | undefined,
): PaymentModes => {
  const price = Math.round(Number(course.priceInPaise) || 0);
  if (price <= 0) return { razorpay: false, upi: false };
  const modes = course.paymentModes || {};
  const upiConfigured = Boolean(String(settings?.upiId || "").trim() || String(settings?.qrImageUrl || "").trim());
  return {
    razorpay: modes.razorpay === true,
    upi: modes.upi === true && settings?.manualPaymentsEnabled !== false && Boolean(settings) && upiConfigured,
  };
};

/** A payment screenshot must be an https image on OUR Cloudinary cloud. */
export const isAllowedProofUrl = (value: unknown, cloudName: string = ELEARN_CLOUDINARY_CLOUD): boolean => {
  if (typeof value !== "string" || !value.trim() || value.length > 600) return false;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  return url.protocol === "https:"
    && url.hostname === "res.cloudinary.com"
    && url.pathname.startsWith(`/${cloudName}/`);
};
