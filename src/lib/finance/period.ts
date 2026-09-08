// ---------------------------------------------------------------------------
// THE PERIOD AN ADMIN SCREEN IS SHOWING (req 3).
//
// Finance used to offer This month / Today / All time / one day. The office also
// needs "1 to 15 September" and "show me July", so the whole thing is now one
// small model shared by every screen that filters by date:
//
//   all    — no bounds
//   month  — any month, not just the current one ("2026-07")
//   today  — the admin's local today
//   day    — one chosen date
//   range  — from…to, inclusive at both ends
//
// PURE, and every function takes "today" rather than reading the clock, so the
// tests are not clock-dependent and a screen rendered at 23:59 cannot disagree
// with the export it launches.
// ---------------------------------------------------------------------------

export type PeriodMode = "all" | "month" | "today" | "day" | "range";

export interface PeriodSelection {
  mode: PeriodMode;
  /** "YYYY-MM" — used by `month`. */
  monthKey: string;
  /** "YYYY-MM-DD" — used by `day`. */
  day: string;
  /** "YYYY-MM-DD" — used by `range`; empty means unbounded on that side. */
  from: string;
  to: string;
}

const pad = (value: number): string => String(value).padStart(2, "0");

/** "YYYY-MM-DD" in LOCAL time — before dawn IST a UTC date is yesterday. */
export const dayKeyOf = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const monthKeyOf = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;

/** The last day of a "YYYY-MM" month, as "YYYY-MM-DD". */
export const monthEndKey = (monthKey: string): string => {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return "";
  return dayKeyOf(new Date(year, month, 0));
};

export const createPeriodSelection = (today: Date, mode: PeriodMode = "month"): PeriodSelection => ({
  mode,
  monthKey: monthKeyOf(today),
  day: dayKeyOf(today),
  from: `${monthKeyOf(today)}-01`,
  to: dayKeyOf(today),
});

/** Inclusive "YYYY-MM-DD" bounds; "" on either side means unbounded. */
export const periodBounds = (selection: PeriodSelection, today: Date): { from: string; to: string } => {
  switch (selection.mode) {
    case "all":
      return { from: "", to: "" };
    case "today": {
      const key = dayKeyOf(today);
      return { from: key, to: key };
    }
    case "day":
      return { from: selection.day, to: selection.day };
    case "month": {
      const monthKey = selection.monthKey || monthKeyOf(today);
      return { from: `${monthKey}-01`, to: monthEndKey(monthKey) };
    }
    case "range":
    default:
      // A backwards range is read the way it was obviously meant.
      if (selection.from && selection.to && selection.from > selection.to) {
        return { from: selection.to, to: selection.from };
      }
      return { from: selection.from, to: selection.to };
  }
};

/**
 * Does a record's date fall inside the chosen period? Undated records only
 * count under "All time" — including them anywhere else would silently inflate
 * whatever month or range the admin is looking at.
 */
export const isInPeriod = (dateKey: string, selection: PeriodSelection, today: Date): boolean => {
  const { from, to } = periodBounds(selection, today);
  if (!from && !to) return true;
  if (!dateKey) return false;
  if (from && dateKey < from) return false;
  if (to && dateKey > to) return false;
  return true;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "September 2026" from "2026-09". */
export const describeMonth = (monthKey: string): string => {
  const [year, month] = (monthKey || "").split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return monthKey || "";
  return `${MONTH_NAMES[month - 1]} ${year}`;
};

/** "8 Sep 2026" from "2026-09-08". */
export const describeDay = (dayKey: string): string => {
  const [year, month, day] = (dayKey || "").split("-").map(Number);
  if (!year || !month || !day) return dayKey || "";
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

/** The one line a page shows: "Showing: 1 Sep 2026 → 15 Sep 2026". */
export const describePeriod = (selection: PeriodSelection, today: Date): string => {
  switch (selection.mode) {
    case "all":
      return "All time";
    case "today":
      return `Today (${describeDay(dayKeyOf(today))})`;
    case "day":
      return describeDay(selection.day);
    case "month": {
      const monthKey = selection.monthKey || monthKeyOf(today);
      return monthKey === monthKeyOf(today) ? `This month (${describeMonth(monthKey)})` : describeMonth(monthKey);
    }
    case "range":
    default: {
      const { from, to } = periodBounds(selection, today);
      if (!from && !to) return "All time";
      if (from && to) return from === to ? describeDay(from) : `${describeDay(from)} → ${describeDay(to)}`;
      return from ? `${describeDay(from)} onwards` : `Up to ${describeDay(to)}`;
    }
  }
};
