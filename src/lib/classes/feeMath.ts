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

const SHORT_MONTHS = MONTH_NAMES.map((name) => name.slice(0, 3));

/** "1 Jul 2026" for "2026-07-01". Returns the input unchanged if not a date. */
export const formatNiceDate = (iso?: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!match) return iso || "";
  return `${Number(match[3])} ${SHORT_MONTHS[Number(match[2]) - 1]} ${match[1]}`;
};

/** "May to August" from two "YYYY-MM-DD" (or "YYYY-MM") dates. */
export const formatMonthRange = (startIso?: string, endIso?: string): string => {
  const monthName = (iso?: string) => {
    const match = /^(\d{4})-(\d{2})/.exec(iso || "");
    return match ? MONTH_NAMES[Number(match[2]) - 1] : "";
  };
  const start = monthName(startIso);
  const end = monthName(endIso);
  if (start && end) return `${start} to ${end}`;
  return start || end || "";
};

// ---------------------------------------------------------------------------
// Advance vs. arrears billing period.
// ---------------------------------------------------------------------------
// Business rule (client-confirmed): the "manual" rail is the **Advance Fee** —
// the parent pre-pays the *current* cycle. Every other rail (autopay, term
// pay-full, term EMI, cash) is billed **in arrears** — the collection made this
// month pays for the *previous* month. So a 4-month autopay/term collected in
// June covers "May to August" and the next charge falls in September.
// ---------------------------------------------------------------------------

/** A class payment rail. Mirrors ClassPaymentMethod; kept loose for portability. */
export type BillingMethod = "autopay" | "manual" | "full" | "emi" | "cash" | (string & {});

/** Only the "manual" Advance Fee rail bills the current month; all others are arrears. */
export const isAdvanceBilling = (method?: BillingMethod): boolean => method === "manual";

export interface BillingPeriod {
  startMonthKey: string;       // "2026-05" — first billed month
  endMonthKey: string;         // "2026-08" — last billed month (== start for a monthly fee)
  nextChargeMonthKey: string;  // "2026-09" — the month after the period ends
  monthsCovered: string[];     // ["May","June","July","August"] — for human-readable messages
  periodLabel: string;         // "May 2026" (monthly) or "May to August" (multi-month)
}

/**
 * Compute the billed period from the *collection* month key + the payment rail.
 * Advance ("manual") bills the collection month itself; every other rail bills
 * in arrears (start = the previous month). `durationMonths` (>=1) spans the
 * period: 1 for a monthly fee, N for an N-month term/course.
 */
export const computeBillingPeriodFromMonthKey = (
  collectionMonthKey: string,
  method: BillingMethod | undefined,
  durationMonths = 1,
): BillingPeriod => {
  const months = Math.max(1, Math.floor(Number(durationMonths) || 1));
  const startMonthKey = isAdvanceBilling(method) ? collectionMonthKey : addMonths(collectionMonthKey, -1);
  const endMonthKey = addMonths(startMonthKey, months - 1);
  // Next charge = the month after the covered period ends (e.g. a May–August
  // term → September), but never earlier than the month after this payment, so
  // recurring monthly arrears (June pays for May) still bill again in July, not
  // June. "YYYY-MM" keys compare correctly as strings.
  const afterPeriod = addMonths(endMonthKey, 1);
  const afterPayment = addMonths(collectionMonthKey, 1);
  const nextChargeMonthKey = afterPeriod >= afterPayment ? afterPeriod : afterPayment;

  const monthsCovered: string[] = [];
  for (let i = 0; i < months; i += 1) {
    const parsed = parseMonthKey(addMonths(startMonthKey, i));
    if (parsed) monthsCovered.push(MONTH_NAMES[parsed.month - 1]);
  }

  const startParsed = parseMonthKey(startMonthKey);
  const endParsed = parseMonthKey(endMonthKey);
  const label = months <= 1
    ? periodLabel(startMonthKey)
    : (startParsed && endParsed ? `${MONTH_NAMES[startParsed.month - 1]} to ${MONTH_NAMES[endParsed.month - 1]}` : periodLabel(startMonthKey));

  return { startMonthKey, endMonthKey, nextChargeMonthKey, monthsCovered, periodLabel: label };
};

/** Convenience: compute the billed period from a payment Date instead of a month key. */
export const computeBillingPeriod = (
  method: BillingMethod | undefined,
  paymentDate: Date = new Date(),
  durationMonths = 1,
): BillingPeriod => computeBillingPeriodFromMonthKey(monthKeyFor(paymentDate), method, durationMonths);

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
  reminders?: { preDebitMonthKey?: string; preDebitDateKey?: string };
}

// After the due date passes, keep nudging daily for this many days, then stop
// (avoids nagging forever; the admin can still Remind manually). Req 2: the
// window is the 5 days before the due date PLUS the 5 days after it.
export const OVERDUE_REMINDER_GRACE_DAYS = 5;

/**
 * Select fee docs to remind today (req 6). We send a daily "pay in N days"
 * countdown across the whole window — from `daysBefore` days before the due
 * date through OVERDUE_REMINDER_GRACE_DAYS past it — and stop once paid. A
 * per-calendar-day guard (`reminders.preDebitDateKey`) makes each day's run
 * idempotent, so the cron can run repeatedly without spamming. Fees already
 * submitted for approval ("processing") or settled are skipped. Mirrored in
 * api/_lib/class-fees.ts — keep the two in sync.
 */
export const collectDueReminders = <T extends FeeReminderCandidate>(
  docs: T[],
  now: Date = new Date(),
  daysBefore: number = DEFAULT_REMINDER_DAYS,
): T[] => {
  const todayKey = dateKeyFor(now);
  return docs.filter((doc) => {
    if (doc.status !== "pending" && doc.status !== "overdue") return false;
    const remaining = daysUntil(doc.dueDate || "", now);
    if (remaining === null || remaining < -OVERDUE_REMINDER_GRACE_DAYS || remaining > daysBefore) return false;
    return doc.reminders?.preDebitDateKey !== todayKey;
  });
};
