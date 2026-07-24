import { describe, expect, it } from "vitest";
import { buildCourseBreakdown, buildStudentBreakdown, flattenBreakdownRows } from "./feeBreakdown";
import type { StudentCourse } from "./types";

const course = (over: Partial<StudentCourse> = {}): StudentCourse => ({
  key: "k1",
  classId: "c1",
  className: "Bharatanatyam",
  inventory: { kit: false, books: false, uniform: false },
  status: "active",
  methods: { razorpay: false, qr: true, counter: true, emi: false },
  fees: {
    studentType: "new",
    track: "monthly",
    kitFeeInPaise: 0,
    booksFeeInPaise: 0,
    uniformFeeInPaise: 0,
    monthlyFeeInPaise: 0,
    termFeeInPaise: 0,
    discountInPaise: 0,
    firstMonthFree: false,
  },
  ...over,
});

describe("buildCourseBreakdown", () => {
  it("itemises kit, books, uniform and the monthly pre-payment for a new student", () => {
    const result = buildCourseBreakdown(course({
      fees: {
        ...course().fees,
        kitFeeInPaise: 150000, booksFeeInPaise: 80000,
        uniformFeeInPaise: 120000, monthlyFeeInPaise: 100000,
      },
    }));
    expect(result.rows.map((row) => row.label)).toEqual([
      "Kit fee", "Books fee", "Uniform fee", "Pre-payment (first fee)",
    ]);
    expect(result.subtotalInPaise).toBe(450000);
    expect(result.discountInPaise).toBe(0);
    expect(result.totalInPaise).toBe(450000);
    expect(result.dueNowInPaise).toBe(450000);
  });

  it("omits the monthly pre-payment for an existing student but keeps the items", () => {
    const result = buildCourseBreakdown(course({
      fees: { ...course().fees, studentType: "existing", kitFeeInPaise: 150000, monthlyFeeInPaise: 100000 },
    }));
    expect(result.rows.map((row) => row.label)).toEqual(["Kit fee"]);
    expect(result.totalInPaise).toBe(150000);
  });

  it("charges the term course fee for existing students too", () => {
    const result = buildCourseBreakdown(course({
      fees: { ...course().fees, studentType: "existing", track: "term", termFeeInPaise: 800000 },
    }));
    expect(result.rows.map((row) => row.label)).toEqual(["Course fee (full term)"]);
    expect(result.totalInPaise).toBe(800000);
  });

  it("clamps the discount to the subtotal and records it as a negative row", () => {
    const result = buildCourseBreakdown(course({
      fees: { ...course().fees, kitFeeInPaise: 100000, discountInPaise: 500000 },
    }));
    expect(result.discountInPaise).toBe(100000);
    expect(result.rows.at(-1)).toEqual({ label: "Discount", amountInPaise: -100000 });
    expect(result.totalInPaise).toBe(0);
  });

  it("asks only for installment 1 when EMI is on, and the parts sum to the total", () => {
    const result = buildCourseBreakdown(course({
      methods: { razorpay: false, qr: true, counter: true, emi: true },
      fees: {
        ...course().fees, track: "term", termFeeInPaise: 900000,
        emiSplit: { upfrontPercentage: 50, installmentPercentages: [25, 25] },
      },
    }));
    expect(result.totalInPaise).toBe(900000);
    expect(result.dueNowInPaise).toBe(450000);
    expect(result.emiInstallments).toHaveLength(3);
    expect(result.emiInstallments!.reduce((sum, row) => sum + row.amountInPaise, 0)).toBe(900000);
  });

  it("has no EMI schedule when the emi method is off", () => {
    const result = buildCourseBreakdown(course({
      methods: { razorpay: false, qr: true, counter: true, emi: false },
      fees: {
        ...course().fees, track: "term", termFeeInPaise: 900000,
        emiSplit: { upfrontPercentage: 50, installmentPercentages: [25, 25] },
      },
    }));
    expect(result.emiInstallments).toBeUndefined();
    expect(result.dueNowInPaise).toBe(900000);
  });

  it("reports the recurring monthly charge so the parent sees what comes next", () => {
    const result = buildCourseBreakdown(course({
      fees: { ...course().fees, monthlyFeeInPaise: 100000 },
    }));
    expect(result.recurring).toEqual({ label: "Monthly class fee", amountInPaise: 100000 });
  });

  it("has no recurring line for a term course", () => {
    const result = buildCourseBreakdown(course({
      fees: { ...course().fees, track: "term", termFeeInPaise: 500000 },
    }));
    expect(result.recurring).toBeUndefined();
  });
});

describe("buildStudentBreakdown", () => {
  it("returns one section per class and sums the grand total", () => {
    const result = buildStudentBreakdown([
      course({ key: "a", className: "Vocal", fees: { ...course().fees, kitFeeInPaise: 100000, monthlyFeeInPaise: 60000 } }),
      course({ key: "b", className: "Veena", fees: { ...course().fees, booksFeeInPaise: 40000, monthlyFeeInPaise: 80000 } }),
    ]);
    expect(result.sections.map((section) => section.className)).toEqual(["Vocal", "Veena"]);
    expect(result.grandTotalInPaise).toBe(100000 + 60000 + 40000 + 80000);
    expect(result.dueNowInPaise).toBe(result.grandTotalInPaise);
  });

  it("excludes dropped courses", () => {
    const result = buildStudentBreakdown([
      course({ key: "a", className: "Vocal", fees: { ...course().fees, kitFeeInPaise: 100000 } }),
      course({ key: "b", className: "Veena", status: "dropped", fees: { ...course().fees, kitFeeInPaise: 999999 } }),
    ]);
    expect(result.sections).toHaveLength(1);
    expect(result.grandTotalInPaise).toBe(100000);
  });

  it("sums only installment 1 of each EMI course into due-now", () => {
    const result = buildStudentBreakdown([
      course({ key: "a", className: "Vocal", fees: { ...course().fees, kitFeeInPaise: 100000 } }),
      course({
        key: "b", className: "Veena",
        methods: { razorpay: false, qr: true, counter: true, emi: true },
        fees: {
          ...course().fees, track: "term", termFeeInPaise: 800000,
          emiSplit: { upfrontPercentage: 50, installmentPercentages: [50] },
        },
      }),
    ]);
    expect(result.grandTotalInPaise).toBe(900000);
    expect(result.dueNowInPaise).toBe(100000 + 400000);
  });

  it("is empty-safe", () => {
    expect(buildStudentBreakdown([])).toEqual({ sections: [], grandTotalInPaise: 0, dueNowInPaise: 0 });
  });

  // REGRESSION: sections are written to onboardingLinks.sections, and Firestore
  // REJECTS undefined — a stray `slotLabel: undefined` made the whole setDoc
  // throw, so the pay link doc was never created and /pay/:token 404'd.
  it("never emits an undefined value in a section (Firestore-safe)", () => {
    const { sections } = buildStudentBreakdown([
      course({ key: "a", className: "Vocal", slotLabel: undefined, fees: { ...course().fees, kitFeeInPaise: 100000 } }),
      course({ key: "b", className: "Veena", slotLabel: "Mon 6PM", fees: { ...course().fees, booksFeeInPaise: 40000 } }),
    ]);
    for (const section of sections) {
      for (const [key, value] of Object.entries(section)) {
        expect(value, `section.${key} must not be undefined`).not.toBeUndefined();
      }
    }
    expect("slotLabel" in sections[0]).toBe(false);
    expect(sections[1].slotLabel).toBe("Mon 6PM");
  });
});

describe("flattenBreakdownRows", () => {
  it("leaves rows unprefixed for a single class", () => {
    const breakdown = buildStudentBreakdown([
      course({ className: "Vocal", fees: { ...course().fees, kitFeeInPaise: 100000 } }),
    ]);
    expect(flattenBreakdownRows(breakdown)).toEqual([{ label: "Kit fee", amountInPaise: 100000 }]);
  });

  it("prefixes rows with the class name when several classes are combined", () => {
    const breakdown = buildStudentBreakdown([
      course({ key: "a", className: "Vocal", fees: { ...course().fees, kitFeeInPaise: 100000 } }),
      course({ key: "b", className: "Veena", fees: { ...course().fees, booksFeeInPaise: 40000 } }),
    ]);
    expect(flattenBreakdownRows(breakdown)).toEqual([
      { label: "Vocal · Kit fee", amountInPaise: 100000 },
      { label: "Veena · Books fee", amountInPaise: 40000 },
    ]);
  });
});
