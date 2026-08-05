import { deriveDisplayFeeStatus, type EnrollmentStatus, type FeePaymentDoc } from "@/lib/classes";

// ---------------------------------------------------------------------------
// Automatic access restriction (req): "portal access will be suspended if fees
// are not paid by the due date and restored upon payment."
//
// Scoped PER CLASS — only the defaulting class locks. Fee payment, the profile,
// the dashboard and every paid-up class stay open, so a family is never locked
// out of the very screen they need in order to pay.
//
// PURE + unit-tested. Nothing here is a security boundary — it is the UX rule.
// ---------------------------------------------------------------------------

/** Days after the due date before content locks. Admin-configurable. */
export const DEFAULT_ACCESS_GRACE_DAYS = 3;

/**
 * The automatic lock is OFF unless the office switches it on.
 *
 * INCIDENT 2026-08-05: it shipped ON with a 3-day grace and immediately locked
 * 38% of active enrolments out of their recordings and materials — every one of
 * them on an auto-generated monthly "pending" row that was 30+ days old because
 * the ledger lags real (often cash) payments. Locking paying families out of
 * content they bought is far worse than not locking a defaulter, so this now
 * has to be turned on deliberately, once the ledger is trusted.
 */
export const ACCESS_LOCK_ENABLED_BY_DEFAULT = false;

/** Statuses that still count as "money owed" for locking purposes. */
const OWES = new Set(["pending", "overdue", "failed"]);

export interface ClassAccess {
  locked: boolean;
  /** Shown to the student when locked, or why they're still allowed in. */
  reason: string;
  /** The fee that caused the lock (the worst offender). */
  blockingFee?: FeePaymentDoc;
  daysOverdue: number;
  /** Set when a fee is late but still inside its grace — a soft warning. */
  graceEndsOn?: string;
}

const OPEN: ClassAccess = { locked: false, reason: "", daysOverdue: 0 };

const daysBetween = (fromIso: string, toIso: string): number => {
  const from = Date.parse(`${fromIso}T00:00:00`);
  const to = Date.parse(`${toIso}T00:00:00`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
};

const addDays = (iso: string, days: number): string => {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  date.setDate(date.getDate() + days);
  // Format from LOCAL parts: toISOString() converts to UTC, which in IST
  // (+5:30) rolls local midnight back to the previous day and would show the
  // parent a grace deadline one day early.
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export interface ClassAccessInput {
  /** The fees of THIS class only. */
  fees: FeePaymentDoc[];
  enrollmentStatus?: EnrollmentStatus;
  graceDays?: number;
  /** "YYYY-MM-DD" — today. */
  today?: string;
  /** Admin override: access stays open through this date. */
  overrideUntil?: string;
  /** Master switch. When false NOTHING is ever locked. Default: off. */
  lockEnabled?: boolean;
}

/**
 * Whether this class's content is locked for the student right now.
 *
 * Deliberately NOT locked by:
 *  - `processing` — the parent submitted a UPI proof and is waiting on the
 *    admin. Locking here punishes someone who has already paid.
 *  - `waived` — the fee was excused.
 *  - a paused/cancelled enrolment — that's inactive, not delinquent.
 */
export const computeClassAccess = ({
  fees,
  enrollmentStatus,
  graceDays = DEFAULT_ACCESS_GRACE_DAYS,
  today = new Date().toISOString().slice(0, 10),
  overrideUntil,
  lockEnabled = ACCESS_LOCK_ENABLED_BY_DEFAULT,
}: ClassAccessInput): ClassAccess => {
  // Master switch off → never lock anyone, whatever the ledger says.
  if (!lockEnabled) return OPEN;
  if (overrideUntil && overrideUntil >= today) {
    return { ...OPEN, reason: `Access extended by the office until ${overrideUntil}.` };
  }
  if (enrollmentStatus === "paused" || enrollmentStatus === "cancelled") return OPEN;

  const grace = Math.max(0, Math.round(graceDays));
  let worst: FeePaymentDoc | undefined;
  let worstDays = 0;
  let softestGraceEnd: string | undefined;

  for (const fee of fees || []) {
    if (!OWES.has(deriveDisplayFeeStatus(fee, new Date(`${today}T12:00:00`)))) continue;
    if (!fee.dueDate) continue;
    // A zero-rupee due is a bookkeeping artefact, never a reason to lock a
    // student out (one real student was locked over a ₹0 row).
    if (!(fee.amountInPaise > 0)) continue;

    const lateBy = daysBetween(fee.dueDate, today);
    if (lateBy > grace) {
      if (lateBy > worstDays) { worst = fee; worstDays = lateBy; }
    } else if (lateBy > 0) {
      // Late but inside the grace — surface the deadline instead of locking.
      const endsOn = addDays(fee.dueDate, grace);
      if (!softestGraceEnd || endsOn < softestGraceEnd) softestGraceEnd = endsOn;
    }
  }

  if (worst) {
    return {
      locked: true,
      reason: `Access is paused — the ${worst.periodLabel} fee is ${worstDays} day${worstDays === 1 ? "" : "s"} overdue. It unlocks as soon as the payment is recorded.`,
      blockingFee: worst,
      daysOverdue: worstDays,
    };
  }

  if (softestGraceEnd) {
    return {
      ...OPEN,
      reason: `A fee is past its due date. Access continues until ${softestGraceEnd}.`,
      graceEndsOn: softestGraceEnd,
    };
  }

  return OPEN;
};

/** Convenience: is ANY of these classes locked? */
export const anyLocked = (accessByEnrollment: Record<string, ClassAccess>): boolean =>
  Object.values(accessByEnrollment).some((access) => access.locked);
