import { describe, it, expect } from "vitest";
import {
  baseFeeLabel,
  computeFeeEditChanges,
  describeFeeEditChanges,
  feePaidStatement,
  formatFeeDate,
  nextFeePeriodLabel,
} from "./feeMath";

describe("formatFeeDate", () => {
  it("formats an ISO string with the full month name (unambiguous)", () => {
    expect(formatFeeDate("2026-07-11T10:30:00.000Z")).toMatch(/^11 July 2026$|^12 July 2026$/); // local tz may shift the day near midnight
    expect(formatFeeDate("2026-07-11")).toContain("July 2026");
  });
  it("formats a Firestore Timestamp-like object", () => {
    const fakeTimestamp = { toDate: () => new Date(2026, 6, 11) };
    expect(formatFeeDate(fakeTimestamp)).toBe("11 July 2026");
  });
  it("formats a Date", () => {
    expect(formatFeeDate(new Date(2026, 5, 1))).toBe("1 June 2026");
  });
  it("returns empty for garbage", () => {
    expect(formatFeeDate(undefined)).toBe("");
    expect(formatFeeDate("not a date")).toBe("");
    expect(formatFeeDate(null)).toBe("");
  });
});

describe("baseFeeLabel", () => {
  it("strips the Pre-payment suffix", () => {
    expect(baseFeeLabel("June 2026 · Pre-payment")).toBe("June 2026");
    expect(baseFeeLabel("June 2026")).toBe("June 2026");
    expect(baseFeeLabel("")).toBe("");
  });
});

describe("feePaidStatement", () => {
  const paidAt = { toDate: () => new Date(2026, 6, 12) }; // 12 July 2026

  it('says "June 2026 fee paid on 12 July 2026" (req)', () => {
    expect(feePaidStatement({ periodLabel: "June 2026", status: "paid", paidAt })).toBe("June 2026 fee paid on 12 July 2026");
  });
  it("uses the base label for a Pre-payment fee", () => {
    expect(feePaidStatement({ periodLabel: "June 2026 · Pre-payment", status: "paid", paidAt })).toBe("June 2026 fee paid on 12 July 2026");
  });
  it('avoids "fee fee" when the label already ends in fee', () => {
    expect(feePaidStatement({ periodLabel: "Full course fee", status: "paid", paidAt })).toBe("Full course fee paid on 12 July 2026");
  });
  it("is empty when the fee is not paid or has no paid date", () => {
    expect(feePaidStatement({ periodLabel: "June 2026", status: "pending", paidAt })).toBe("");
    expect(feePaidStatement({ periodLabel: "June 2026", status: "paid", paidAt: undefined })).toBe("");
  });
});

describe("nextFeePeriodLabel", () => {
  it("keeps an arrears fee arrears when moved to another month", () => {
    // Doc collected in 2026-07 but labelled "June 2026" (arrears). Moving it to
    // 2026-08 keeps the offset: label becomes "July 2026".
    expect(nextFeePeriodLabel({ periodLabel: "June 2026", monthKey: "2026-07" }, { monthKey: "2026-08", prepayment: false })).toBe("July 2026");
  });
  it("keeps an advance fee on its own month when moved", () => {
    expect(nextFeePeriodLabel({ periodLabel: "July 2026", monthKey: "2026-07" }, { monthKey: "2026-08", prepayment: false })).toBe("August 2026");
  });
  it("applies the Pre-payment suffix from the toggle", () => {
    expect(nextFeePeriodLabel({ periodLabel: "June 2026", monthKey: "2026-06" }, { prepayment: true })).toBe("June 2026 · Pre-payment");
    expect(nextFeePeriodLabel({ periodLabel: "June 2026 · Pre-payment", monthKey: "2026-06" }, { prepayment: false })).toBe("June 2026");
  });
});

describe("computeFeeEditChanges", () => {
  const fee = { amountInPaise: 185000, dueDate: "2026-07-11", monthKey: "2026-07", periodLabel: "June 2026" };

  it("records an amount change with display values", () => {
    const changes = computeFeeEditChanges(fee, { amountInPaise: 200000, dueDate: "2026-07-11", prepayment: false });
    expect(changes).toEqual([{ field: "amount", from: "₹1,850", to: "₹2,000" }]);
  });

  it("records a month change using the labels the parent sees", () => {
    const changes = computeFeeEditChanges(fee, { amountInPaise: 185000, dueDate: "2026-07-11", monthKey: "2026-08", prepayment: false });
    expect(changes).toEqual([{ field: "month", from: "June 2026", to: "July 2026" }]);
  });

  it("records due date and type changes", () => {
    const changes = computeFeeEditChanges(fee, { amountInPaise: 185000, dueDate: "2026-07-15", prepayment: true });
    expect(changes).toEqual([
      { field: "dueDate", from: "11 Jul 2026", to: "15 Jul 2026" },
      { field: "type", from: "Regular fee", to: "Pre-payment" },
    ]);
  });

  it("returns nothing when nothing changed", () => {
    expect(computeFeeEditChanges(fee, { amountInPaise: 185000, dueDate: "2026-07-11", prepayment: false })).toEqual([]);
  });
});

describe("describeFeeEditChanges", () => {
  it("joins changes into one readable line", () => {
    expect(describeFeeEditChanges([
      { field: "amount", from: "₹1,850", to: "₹2,000" },
      { field: "month", from: "June 2026", to: "July 2026" },
    ])).toBe("Amount: ₹1,850 → ₹2,000 · Month: June 2026 → July 2026");
    expect(describeFeeEditChanges(undefined)).toBe("");
  });
});
