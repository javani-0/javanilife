// ---------------------------------------------------------------------------
// Classes fee math — server mirror of src/lib/classes/feeMath.ts.
// ---------------------------------------------------------------------------
// Pure, dependency-free helpers used by the webhook + cron. Kept identical to
// the client copy (which carries the unit tests). No Firebase imports here.
// ---------------------------------------------------------------------------

export const MIN_BILLING_DAY = 1;
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

export const monthKeyFor = (date: Date = new Date()): string => date.toISOString().slice(0, 7);

export const parseMonthKey = (monthKey: string): { year: number; month: number } | null => {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey || "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
};

export const addMonths = (monthKey: string, n: number): string => {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return monthKey;
  const zeroBased = parsed.month - 1 + Math.floor(n);
  const year = parsed.year + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12;
  return `${year}-${pad2(month + 1)}`;
};

export const periodLabel = (monthKey: string): string => {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return monthKey;
  return `${MONTH_NAMES[parsed.month - 1]} ${parsed.year}`;
};

export const dueDateFor = (monthKey: string, billingDay: number): string => {
  if (!parseMonthKey(monthKey)) return "";
  return `${monthKey}-${pad2(clampBillingDay(billingDay))}`;
};

// ---------------------------------------------------------------------------
// Advance vs. arrears billing period — server mirror of the client helper in
// src/lib/classes/feeMath.ts (which carries the unit tests). Keep in sync.
// "manual" = Advance Fee → current month; every other rail bills in arrears.
// ---------------------------------------------------------------------------

export const isAdvanceBilling = (method?: string): boolean => method === "manual";

export interface BillingPeriod {
  startMonthKey: string;
  endMonthKey: string;
  nextChargeMonthKey: string;
  monthsCovered: string[];
  periodLabel: string;
}

export const computeBillingPeriodFromMonthKey = (
  collectionMonthKey: string,
  method: string | undefined,
  durationMonths = 1,
): BillingPeriod => {
  const months = Math.max(1, Math.floor(Number(durationMonths) || 1));
  const startMonthKey = isAdvanceBilling(method) ? collectionMonthKey : addMonths(collectionMonthKey, -1);
  const endMonthKey = addMonths(startMonthKey, months - 1);
  // Next charge = month after the covered period, but never earlier than the
  // month after this payment (so monthly arrears billed in June recur in July).
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

export const computeBillingPeriod = (
  method: string | undefined,
  paymentDate: Date = new Date(),
  durationMonths = 1,
): BillingPeriod => computeBillingPeriodFromMonthKey(monthKeyFor(paymentDate), method, durationMonths);

export const buildFeePaymentId = (enrollmentId: string, monthKey: string): string => `${enrollmentId}_${monthKey}`;

/**
 * The full-payment amount (paise) for a term course after its pay-full offer
 * (N free months). Mirrors the client helper in src/lib/classes/classes.ts —
 * keep the two in sync. Returns the plain term fee when there is no offer.
 */
export const termPayFullAmountInPaise = (classData: {
  termFeeInPaise?: number;
  durationMonths?: number;
  termFreeMonthsOnFullPayment?: number;
  termPayFullPriceInPaise?: number;
}): number => {
  const termFee = Math.max(0, Math.round(Number(classData.termFeeInPaise || 0)));
  // An explicit pay-full final price wins over the free-months calculation.
  const explicit = Math.max(0, Math.round(Number(classData.termPayFullPriceInPaise || 0)));
  if (explicit >= 100 && termFee > 0 && explicit < termFee) return explicit;
  const duration = Math.max(0, Math.round(Number(classData.durationMonths || 0)));
  const freeMonthsRaw = Math.max(0, Math.round(Number(classData.termFreeMonthsOnFullPayment || 0)));
  // Never give away the whole course; cap at duration - 1.
  const freeMonths = duration > 0 ? Math.min(freeMonthsRaw, Math.max(0, duration - 1)) : 0;
  if (termFee <= 0 || duration <= 0 || freeMonths <= 0) return termFee;
  const discount = Math.round((termFee / duration) * freeMonths);
  return Math.max(100, termFee - discount);
};

const toUtcMidnight = (dateKey: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey || "");
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
};

const dateKeyFor = (date: Date) => date.toISOString().slice(0, 10);

export const daysUntil = (dueDate: string, now: Date = new Date()): number | null => {
  const due = toUtcMidnight(dueDate);
  const today = toUtcMidnight(dateKeyFor(now));
  if (!due || !today) return null;
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
};

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

// Mirror of src/lib/classes/feeMath.ts collectDueReminders (req 6): send a daily
// "pay in N days" countdown across the whole window — daysBefore days ahead of
// the due date through OVERDUE_REMINDER_GRACE_DAYS past it — and stop once
// paid/waived/processing, using a per-calendar-day idempotency guard. Keep the
// two in sync.
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
