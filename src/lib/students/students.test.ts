import { describe, expect, it } from "vitest";
import {
  buildFeeBreakdown,
  formatStudentId,
  isPaymentFreeOnboarding,
  ROLL_NUMBER_PATTERN,
  suggestNextStudentId,
  type StudentFeeSetup,
} from "./types";

const baseFees: StudentFeeSetup = {
  studentType: "new",
  track: "monthly",
  kitFeeInPaise: 50000,      // ₹500
  booksFeeInPaise: 30000,    // ₹300
  uniformFeeInPaise: 20000,  // ₹200
  monthlyFeeInPaise: 200000, // ₹2,000
  termFeeInPaise: 0,
  discountInPaise: 0,
  firstMonthFree: false,
};

describe("formatStudentId", () => {
  it("zero-pads to three digits", () => {
    expect(formatStudentId(1)).toBe("STU001");
    expect(formatStudentId(42)).toBe("STU042");
  });
  it("grows past 999 without truncation", () => {
    expect(formatStudentId(1000)).toBe("STU1000");
  });
  it("clamps nonsense to the first id", () => {
    expect(formatStudentId(0)).toBe("STU001");
    expect(formatStudentId(-5)).toBe("STU001");
  });
});

describe("buildFeeBreakdown", () => {
  it("new monthly student pays items + pre-payment", () => {
    const { rows, totalInPaise } = buildFeeBreakdown(baseFees);
    expect(totalInPaise).toBe(50000 + 30000 + 20000 + 200000);
    expect(rows.map((row) => row.label)).toEqual(["Kit fee", "Books fee", "Uniform fee", "Pre-payment (first fee)"]);
  });

  it("existing student never pays the pre-payment (req)", () => {
    const { rows, totalInPaise } = buildFeeBreakdown({ ...baseFees, studentType: "existing" });
    expect(totalInPaise).toBe(50000 + 30000 + 20000);
    expect(rows.some((row) => row.label.includes("Pre-payment"))).toBe(false);
  });

  it("term track charges the full term fee instead of the monthly fee", () => {
    const { rows, totalInPaise } = buildFeeBreakdown({ ...baseFees, track: "term", termFeeInPaise: 800000 });
    expect(totalInPaise).toBe(50000 + 30000 + 20000 + 800000);
    expect(rows.some((row) => row.label === "Course fee (full term)")).toBe(true);
  });

  it("discount is applied and clamped to the subtotal", () => {
    expect(buildFeeBreakdown({ ...baseFees, discountInPaise: 50000 }).totalInPaise).toBe(250000);
    // A discount larger than the subtotal never goes negative.
    expect(buildFeeBreakdown({ ...baseFees, discountInPaise: 99_00000 }).totalInPaise).toBe(0);
  });

  it("first-month-free keeps today's total unchanged (the month is waived later)", () => {
    const normal = buildFeeBreakdown(baseFees);
    const free = buildFeeBreakdown({ ...baseFees, firstMonthFree: true });
    expect(free.totalInPaise).toBe(normal.totalInPaise);
  });

  it("skips zero rows", () => {
    const { rows } = buildFeeBreakdown({ ...baseFees, kitFeeInPaise: 0, booksFeeInPaise: 0, uniformFeeInPaise: 0 });
    expect(rows.map((row) => row.label)).toEqual(["Pre-payment (first fee)"]);
  });
});

describe("suggestNextStudentId", () => {
  it("suggests one past the highest number in use", () => {
    expect(suggestNextStudentId([{ studentId: "STU002" }, { studentId: "STU007" }])).toBe("STU008");
  });
  it("counts pending (desired) numbers too", () => {
    expect(suggestNextStudentId([{ studentId: "STU003" }, { desiredStudentId: "STU010" }])).toBe("STU011");
  });
  it("starts at STU001 with no students", () => {
    expect(suggestNextStudentId([])).toBe("STU001");
  });
  it("ignores non-numeric ids", () => {
    expect(suggestNextStudentId([{ studentId: "CUSTOM" }, { studentId: "STU004" }])).toBe("STU005");
  });
});

describe("ROLL_NUMBER_PATTERN", () => {
  it("accepts standard and custom ids of 6-20 chars", () => {
    expect(ROLL_NUMBER_PATTERN.test("STU001")).toBe(true);
    expect(ROLL_NUMBER_PATTERN.test("JAV-2026-01")).toBe(true);
  });
  it("rejects ids too short to be a Firebase password", () => {
    expect(ROLL_NUMBER_PATTERN.test("STU1")).toBe(false);
    expect(ROLL_NUMBER_PATTERN.test("")).toBe(false);
  });
  it("rejects spaces and symbols", () => {
    expect(ROLL_NUMBER_PATTERN.test("STU 001")).toBe(false);
    expect(ROLL_NUMBER_PATTERN.test("STU@001")).toBe(false);
  });
});

describe("isPaymentFreeOnboarding", () => {
  it("true for an existing student with no items to buy", () => {
    expect(isPaymentFreeOnboarding({ ...baseFees, studentType: "existing", kitFeeInPaise: 0, booksFeeInPaise: 0, uniformFeeInPaise: 0 })).toBe(true);
  });
  it("false whenever something is payable today", () => {
    expect(isPaymentFreeOnboarding(baseFees)).toBe(false);
  });
});
