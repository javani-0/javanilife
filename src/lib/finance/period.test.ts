import { describe, expect, it } from "vitest";
import {
  createPeriodSelection,
  dayKeyOf,
  describeDay,
  describeMonth,
  describePeriod,
  isInPeriod,
  monthEndKey,
  monthKeyOf,
  periodBounds,
  type PeriodSelection,
} from "./period";

// A fixed "today" — 8 September 2026, local time.
const TODAY = new Date(2026, 8, 8, 15, 30);

const selection = (over: Partial<PeriodSelection> = {}): PeriodSelection => ({
  ...createPeriodSelection(TODAY),
  ...over,
});

describe("day and month keys", () => {
  it("uses LOCAL dates, not UTC", () => {
    // 00:30 IST on the 9th is still the 9th locally, whatever UTC says.
    expect(dayKeyOf(new Date(2026, 8, 9, 0, 30))).toBe("2026-09-09");
    expect(monthKeyOf(TODAY)).toBe("2026-09");
  });

  it("knows where a month ends, leap years included", () => {
    expect(monthEndKey("2026-09")).toBe("2026-09-30");
    expect(monthEndKey("2026-02")).toBe("2026-02-28");
    expect(monthEndKey("2028-02")).toBe("2028-02-29");
    expect(monthEndKey("2026-12")).toBe("2026-12-31");
  });
});

describe("periodBounds", () => {
  it("all time has no bounds", () => {
    expect(periodBounds(selection({ mode: "all" }), TODAY)).toEqual({ from: "", to: "" });
  });

  it("today is a single day", () => {
    expect(periodBounds(selection({ mode: "today" }), TODAY)).toEqual({ from: "2026-09-08", to: "2026-09-08" });
  });

  it("a chosen day is that day", () => {
    expect(periodBounds(selection({ mode: "day", day: "2026-07-04" }), TODAY)).toEqual({ from: "2026-07-04", to: "2026-07-04" });
  });

  it("a month spans its first to its last date — ANY month, not just this one", () => {
    expect(periodBounds(selection({ mode: "month", monthKey: "2026-07" }), TODAY)).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(periodBounds(selection({ mode: "month", monthKey: "2026-02" }), TODAY)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("a range is used as given", () => {
    expect(periodBounds(selection({ mode: "range", from: "2026-09-01", to: "2026-09-15" }), TODAY))
      .toEqual({ from: "2026-09-01", to: "2026-09-15" });
  });

  it("reads a backwards range the way it was meant", () => {
    expect(periodBounds(selection({ mode: "range", from: "2026-09-15", to: "2026-09-01" }), TODAY))
      .toEqual({ from: "2026-09-01", to: "2026-09-15" });
  });

  it("allows an open-ended range", () => {
    expect(periodBounds(selection({ mode: "range", from: "2026-09-01", to: "" }), TODAY))
      .toEqual({ from: "2026-09-01", to: "" });
  });
});

describe("isInPeriod", () => {
  it("is inclusive at both ends of a range", () => {
    const range = selection({ mode: "range", from: "2026-09-01", to: "2026-09-15" });
    expect(isInPeriod("2026-09-01", range, TODAY)).toBe(true);
    expect(isInPeriod("2026-09-15", range, TODAY)).toBe(true);
    expect(isInPeriod("2026-08-31", range, TODAY)).toBe(false);
    expect(isInPeriod("2026-09-16", range, TODAY)).toBe(false);
  });

  it("keeps a whole month", () => {
    const july = selection({ mode: "month", monthKey: "2026-07" });
    expect(isInPeriod("2026-07-01", july, TODAY)).toBe(true);
    expect(isInPeriod("2026-07-31", july, TODAY)).toBe(true);
    expect(isInPeriod("2026-08-01", july, TODAY)).toBe(false);
  });

  it("keeps everything under All time, undated records included", () => {
    const all = selection({ mode: "all" });
    expect(isInPeriod("", all, TODAY)).toBe(true);
    expect(isInPeriod("2020-01-01", all, TODAY)).toBe(true);
  });

  it("drops undated records from every bounded period", () => {
    expect(isInPeriod("", selection({ mode: "month" }), TODAY)).toBe(false);
    expect(isInPeriod("", selection({ mode: "range", from: "2026-09-01", to: "" }), TODAY)).toBe(false);
  });
});

describe("describePeriod", () => {
  it("says exactly what is on screen", () => {
    expect(describePeriod(selection({ mode: "all" }), TODAY)).toBe("All time");
    expect(describePeriod(selection({ mode: "today" }), TODAY)).toBe("Today (8 Sept 2026)");
    expect(describePeriod(selection({ mode: "month" }), TODAY)).toBe("This month (September 2026)");
    expect(describePeriod(selection({ mode: "month", monthKey: "2026-07" }), TODAY)).toBe("July 2026");
    expect(describePeriod(selection({ mode: "day", day: "2026-07-04" }), TODAY)).toBe("4 Jul 2026");
    expect(describePeriod(selection({ mode: "range", from: "2026-09-01", to: "2026-09-15" }), TODAY))
      .toBe("1 Sept 2026 → 15 Sept 2026");
    expect(describePeriod(selection({ mode: "range", from: "2026-09-01", to: "" }), TODAY)).toBe("1 Sept 2026 onwards");
  });
});

describe("labels", () => {
  it("names months and days readably", () => {
    expect(describeMonth("2026-07")).toBe("July 2026");
    expect(describeMonth("")).toBe("");
    expect(describeDay("2026-09-08")).toBe("8 Sept 2026");
  });
});
