import { hasActiveAccess, toMillis, type ElearnCourse, type ElearnEnrollment, type ElearnLevel } from "@/lib/elearning";

export const LEVEL_LABELS: Record<ElearnLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  all: "All levels",
};

export const accessLabel = (course: Pick<ElearnCourse, "accessDays">) =>
  course.accessDays > 0 ? `${course.accessDays} days access` : "Lifetime access";

export const lessonsLabel = (count: number) => `${count} ${count === 1 ? "lesson" : "lessons"}`;

/** Readable gold on light backgrounds (brand gold fails 4.5:1 as small text). */
export const GOLD_TEXT = "text-[hsl(36_55%_30%)]";

export const formatDate = (value: unknown) => {
  const ms = toMillis(value as never);
  return ms === null ? "" : new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

export type AccessState = "signed-out" | "none" | "awaiting-payment" | "processing" | "rejected" | "active" | "expired" | "revoked";

export const accessStateOf = (signedIn: boolean, enrollment: ElearnEnrollment | null, now = Date.now()): AccessState => {
  if (!signedIn) return "signed-out";
  if (!enrollment) return "none";
  if (enrollment.status === "active") return hasActiveAccess(enrollment, now) ? "active" : "expired";
  return enrollment.status;
};

/** True when the student may (re)start a purchase. A revoked student may buy again (owner 2026-11-25). */
export const canBuy = (state: AccessState) => state === "none" || state === "awaiting-payment" || state === "rejected" || state === "expired" || state === "revoked";

export const REVOKED_MESSAGE = "Your access to this master class was removed. You can buy it again below.";

/** UTR / UPI reference: 12 digits once spaces and dashes are removed. */
export const normalizeUtr = (value: string) => value.replace(/[\s-]/g, "");
export const isValidUtr = (value: string) => /^\d{12}$/.test(normalizeUtr(value));

export const isMobileDevice = () =>
  typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
