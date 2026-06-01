// ---------------------------------------------------------------------------
// Classes fee math — pure, dependency-free helpers.
// ---------------------------------------------------------------------------
// Month keys, due dates, period labels, fee-doc ids, and reminder/overdue
// selection. No Firebase imports so the logic stays portable and unit-testable
// (see feeMath.test.ts). The server mirrors this logic in
// api/_lib/class-fees.ts — keep the two in sync.
// ---------------------------------------------------------------------------

export const MIN_BILLING_DAY = 1;
// Clamp to 28 so every month has the day and we avoid month-length edge cases.
export const MAX_BILLING_DAY = 28;
export const DEFAULT_REMINDER_DAYS = 5;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad2 = (value: number) => String(value).padStart(2, "0");

export const clampBillingDay = (day: number | string | undefined): number => {
  const parsed = Math.floor(Number(day));
  if (!Number.isFinite(parsed)) return MIN_BILLING_DAY;
  return Math.min(MAX_BILLING_DAY, Math.max(MIN_BILLING_DAY, parsed));
};

/** "YYYY-MM" for the given date (UTC, matching the course-installments convention). */
export const monthKeyFor = (date: Date = new Date()): string => date.toISOString().slice(0, 7);

/** Parse "YYYY-MM" into { year, month } (month is 1-12). Returns null if malformed. */
export const parseMonthKey = (monthKey: string): { year: number; month: number } | null => {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey || "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
};

/** Shift a month key by n months (n may be negative). "2026-12" + 1 → "2027-01". */
export const addMonths = (monthKey: string, n: number): string => {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return monthKey;
  const zeroBased = parsed.month - 1 + Math.floor(n);
  const year = parsed.year + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12;
  return `${year}-${pad2(month + 1)}`;
};

/** "June 2026" for "2026-06". */
export const periodLabel = (monthKey: string): string => {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return monthKey;
  return `${MONTH_NAMES[parsed.month - 1]} ${parsed.year}`;
};

/** ISO date "YYYY-MM-DD" for the billing day in the given month. */
export const dueDateFor = (monthKey: string, billingDay: number): string => {
  if (!parseMonthKey(monthKey)) return "";
  return `${monthKey}-${pad2(clampBillingDay(billingDay))}`;
};

/** Deterministic, idempotent fee-doc id: `${enrollmentId}_${monthKey}`. */
export const buildFeePaymentId = (enrollmentId: string, monthKey: string): string => `${enrollmentId}_${monthKey}`;

const toUtcMidnight = (dateKey: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey || "");
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
};

const dateKeyFor = (date: Date) => date.toISOString().slice(0, 10);

/** Whole days from `now` until `dueDate` (positive = future). null if unparseable. */
export const daysUntil = (dueDate: string, now: Date = new Date()): number | null => {
  const due = toUtcMidnight(dueDate);
  const today = toUtcMidnight(dateKeyFor(now));
  if (!due || !today) return null;
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
};

/** True when the due date is strictly in the past. */
export const isOverdue = (dueDate: string, now: Date = new Date()): boolean => {
  const remaining = daysUntil(dueDate, now);
  return remaining !== null && remaining < 0;
};

export interface FeeReminderCandidate {
  id?: string;
  enrollmentId?: string;
  monthKey?: string;
  status?: string;
  dueDate?: string;
  reminders?: { preDebitMonthKey?: string };
}

/**
 * Select pending/processing fee docs whose due date is exactly `daysBefore`
 * days away and that have not yet had a pre-debit reminder recorded for their
 * monthKey. The monthKey guard makes a re-run idempotent.
 */
export const collectDueReminders = <T extends FeeReminderCandidate>(
  docs: T[],
  now: Date = new Date(),
  daysBefore: number = DEFAULT_REMINDER_DAYS,
): T[] =>
  docs.filter((doc) => {
    if (doc.status !== "pending" && doc.status !== "processing") return false;
    const remaining = daysUntil(doc.dueDate || "", now);
    if (remaining === null || remaining !== daysBefore) return false;
    return doc.reminders?.preDebitMonthKey !== doc.monthKey;
  });
