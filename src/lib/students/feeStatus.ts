import { deriveDisplayFeeStatus, type FeePaymentDoc, type FeeStatus } from "@/lib/classes";
import type { StudentDoc } from "./types";

/**
 * Every enrolment a student holds — ALL their classes, not just the first.
 * Falls back to the legacy singular id + the course rows for older records.
 */
export const enrollmentIdsOf = (student: Pick<StudentDoc, "enrollmentIds" | "enrollmentId" | "courses">): string[] => {
  const ids = student.enrollmentIds?.length
    ? student.enrollmentIds
    : [student.enrollmentId || "", ...(student.courses || []).map((course) => course.enrollmentId || "")];
  return Array.from(new Set(ids.filter(Boolean)));
};

// ---------------------------------------------------------------------------
// Whether a student actually OWES anything, across every class they take.
//
// BUG THIS EXISTS TO FIX: the Student Manager used to describe a student by
// `latestOf(fees)` — the fee doc with the most recent activity timestamp. Pay
// the admission fee today and its `paidAt` becomes the newest timestamp, so the
// row read "Paid" while a genuinely pending month sat there unnoticed, and the
// "Pending" filter HID exactly the students who owed money.
//
// Outstanding is a property of the WHOLE ledger, not of one doc. PURE + tested.
// ---------------------------------------------------------------------------

/** A fee the family still has to pay. `processing` is excluded — see below. */
const isOutstandingStatus = (status: FeeStatus): boolean =>
  status === "pending" || status === "overdue" || status === "failed";

const toMillis = (value: unknown): number => {
  const stamp = value as { toMillis?: () => number } | undefined;
  return typeof stamp?.toMillis === "function" ? stamp.toMillis() : 0;
};

/** "Most recent activity" on a fee: paid date wins, else submitted/updated/created. */
export const feeActivityMillis = (fee: FeePaymentDoc): number =>
  Math.max(toMillis(fee.paidAt), toMillis(fee.upiSubmittedAt), toMillis(fee.updatedAt), toMillis(fee.createdAt));

export interface StudentFeeSummary {
  all: FeePaymentDoc[];
  /** Still payable: pending / overdue / failed, across every class. */
  outstanding: FeePaymentDoc[];
  /** UPI proof submitted, waiting on the admin. NOT outstanding — they paid. */
  awaitingApproval: FeePaymentDoc[];
  outstandingInPaise: number;
  overdueCount: number;
  hasOutstanding: boolean;
  /** The soonest unpaid fee — what a reminder should target. */
  nextDue?: FeePaymentDoc;
  /** Most recently touched fee — for "paid on <date>" captions only. */
  latest?: FeePaymentDoc;
  /** The headline chip: worst outstanding state, else the latest settled state. */
  status?: FeeStatus;
  /** Names of the classes with something outstanding (sorted, deduped). */
  classesWithDues: string[];
  /**
   * Every distinct display status present, resolved ONCE at the summary's
   * `now`. Filtering reads this instead of re-deriving with a different clock —
   * otherwise a fee due today could be "pending" in the summary and "overdue"
   * in the filter, and the row would vanish from both buckets.
   */
  statuses: FeeStatus[];
}

/**
 * Summarize a student's ENTIRE fee ledger — pass the fees of every enrollment
 * they hold, not just the first class.
 */
export const summarizeStudentFees = (
  fees: FeePaymentDoc[],
  now: Date = new Date(),
): StudentFeeSummary => {
  const all = fees || [];
  const outstanding: FeePaymentDoc[] = [];
  const awaitingApproval: FeePaymentDoc[] = [];
  const statusSet = new Set<FeeStatus>();
  let overdueCount = 0;

  for (const fee of all) {
    const status = deriveDisplayFeeStatus(fee, now);
    statusSet.add(status);
    if (status === "processing") { awaitingApproval.push(fee); continue; }
    if (!isOutstandingStatus(status)) continue;
    outstanding.push(fee);
    if (status === "overdue") overdueCount += 1;
  }

  const byDueDate = [...outstanding].sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  const latest = all.length === 0
    ? undefined
    : all.reduce((a, b) => (feeActivityMillis(b) >= feeActivityMillis(a) ? b : a));

  // The chip must lead with what's WRONG. Only when nothing is outstanding does
  // the most recent settled state get to speak.
  let status: FeeStatus | undefined;
  if (overdueCount > 0) status = "overdue";
  else if (outstanding.length > 0) status = "pending";
  else if (awaitingApproval.length > 0) status = "processing";
  else if (latest) status = deriveDisplayFeeStatus(latest, now);

  return {
    all,
    outstanding,
    awaitingApproval,
    outstandingInPaise: outstanding.reduce((sum, fee) => sum + Math.max(0, fee.amountInPaise || 0), 0),
    overdueCount,
    hasOutstanding: outstanding.length > 0,
    nextDue: byDueDate[0],
    latest,
    status,
    classesWithDues: Array.from(new Set(outstanding.map((fee) => fee.className).filter(Boolean))).sort(),
    statuses: Array.from(statusSet),
  };
};

export type FeeFilter = "all" | "none" | FeeStatus;

/**
 * Does a student match a status filter? Matches if ANY of their fees is in that
 * state — the old code compared only the latest doc, so "Pending" hid the
 * students who actually owed money.
 */
export const matchesFeeFilter = (summary: StudentFeeSummary, filter: FeeFilter): boolean => {
  if (filter === "all") return true;
  if (filter === "none") return summary.all.length === 0;
  return summary.statuses.includes(filter);
};
