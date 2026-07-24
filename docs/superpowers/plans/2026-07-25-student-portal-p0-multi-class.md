# Student Portal P0 — Multi-Class Enrollment + Fee Transparency — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one student hold several classes under one profile/login/roll number, each with its own enrollment and fee ledger, and show a fully itemised (kit / books / uniform / course / pre-payment / discount) breakdown to both admin and parent on every price.

**Architecture:** `students/{id}` gains a `courses: StudentCourse[]` array. `normalizeStudent` synthesises a single-entry array from today's flat fields, and every write mirrors `courses[0]` back to them — so nothing that reads `student.classId` breaks and no backfill migration is needed. Approval loops the array, creating one `EnrollmentDoc` + one admission fee doc per course, with idempotency moved from the student to the course (which is also how a class gets added later). A new pure `feeBreakdown.ts` produces per-class sections plus a grand total, rendered identically in the admin form, the public pay link, and the fee ledger.

**Tech Stack:** Vite + React 18 + TypeScript, Firebase (Firestore/Auth), Vercel serverless (`api/`), Vitest, Tailwind.

## Global Constraints

- Money is **paise (integer)** everywhere. Format with `formatPaiseAsRupees`. Parse with `parsePriceToPaise`.
- Fee math is duplicated client (`src/lib`) + server (`api/_lib`, `api/_razorpay`) — **every change must be made in both**.
- Firestore **rejects `undefined`**. Write `""`, `null`, or omit the key.
- Never use `window.confirm`/`window.prompt` — use `confirmDialog()` / `promptDialog()` from `@/components/ConfirmDialogHost`.
- Every new admin mutation calls `useAdminLog()`.
- Server API files import with **`.js` extensions** (`../_lib/http.js`) — required by the API `tsconfig`.
- The repo is at Vercel's **12-function limit**. Do **not** add files under `api/`; route new server actions through `api/razorpay.ts`.
- Mobile: `min-w-0` on grid/flex children; `overflow-x-clip`, never `overflow-x-hidden`; scroll containers need `min-h-0` + `shrink-0` header.
- Test runner: `npx vitest run <path>`. Full suite: `npm test`. Build: `npm run build`. Lint: `npm run lint`.
- Existing test count baseline: **110 passing**. No task may reduce it.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/students/types.ts` (modify) | `StudentCourse`, `StudentCourseStatus`, `StudentDoc.courses`, `normalizeCourses` |
| `src/lib/students/feeBreakdown.ts` (create) | Pure per-course + per-student breakdown math |
| `src/lib/students/feeBreakdown.test.ts` (create) | Its tests |
| `src/lib/students/students.ts` (modify) | Read/write `courses`, mirror `courses[0]`, sync link `sections` |
| `src/pages/OnboardingPay.tsx` (modify) | Render per-class sections |
| `api/_razorpay/approve-onboarding.ts` (modify) | Loop courses → N enrollments |
| `api/_razorpay/delete-student.ts` (modify) | Sweep all enrollments |
| `api/_lib/fee-store.ts` (modify) | `breakdown[]` on every fee seed |
| `src/lib/classes/fees.ts` (modify) | Client mirror of the same |
| `src/components/admin/StudentFeeSummary.tsx` (create) | Breakdown render, shared |
| `src/components/admin/StudentCourseEditor.tsx` (create) | One course row |
| `src/components/admin/StudentForm.tsx` (create) | Whole add/edit form |
| `src/pages/admin/AdminStudents.tsx` (modify) | List/actions only; form extracted |
| `src/pages/account/Classes.tsx` (modify) | Render `breakdown[]` on every fee |
| `firestore.rules` | **Unchanged in P0** — no new collections |

---

## Task 1: `StudentCourse` type + normalization

**Files:**
- Modify: `src/lib/students/types.ts`
- Test: `src/lib/students/students.test.ts` (append)

**Interfaces:**
- Consumes: existing `StudentFeeSetup`, `StudentPaymentMethods`, `StudentInventory` from `types.ts`
- Produces: `StudentCourse`, `StudentCourseStatus`, `normalizeCourses(data)`, `StudentDoc.courses`, `StudentDoc.enrollmentIds`, `StudentDoc.accessOverrideUntil`, `activeCourses(courses)`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/students/students.test.ts`:

```ts
import { normalizeCourses, activeCourses, type StudentCourse } from "./types";

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
    expect(course.methods.qr).toBe(true);      // defaults true
    expect(course.methods.counter).toBe(true); // defaults true
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/students/students.test.ts`
Expected: FAIL — `normalizeCourses is not a function` / no export `activeCourses`.

- [ ] **Step 3: Implement in `src/lib/students/types.ts`**

Add after the `StudentFeeSetup` interface:

```ts
export type StudentCourseStatus = "active" | "dropped";

/**
 * ONE class a student takes. A student may hold several (req: "one student can
 * take multiple classes"). Each course materialises its own EnrollmentDoc and
 * its own fee ledger at approval, so the existing fee engine is untouched.
 */
export interface StudentCourse {
  key: string;                 // stable local id; survives reorder/removal
  classId: string;
  className: string;
  slotId?: string;
  slotLabel?: string;
  trainerName?: string;
  joiningDate?: string;        // YYYY-MM-DD
  nextChargeDate?: string;     // YYYY-MM-DD
  inventory: StudentInventory;
  fees: StudentFeeSetup;
  methods: StudentPaymentMethods;
  enrollmentId?: string;       // set once this course is approved
  status: StudentCourseStatus;
}
```

Add to `StudentDoc` (keep every existing field):

```ts
  // Every class this student takes. Legacy docs have only the flat fields
  // above; `normalizeCourses` synthesises a single entry from them, and writes
  // mirror courses[0] back, so no backfill migration is needed.
  courses: StudentCourse[];
  enrollmentIds: string[];
  // Admin override: force portal access unlocked through this date (YYYY-MM-DD)
  // even when a fee is overdue. Used in a later phase; stored from P0 on.
  accessOverrideUntil?: string;
```

Add the normaliser near the other pure helpers at the bottom of the file:

```ts
const courseNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const coursePaise = (value: unknown): number => Math.max(0, Math.round(courseNumber(value)));
const courseString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);

const normalizeCourseEmiSplit = (raw: unknown): EmiSplitConfig | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const data = raw as Record<string, unknown>;
  const upfront = Math.round(courseNumber(data.upfrontPercentage, 50));
  const parts = Array.isArray(data.installmentPercentages)
    ? data.installmentPercentages.map((v) => Math.round(courseNumber(v))).filter((v) => v > 0)
    : [];
  if (upfront <= 0 || parts.length === 0) return undefined;
  return { upfrontPercentage: Math.min(100, Math.max(1, upfront)), installmentPercentages: parts };
};

/** Normalize ONE stored course row. `fallbackKey` is used when none is stored. */
const normalizeCourse = (raw: Record<string, unknown>, fallbackKey: string): StudentCourse => {
  const fees = (raw.fees || {}) as Record<string, unknown>;
  const inventory = (raw.inventory || {}) as Record<string, unknown>;
  const methods = (raw.methods || {}) as Record<string, unknown>;
  const track: StudentTrack = fees.track === "term" ? "term" : "monthly";
  return {
    key: courseString(raw.key) || fallbackKey,
    classId: courseString(raw.classId),
    className: courseString(raw.className),
    slotId: courseString(raw.slotId) || undefined,
    slotLabel: courseString(raw.slotLabel) || undefined,
    trainerName: courseString(raw.trainerName) || undefined,
    joiningDate: courseString(raw.joiningDate) || undefined,
    nextChargeDate: courseString(raw.nextChargeDate) || undefined,
    inventory: {
      uniform: inventory.uniform === true,
      kit: inventory.kit === true,
      books: inventory.books === true,
    },
    fees: {
      studentType: fees.studentType === "existing" ? "existing" : "new",
      track,
      kitFeeInPaise: coursePaise(fees.kitFeeInPaise),
      booksFeeInPaise: coursePaise(fees.booksFeeInPaise),
      uniformFeeInPaise: coursePaise(fees.uniformFeeInPaise),
      monthlyFeeInPaise: coursePaise(fees.monthlyFeeInPaise),
      termFeeInPaise: coursePaise(fees.termFeeInPaise),
      discountInPaise: coursePaise(fees.discountInPaise),
      firstMonthFree: fees.firstMonthFree === true && track === "monthly",
      emiSplit: normalizeCourseEmiSplit(fees.emiSplit),
    },
    methods: {
      razorpay: methods.razorpay === true,
      qr: methods.qr !== false,
      counter: methods.counter !== false,
      emi: methods.emi === true && track === "term",
    },
    enrollmentId: courseString(raw.enrollmentId) || undefined,
    status: raw.status === "dropped" ? "dropped" : "active",
  };
};

/**
 * The student's courses. Prefers a stored `courses` array; falls back to
 * synthesising ONE course from the legacy flat fields (classId/fees/methods/…)
 * so pre-multi-class documents keep working with no migration. Returns [] when
 * there is no class at all (a half-filled draft).
 */
export const normalizeCourses = (data: Record<string, unknown> = {}): StudentCourse[] => {
  const stored = Array.isArray(data.courses) ? (data.courses as Record<string, unknown>[]) : [];
  if (stored.length > 0) {
    return stored.map((raw, index) => normalizeCourse(raw, `course-${index + 1}`));
  }
  if (!courseString(data.classId)) return [];
  return [normalizeCourse(
    {
      key: "legacy",
      classId: data.classId,
      className: data.className,
      slotId: data.slotId,
      slotLabel: data.slotLabel,
      trainerName: data.trainerName,
      joiningDate: data.joiningDate,
      nextChargeDate: data.nextChargeDate,
      inventory: data.inventory,
      fees: data.fees,
      methods: data.methods,
      enrollmentId: data.enrollmentId,
      status: "active",
    },
    "legacy",
  )];
};

/** Courses that still count — dropped ones keep their history but stop billing. */
export const activeCourses = (courses: StudentCourse[]): StudentCourse[] =>
  (courses || []).filter((course) => course.status !== "dropped");

/** A fresh unique key for a newly added course row in the admin form. */
export const newCourseKey = (): string =>
  `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/students/students.test.ts`
Expected: PASS, all existing tests in the file still green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/students/types.ts src/lib/students/students.test.ts
git commit -m "feat(students): StudentCourse type + legacy-compatible course normalization"
```

---

## Task 2: `feeBreakdown.ts` — per-course and per-student breakdown

**Files:**
- Create: `src/lib/students/feeBreakdown.ts`
- Create: `src/lib/students/feeBreakdown.test.ts`
- Modify: `src/lib/students/types.ts` (re-express `buildFeeBreakdown`)
- Modify: `src/lib/students/index.ts` (export the new module)

**Interfaces:**
- Consumes: `StudentCourse`, `StudentFeeSetup`, `FeeBreakdownRow`, `activeCourses` (Task 1)
- Produces:
  - `buildCourseBreakdown(course: StudentCourse): CourseBreakdown`
  - `buildStudentBreakdown(courses: StudentCourse[]): StudentBreakdown`
  - types `CourseBreakdown`, `StudentBreakdown`

- [ ] **Step 1: Write the failing test**

Create `src/lib/students/feeBreakdown.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildCourseBreakdown, buildStudentBreakdown } from "./feeBreakdown";
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
      fees: { ...course().fees, kitFeeInPaise: 150000, booksFeeInPaise: 80000, uniformFeeInPaise: 120000, monthlyFeeInPaise: 100000 },
    }));
    expect(result.rows.map((r) => r.label)).toEqual([
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
    expect(result.rows.map((r) => r.label)).toEqual(["Kit fee"]);
    expect(result.totalInPaise).toBe(150000);
  });

  it("charges the term course fee for existing students too", () => {
    const result = buildCourseBreakdown(course({
      fees: { ...course().fees, studentType: "existing", track: "term", termFeeInPaise: 800000 },
    }));
    expect(result.rows.map((r) => r.label)).toEqual(["Course fee (full term)"]);
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
    expect(result.emiInstallments!.reduce((s, r) => s + r.amountInPaise, 0)).toBe(900000);
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
    expect(result.sections.map((s) => s.className)).toEqual(["Vocal", "Veena"]);
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/students/feeBreakdown.test.ts`
Expected: FAIL — `Failed to resolve import "./feeBreakdown"`.

- [ ] **Step 3: Create `src/lib/students/feeBreakdown.ts`**

```ts
// TYPE-ONLY import: `types.ts` imports buildCourseRows/buildEmiRows back from
// this file (Step 4), so importing any RUNTIME value from types.ts here would
// create a real module cycle. Type imports erase at compile time — safe.
import type { FeeBreakdownRow, StudentCourse, StudentFeeSetup } from "./types";

// ---------------------------------------------------------------------------
// Transparent pricing (req): every charge a parent pays is itemised — kit fee,
// books fee, uniform fee, course/pre-payment and any discount — per CLASS, then
// summed into one grand total. The same numbers are shown to the admin (student
// form), to the parent (payment link + portal), and stored on the fee ledger.
//
// PURE + unit-tested. Mirrored server-side in
// api/_razorpay/approve-onboarding.ts (buildOnboardingBreakdown) — keep in sync.
// ---------------------------------------------------------------------------

export interface CourseBreakdown {
  key: string;
  classId: string;
  className: string;
  slotLabel?: string;
  rows: FeeBreakdownRow[];
  subtotalInPaise: number;
  discountInPaise: number;
  totalInPaise: number;
  /** What must be paid NOW: the whole total, or installment 1 on an EMI course. */
  dueNowInPaise: number;
  emiInstallments?: FeeBreakdownRow[];
  /** What recurs after admission (monthly track only) — shown as "then ₹X/month". */
  recurring?: { label: string; amountInPaise: number };
}

export interface StudentBreakdown {
  sections: CourseBreakdown[];
  grandTotalInPaise: number;
  dueNowInPaise: number;
}

const clampPaise = (value: number): number => Math.max(0, Math.round(Number(value) || 0));

const ordinal = (n: number): string => {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
};

/** The itemised rows for one course's admission payment. */
export const buildCourseRows = (fees: StudentFeeSetup): {
  rows: FeeBreakdownRow[];
  subtotalInPaise: number;
  discountInPaise: number;
  totalInPaise: number;
} => {
  const rows: FeeBreakdownRow[] = [];
  if (clampPaise(fees.kitFeeInPaise) > 0) rows.push({ label: "Kit fee", amountInPaise: clampPaise(fees.kitFeeInPaise) });
  if (clampPaise(fees.booksFeeInPaise) > 0) rows.push({ label: "Books fee", amountInPaise: clampPaise(fees.booksFeeInPaise) });
  if (clampPaise(fees.uniformFeeInPaise) > 0) rows.push({ label: "Uniform fee", amountInPaise: clampPaise(fees.uniformFeeInPaise) });

  // A TERM course is a one-time full payment — charged for BOTH new and existing
  // students. Only the MONTHLY pre-payment (the first advance) is skipped for
  // existing students, who bill in arrears from their first collectable month.
  if (fees.track === "term" && clampPaise(fees.termFeeInPaise) > 0) {
    rows.push({ label: "Course fee (full term)", amountInPaise: clampPaise(fees.termFeeInPaise) });
  }
  if (fees.studentType === "new" && fees.track === "monthly" && clampPaise(fees.monthlyFeeInPaise) > 0) {
    rows.push({ label: "Pre-payment (first fee)", amountInPaise: clampPaise(fees.monthlyFeeInPaise) });
  }

  const subtotalInPaise = rows.reduce((sum, row) => sum + row.amountInPaise, 0);
  const discountInPaise = Math.min(clampPaise(fees.discountInPaise), subtotalInPaise);
  if (discountInPaise > 0) rows.push({ label: "Discount", amountInPaise: -discountInPaise });

  return { rows, subtotalInPaise, discountInPaise, totalInPaise: Math.max(0, subtotalInPaise - discountInPaise) };
};

/** The EMI installment rows for a total, or undefined when EMI isn't in force. */
export const buildEmiRows = (
  fees: StudentFeeSetup,
  methods: { emi: boolean },
  totalInPaise: number,
): FeeBreakdownRow[] | undefined => {
  if (methods.emi !== true || fees.track !== "term" || !fees.emiSplit || totalInPaise <= 0) return undefined;
  const { upfrontPercentage, installmentPercentages } = fees.emiSplit;
  if (upfrontPercentage <= 0 || installmentPercentages.length === 0) return undefined;

  const upfrontAmount = Math.round((totalInPaise * upfrontPercentage) / 100);
  const rows: FeeBreakdownRow[] = [{ label: `Pay now (${upfrontPercentage}%)`, amountInPaise: upfrontAmount }];
  // The LAST installment absorbs the rounding remainder so the parts always sum
  // to the total — never charge a rupee more or less than the agreed fee.
  let remaining = totalInPaise - upfrontAmount;
  installmentPercentages.forEach((pct, index) => {
    const isLast = index === installmentPercentages.length - 1;
    const amountInPaise = isLast ? remaining : Math.round((totalInPaise * pct) / 100);
    remaining -= amountInPaise;
    rows.push({ label: `${ordinal(index + 2)} installment (${pct}%)`, amountInPaise });
  });
  return rows.length > 1 ? rows : undefined;
};

/** One class's full transparent breakdown. */
export const buildCourseBreakdown = (course: StudentCourse): CourseBreakdown => {
  const { rows, subtotalInPaise, discountInPaise, totalInPaise } = buildCourseRows(course.fees);
  const emiInstallments = buildEmiRows(course.fees, course.methods, totalInPaise);
  return {
    key: course.key,
    classId: course.classId,
    className: course.className,
    slotLabel: course.slotLabel,
    rows,
    subtotalInPaise,
    discountInPaise,
    totalInPaise,
    dueNowInPaise: emiInstallments ? emiInstallments[0].amountInPaise : totalInPaise,
    ...(emiInstallments ? { emiInstallments } : {}),
    ...(course.fees.track === "monthly" && clampPaise(course.fees.monthlyFeeInPaise) > 0
      ? { recurring: { label: "Monthly class fee", amountInPaise: clampPaise(course.fees.monthlyFeeInPaise) } }
      : {}),
  };
};

/** Every class the student takes, sectioned, plus the one grand total. */
export const buildStudentBreakdown = (courses: StudentCourse[]): StudentBreakdown => {
  // Filter inline rather than importing activeCourses() — see the cycle note above.
  const sections = (courses || []).filter((course) => course.status !== "dropped").map(buildCourseBreakdown);
  return {
    sections,
    grandTotalInPaise: sections.reduce((sum, section) => sum + section.totalInPaise, 0),
    dueNowInPaise: sections.reduce((sum, section) => sum + section.dueNowInPaise, 0),
  };
};

/** Flattened rows across every class — for legacy consumers that expect one list. */
export const flattenBreakdownRows = (breakdown: StudentBreakdown): FeeBreakdownRow[] =>
  breakdown.sections.flatMap((section) =>
    breakdown.sections.length > 1
      ? section.rows.map((row) => ({ label: `${section.className} · ${row.label}`, amountInPaise: row.amountInPaise }))
      : section.rows,
  );
```

- [ ] **Step 4: Re-express the legacy helper in `src/lib/students/types.ts`**

Replace the body of `buildFeeBreakdown` (keep the exported name and signature — `AdminStudents.tsx` and `students.ts` both import it) so there is exactly ONE copy of the row rules. Delete the now-duplicate local `ordinal` from `types.ts`.

```ts
/**
 * Legacy single-course breakdown. Retained because existing callers and tests
 * use it; it now delegates to the shared per-course math in feeBreakdown.ts so
 * the rules live in exactly one place.
 */
export const buildFeeBreakdown = (
  fees: StudentFeeSetup,
): { rows: FeeBreakdownRow[]; totalInPaise: number; emiInstallments?: FeeBreakdownRow[] } => {
  const { rows, totalInPaise } = buildCourseRows(fees);
  // Legacy behaviour: emiInstallments were computed whenever a split existed,
  // regardless of the `emi` method flag. Preserved exactly.
  const emiInstallments = buildEmiRows(fees, { emi: true }, totalInPaise);
  return { rows, totalInPaise, ...(emiInstallments ? { emiInstallments } : {}) };
};
```

Add at the top of `types.ts`:

```ts
import { buildCourseRows, buildEmiRows } from "./feeBreakdown";
```

> **Verify no cycle:** after this step run `npx vitest run src/lib/students/`. A runtime cycle surfaces as `Cannot access 'buildCourseRows' before initialization`. If that appears, the type-only import rule above was violated — check that `feeBreakdown.ts` uses `import type { … }` and calls no runtime function from `types.ts`.

- [ ] **Step 5: Export from `src/lib/students/index.ts`**

```ts
export * from "./types";
export * from "./feeBreakdown";
export * from "./students";
export * from "./onboarding";
export * from "./enrollmentRequests";
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/students/`
Expected: PASS — new `feeBreakdown.test.ts` green **and** the existing `students.test.ts` `buildFeeBreakdown` tests still green.

- [ ] **Step 7: Typecheck + commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add src/lib/students/feeBreakdown.ts src/lib/students/feeBreakdown.test.ts src/lib/students/types.ts src/lib/students/index.ts
git commit -m "feat(students): per-class + per-student transparent fee breakdown"
```

---

## Task 3: `students.ts` reads/writes courses and syncs link sections

**Files:**
- Modify: `src/lib/students/students.ts`
- Modify: `src/lib/students/types.ts` (`OnboardingLinkDoc.sections`)
- Test: `src/lib/students/students.test.ts` (append)

**Interfaces:**
- Consumes: `normalizeCourses`, `StudentCourse` (Task 1); `buildStudentBreakdown`, `flattenBreakdownRows`, `CourseBreakdown` (Task 2)
- Produces: `StudentWriteInput.courses: StudentCourse[]`, `mirrorPrimaryCourse(courses)`, `OnboardingLinkDoc.sections`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/students/students.test.ts`:

> **Why `./types` and not `./students`:** `students.test.ts` currently imports only from `./types`, which is pure. `students.ts` imports `@/lib/firebase`, which initialises an app at module load and breaks under Vitest. `mirrorPrimaryCourse` is pure, so it **lives in `types.ts`** and `students.ts` imports it from there.

```ts
import { mirrorPrimaryCourse } from "./types";

describe("mirrorPrimaryCourse", () => {
  it("mirrors the first course into the legacy flat fields", () => {
    const flat = mirrorPrimaryCourse([
      {
        key: "a", classId: "c1", className: "Vocal", slotId: "s1", slotLabel: "Mon 6PM",
        trainerName: "Guru A", joiningDate: "2026-07-01", nextChargeDate: "2026-08-05",
        inventory: { kit: true, books: false, uniform: false },
        fees: {
          studentType: "new", track: "monthly", kitFeeInPaise: 1000, booksFeeInPaise: 0,
          uniformFeeInPaise: 0, monthlyFeeInPaise: 5000, termFeeInPaise: 0,
          discountInPaise: 0, firstMonthFree: false,
        },
        methods: { razorpay: false, qr: true, counter: true, emi: false },
        enrollmentId: "e1", status: "active",
      },
      {
        key: "b", classId: "c2", className: "Veena",
        inventory: { kit: false, books: false, uniform: false },
        fees: {
          studentType: "new", track: "monthly", kitFeeInPaise: 0, booksFeeInPaise: 0,
          uniformFeeInPaise: 0, monthlyFeeInPaise: 7000, termFeeInPaise: 0,
          discountInPaise: 0, firstMonthFree: false,
        },
        methods: { razorpay: false, qr: true, counter: true, emi: false },
        enrollmentId: "e2", status: "active",
      },
    ]);
    expect(flat.classId).toBe("c1");
    expect(flat.className).toBe("Vocal");
    expect(flat.slotLabel).toBe("Mon 6PM");
    expect(flat.enrollmentId).toBe("e1");
    expect(flat.enrollmentIds).toEqual(["e1", "e2"]);
    expect(flat.fees.monthlyFeeInPaise).toBe(5000);
  });

  it("never writes undefined into Firestore fields", () => {
    const flat = mirrorPrimaryCourse([
      {
        key: "a", classId: "c1", className: "Vocal",
        inventory: { kit: false, books: false, uniform: false },
        fees: {
          studentType: "new", track: "monthly", kitFeeInPaise: 0, booksFeeInPaise: 0,
          uniformFeeInPaise: 0, monthlyFeeInPaise: 0, termFeeInPaise: 0,
          discountInPaise: 0, firstMonthFree: false,
        },
        methods: { razorpay: false, qr: true, counter: true, emi: false },
        status: "active",
      },
    ]);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/students/students.test.ts`
Expected: FAIL — `mirrorPrimaryCourse` is not exported.

- [ ] **Step 3a: Implement `mirrorPrimaryCourse` in `src/lib/students/types.ts`** (pure — keeps it testable without Firebase)

```ts
const emptyFees = (): StudentFeeSetup => ({
  studentType: "new", track: "monthly", kitFeeInPaise: 0, booksFeeInPaise: 0,
  uniformFeeInPaise: 0, monthlyFeeInPaise: 0, termFeeInPaise: 0,
  discountInPaise: 0, firstMonthFree: false,
});

/**
 * Mirror courses[0] back into the LEGACY flat fields (classId/className/fees/…)
 * so every existing reader — StudentFeeCollections, the student list, search,
 * activity-log captions, setStudentActive — keeps working untouched while
 * consumers migrate to `courses`. Firestore rejects undefined, so blanks are "".
 */
export const mirrorPrimaryCourse = (courses: StudentCourse[]) => {
  const primary = courses[0];
  return {
    classId: primary?.classId || "",
    className: primary?.className || "",
    slotId: primary?.slotId || "",
    slotLabel: primary?.slotLabel || "",
    trainerName: primary?.trainerName || "",
    joiningDate: primary?.joiningDate || "",
    nextChargeDate: primary?.nextChargeDate || "",
    inventory: primary?.inventory || { uniform: false, kit: false, books: false },
    fees: { ...(primary?.fees || emptyFees()), emiSplit: primary?.fees.emiSplit || null },
    methods: primary?.methods || { razorpay: false, qr: true, counter: true, emi: false },
    enrollmentId: primary?.enrollmentId || "",
    enrollmentIds: courses.map((course) => course.enrollmentId || "").filter(Boolean),
  };
};
```

- [ ] **Step 3b: Wire it up in `src/lib/students/students.ts`**

Add to the imports at the top:

```ts
import { buildStudentBreakdown, flattenBreakdownRows, type CourseBreakdown } from "./feeBreakdown";
import { mirrorPrimaryCourse, normalizeCourses, type StudentCourse } from "./types";
```

In `normalizeStudent`, add to the returned object (keep every existing field):

```ts
    courses: normalizeCourses(data),
    enrollmentIds: Array.isArray(data.enrollmentIds)
      ? (data.enrollmentIds as unknown[]).map((v) => getString(v)).filter(Boolean)
      : [getString(data.enrollmentId)].filter(Boolean),
    accessOverrideUntil: getString(data.accessOverrideUntil) || undefined,
```

Change `StudentWriteInput` — **replace** the per-class fields (`classId`, `className`, `slotId`, `slotLabel`, `trainerName`, `joiningDate`, `nextChargeDate`, `inventory`, `fees`, `methods`) with:

```ts
export interface StudentWriteInput {
  name: string;
  age: number;
  gender: Gender;
  email: string;
  phone: string;
  parentName: string;
  parentRelation: ParentRelation;
  address: string;
  mode: StudentMode;
  photoUrl?: string;
  desiredStudentId?: string;
  /** Every class this student takes. At least one is required. */
  courses: StudentCourse[];
}
```

Rewrite `buildStudentPayload`:

```ts
const buildStudentPayload = (input: StudentWriteInput) => {
  const courses: StudentCourse[] = (input.courses || []).map((course, index) => ({
    ...course,
    key: course.key || `course-${index + 1}`,
    className: (course.className || "").trim(),
    fees: {
      ...course.fees,
      firstMonthFree: course.fees.firstMonthFree === true && course.fees.track === "monthly",
      emiSplit: course.fees.emiSplit || null,
    },
    methods: { ...course.methods, emi: course.methods.emi === true && course.fees.track === "term" },
    status: course.status === "dropped" ? "dropped" : "active",
  })) as StudentCourse[];

  return {
    name: input.name.trim(),
    age: Math.max(0, Math.round(toNumber(input.age))),
    gender: input.gender,
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
    parentName: input.parentName.trim(),
    parentRelation: input.parentRelation,
    address: input.address.trim(),
    mode: input.mode,
    photoUrl: (input.photoUrl || "").trim(),
    desiredStudentId: (input.desiredStudentId || "").trim().toUpperCase(),
    courses,
    ...mirrorPrimaryCourse(courses),
    updatedAt: serverTimestamp(),
  };
};
```

Rewrite `syncOnboardingLink` to publish per-class sections:

```ts
const syncOnboardingLink = async (student: StudentDoc): Promise<void> => {
  if (!student.linkToken) return;
  const breakdown = buildStudentBreakdown(student.courses);
  const primary = student.courses[0];
  // Free-month note names the class when there is more than one.
  const freeMonthNotes = student.courses
    .filter((course) => course.status !== "dropped" && course.fees.firstMonthFree && course.fees.track === "monthly")
    .map((course) => (student.courses.length > 1 ? `${course.className}: first month FREE` : "Offer: the first month's class fee is FREE — nothing extra to pay for it later."));

  await setDoc(
    doc(db, ONBOARDING_LINKS_COLLECTION, student.linkToken),
    {
      token: student.linkToken,
      studentDocId: student.id,
      studentName: student.name,
      parentName: student.parentName,
      // Legacy single-class display fields — first class, kept for old readers.
      className: primary?.className || "",
      slotLabel: primary?.slotLabel || "",
      trainerName: primary?.trainerName || "",
      // Multi-class: one section per class + the flattened legacy rows.
      sections: breakdown.sections as CourseBreakdown[],
      rows: flattenBreakdownRows(breakdown),
      totalInPaise: breakdown.grandTotalInPaise,
      dueNowInPaise: breakdown.dueNowInPaise,
      methods: mergeLinkMethods(student.courses),
      status: student.onboardingStatus,
      freeMonthNote: freeMonthNotes.join(" · "),
      emiSplit: primary?.fees.emiSplit || null,
      emiInstallments: breakdown.sections[0]?.emiInstallments || null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};
```

Add `mergeLinkMethods` above it — the parent sees a payment method if **any** class offers it, since they pay one combined total:

```ts
/**
 * The payment methods offered on the combined link. The parent pays ONE total,
 * so a method is offered when EVERY active course allows it (the strictest
 * class wins — otherwise a class that forbids online pay could be paid online).
 * EMI is offered only when a single course drives the link.
 */
const mergeLinkMethods = (courses: StudentCourse[]): StudentPaymentMethods => {
  const active = courses.filter((course) => course.status !== "dropped");
  if (active.length === 0) return { razorpay: false, qr: true, counter: true, emi: false };
  return {
    razorpay: active.every((course) => course.methods.razorpay),
    qr: active.every((course) => course.methods.qr),
    counter: active.every((course) => course.methods.counter),
    emi: active.length === 1 && active[0].methods.emi === true,
  };
};
```

Update `updateStudent`'s post-write syncs to loop courses instead of using the flat fields:

```ts
export const updateStudent = async (existing: StudentDoc, input: StudentWriteInput): Promise<void> => {
  const payload = buildStudentPayload(input);
  await updateDoc(doc(db, STUDENTS_COLLECTION, existing.id), payload);
  await syncOnboardingLink({
    ...existing,
    ...normalizeStudent(existing.id, payload),
    linkToken: existing.linkToken,
    onboardingStatus: existing.onboardingStatus,
  });

  const photoUrl = (input.photoUrl || "").trim();
  if (existing.userUid && photoUrl && photoUrl !== (existing.photoUrl || "")) {
    try {
      await updateDoc(doc(db, "users", existing.userUid), { photoURL: photoUrl, updatedAt: serverTimestamp() });
    } catch (error) {
      console.error("Could not sync the student photo to the portal account", error);
    }
  }

  // Per-course syncs: autopay invitation + next-charge due, matched by course key.
  for (const course of input.courses) {
    if (!course.enrollmentId || course.status === "dropped") continue;
    const before = existing.courses.find((item) => item.key === course.key);

    if (before && course.methods.razorpay !== before.methods.razorpay) {
      try {
        await updateDoc(doc(db, "enrollments", course.enrollmentId), {
          autopayInvited: course.methods.razorpay === true,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.error("Could not sync the autopay option to the enrollment", error);
      }
    }

    const nextChargeDate = (course.nextChargeDate || "").trim();
    if (
      existing.onboardingStatus === "approved"
      && course.fees.track === "monthly"
      && nextChargeDate
      && nextChargeDate !== (before?.nextChargeDate || "")
    ) {
      try {
        const enrollment = await getEnrollment(course.enrollmentId);
        if (enrollment) await applyNextChargeDue(enrollment, nextChargeDate);
      } catch (error) {
        console.error("Could not apply the next charge date", error);
      }
    }
  }
};
```

Update `setStudentActive` to pause/resume **every** enrollment:

```ts
export const setStudentActive = async (student: StudentDoc, active: boolean): Promise<void> => {
  await updateDoc(doc(db, STUDENTS_COLLECTION, student.id), { active, updatedAt: serverTimestamp() });
  for (const course of student.courses) {
    if (!course.enrollmentId) continue;
    // A dropped course stays paused even when the student is reactivated.
    const target = active && course.status !== "dropped" ? "active" : "paused";
    try {
      await setEnrollmentStatus(course.enrollmentId, target);
    } catch (error) {
      console.error("Could not sync enrollment status for student", student.id, course.classId, error);
    }
  }
};
```

- [ ] **Step 4: Add `sections` to `OnboardingLinkDoc` in `types.ts`**

```ts
  /** Per-class breakdown sections (multi-class). Older links have only `rows`. */
  sections?: import("./feeBreakdown").CourseBreakdown[];
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/lib/students/ && npx tsc --noEmit -p tsconfig.json`
Expected: tests PASS. `tsc` will report errors in `AdminStudents.tsx` (it still builds the old `StudentWriteInput`) — **that is expected and is fixed in Task 7.** No errors inside `src/lib/`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/students/students.ts src/lib/students/types.ts src/lib/students/students.test.ts
git commit -m "feat(students): course-array write path + per-class link sections"
```

---

## Task 4: Public pay link renders per-class sections

**Files:**
- Modify: `src/pages/OnboardingPay.tsx`

**Interfaces:**
- Consumes: `OnboardingLinkDoc.sections` (Task 3)
- Produces: nothing consumed downstream

- [ ] **Step 1: Locate the current rows block**

`src/pages/OnboardingPay.tsx:234` renders `{link.rows.map((row, i) => (…))}`. Read the surrounding block (roughly lines 225–260) before editing.

- [ ] **Step 2: Replace with a sectioned render**

Replace the single `link.rows.map(...)` block with:

```tsx
{/* Per-class breakdown (req: transparent pricing). Older links have no
    `sections` — fall back to the flat rows so they still render. */}
{(link.sections?.length ? link.sections : null) ? (
  <div className="space-y-3">
    {link.sections!.map((section) => (
      <div key={section.key} className="rounded-lg border border-border/60 bg-background/60 p-3">
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-2">
          <p className="font-body text-sm font-semibold text-foreground">{section.className}</p>
          {section.slotLabel && <p className="font-body text-xs text-muted-foreground">{section.slotLabel}</p>}
        </div>
        {section.rows.map((row, i) => (
          <div key={i} className="flex justify-between gap-2 font-body text-xs">
            <span className="min-w-0 text-muted-foreground">{row.label}</span>
            <span className={row.amountInPaise < 0 ? "shrink-0 text-green-700" : "shrink-0 text-foreground"}>
              {row.amountInPaise < 0 ? "−" : ""}{formatPaiseAsRupees(Math.abs(row.amountInPaise))}
            </span>
          </div>
        ))}
        <div className="mt-1.5 flex justify-between border-t border-border/60 pt-1.5 font-body text-xs font-semibold text-foreground">
          <span>{section.className} total</span>
          <span>{formatPaiseAsRupees(section.totalInPaise)}</span>
        </div>
        {section.recurring && (
          <p className="mt-1 font-body text-[0.7rem] text-muted-foreground">
            Then {formatPaiseAsRupees(section.recurring.amountInPaise)} / month
          </p>
        )}
        {section.emiInstallments && (
          <div className="mt-2 border-t border-border/60 pt-1.5">
            <p className="font-body text-[0.7rem] font-semibold uppercase tracking-wide text-gold">EMI schedule</p>
            {section.emiInstallments.map((row, i) => (
              <div key={i} className="flex justify-between gap-2 font-body text-xs">
                <span className={i === 0 ? "font-semibold text-foreground" : "text-muted-foreground"}>{row.label}</span>
                <span className="shrink-0 text-foreground">{formatPaiseAsRupees(row.amountInPaise)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    ))}
  </div>
) : (
  <div className="space-y-0.5">
    {link.rows.map((row, i) => (
      <div key={i} className="flex justify-between gap-2 font-body text-xs">
        <span className="min-w-0 text-muted-foreground">{row.label}</span>
        <span className={row.amountInPaise < 0 ? "shrink-0 text-green-700" : "shrink-0 text-foreground"}>
          {row.amountInPaise < 0 ? "−" : ""}{formatPaiseAsRupees(Math.abs(row.amountInPaise))}
        </span>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 3: Verify the grand-total line already reads `totalInPaise`/`dueNowInPaise`**

`OnboardingPay.tsx:55` (`const total = link?.totalInPaise || 0;`) and `:58` (`const dueNow = link?.dueNowInPaise ?? total;`) already carry the combined values written in Task 3. No change needed. When `sections.length > 1`, add a label so the parent understands the total spans classes — change the total row's label to:

```tsx
{(link.sections?.length || 0) > 1 ? `Total for ${link.sections!.length} classes` : "Total"}
```

- [ ] **Step 4: Build + browser smoke**

```bash
npm run build
npm run dev
```
Open `http://localhost:5173/pay/<token>` for an existing link (public route — no login). Expected: existing single-class links still render exactly as before (fallback path). Check at 375px width that no horizontal scroll appears (`main.scrollWidth` equals the viewport).

- [ ] **Step 5: Commit**

```bash
git add src/pages/OnboardingPay.tsx
git commit -m "feat(onboarding): pay link shows a per-class fee breakdown"
```

---

## Task 5: Approval creates one enrollment per course

**Files:**
- Modify: `api/_razorpay/approve-onboarding.ts`

**Interfaces:**
- Consumes: `students/{id}.courses` (Task 3)
- Produces: response `{ studentId, uid, enrollmentId, enrollmentIds: string[], credentials, warnings }`

- [ ] **Step 1: Add the server-side course normaliser**

Add below `buildOnboardingBreakdown` in `api/_razorpay/approve-onboarding.ts`:

```ts
interface ServerCourse {
  key: string;
  classId: string;
  className: string;
  slotId: string;
  slotLabel: string;
  trainerName: string;
  joiningDate: string;
  nextChargeDate: string;
  fees: Record<string, unknown>;
  methods: Record<string, unknown>;
  enrollmentId: string;
  status: string;
}

/**
 * Server mirror of src/lib/students/types.ts normalizeCourses. Prefers the
 * stored `courses` array; falls back to ONE course synthesised from the legacy
 * flat fields so pre-multi-class students still approve.
 */
const readCourses = (student: Record<string, unknown>): ServerCourse[] => {
  const toCourse = (raw: Record<string, unknown>, index: number): ServerCourse => ({
    key: getString(raw.key) || `course-${index + 1}`,
    classId: getString(raw.classId),
    className: getString(raw.className),
    slotId: getString(raw.slotId),
    slotLabel: getString(raw.slotLabel),
    trainerName: getString(raw.trainerName),
    joiningDate: getString(raw.joiningDate),
    nextChargeDate: getString(raw.nextChargeDate),
    fees: (raw.fees || {}) as Record<string, unknown>,
    methods: (raw.methods || {}) as Record<string, unknown>,
    enrollmentId: getString(raw.enrollmentId),
    status: getString(raw.status, "active"),
  });

  const stored = Array.isArray(student.courses) ? (student.courses as Record<string, unknown>[]) : [];
  if (stored.length > 0) return stored.map(toCourse);
  if (!getString(student.classId)) return [];
  return [toCourse({
    key: "legacy",
    classId: student.classId,
    className: student.className,
    slotId: student.slotId,
    slotLabel: student.slotLabel,
    trainerName: student.trainerName,
    joiningDate: student.joiningDate,
    nextChargeDate: student.nextChargeDate,
    fees: student.fees,
    methods: student.methods,
    enrollmentId: student.enrollmentId,
    status: "active",
  }, 0)];
};
```

- [ ] **Step 2: Replace the single-class idempotency guard**

The current guard at line ~205 returns early when `studentId && userUid && enrollmentId` are all set. Replace it so it only short-circuits when there is **nothing new to do**:

```ts
    const courses = readCourses(student);
    const pendingCourses = courses.filter((course) => !course.enrollmentId && course.status !== "dropped");
    const alreadyIssued = Boolean(getString(student.studentId) && getString(student.userUid));

    if (courses.length === 0) {
      sendError(response, 400, "The student has no class selected — edit the profile first.");
      return;
    }

    // Idempotency lives on the COURSE, not the student: re-approving an already
    // approved student with a newly added class materialises only that class.
    if (alreadyIssued && pendingCourses.length === 0) {
      sendJson(response, 200, {
        ok: true,
        alreadyApproved: true,
        studentId: getString(student.studentId),
        uid: getString(student.userUid),
        enrollmentId: getString(student.enrollmentId),
        enrollmentIds: courses.map((course) => course.enrollmentId).filter(Boolean),
        credentials: { email, password: getString(student.studentId), studentId: getString(student.studentId) },
      });
      return;
    }
```

Delete the old `const classId = getString(student.classId)` guard and the single `classSnap` load that follows it — both move into the per-course loop.

- [ ] **Step 3: Reuse the existing roll number and login when already issued**

Wrap the roll-number block (steps 1–2 of the handler) so it is skipped for an already-approved student:

```ts
    let studentId = getString(student.studentId);
    let uid = getString(student.userUid);
    let createdUser = false;

    if (!alreadyIssued) {
      // …existing roll-number resolution + Auth user creation + users/{uid} write,
      // unchanged, assigning studentId / uid / createdUser…
    }
    const password = studentId;
```

- [ ] **Step 4: Loop the pending courses**

Replace everything from `// 3. The real enrollment` through the end of section 5b with a loop. Each course is independently try/caught so one bad class cannot lose the others:

```ts
    const warnings: string[] = [];
    const createdEnrollmentIds: string[] = [];
    const courseUpdates = [...courses];

    for (const course of pendingCourses) {
      try {
        if (!course.classId) {
          warnings.push(`Skipped a class with no class selected.`);
          continue;
        }
        const classSnap = await db.collection(CLASSES).doc(course.classId).get();
        if (!classSnap.exists) {
          warnings.push(`Skipped "${course.className || course.classId}" — that class no longer exists.`);
          continue;
        }
        const classData = classSnap.data() || {};
        const billingDay = clampBillingDay(toNumber(classData.billingDayOfMonth, 5));

        const fees = course.fees;
        const track = getString(fees.track, "monthly");
        const isTerm = track === "term";
        const courseStudentType = getString(fees.studentType, "new") === "existing" ? "existing" : "new";
        const methods = course.methods;

        const joiningDate = /^\d{4}-\d{2}-\d{2}$/.test(course.joiningDate)
          ? course.joiningDate
          : new Date().toISOString().slice(0, 10);
        const joinMonthKey = joiningDate.slice(0, 7);
        const adminNextChargeDate = /^\d{4}-\d{2}-\d{2}$/.test(course.nextChargeDate) ? course.nextChargeDate : "";
        const monthlyFeeInPaise = clampPaise(fees.monthlyFeeInPaise);
        const termFeeInPaise = clampPaise(fees.termFeeInPaise);
        const paymentPlan = isTerm ? (methods.emi === true ? "emi" : "full") : "manual";

        const { rows: breakdownRows, totalInPaise } = buildOnboardingBreakdown(fees);
        const emiSchedule = isTerm && methods.emi === true
          ? buildEmiSchedule(fees, totalInPaise, joinMonthKey, billingDay)
          : [];
        const isEmi = emiSchedule.length > 1;

        const enrollmentDoc: Record<string, unknown> = {
          student: {
            name: studentName,
            age: Math.max(0, Math.round(toNumber(student.age))),
            gender: ["male", "female", "other"].includes(getString(student.gender)) ? getString(student.gender) : "other",
          },
          parent: {
            name: getString(student.parentName) || studentName,
            phone: getString(student.phone),
            whatsappNumber: getString(student.phone),
            address: getString(student.address),
          },
          parentUserId: uid,
          classId: course.classId,
          className: course.className || getString(classData.name),
          monthlyFeeInPaise: isTerm ? 0 : monthlyFeeInPaise,
          billingDayOfMonth: billingDay,
          startMonthKey: joinMonthKey,
          joiningDate,
          trainerName: course.trainerName || getString(classData.facultyName),
          status: "active",
          autopay: { enabled: false },
          paymentPlan,
          feeType: isTerm ? "term" : "monthly",
          studentStatus: courseStudentType,
          ...(methods.razorpay === true && !isTerm ? { autopayInvited: true } : {}),
          ...(course.slotId ? { slotId: course.slotId, slotLabel: course.slotLabel } : {}),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (isTerm) {
          enrollmentDoc.termFeeInPaise = termFeeInPaise;
          if (getString(classData.startDate)) enrollmentDoc.termStartDate = getString(classData.startDate);
          if (getString(classData.endDate)) enrollmentDoc.termEndDate = getString(classData.endDate);
          if (isEmi) {
            enrollmentDoc.installmentPlan = {
              status: "active",
              totalInPaise,
              initialPaymentInPaise: emiSchedule[0].amountInPaise,
              remainingInPaise: totalInPaise - emiSchedule[0].amountInPaise,
              reminderDayOfMonth: billingDay,
              installments: emiSchedule.map((installment) => ({
                installmentNumber: installment.installmentNumber,
                label: installment.label,
                percentage: installment.percentage,
                amountInPaise: installment.amountInPaise,
                dueDate: installment.dueDate,
                status: installment.installmentNumber === 1 ? "paid" : "pending",
              })),
            };
            enrollmentDoc.nextChargeDate = adminNextChargeDate || emiSchedule[1].dueDate;
          }
        } else {
          const firstDueMonth = courseStudentType === "new" ? addMonths(joinMonthKey, 1) : joinMonthKey;
          enrollmentDoc.nextChargeDate = adminNextChargeDate || dueDateFor(firstDueMonth, billingDay);
        }

        const enrollmentRef = await db.collection(ENROLLMENTS_COLLECTION).add(enrollmentDoc);
        const enrollmentId = enrollmentRef.id;
        await countSlotSeatOnce(db, enrollmentId);
        createdEnrollmentIds.push(enrollmentId);

        const index = courseUpdates.findIndex((item) => item.key === course.key);
        if (index >= 0) courseUpdates[index] = { ...courseUpdates[index], enrollmentId };

        const enrollmentRecord: EnrollmentRecord = { id: enrollmentId, ...(enrollmentDoc as Omit<EnrollmentRecord, "id">) };

        const paidVia = getString(student.paidVia);
        const paymentMethod = body.paymentMethod
          || (paidVia === "qr" ? "upi" : paidVia === "counter" ? "cash" : paidVia === "razorpay" ? "manual" : "cash");
        const paymentProofFields = {
          ...(getString(student.proofUrl) ? { upiProofUrl: getString(student.proofUrl) } : {}),
          ...(getString(student.upiRef) ? { upiRef: getString(student.upiRef) } : {}),
          ...(getString(student.razorpayPaymentId) ? { razorpayPaymentId: getString(student.razorpayPaymentId) } : {}),
        };

        if (isEmi) {
          for (const installment of emiSchedule) {
            const isFirst = installment.installmentNumber === 1;
            const { id: feeId } = await ensureCustomFeePayment(db, enrollmentRecord, {
              suffix: `emi-${installment.installmentNumber}`,
              amountInPaise: installment.amountInPaise,
              periodLabel: installment.label,
              dueDate: installment.dueDate,
            });
            await db.collection(FEE_PAYMENTS_COLLECTION).doc(feeId).set({
              emiInstallmentNumber: installment.installmentNumber,
              ...(isFirst
                ? {
                    status: "paid",
                    paymentMethod,
                    breakdown: breakdownRows,
                    ...paymentProofFields,
                    approvedBy: decoded.uid,
                    approvedAt: FieldValue.serverTimestamp(),
                    paidAt: FieldValue.serverTimestamp(),
                  }
                : { status: "pending" }),
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
          }
        } else if (totalInPaise > 0) {
          const isPrepaymentStyle = !isTerm && courseStudentType === "new";
          const { id: feeId } = await ensureCustomFeePayment(db, enrollmentRecord, {
            suffix: "onboarding",
            amountInPaise: totalInPaise,
            periodLabel: isPrepaymentStyle
              ? "Admission · Pre-payment & items"
              : isTerm ? "Admission · Full course fee & items" : "Admission payment",
            dueDate: new Date().toISOString().slice(0, 10),
          });
          await db.collection(FEE_PAYMENTS_COLLECTION).doc(feeId).set({
            status: "paid",
            paymentMethod,
            breakdown: breakdownRows,
            ...(isPrepaymentStyle ? { prepayment: true } : {}),
            ...paymentProofFields,
            approvedBy: decoded.uid,
            approvedAt: FieldValue.serverTimestamp(),
            paidAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }

        if (!isTerm && fees.firstMonthFree === true) {
          try {
            const freeMonthKey = courseStudentType === "new" ? addMonths(joinMonthKey, 1) : joinMonthKey;
            const freeFeeRef = db.collection(FEE_PAYMENTS_COLLECTION).doc(buildFeePaymentId(enrollmentId, freeMonthKey));
            if (!(await freeFeeRef.get()).exists) {
              await freeFeeRef.set({
                ...buildFeePaymentSeed(enrollmentRecord, freeMonthKey),
                status: "waived",
                adminNote: "First month free (onboarding offer)",
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
              }, { merge: true });
            }
          } catch (waiveError) {
            console.error("Onboarding: free-month waiver failed", waiveError);
            warnings.push(`Could not pre-waive the free month for ${course.className} — waive it manually in Fee Collections.`);
          }
        }

        if (!isTerm && adminNextChargeDate) {
          try {
            const dueMonthKey = adminNextChargeDate.slice(0, 7);
            const dueRef = db.collection(FEE_PAYMENTS_COLLECTION).doc(buildFeePaymentId(enrollmentId, dueMonthKey));
            if (!(await dueRef.get()).exists) {
              await dueRef.set({
                ...buildFeePaymentSeed(enrollmentRecord, dueMonthKey),
                dueDate: adminNextChargeDate,
                status: "pending",
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
              }, { merge: true });
            }
          } catch (dueError) {
            console.error("Onboarding: next-charge due creation failed", dueError);
            warnings.push(`Could not create the next-charge due for ${course.className} — add it from Fee Collections.`);
          }
        }
      } catch (courseError) {
        console.error("Onboarding: course approval failed", course.classId, courseError);
        warnings.push(`Could not set up "${course.className || course.classId}" — re-run Approve to retry just that class.`);
      }
    }

    if (createdEnrollmentIds.length === 0 && !alreadyIssued) {
      sendError(response, 500, `Could not set up any class for this student. ${warnings.join(" ")}`.trim());
      return;
    }
```

- [ ] **Step 5: Write back all courses + enrollment ids**

Replace the final `studentRef.set({...})` block's `enrollmentId` line and add the array. The primary mirror keeps `enrollmentId` = `courses[0].enrollmentId`:

```ts
    const allEnrollmentIds = courseUpdates.map((course) => course.enrollmentId).filter(Boolean);
    await studentRef.set({
      studentId,
      userUid: uid,
      courses: courseUpdates,
      enrollmentId: courseUpdates[0]?.enrollmentId || "",
      enrollmentIds: allEnrollmentIds,
      authUserCreated: createdUser,
      onboardingStatus: "approved",
      paidVia: getString(student.paidVia) || (body.paymentMethod === "cash" ? "counter" : body.paymentMethod === "upi" ? "qr" : "razorpay"),
      active: true,
      rejectReason: FieldValue.delete(),
      approvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    sendJson(response, 200, {
      ok: true, studentId, uid,
      enrollmentId: courseUpdates[0]?.enrollmentId || "",
      enrollmentIds: allEnrollmentIds,
      credentials, warnings,
    });
```

- [ ] **Step 6: Typecheck the API**

Run: `npx tsc --noEmit -p api/tsconfig.json`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add api/_razorpay/approve-onboarding.ts
git commit -m "feat(onboarding): approve creates one enrollment + ledger per class"
```

---

## Task 6: Deleting a student sweeps every enrollment

**Files:**
- Modify: `api/_razorpay/delete-student.ts`

**Interfaces:**
- Consumes: `students/{id}.courses`, `students/{id}.enrollmentIds` (Tasks 3, 5)
- Produces: nothing consumed downstream

- [ ] **Step 1: Collect every enrollment id**

Replace lines 68–79 (`const enrollmentId = …` through the enrollment delete) with:

```ts
    const linkToken = getString(student.linkToken);
    const uid = getString(student.userUid);
    // Every class this student took — the legacy single `enrollmentId`, the
    // `enrollmentIds` array, and any id still only on a course row. Deduped.
    const enrollmentIds = Array.from(new Set([
      getString(student.enrollmentId),
      ...(Array.isArray(student.enrollmentIds) ? (student.enrollmentIds as unknown[]).map((v) => getString(v)) : []),
      ...(Array.isArray(student.courses)
        ? (student.courses as Record<string, unknown>[]).map((course) => getString(course.enrollmentId))
        : []),
    ].filter(Boolean)));
    const removed: string[] = [];

    // 1. Fee ledger + enrollments — one set per class.
    let feeCount = 0;
    for (const enrollmentId of enrollmentIds) {
      feeCount += await deleteQueryDocs(db, "feePayments", "enrollmentId", enrollmentId);
      await db.collection("enrollments").doc(enrollmentId).delete();
    }
    if (feeCount > 0) removed.push(`${feeCount} fee record${feeCount > 1 ? "s" : ""}`);
    if (enrollmentIds.length > 0) {
      removed.push(`${enrollmentIds.length} enrollment${enrollmentIds.length > 1 ? "s" : ""}`);
    }
```

- [ ] **Step 2: Typecheck the API**

Run: `npx tsc --noEmit -p api/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add api/_razorpay/delete-student.ts
git commit -m "fix(students): danger-zone delete removes every class's enrollment and fees"
```

---

## Task 7: Admin form — extract components and edit multiple classes

**Files:**
- Create: `src/components/admin/StudentFeeSummary.tsx`
- Create: `src/components/admin/StudentCourseEditor.tsx`
- Create: `src/components/admin/StudentForm.tsx`
- Modify: `src/pages/admin/AdminStudents.tsx`

**Interfaces:**
- Consumes: `StudentCourse`, `newCourseKey` (Task 1); `buildStudentBreakdown`, `CourseBreakdown` (Task 2); `StudentWriteInput.courses` (Task 3)
- Produces:
  - `<StudentFeeSummary breakdown={StudentBreakdown} firstMonthFreeNotes={string[]} />`
  - `<StudentCourseEditor course, classes, index, total, locked, onChange, onRemove />`
  - `<StudentForm editing, students, classes, saving, onCancel, onSave />` where `onSave(input: StudentWriteInput)`

- [ ] **Step 1: Create `src/components/admin/StudentFeeSummary.tsx`**

```tsx
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import type { StudentBreakdown } from "@/lib/students";

interface StudentFeeSummaryProps {
  breakdown: StudentBreakdown;
  firstMonthFreeNotes: string[];
}

/**
 * The transparent price the admin sees while filling the form — and the exact
 * same numbers the parent sees on the payment link (req). One section per
 * class, then the grand total the parent actually pays now.
 */
const StudentFeeSummary = ({ breakdown, firstMonthFreeNotes }: StudentFeeSummaryProps) => {
  const multi = breakdown.sections.length > 1;
  return (
    <div className="mt-4 rounded-lg border border-gold/25 bg-gold/5 p-3">
      <p className="font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment link total</p>
      {breakdown.sections.length === 0 || breakdown.grandTotalInPaise === 0 ? (
        <p className="mt-1 font-body text-sm text-muted-foreground">Nothing to pay now — a login can be issued directly after saving.</p>
      ) : (
        <div className="mt-2 space-y-2.5">
          {breakdown.sections.map((section) => (
            <div key={section.key} className={multi ? "rounded-md border border-gold/20 bg-background/60 p-2.5" : ""}>
              {multi && <p className="mb-1 font-body text-xs font-semibold text-foreground">{section.className || "Class"}</p>}
              <div className="space-y-0.5">
                {section.rows.map((row, i) => (
                  <div key={i} className="flex justify-between gap-2 font-body text-xs text-muted-foreground">
                    <span className="min-w-0">{row.label}</span>
                    <span className={row.amountInPaise < 0 ? "shrink-0 text-green-700" : "shrink-0 text-foreground"}>
                      {row.amountInPaise < 0 ? "−" : ""}{formatPaiseAsRupees(Math.abs(row.amountInPaise))}
                    </span>
                  </div>
                ))}
              </div>
              {multi && (
                <div className="mt-1 flex justify-between border-t border-gold/20 pt-1 font-body text-xs font-semibold text-foreground">
                  <span>Subtotal</span><span>{formatPaiseAsRupees(section.totalInPaise)}</span>
                </div>
              )}
              {section.recurring && (
                <p className="mt-0.5 font-body text-[0.7rem] text-muted-foreground">
                  Then {formatPaiseAsRupees(section.recurring.amountInPaise)} / month
                </p>
              )}
              {section.emiInstallments && (
                <div className="mt-1.5 border-t border-gold/20 pt-1.5">
                  <p className="font-body text-[0.7rem] font-semibold uppercase tracking-wide text-gold">EMI Payment Schedule</p>
                  <div className="mt-1 space-y-0.5">
                    {section.emiInstallments.map((row, i) => (
                      <div key={i} className="flex justify-between gap-2 font-body text-xs">
                        <span className={i === 0 ? "min-w-0 font-semibold text-foreground" : "min-w-0 text-muted-foreground"}>{row.label}</span>
                        <span className="shrink-0 text-foreground">{formatPaiseAsRupees(row.amountInPaise)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="flex justify-between gap-2 border-t border-gold/30 pt-1.5 font-body text-sm font-bold text-foreground">
            <span>{multi ? `Total for ${breakdown.sections.length} classes` : "Total"}</span>
            <span>{formatPaiseAsRupees(breakdown.grandTotalInPaise)}</span>
          </div>
          {breakdown.dueNowInPaise !== breakdown.grandTotalInPaise && (
            <div className="flex justify-between gap-2 font-body text-sm font-semibold text-gold">
              <span>Parent pays now</span><span>{formatPaiseAsRupees(breakdown.dueNowInPaise)}</span>
            </div>
          )}
        </div>
      )}
      {firstMonthFreeNotes.map((note) => (
        <p key={note} className="mt-1 font-body text-[0.72rem] text-green-700">{note}</p>
      ))}
    </div>
  );
};

export default StudentFeeSummary;
```

- [ ] **Step 2: Create `src/components/admin/StudentCourseEditor.tsx`**

Move the per-class form fields out of `AdminStudents.tsx` verbatim (class select, slot select, track toggle, student type, kit/books/uniform fees + received checkboxes, monthly/term fee, discount, first-month-free, payment methods, EMI split, joining date, next charge date), driven by a `StudentCourse` rather than the flat form state.

```tsx
import { Trash2 } from "lucide-react";
import { parsePriceToPaise, formatPaiseAsRupees } from "@/lib/ecommerce";
import {
  classOffersMonthly, classOffersTerm, type ClassDoc,
} from "@/lib/classes";
import { DEFAULT_EMI_SPLIT, type StudentCourse, type StudentTrack } from "@/lib/students";

const inputClass = "w-full px-3 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 bg-background";
const labelClass = "font-body text-[0.8rem] text-muted-foreground block mb-1";

/** Paise → an editable rupee string ("" for zero, so the field looks empty). */
const toRupeeInput = (paise: number): string => (paise > 0 ? String(paise / 100) : "");

interface StudentCourseEditorProps {
  course: StudentCourse;
  classes: ClassDoc[];
  index: number;
  total: number;
  /** Approved courses can't change class/slot — only their fees and dates. */
  locked: boolean;
  onChange: (next: StudentCourse) => void;
  onRemove: () => void;
}

const StudentCourseEditor = ({ course, classes, index, total, locked, onChange, onRemove }: StudentCourseEditorProps) => {
  const selectedClass = classes.find((cls) => cls.id === course.classId);
  const tracks = selectedClass
    ? ([classOffersMonthly(selectedClass) ? "monthly" : null, classOffersTerm(selectedClass) ? "term" : null].filter(Boolean) as StudentTrack[])
    : [];

  const patch = (changes: Partial<StudentCourse>) => onChange({ ...course, ...changes });
  const patchFees = (changes: Partial<StudentCourse["fees"]>) => onChange({ ...course, fees: { ...course.fees, ...changes } });
  const patchMethods = (changes: Partial<StudentCourse["methods"]>) => onChange({ ...course, methods: { ...course.methods, ...changes } });

  const handleClassChange = (classId: string) => {
    const cls = classes.find((item) => item.id === classId);
    const track: StudentTrack = cls && !classOffersMonthly(cls) && classOffersTerm(cls) ? "term" : "monthly";
    patch({
      classId,
      className: cls?.name || "",
      slotId: "",
      slotLabel: "",
      trainerName: cls?.facultyName || "",
      fees: {
        ...course.fees,
        track,
        monthlyFeeInPaise: track === "monthly" ? (cls?.monthlyFeeInPaise || 0) : 0,
        termFeeInPaise: track === "term" ? (cls?.termFeeInPaise || 0) : 0,
      },
    });
  };

  return (
    <div className="rounded-lg border border-border/70 bg-background/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-body text-sm font-semibold text-foreground">
          Class {index + 1}{course.enrollmentId ? " · approved" : ""}
        </p>
        {total > 1 && (
          <button
            type="button"
            onClick={onRemove}
            className="flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 font-body text-[0.7rem] font-semibold text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> {course.enrollmentId ? "Drop class" : "Remove"}
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label className={labelClass}>Class *</label>
          <select
            className={inputClass}
            value={course.classId}
            disabled={locked}
            onChange={(e) => handleClassChange(e.target.value)}
          >
            <option value="">Select a class</option>
            {classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
          </select>
        </div>

        <div className="min-w-0">
          <label className={labelClass}>Batch / time slot</label>
          <select
            className={inputClass}
            value={course.slotId || ""}
            disabled={locked || !selectedClass}
            onChange={(e) => {
              const slot = (selectedClass?.timeSlots || []).find((item) => item.id === e.target.value);
              patch({ slotId: slot?.id || "", slotLabel: slot?.label || "" });
            }}
          >
            <option value="">{selectedClass?.schedule || "No specific slot"}</option>
            {(selectedClass?.timeSlots || []).map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}
          </select>
        </div>

        {tracks.length > 1 && (
          <div className="min-w-0">
            <label className={labelClass}>Track</label>
            <select
              className={inputClass}
              value={course.fees.track}
              onChange={(e) => {
                const track = e.target.value as StudentTrack;
                patchFees({ track, ...(track === "monthly" ? { termFeeInPaise: 0 } : { monthlyFeeInPaise: 0 }) });
              }}
            >
              {tracks.map((track) => <option key={track} value={track}>{track === "monthly" ? "Monthly" : "Term course"}</option>)}
            </select>
          </div>
        )}

        <div className="min-w-0">
          <label className={labelClass}>Student type</label>
          <select
            className={inputClass}
            value={course.fees.studentType}
            onChange={(e) => patchFees({ studentType: e.target.value as StudentCourse["fees"]["studentType"] })}
          >
            <option value="new">New student</option>
            <option value="existing">Existing student</option>
          </select>
        </div>

        <div className="min-w-0">
          <label className={labelClass}>Joining date</label>
          <input type="date" className={inputClass} value={course.joiningDate || ""} onChange={(e) => patch({ joiningDate: e.target.value })} />
        </div>

        <div className="min-w-0">
          <label className={labelClass}>Next charge date</label>
          <input type="date" className={inputClass} value={course.nextChargeDate || ""} onChange={(e) => patch({ nextChargeDate: e.target.value })} />
        </div>
      </div>

      {/* Itemised fees — every line the parent will see (req: transparency). */}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {([
          ["Kit fee (₹)", "kitFeeInPaise", "kit"],
          ["Books fee (₹)", "booksFeeInPaise", "books"],
          ["Uniform fee (₹)", "uniformFeeInPaise", "uniform"],
        ] as const).map(([label, feeKey, invKey]) => (
          <div key={feeKey} className="min-w-0">
            <label className={labelClass}>{label}</label>
            <input
              className={inputClass}
              inputMode="decimal"
              value={toRupeeInput(course.fees[feeKey])}
              onChange={(e) => patchFees({ [feeKey]: parsePriceToPaise(e.target.value) || 0 } as Partial<StudentCourse["fees"]>)}
            />
            <label className="mt-1 flex items-center gap-1.5 font-body text-[0.72rem] text-muted-foreground">
              <input
                type="checkbox"
                checked={course.inventory[invKey]}
                onChange={(e) => patch({ inventory: { ...course.inventory, [invKey]: e.target.checked } })}
              /> Received
            </label>
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {course.fees.track === "monthly" ? (
          <div className="min-w-0">
            <label className={labelClass}>Monthly fee (₹)</label>
            <input className={inputClass} inputMode="decimal" value={toRupeeInput(course.fees.monthlyFeeInPaise)} onChange={(e) => patchFees({ monthlyFeeInPaise: parsePriceToPaise(e.target.value) || 0 })} />
          </div>
        ) : (
          <div className="min-w-0">
            <label className={labelClass}>Term course fee (₹)</label>
            <input className={inputClass} inputMode="decimal" value={toRupeeInput(course.fees.termFeeInPaise)} onChange={(e) => patchFees({ termFeeInPaise: parsePriceToPaise(e.target.value) || 0 })} />
          </div>
        )}
        <div className="min-w-0">
          <label className={labelClass}>Discount (₹)</label>
          <input className={inputClass} inputMode="decimal" value={toRupeeInput(course.fees.discountInPaise)} onChange={(e) => patchFees({ discountInPaise: parsePriceToPaise(e.target.value) || 0 })} />
        </div>
        {course.fees.track === "monthly" && (
          <label className="flex items-end gap-2 pb-2 font-body text-[0.8rem] text-muted-foreground">
            <input type="checkbox" checked={course.fees.firstMonthFree} onChange={(e) => patchFees({ firstMonthFree: e.target.checked })} />
            First month free
          </label>
        )}
      </div>

      <div className="mt-3">
        <label className={labelClass}>Payment options on the link</label>
        <div className="flex flex-wrap gap-3">
          {([
            ["Online (Razorpay / autopay)", "razorpay"],
            ["UPI QR + screenshot", "qr"],
            ["Pay at counter", "counter"],
          ] as const).map(([label, key]) => (
            <label key={key} className="flex items-center gap-1.5 font-body text-[0.8rem] text-muted-foreground">
              <input type="checkbox" checked={course.methods[key]} onChange={(e) => patchMethods({ [key]: e.target.checked } as Partial<StudentCourse["methods"]>)} /> {label}
            </label>
          ))}
          {course.fees.track === "term" && (
            <label className="flex items-center gap-1.5 font-body text-[0.8rem] text-muted-foreground">
              <input
                type="checkbox"
                checked={course.methods.emi}
                onChange={(e) => onChange({
                  ...course,
                  methods: { ...course.methods, emi: e.target.checked },
                  fees: { ...course.fees, emiSplit: e.target.checked ? (course.fees.emiSplit || DEFAULT_EMI_SPLIT) : undefined },
                })}
              /> EMI installments
            </label>
          )}
        </div>
      </div>

      {course.methods.emi && course.fees.track === "term" && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label className={labelClass}>Upfront %</label>
            <input
              className={inputClass}
              inputMode="numeric"
              value={String(course.fees.emiSplit?.upfrontPercentage ?? DEFAULT_EMI_SPLIT.upfrontPercentage)}
              onChange={(e) => patchFees({
                emiSplit: {
                  upfrontPercentage: Math.max(1, Math.round(Number(e.target.value) || DEFAULT_EMI_SPLIT.upfrontPercentage)),
                  installmentPercentages: course.fees.emiSplit?.installmentPercentages || DEFAULT_EMI_SPLIT.installmentPercentages,
                },
              })}
            />
          </div>
          <div className="min-w-0">
            <label className={labelClass}>Later installments % (comma separated)</label>
            <input
              className={inputClass}
              value={(course.fees.emiSplit?.installmentPercentages || DEFAULT_EMI_SPLIT.installmentPercentages).join(", ")}
              onChange={(e) => patchFees({
                emiSplit: {
                  upfrontPercentage: course.fees.emiSplit?.upfrontPercentage ?? DEFAULT_EMI_SPLIT.upfrontPercentage,
                  installmentPercentages: e.target.value.split(",").map((v) => Math.round(Number(v.trim()) || 0)).filter((v) => v > 0),
                },
              })}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentCourseEditor;
```

- [ ] **Step 3: Create `src/components/admin/StudentForm.tsx`**

The source modal is the `createPortal` block at **`AdminStudents.tsx:830`** through its closing `)}` after the Cancel / Update buttons at **line ~1182**. Move the personal-details fields from it **verbatim** (name, age, gender, email + `emailAuto` auto-derive, phone, parent name/relation, address, mode, photo upload + `openSquareCropper`, roll number) into this component, keeping `inputClass` / `labelClass` and the existing markup. Then render `courses.map(<StudentCourseEditor …/>)` with an **"+ Add another class"** button, and `<StudentFeeSummary />` in place of the old "Payment link total" block (lines 1141–1172). Its `onSave` builds and emits a `StudentWriteInput`:

```tsx
const emptyCourse = (): StudentCourse => ({
  key: newCourseKey(),
  classId: "", className: "",
  inventory: { uniform: false, kit: false, books: false },
  fees: {
    studentType: "new", track: "monthly", kitFeeInPaise: 0, booksFeeInPaise: 0,
    uniformFeeInPaise: 0, monthlyFeeInPaise: 0, termFeeInPaise: 0,
    discountInPaise: 0, firstMonthFree: false,
  },
  methods: { razorpay: false, qr: true, counter: true, emi: false },
  status: "active",
  joiningDate: new Date().toISOString().slice(0, 10),
});
```

Validation before `onSave`:
- `name`, `email` and **at least one course with a `classId`** are required; otherwise toast and return.
- Roll number, when present, must match `ROLL_NUMBER_PATTERN`.
- A course may not repeat a `classId` already used by another **active** course — toast `"<Class> is already added for this student."`

Removing a course: if `course.enrollmentId` is set, `confirmDialog()` with `"Drop <class>? Their fee history is kept and billing stops."` then set `status: "dropped"` (never splice — history must survive). If unapproved, splice it out.

`useMemo` for the live preview:

```tsx
const breakdown = useMemo(() => buildStudentBreakdown(courses), [courses]);
const firstMonthFreeNotes = useMemo(
  () => courses
    .filter((c) => c.status !== "dropped" && c.fees.firstMonthFree && c.fees.track === "monthly")
    .map((c) => `${c.className || "This class"}: first month's fee will be waived automatically.`),
  [courses],
);
```

- [ ] **Step 4: Rewire `AdminStudents.tsx`**

- Delete `StudentFormState` (lines 67–101), `defaultForm` (105–116), `toFormFees` (126–140), `handleClassChange` (278–290), the `form` / `emailAuto` / `photoUploading` / `photoRef` state (155, 159, 174–175), the `selectedClass` / `classTracks` / `previewFees` / `paymentFree` memos (182–189), and the entire `createPortal` modal (830–1182). Replace the modal with `{showModal && <StudentForm editing={editing} students={students} classes={classes} saving={saving} onCancel={closeModal} onSave={handleSave} />}`.
- `openAdd(prefill?: Partial<StudentCourse> & { name?: string; email?: string; … })` now seeds `StudentForm` via an `initialPrefill` prop — used by "Add to student" from a lead (`addFromRequest`).
- `handleSave(input: StudentWriteInput)` calls `createStudent`/`updateStudent` unchanged; update the log lines to use the class list:

```ts
const classSummary = input.courses.map((c) => c.className).filter(Boolean).join(", ");
logAction("Created student", `${input.name} · ${classSummary}${input.desiredStudentId ? ` · roll ${input.desiredStudentId}` : ""}`);
```

- The student list's class caption becomes:

```tsx
{student.courses.length > 1
  ? `${student.courses[0].className} +${student.courses.length - 1} more`
  : student.className || "—"}
```

- Search (line ~515) also matches every class name:

```ts
students.filter((s) => [s.name, s.email, s.parentName, s.studentId, ...s.courses.map((c) => c.className)]
  .some((v) => (v || "").toLowerCase().includes(q)))
```

- After approval, when `result.warnings?.length`, toast them (`variant: "destructive"`) so a partially-failed class is visible rather than silent.

- [ ] **Step 5: Typecheck, lint, build**

```bash
npx tsc --noEmit -p tsconfig.json
npm run lint
npm run build
```
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/StudentFeeSummary.tsx src/components/admin/StudentCourseEditor.tsx src/components/admin/StudentForm.tsx src/pages/admin/AdminStudents.tsx
git commit -m "feat(admin): multi-class student form with per-class fee summary"
```

---

## Task 8: Every fee doc carries a breakdown

**Files:**
- Modify: `api/_lib/fee-store.ts`
- Modify: `src/lib/classes/fees.ts`

**Interfaces:**
- Consumes: `EnrollmentRecord` / `EnrollmentDoc`
- Produces: `FeePaymentDoc.breakdown` populated on recurring monthly fees

- [ ] **Step 1: Server — add the breakdown to `buildFeePaymentSeed`**

In `api/_lib/fee-store.ts`, inside the object returned by `buildFeePaymentSeed`, after `amountInPaise`, add:

```ts
    // Every fee is itemised (req: transparent pricing). A recurring monthly fee
    // is a single line naming the class, so the parent's history and the admin
    // ledger always render a breakdown table rather than a bare number.
    breakdown: [{
      label: `Monthly class fee — ${getString(enrollment.className) || "Class"}`,
      amountInPaise: Math.max(0, Math.round(toNumber(enrollment.monthlyFeeInPaise))),
    }],
```

Do the same in `ensureCustomFeePayment`'s `seed`, after `amountInPaise`:

```ts
    breakdown: [{ label: params.periodLabel, amountInPaise: Math.max(0, Math.round(toNumber(params.amountInPaise))) }],
```

> The admission and EMI writes in `approve-onboarding.ts` `set(..., { merge: true })` a richer `breakdown` **after** `ensureCustomFeePayment`, so the itemised kit/books rows still win. This default only fills docs nothing else itemises.

- [ ] **Step 2: Client — mirror it**

In `src/lib/classes/fees.ts`, `ensureMonthlyDueFee` builds its seed inline around line 200. Add the same `breakdown` field to that object, and to `applyNextChargeDue`'s `setDoc` payload (around line 504):

```ts
    breakdown: [{
      label: `Monthly class fee — ${enrollment.className || "Class"}`,
      amountInPaise: Math.max(0, Math.round(enrollment.monthlyFeeInPaise || 0)),
    }],
```

- [ ] **Step 3: Verify nothing overwrites an itemised breakdown**

Run: `npx vitest run` and confirm 110+ tests pass.
Then grep for other writers: `npx rg "breakdown" src/lib api --type ts`
Expected: only the sites above plus `approve-onboarding.ts` (richer, merged after) and read-side renderers.

- [ ] **Step 4: Typecheck both projects + commit**

```bash
npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p api/tsconfig.json
git add api/_lib/fee-store.ts src/lib/classes/fees.ts
git commit -m "feat(fees): itemised breakdown on every fee doc, not just admission"
```

---

## Task 9: Parent portal renders the breakdown on every fee

**Files:**
- Modify: `src/pages/account/Classes.tsx`

**Interfaces:**
- Consumes: `FeePaymentDoc.breakdown` (Task 8)

- [ ] **Step 1: Find the current breakdown render**

Run: `npx rg -n "breakdown" src/pages/account/Classes.tsx`
The history list already renders `fee.breakdown` for admission fees. Locate that block.

- [ ] **Step 2: Make it unconditional and labelled**

Replace the conditional so **every** fee with a breakdown shows it, and a single-row breakdown that just restates the total is suppressed as noise:

```tsx
{(fee.breakdown?.length || 0) > 0
  && !(fee.breakdown!.length === 1 && fee.breakdown![0].amountInPaise === fee.amountInPaise) && (
  <div className="mt-2 rounded-md border border-border/60 bg-background/60 p-2">
    <p className="font-body text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">What this covers</p>
    <div className="mt-1 space-y-0.5">
      {fee.breakdown!.map((row, i) => (
        <div key={i} className="flex justify-between gap-2 font-body text-xs">
          <span className="min-w-0 text-muted-foreground">{row.label}</span>
          <span className={row.amountInPaise < 0 ? "shrink-0 text-green-700" : "shrink-0 text-foreground"}>
            {row.amountInPaise < 0 ? "−" : ""}{formatPaiseAsRupees(Math.abs(row.amountInPaise))}
          </span>
        </div>
      ))}
      <div className="flex justify-between gap-2 border-t border-border/60 pt-1 font-body text-xs font-bold text-foreground">
        <span>Total</span><span>{formatPaiseAsRupees(fee.amountInPaise)}</span>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add src/pages/account/Classes.tsx
git commit -m "feat(portal): show the itemised breakdown on every fee in My Classes"
```

---

## Task 10: Full verification pass

**Files:** none modified — this task is the gate before P1.

- [ ] **Step 1: Static checks**

```bash
npm test
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p api/tsconfig.json
npm run lint
npm run build
```
Expected: ≥110 tests pass, zero type errors, zero lint errors, build succeeds.

- [ ] **Step 2: Live regression — a LEGACY single-class student**

`npm run dev`, sign in as admin, open `/admin/students`.
1. Open an existing pre-multi-class student. Expected: exactly one class row, all fees populated from the flat fields, roll number read-only if approved.
2. Save without changing anything. Expected: no error; `courses` written; the list caption unchanged.
3. Open Fee Collections. Expected: the student still appears with the same ledger.

- [ ] **Step 3: Live path — a NEW two-class student**

1. Add Student → fill personal details → Class 1 (monthly, kit ₹1500 + books ₹800, monthly ₹1000) → **+ Add another class** → Class 2 (monthly, books ₹500, monthly ₹1200).
2. Expected in the summary: two sections, per-class subtotals, `Total for 2 classes` = ₹5,000.
3. Create & Get Link → open `/pay/:token` in a private window. Expected: both classes sectioned with the same numbers, one grand total.
4. Approve. Expected: **two** enrollments, two paid admission fee docs each with its own kit/books rows, one STU roll number, one login.
5. Sign in as the parent. Expected: My Classes lists both classes; each admission fee shows "What this covers".

- [ ] **Step 4: Live path — add a third class to the approved student**

Edit the student → add Class 3 → save → click **Approve new classes**. Expected: only one new enrollment appears; classes 1 and 2 are untouched (same fee doc ids, same paid status).

- [ ] **Step 5: Mobile check**

In DevTools at 375px on `/admin/students` (form open) and `/pay/:token`, evaluate `document.querySelector("main").scrollWidth`. Expected: ≤ 375. No horizontal scroll.

- [ ] **Step 6: Commit the verification notes**

```bash
git add -A
git commit -m "chore: P0 verification pass — multi-class onboarding + fee transparency"
```

---

## Deploy notes for P0

- **No `firestore.rules` change is needed** — `courses` lives inside the existing `students` doc, and no new collection is introduced. (P1 onward does need a rules deploy.)
- No new environment variables.
- No new Vercel functions.
