import { describe, expect, it } from "vitest";
import {
  clampRentalDays,
  computeRentalCharge,
  describeRentalCountdown,
  isRentalOverdue,
  overdueChargeInPaise,
  overdueHoursAt,
  rentalBaseInPaise,
  rentalDaysBetween,
  rentalDueAt,
  rentalHourlyRateInPaise,
} from "./rentals";

const DAY_RATE = 50_000; // ₹500 for 24 hours
const START = "2026-09-10T10:00:00.000Z";

describe("clampRentalDays", () => {
  it("never books less than a day", () => {
    expect(clampRentalDays(0)).toBe(1);
    expect(clampRentalDays(-3)).toBe(1);
    expect(clampRentalDays(2.7)).toBe(2);
  });

  it("respects the admin's maximum", () => {
    expect(clampRentalDays(30, 7)).toBe(7);
    expect(clampRentalDays(3, 7)).toBe(3);
    expect(clampRentalDays(30, 0)).toBe(30); // 0 = no limit
  });
});

describe("rentalDueAt", () => {
  it("is exactly N × 24 hours after the item goes out", () => {
    expect(rentalDueAt(START, 1)).toBe("2026-09-11T10:00:00.000Z");
    expect(rentalDueAt(START, 3)).toBe("2026-09-13T10:00:00.000Z");
  });

  it("returns nothing for an unusable start", () => {
    expect(rentalDueAt("not a date", 2)).toBe("");
  });
});

describe("rentalBaseInPaise", () => {
  it("is days × the 24-hour price × units", () => {
    expect(rentalBaseInPaise(DAY_RATE, 3)).toBe(150_000);
    expect(rentalBaseInPaise(DAY_RATE, 2, 3)).toBe(300_000);
  });
});

describe("rentalHourlyRateInPaise", () => {
  it("is a 24th of the day rate", () => {
    expect(rentalHourlyRateInPaise(DAY_RATE)).toBe(2083); // ₹20.83
    expect(rentalHourlyRateInPaise(24_00)).toBe(100);     // ₹24/day → ₹1/h
  });
});

describe("overdueHoursAt", () => {
  const due = "2026-09-11T10:00:00.000Z";

  it("is zero while the rental is still within its time", () => {
    expect(overdueHoursAt(due, "2026-09-11T09:59:00.000Z")).toBe(0);
    expect(overdueHoursAt(due, due)).toBe(0);
  });

  it("counts any part of an hour as a whole hour", () => {
    expect(overdueHoursAt(due, "2026-09-11T10:00:01.000Z")).toBe(1);
    expect(overdueHoursAt(due, "2026-09-11T11:00:00.000Z")).toBe(1);
    expect(overdueHoursAt(due, "2026-09-11T11:00:01.000Z")).toBe(2);
    expect(overdueHoursAt(due, "2026-09-12T10:00:00.000Z")).toBe(24);
  });
});

describe("overdueChargeInPaise", () => {
  it("bills the late hours at the hourly rate", () => {
    // 5 late hours × ₹20.83 = ₹104.15
    expect(overdueChargeInPaise(DAY_RATE, "2026-09-11T10:00:00.000Z", "2026-09-11T15:00:00.000Z")).toBe(10_415);
  });

  it("multiplies by the number of units out", () => {
    expect(overdueChargeInPaise(DAY_RATE, "2026-09-11T10:00:00.000Z", "2026-09-11T15:00:00.000Z", 2)).toBe(20_830);
  });

  it("is nothing when the item is back in time", () => {
    expect(overdueChargeInPaise(DAY_RATE, "2026-09-11T10:00:00.000Z", "2026-09-11T09:00:00.000Z")).toBe(0);
  });
});

describe("computeRentalCharge", () => {
  it("prices a booking that is still running", () => {
    const charge = computeRentalCharge({
      pricePerDayInPaise: DAY_RATE, days: 2, startAt: START, now: "2026-09-11T10:00:00.000Z",
    });
    expect(charge.dueAt).toBe("2026-09-12T10:00:00.000Z");
    expect(charge.baseInPaise).toBe(100_000);
    expect(charge.overdueHours).toBe(0);
    expect(charge.totalInPaise).toBe(100_000);
  });

  it("adds the late hours to the total", () => {
    const charge = computeRentalCharge({
      pricePerDayInPaise: DAY_RATE, days: 1, startAt: START, now: "2026-09-11T13:30:00.000Z",
    });
    expect(charge.overdueHours).toBe(4);                 // 3.5 h → 4 started hours
    expect(charge.overdueChargeInPaise).toBe(8332);      // 4 × ₹20.83
    expect(charge.totalInPaise).toBe(58_332);
  });

  it("STOPS accruing once the item is back", () => {
    const returned = computeRentalCharge({
      pricePerDayInPaise: DAY_RATE, days: 1, startAt: START,
      returnedAt: "2026-09-11T12:00:00.000Z",
      now: "2026-09-20T10:00:00.000Z",                   // days later
    });
    expect(returned.overdueHours).toBe(2);
    expect(returned.totalInPaise).toBe(50_000 + 2 * 2083);
  });

  it("honours a stored dueAt over recomputing it", () => {
    const charge = computeRentalCharge({
      pricePerDayInPaise: DAY_RATE, days: 1, startAt: START,
      dueAt: "2026-09-15T10:00:00.000Z",
      now: "2026-09-15T09:00:00.000Z",
    });
    expect(charge.overdueHours).toBe(0);
    expect(charge.dueAt).toBe("2026-09-15T10:00:00.000Z");
  });
});

describe("isRentalOverdue", () => {
  const dueAt = "2026-09-11T10:00:00.000Z";
  const late = "2026-09-11T12:00:00.000Z";

  it("is true only while the item is still out", () => {
    expect(isRentalOverdue({ status: "picked-up", dueAt }, late)).toBe(true);
    expect(isRentalOverdue({ status: "booked", dueAt }, late)).toBe(true);
    expect(isRentalOverdue({ status: "returned", dueAt }, late)).toBe(false);
    expect(isRentalOverdue({ status: "cancelled", dueAt }, late)).toBe(false);
  });

  it("is false before the due moment", () => {
    expect(isRentalOverdue({ status: "picked-up", dueAt }, "2026-09-11T09:00:00.000Z")).toBe(false);
  });
});

describe("describeRentalCountdown", () => {
  const dueAt = "2026-09-11T10:00:00.000Z";

  it("counts down, then counts up", () => {
    expect(describeRentalCountdown(dueAt, "2026-09-11T09:30:00.000Z")).toBe("Due within the hour");
    expect(describeRentalCountdown(dueAt, "2026-09-11T05:00:00.000Z")).toBe("Due in 5 h");
    expect(describeRentalCountdown(dueAt, "2026-09-08T10:00:00.000Z")).toBe("Due in 3 days");
    expect(describeRentalCountdown(dueAt, "2026-09-11T13:00:00.000Z")).toBe("3 h overdue");
    expect(describeRentalCountdown(dueAt, "2026-09-14T10:00:00.000Z")).toBe("3 days overdue");
  });
});

describe("rentalDaysBetween", () => {
  it("turns a FROM/TO pair into whole billed days", () => {
    expect(rentalDaysBetween("2026-09-10T10:00:00.000Z", "2026-09-11T10:00:00.000Z")).toBe(1);
    expect(rentalDaysBetween("2026-09-10T10:00:00.000Z", "2026-09-13T10:00:00.000Z")).toBe(3);
  });

  it("counts any part of a day as a whole day", () => {
    expect(rentalDaysBetween("2026-09-10T10:00:00.000Z", "2026-09-11T10:00:01.000Z")).toBe(2);
    expect(rentalDaysBetween("2026-09-10T18:00:00.000Z", "2026-09-11T09:00:00.000Z")).toBe(1);
  });

  it("never returns less than a day, however the dates are given", () => {
    expect(rentalDaysBetween("2026-09-10T10:00:00.000Z", "2026-09-10T10:00:00.000Z")).toBe(1);
    expect(rentalDaysBetween("2026-09-12T10:00:00.000Z", "2026-09-10T10:00:00.000Z")).toBe(1);
    expect(rentalDaysBetween("nonsense", "2026-09-10T10:00:00.000Z")).toBe(1);
  });
});
