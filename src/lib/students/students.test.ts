import { describe, expect, it } from "vitest";
import {
  activeCourses,
  buildFeeBreakdown,
  DEFAULT_EMI_SPLIT,
  emiScheduleFor,
  formatStudentId,
  isPaymentFreeOnboarding,
  mirrorPrimaryCourse,
  normalizeCourses,
  onboardingDueNowInPaise,
  ROLL_NUMBER_PATTERN,
  suggestNextStudentId,
  suggestStudentEmail,
  type StudentCourse,
  type StudentFeeSetup,
  type StudentPaymentMethods,
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

  it("EXISTING student on a term course still pays the full course fee", () => {
    const { rows, totalInPaise } = buildFeeBreakdown({ ...baseFees, studentType: "existing", track: "term", termFeeInPaise: 1856500 });
    expect(rows.some((row) => row.label === "Course fee (full term)")).toBe(true);
    expect(totalInPaise).toBe(50000 + 30000 + 20000 + 1856500);
    // …but never a monthly pre-payment row.
    expect(rows.some((row) => row.label.includes("Pre-payment"))).toBe(false);
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

describe("suggestStudentEmail", () => {
  it("builds an email from the name", () => {
    expect(suggestStudentEmail("Krishna Sree")).toBe("krishnasree@javani.com");
  });
  it("strips symbols and case", () => {
    expect(suggestStudentEmail("  Aarav  S. Kumar ")).toBe("aaravskumar@javani.com");
  });
  it("adds a numeric suffix when the address is taken", () => {
    expect(suggestStudentEmail("Krishna Sree", ["krishnasree@javani.com"])).toBe("krishnasree1@javani.com");
    expect(suggestStudentEmail("Krishna Sree", ["krishnasree@javani.com", "krishnasree1@javani.com"])).toBe("krishnasree2@javani.com");
  });
  it("returns empty for a name with no letters/numbers", () => {
    expect(suggestStudentEmail("!!!")).toBe("");
    expect(suggestStudentEmail("")).toBe("");
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

// ---------------------------------------------------------------------------
// EMI onboarding (req): the parent is asked for the FIRST installment only —
// the WhatsApp message, the link and the Razorpay order all price off this.
// ---------------------------------------------------------------------------
const methodsWith = (emi: boolean): StudentPaymentMethods => ({ razorpay: false, qr: true, counter: true, emi });

const emiTermFees: StudentFeeSetup = {
  ...baseFees,
  track: "term",
  monthlyFeeInPaise: 0,
  termFeeInPaise: 1000000, // ₹10,000
  emiSplit: DEFAULT_EMI_SPLIT, // 50% upfront + 25% + 25%
};

describe("emiScheduleFor", () => {
  it("returns the installment rows when EMI is enabled on a term student", () => {
    const schedule = emiScheduleFor(emiTermFees, methodsWith(true));
    expect(schedule).toHaveLength(3);
    // ₹10,000 term + ₹500 kit + ₹300 books + ₹200 uniform = ₹11,000 total.
    expect(schedule?.map((row) => row.amountInPaise)).toEqual([550000, 275000, 275000]);
  });
  it("is undefined when the admin did not enable the EMI method", () => {
    expect(emiScheduleFor(emiTermFees, methodsWith(false))).toBeUndefined();
  });
  it("is undefined for a monthly student even if a split is stored", () => {
    expect(emiScheduleFor({ ...baseFees, emiSplit: DEFAULT_EMI_SPLIT }, methodsWith(true))).toBeUndefined();
  });
  it("installments always sum back to the full total", () => {
    // 33/33/34 forces rounding: the last part must absorb the remainder.
    const schedule = emiScheduleFor(
      { ...emiTermFees, termFeeInPaise: 999999, emiSplit: { upfrontPercentage: 33, installmentPercentages: [33, 34] } },
      methodsWith(true),
    );
    const { totalInPaise } = buildFeeBreakdown({ ...emiTermFees, termFeeInPaise: 999999 });
    expect(schedule?.reduce((sum, row) => sum + row.amountInPaise, 0)).toBe(totalInPaise);
  });
});

describe("onboardingDueNowInPaise", () => {
  it("asks for the first installment only on an EMI link", () => {
    expect(onboardingDueNowInPaise(emiTermFees, methodsWith(true))).toBe(550000);
  });
  it("asks for the whole total when EMI is off", () => {
    const { totalInPaise } = buildFeeBreakdown(emiTermFees);
    expect(onboardingDueNowInPaise(emiTermFees, methodsWith(false))).toBe(totalInPaise);
    expect(totalInPaise).toBe(1100000);
  });
  it("falls back to the total for a monthly student", () => {
    expect(onboardingDueNowInPaise(baseFees, methodsWith(true))).toBe(buildFeeBreakdown(baseFees).totalInPaise);
  });
});

// ---------------------------------------------------------------------------
// Multi-class (req): one student may take several classes under one profile.
// ---------------------------------------------------------------------------

describe("normalizeCourses", () => {
  it("synthesises one course from legacy flat fields", () => {
    const courses = normalizeCourses({
      classId: "c1",
      className: "Bharatanatyam",
      slotId: "s1",
      slotLabel: "Mon–Fri 6PM",
      trainerName: "Guru A",
      joiningDate: "2026-07-01",
      nextChargeDate: "2026-08-05",
      inventory: { kit: true, books: false, uniform: false },
      fees: { studentType: "new", track: "monthly", monthlyFeeInPaise: 100000 },
      methods: { qr: true, counter: true },
      enrollmentId: "e1",
    });
    expect(courses).toHaveLength(1);
    expect(courses[0].key).toBe("legacy");
    expect(courses[0].classId).toBe("c1");
    expect(courses[0].enrollmentId).toBe("e1");
    expect(courses[0].status).toBe("active");
    expect(courses[0].fees.monthlyFeeInPaise).toBe(100000);
    expect(courses[0].inventory.kit).toBe(true);
  });

  it("returns an empty array when there is no class at all", () => {
    expect(normalizeCourses({})).toEqual([]);
  });

  it("reads a real courses array and ignores the flat fields", () => {
    const courses = normalizeCourses({
      classId: "legacy-ignored",
      courses: [
        { key: "a", classId: "c1", className: "Vocal", fees: { track: "monthly", monthlyFeeInPaise: 50000 } },
        { key: "b", classId: "c2", className: "Veena", status: "dropped" },
      ],
    });
    expect(courses).toHaveLength(2);
    expect(courses.map((c) => c.classId)).toEqual(["c1", "c2"]);
    expect(courses[1].status).toBe("dropped");
  });

  it("gives every course a unique key even when the stored key is blank", () => {
    const courses = normalizeCourses({
      courses: [{ classId: "c1", className: "A" }, { classId: "c2", className: "B" }],
    });
    expect(courses[0].key).not.toBe(courses[1].key);
    expect(courses[0].key).toBeTruthy();
  });

  it("clamps money and defaults methods the same way the single-class normaliser did", () => {
    const [course] = normalizeCourses({
      courses: [{ classId: "c1", className: "A", fees: { kitFeeInPaise: -50, monthlyFeeInPaise: "1200" } }],
    });
    expect(course.fees.kitFeeInPaise).toBe(0);
    expect(course.fees.monthlyFeeInPaise).toBe(1200);
    expect(course.methods.qr).toBe(true);
    expect(course.methods.counter).toBe(true);
    expect(course.methods.razorpay).toBe(false);
  });
});

describe("activeCourses", () => {
  it("drops courses marked dropped", () => {
    const courses = [
      { status: "active", classId: "c1" },
      { status: "dropped", classId: "c2" },
    ] as StudentCourse[];
    expect(activeCourses(courses).map((c) => c.classId)).toEqual(["c1"]);
  });
});

const courseFixture = (over: Partial<StudentCourse> = {}): StudentCourse => ({
  key: "k",
  classId: "c1",
  className: "Vocal",
  inventory: { uniform: false, kit: false, books: false },
  fees: {
    studentType: "new", track: "monthly", kitFeeInPaise: 0, booksFeeInPaise: 0,
    uniformFeeInPaise: 0, monthlyFeeInPaise: 0, termFeeInPaise: 0,
    discountInPaise: 0, firstMonthFree: false,
  },
  methods: { razorpay: false, qr: true, counter: true, emi: false },
  status: "active",
  ...over,
});

describe("mirrorPrimaryCourse", () => {
  it("mirrors the first course into the legacy flat fields", () => {
    const flat = mirrorPrimaryCourse([
      courseFixture({
        key: "a", classId: "c1", className: "Vocal", slotId: "s1", slotLabel: "Mon 6PM",
        trainerName: "Guru A", joiningDate: "2026-07-01", nextChargeDate: "2026-08-05",
        inventory: { kit: true, books: false, uniform: false },
        fees: { ...courseFixture().fees, kitFeeInPaise: 1000, monthlyFeeInPaise: 5000 },
        enrollmentId: "e1",
      }),
      courseFixture({ key: "b", classId: "c2", className: "Veena", enrollmentId: "e2" }),
    ]);
    expect(flat.classId).toBe("c1");
    expect(flat.className).toBe("Vocal");
    expect(flat.slotLabel).toBe("Mon 6PM");
    expect(flat.enrollmentId).toBe("e1");
    expect(flat.enrollmentIds).toEqual(["e1", "e2"]);
    expect(flat.fees.monthlyFeeInPaise).toBe(5000);
  });

  it("never writes undefined into Firestore fields", () => {
    const flat = mirrorPrimaryCourse([courseFixture()]);
    expect(Object.values(flat)).not.toContain(undefined);
    expect(flat.slotId).toBe("");
    expect(flat.enrollmentId).toBe("");
    expect(flat.enrollmentIds).toEqual([]);
  });

  it("is safe on an empty course list", () => {
    const flat = mirrorPrimaryCourse([]);
    expect(flat.classId).toBe("");
    expect(flat.enrollmentIds).toEqual([]);
  });
});
