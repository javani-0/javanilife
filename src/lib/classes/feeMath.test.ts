import { describe, it, expect } from "vitest";
import {
  addMonths,
  buildFeePaymentId,
  clampBillingDay,
  collectDueReminders,
  computeBillingPeriod,
  computeBillingPeriodFromMonthKey,
  daysUntil,
  dueDateFor,
  isAdvanceBilling,
  isOverdue,
  monthKeyFor,
  parseMonthKey,
  periodLabel,
} from "./feeMath";

describe("monthKeyFor", () => {
  it("returns YYYY-MM in UTC", () => {
    expect(monthKeyFor(new Date("2026-06-15T10:00:00Z"))).toBe("2026-06");
    expect(monthKeyFor(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
  });
});

describe("parseMonthKey", () => {
  it("parses valid keys", () => {
    expect(parseMonthKey("2026-06")).toEqual({ year: 2026, month: 6 });
  });
  it("rejects malformed keys", () => {
    expect(parseMonthKey("2026-13")).toBeNull();
    expect(parseMonthKey("nope")).toBeNull();
    expect(parseMonthKey("")).toBeNull();
  });
});

describe("addMonths", () => {
  it("rolls forward within a year", () => {
    expect(addMonths("2026-06", 1)).toBe("2026-07");
  });
  it("rolls across a year boundary", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-11", 3)).toBe("2027-02");
  });
  it("rolls backward", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
});

describe("periodLabel", () => {
  it("renders a human label", () => {
    expect(periodLabel("2026-06")).toBe("June 2026");
    expect(periodLabel("2026-12")).toBe("December 2026");
  });
  it("passes through malformed input", () => {
    expect(periodLabel("bad")).toBe("bad");
  });
});

describe("clampBillingDay", () => {
  it("clamps to the 1–28 window", () => {
    expect(clampBillingDay(0)).toBe(1);
    expect(clampBillingDay(31)).toBe(28);
    expect(clampBillingDay(5)).toBe(5);
    expect(clampBillingDay(undefined)).toBe(1);
  });
});

describe("dueDateFor", () => {
  it("builds an ISO date for the billing day", () => {
    expect(dueDateFor("2026-06", 5)).toBe("2026-06-05");
    expect(dueDateFor("2026-06", 31)).toBe("2026-06-28");
  });
  it("returns empty string for a bad month key", () => {
    expect(dueDateFor("bad", 5)).toBe("");
  });
});

describe("buildFeePaymentId", () => {
  it("joins enrollment id and month key", () => {
    expect(buildFeePaymentId("enr123", "2026-06")).toBe("enr123_2026-06");
  });
});

describe("daysUntil", () => {
  it("counts whole days forward", () => {
    expect(daysUntil("2026-06-10", new Date("2026-06-05T08:00:00Z"))).toBe(5);
  });
  it("returns negative for past dates", () => {
    expect(daysUntil("2026-06-01", new Date("2026-06-05T08:00:00Z"))).toBe(-4);
  });
  it("returns null for unparseable dates", () => {
    expect(daysUntil("nope", new Date("2026-06-05T08:00:00Z"))).toBeNull();
  });
});

describe("isOverdue", () => {
  it("is true only when strictly past", () => {
    const now = new Date("2026-06-05T08:00:00Z");
    expect(isOverdue("2026-06-04", now)).toBe(true);
    expect(isOverdue("2026-06-05", now)).toBe(false);
    expect(isOverdue("2026-06-06", now)).toBe(false);
  });
});

describe("isAdvanceBilling", () => {
  it("treats only the manual Advance Fee rail as current-month", () => {
    expect(isAdvanceBilling("manual")).toBe(true);
    expect(isAdvanceBilling("autopay")).toBe(false);
    expect(isAdvanceBilling("full")).toBe(false);
    expect(isAdvanceBilling("emi")).toBe(false);
    expect(isAdvanceBilling("cash")).toBe(false);
    expect(isAdvanceBilling(undefined)).toBe(false);
  });
});

describe("computeBillingPeriodFromMonthKey", () => {
  it("advance (manual) bills the current month", () => {
    const period = computeBillingPeriodFromMonthKey("2026-06", "manual", 1);
    expect(period.startMonthKey).toBe("2026-06");
    expect(period.endMonthKey).toBe("2026-06");
    expect(period.nextChargeMonthKey).toBe("2026-07");
    expect(period.periodLabel).toBe("June 2026");
    expect(period.monthsCovered).toEqual(["June"]);
  });

  it("arrears autopay collected in June bills May, recurs in July", () => {
    const period = computeBillingPeriodFromMonthKey("2026-06", "autopay", 1);
    expect(period.startMonthKey).toBe("2026-05");
    expect(period.endMonthKey).toBe("2026-05");
    // Monthly arrears: covers May, but the next monthly charge is July (not June).
    expect(period.nextChargeMonthKey).toBe("2026-07");
    expect(period.periodLabel).toBe("May 2026");
  });

  it("a 4-month term collected in June covers May to August, next charge September", () => {
    const period = computeBillingPeriodFromMonthKey("2026-06", "full", 4);
    expect(period.startMonthKey).toBe("2026-05");
    expect(period.endMonthKey).toBe("2026-08");
    expect(period.nextChargeMonthKey).toBe("2026-09");
    expect(period.periodLabel).toBe("May to August");
    expect(period.monthsCovered).toEqual(["May", "June", "July", "August"]);
  });

  it("rolls the arrears shift across a year boundary", () => {
    const period = computeBillingPeriodFromMonthKey("2026-01", "cash", 1);
    expect(period.startMonthKey).toBe("2025-12");
    // Covers December, next monthly charge is February.
    expect(period.nextChargeMonthKey).toBe("2026-02");
  });
});

describe("computeBillingPeriod", () => {
  it("derives the period from a payment Date", () => {
    const period = computeBillingPeriod("autopay", new Date("2026-06-15T10:00:00Z"), 1);
    expect(period.startMonthKey).toBe("2026-05");
  });
});

describe("collectDueReminders", () => {
  const now = new Date("2026-06-01T08:00:00Z"); // today = 2026-06-01

  it("selects pending fees anywhere in the 5-day window (5 days out → due today)", () => {
    const docs = [
      { id: "a", monthKey: "2026-06", status: "pending", dueDate: "2026-06-06" }, // 5 days out
      { id: "b", monthKey: "2026-06", status: "pending", dueDate: "2026-06-03" }, // 2 days out
      { id: "c", monthKey: "2026-06", status: "pending", dueDate: "2026-06-01" }, // due today
    ];
    expect(collectDueReminders(docs, now).map((d) => d.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps nudging overdue fees for up to 5 days past due, then stops", () => {
    const docs = [
      { id: "d", monthKey: "2026-06", status: "pending", dueDate: "2026-06-07" }, // 6 days out — too early
      { id: "e", monthKey: "2026-05", status: "overdue", dueDate: "2026-05-28" }, // 4 days past — still nudged
      { id: "g", monthKey: "2026-05", status: "overdue", dueDate: "2026-05-27" }, // 5 days past — last nudge
      { id: "h", monthKey: "2026-05", status: "overdue", dueDate: "2026-05-26" }, // 6 days past — stopped
      { id: "f", monthKey: "2026-05", status: "overdue", dueDate: "2026-05-20" }, // 12 days past — stopped
    ];
    expect(collectDueReminders(docs, now).map((d) => d.id)).toEqual(["e", "g"]);
  });

  it("skips fees under UPI approval (processing) and settled fees", () => {
    const docs = [
      { id: "f", monthKey: "2026-06", status: "processing", dueDate: "2026-06-06" },
      { id: "g", monthKey: "2026-06", status: "paid", dueDate: "2026-06-06" },
      { id: "h", monthKey: "2026-06", status: "waived", dueDate: "2026-06-06" },
    ];
    expect(collectDueReminders(docs, now)).toEqual([]);
  });

  it("sends at most once per calendar day (per-day idempotency)", () => {
    const docs = [
      { id: "i", monthKey: "2026-06", status: "pending", dueDate: "2026-06-06", reminders: { preDebitDateKey: "2026-06-01" } },
      { id: "j", monthKey: "2026-06", status: "pending", dueDate: "2026-06-06", reminders: { preDebitDateKey: "2026-05-31" } },
    ];
    // i was already reminded today → skipped; j was reminded yesterday → sent again today.
    expect(collectDueReminders(docs, now).map((d) => d.id)).toEqual(["j"]);
  });

  it("honours a custom daysBefore window", () => {
    const docs = [
      { id: "k", monthKey: "2026-06", status: "pending", dueDate: "2026-06-10" }, // 9 days out
    ];
    expect(collectDueReminders(docs, now, 10).map((d) => d.id)).toEqual(["k"]);
  });
});
