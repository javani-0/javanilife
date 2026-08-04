import { describe, expect, it } from "vitest";
import { buildCourseBreakdown, buildStudentBreakdown, flattenBreakdownRows, normalizeGst } from "./feeBreakdown";
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
    expect(buildStudentBreakdown([])).toEqual({
      sections: [], grandTotalInPaise: 0, dueNowInPaise: 0, gstInPaise: 0, taxableInPaise: 0,
    });
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

// ---------------------------------------------------------------------------
// GST (req): opt-in per student, default 18%, admin-editable.
// ---------------------------------------------------------------------------

describe("GST", () => {
  const gst = (percent = 18) => ({ enabled: true, percent });

  it("adds a GST row on the POST-DISCOUNT amount and grosses up the total", () => {
    const result = buildCourseBreakdown(course({
      fees: { ...course().fees, kitFeeInPaise: 200000, discountInPaise: 100000 },
    }), gst());
    expect(result.taxableInPaise).toBe(100000);         // 2000 - 1000
    expect(result.gstInPaise).toBe(18000);              // 18% of 1000
    expect(result.totalInPaise).toBe(118000);
    expect(result.rows.at(-1)).toEqual({ label: "GST @ 18%", amountInPaise: 18000 });
  });

  it("honours a custom percentage", () => {
    const result = buildCourseBreakdown(course({
      fees: { ...course().fees, kitFeeInPaise: 100000 },
    }), gst(5));
    expect(result.gstInPaise).toBe(5000);
    expect(result.gstPercent).toBe(5);
    expect(result.rows.at(-1)?.label).toBe("GST @ 5%");
  });

  it("adds nothing when GST is disabled", () => {
    const result = buildCourseBreakdown(course({
      fees: { ...course().fees, kitFeeInPaise: 100000 },
    }), { enabled: false, percent: 18 });
    expect(result.gstInPaise).toBe(0);
    expect(result.gstPercent).toBe(0);
    expect(result.totalInPaise).toBe(100000);
    expect(result.rows.some((r) => r.label.startsWith("GST"))).toBe(false);
  });

  it("splits EMI on the GST-INCLUSIVE total so installments still sum to what is owed", () => {
    const result = buildCourseBreakdown(course({
      methods: { razorpay: false, qr: true, counter: true, emi: true },
      fees: {
        ...course().fees, track: "term", termFeeInPaise: 100000,
        emiSplit: { upfrontPercentage: 50, installmentPercentages: [50] },
      },
    }), gst());
    expect(result.totalInPaise).toBe(118000);
    expect(result.emiInstallments!.reduce((s, r) => s + r.amountInPaise, 0)).toBe(118000);
    expect(result.dueNowInPaise).toBe(59000);
  });

  it("sums GST across every class on the student breakdown", () => {
    const result = buildStudentBreakdown([
      course({ key: "a", className: "Vocal", fees: { ...course().fees, kitFeeInPaise: 100000 } }),
      course({ key: "b", className: "Veena", fees: { ...course().fees, booksFeeInPaise: 200000 } }),
    ], gst());
    expect(result.taxableInPaise).toBe(300000);
    expect(result.gstInPaise).toBe(54000);
    expect(result.grandTotalInPaise).toBe(354000);
  });

  it("never emits undefined in a GST section (Firestore-safe)", () => {
    const { sections } = buildStudentBreakdown([
      course({ key: "a", className: "Vocal", fees: { ...course().fees, kitFeeInPaise: 100000 } }),
    ], gst());
    for (const [key, value] of Object.entries(sections[0])) {
      expect(value, `section.${key} must not be undefined`).not.toBeUndefined();
    }
  });
});

describe("normalizeGst", () => {
  it("defaults to disabled at 18%", () => {
    expect(normalizeGst(undefined)).toEqual({ enabled: false, percent: 18 });
    expect(normalizeGst({})).toEqual({ enabled: false, percent: 18 });
  });
  it("keeps a valid custom percent and clamps nonsense back to the default", () => {
    expect(normalizeGst({ enabled: true, percent: 12 })).toEqual({ enabled: true, percent: 12 });
    expect(normalizeGst({ enabled: true, percent: 0 }).percent).toBe(18);
    expect(normalizeGst({ enabled: true, percent: -5 }).percent).toBe(18);
    expect(normalizeGst({ enabled: true, percent: 500 }).percent).toBe(100);
  });
});
