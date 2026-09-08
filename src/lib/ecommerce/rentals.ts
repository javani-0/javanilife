// ---------------------------------------------------------------------------
// RENTAL PRICING (req 3).
//
// The admin types ONE number: what 24 hours of this item costs. Everything the
// customer and the office ever see is derived from it:
//
//   • a booking of N days costs N × that price, per unit;
//   • the item is due back exactly N × 24 hours after it goes out;
//   • time past that moment is billed PER STARTED HOUR at a 24th of the day
//     rate — an hour and one minute late costs two hours.
//
// PURE arithmetic in paise, no Date.now() hidden inside: every function that
// needs "now" is handed it, so the tests are not clock-dependent and the admin
// screen, the customer screen and the overdue cron all agree to the paisa.
// ---------------------------------------------------------------------------

export const RENTAL_HOURS_PER_DAY = 24;
const MS_PER_HOUR = 60 * 60 * 1000;

export type RentalStatus = "booked" | "picked-up" | "returned" | "cancelled";

export const RENTAL_STATUS_LABELS: Record<RentalStatus, string> = {
  booked: "Booked",
  "picked-up": "With customer",
  returned: "Returned",
  cancelled: "Cancelled",
};

const toTime = (value: Date | string | number | undefined | null): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string" && value) {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
};

const clampPaise = (value: number): number => Math.max(0, Math.round(Number.isFinite(value) ? value : 0));

/** At least one whole day; a booking of "0 days" is not a thing. */
export const clampRentalDays = (days: number, maxDays = 0): number => {
  const whole = Math.max(1, Math.floor(Number(days) || 1));
  return maxDays > 0 ? Math.min(whole, maxDays) : whole;
};

/** When the item must be back: exactly `days × 24h` after it goes out. */
export const rentalDueAt = (startAt: Date | string, days: number): string => {
  const start = toTime(startAt);
  if (!Number.isFinite(start)) return "";
  return new Date(start + clampRentalDays(days) * RENTAL_HOURS_PER_DAY * MS_PER_HOUR).toISOString();
};

/** The booked amount: days × the 24-hour price × how many units. */
export const rentalBaseInPaise = (pricePerDayInPaise: number, days: number, quantity = 1): number =>
  clampPaise(clampPaise(pricePerDayInPaise) * clampRentalDays(days) * Math.max(1, Math.floor(quantity || 1)));

/** A 24th of the day rate — what one late hour costs. */
export const rentalHourlyRateInPaise = (pricePerDayInPaise: number): number =>
  Math.round(clampPaise(pricePerDayInPaise) / RENTAL_HOURS_PER_DAY);

/**
 * Whole hours STARTED past the return moment; 0 while the rental is still
 * within its time. Any part of an hour counts as a full one — that is what
 * "per hour" has to mean if it is to be explainable at a counter.
 */
export const overdueHoursAt = (dueAt: Date | string, now: Date | string): number => {
  const due = toTime(dueAt);
  const current = toTime(now);
  if (!Number.isFinite(due) || !Number.isFinite(current)) return 0;
  const late = current - due;
  if (late <= 0) return 0;
  return Math.ceil(late / MS_PER_HOUR);
};

/** What the late hours cost, at the hourly rate, per unit. */
export const overdueChargeInPaise = (
  pricePerDayInPaise: number,
  dueAt: Date | string,
  now: Date | string,
  quantity = 1,
): number => overdueHoursAt(dueAt, now) * rentalHourlyRateInPaise(pricePerDayInPaise) * Math.max(1, Math.floor(quantity || 1));

export interface RentalCharge {
  days: number;
  quantity: number;
  pricePerDayInPaise: number;
  hourlyRateInPaise: number;
  baseInPaise: number;
  overdueHours: number;
  overdueChargeInPaise: number;
  totalInPaise: number;
  dueAt: string;
  /** The moment the charge was worked out against. */
  asOf: string;
}

/**
 * The whole bill for one rental line, as of a given moment — or as of the
 * moment it came back, when it has. A returned rental never keeps accruing.
 */
export const computeRentalCharge = (input: {
  pricePerDayInPaise: number;
  days: number;
  quantity?: number;
  startAt: Date | string;
  /** Overrides `startAt + days`; use the booking's stored dueAt when present. */
  dueAt?: string;
  returnedAt?: Date | string | null;
  now: Date | string;
}): RentalCharge => {
  const quantity = Math.max(1, Math.floor(input.quantity || 1));
  const days = clampRentalDays(input.days);
  const dueAt = input.dueAt || rentalDueAt(input.startAt, days);
  const asOfSource = input.returnedAt || input.now;
  const asOf = new Date(toTime(asOfSource) || Date.now()).toISOString();
  const overdueHours = overdueHoursAt(dueAt, asOf);
  const hourlyRateInPaise = rentalHourlyRateInPaise(input.pricePerDayInPaise);
  const baseInPaise = rentalBaseInPaise(input.pricePerDayInPaise, days, quantity);
  const overdue = overdueHours * hourlyRateInPaise * quantity;
  return {
    days,
    quantity,
    pricePerDayInPaise: clampPaise(input.pricePerDayInPaise),
    hourlyRateInPaise,
    baseInPaise,
    overdueHours,
    overdueChargeInPaise: overdue,
    totalInPaise: baseInPaise + overdue,
    dueAt,
    asOf,
  };
};

/** "Due in 5 h" · "Due in 2 days" · "3 h overdue" — one short line for a card. */
export const describeRentalCountdown = (dueAt: Date | string, now: Date | string): string => {
  const due = toTime(dueAt);
  const current = toTime(now);
  if (!Number.isFinite(due) || !Number.isFinite(current)) return "";
  const diffHours = (due - current) / MS_PER_HOUR;
  if (diffHours <= 0) {
    const late = overdueHoursAt(dueAt, now);
    return late >= 48 ? `${Math.floor(late / 24)} days overdue` : `${late} h overdue`;
  }
  if (diffHours < 1) return "Due within the hour";
  if (diffHours < 48) return `Due in ${Math.floor(diffHours)} h`;
  return `Due in ${Math.floor(diffHours / 24)} days`;
};

/** A rental is overdue while it is still out and past its due moment. */
export const isRentalOverdue = (
  booking: { status: RentalStatus; dueAt: string },
  now: Date | string,
): boolean => (booking.status === "booked" || booking.status === "picked-up")
  && overdueHoursAt(booking.dueAt, now) > 0;

/** "10 Sep 2026, 6:00 pm" in the admin's own timezone. */
export const formatRentalMoment = (value: Date | string, locale = "en-IN"): string => {
  const time = toTime(value);
  if (!Number.isFinite(time)) return "—";
  return new Date(time).toLocaleString(locale, {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });
};
