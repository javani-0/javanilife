import { describe, expect, it } from "vitest";
import type { FeePaymentDoc } from "@/lib/classes";
import { buildBillNumber, normalizeBill, splitGstLines } from "./bills";

describe("splitGstLines", () => {
  it("separates the GST line from the taxable lines and reads the rate", () => {
    const result = splitGstLines([
      { label: "Kit fee", amountInPaise: 150000 },
      { label: "Books fee", amountInPaise: 50000 },
      { label: "GST @ 18%", amountInPaise: 36000 },
    ]);
    expect(result.taxableInPaise).toBe(200000);
    expect(result.gstInPaise).toBe(36000);
    expect(result.gstPercent).toBe(18);
  });

  it("keeps discounts inside the taxable value (they reduce it)", () => {
    const result = splitGstLines([
      { label: "Kit fee", amountInPaise: 200000 },
      { label: "Discount", amountInPaise: -100000 },
      { label: "GST @ 18%", amountInPaise: 18000 },
    ]);
    expect(result.taxableInPaise).toBe(100000);
    expect(result.gstInPaise).toBe(18000);
  });

  it("reports no GST on a pre-GST bill", () => {
    const result = splitGstLines([{ label: "Monthly class fee — Vocal", amountInPaise: 100000 }]);
    expect(result.gstInPaise).toBe(0);
    expect(result.gstPercent).toBe(0);
    expect(result.taxableInPaise).toBe(100000);
  });

  it("handles a fractional rate", () => {
    const result = splitGstLines([
      { label: "Course fee (full term)", amountInPaise: 100000 },
      { label: "GST @ 2.5%", amountInPaise: 2500 },
    ]);
    expect(result.gstPercent).toBe(2.5);
    expect(result.gstInPaise).toBe(2500);
  });

  it("is not fooled by a line that merely mentions GST", () => {
    const result = splitGstLines([{ label: "GST registration charge", amountInPaise: 50000 }]);
    expect(result.gstInPaise).toBe(0);
    expect(result.taxableInPaise).toBe(50000);
  });
});

describe("buildBillNumber", () => {
  const fee = { id: "abcdefEnroll_2026-07", monthKey: "2026-07" } as FeePaymentDoc;

  it("encodes period, roll number and a suffix from the ENROLMENT part", () => {
    // Not "6-07": fee ids end in the month, so the tail must come from the
    // enrollment id or every bill in a month would share a suffix.
    expect(buildBillNumber(fee, "STU001", "2026-07-27")).toBe("JAV/202607/STU001/ROLL");
  });

  it("gives two students in the same month DIFFERENT suffixes", () => {
    const a = { id: "aaaaaaaaEnrollAAA_2026-07", monthKey: "2026-07" } as FeePaymentDoc;
    const b = { id: "bbbbbbbbEnrollBBB_2026-07", monthKey: "2026-07" } as FeePaymentDoc;
    expect(buildBillNumber(a, "STU001", "2026-07-27"))
      .not.toBe(buildBillNumber(b, "STU002", "2026-07-27"));
  });

  it("falls back to GUEST when there is no roll number yet", () => {
    expect(buildBillNumber(fee, "", "2026-07-27")).toContain("/GUEST/");
  });

  it("uses the issue month when the fee has no monthKey", () => {
    const noMonth = { id: "xyz1", monthKey: "" } as FeePaymentDoc;
    expect(buildBillNumber(noMonth, "STU009", "2026-08-02")).toBe("JAV/202608/STU009/XYZ1");
  });
});

describe("normalizeBill", () => {
  it("drops unlabelled lines and clamps the money fields", () => {
    const bill = normalizeBill({
      token: "t1",
      lines: [{ label: "Kit fee", amountInPaise: 1000 }, { label: "", amountInPaise: 999 }],
      totalInPaise: -5,
      gstPercent: 18,
    });
    expect(bill.lines).toHaveLength(1);
    expect(bill.totalInPaise).toBe(0);
    expect(bill.gstPercent).toBe(18);
  });

  it("is empty-safe and never returns undefined strings", () => {
    const bill = normalizeBill({});
    expect(bill.token).toBe("");
    expect(bill.lines).toEqual([]);
    expect(bill.status).toBe("pending");
  });
});
