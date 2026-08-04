// TYPE-ONLY import: types.ts imports buildCourseRows/buildEmiRows back from this
// file, so importing any RUNTIME value from types.ts here would create a real
// module cycle. Type imports erase at compile time — safe.
import type { FeeBreakdownRow, StudentCourse, StudentFeeSetup } from "./types";

// ---------------------------------------------------------------------------
// Transparent pricing (req): every charge a parent pays is itemised — kit fee,
// books fee, uniform fee, course/pre-payment and any discount — per CLASS, then
// summed into ONE grand total. The same numbers are shown to the admin (student
// form), to the parent (payment link + portal), and stored on the fee ledger.
//
// PURE + unit-tested. Mirrored server-side in
// api/_razorpay/approve-onboarding.ts (buildOnboardingBreakdown) — keep in sync.
// ---------------------------------------------------------------------------

/**
 * GST is opt-in PER STUDENT (req: "for few students"). Default 18%, admin
 * editable. It is charged on the post-discount amount of each class, so every
 * fee document and every bill line stays internally consistent.
 */
export interface GstConfig {
  enabled: boolean;
  percent: number;
}

export const DEFAULT_GST_PERCENT = 18;

export const normalizeGst = (raw: unknown): GstConfig => {
  const data = (raw || {}) as Record<string, unknown>;
  const percent = Number(data.percent);
  return {
    enabled: data.enabled === true,
    percent: Number.isFinite(percent) && percent > 0 ? Math.min(100, percent) : DEFAULT_GST_PERCENT,
  };
};

/** GST payable on a taxable amount, rounded to the nearest paisa. */
export const gstOn = (taxableInPaise: number, gst?: GstConfig): number => {
  if (!gst?.enabled || !(gst.percent > 0) || taxableInPaise <= 0) return 0;
  return Math.round((taxableInPaise * gst.percent) / 100);
};

export interface CourseBreakdown {
  key: string;
  classId: string;
  className: string;
  slotLabel?: string;
  rows: FeeBreakdownRow[];
  subtotalInPaise: number;
  discountInPaise: number;
  /** Post-discount, pre-GST — the taxable value shown on the bill. */
  taxableInPaise: number;
  gstInPaise: number;
  gstPercent: number;
  totalInPaise: number;
  /** What must be paid NOW: the whole total, or installment 1 on an EMI course. */
  dueNowInPaise: number;
  emiInstallments?: FeeBreakdownRow[];
  /** What recurs after admission (monthly track only) — "then ₹X / month". */
  recurring?: { label: string; amountInPaise: number };
}

export interface StudentBreakdown {
  sections: CourseBreakdown[];
  grandTotalInPaise: number;
  dueNowInPaise: number;
  /** Combined GST across every class — the bill's tax line. */
  gstInPaise: number;
  taxableInPaise: number;
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
  installmentPercentages.forEach((percentage, index) => {
    const isLast = index === installmentPercentages.length - 1;
    const amountInPaise = isLast ? remaining : Math.round((totalInPaise * percentage) / 100);
    remaining -= amountInPaise;
    rows.push({ label: `${ordinal(index + 2)} installment (${percentage}%)`, amountInPaise });
  });
  return rows.length > 1 ? rows : undefined;
};

/** One class's full transparent breakdown, GST included when the student pays it. */
export const buildCourseBreakdown = (course: StudentCourse, gst?: GstConfig): CourseBreakdown => {
  const { rows: baseRows, subtotalInPaise, discountInPaise, totalInPaise: taxableInPaise } = buildCourseRows(course.fees);
  // GST applies to the POST-DISCOUNT amount, and the EMI split is computed on
  // the GST-inclusive total so the installments still sum to what's owed.
  const gstInPaise = gstOn(taxableInPaise, gst);
  const rows = gstInPaise > 0
    ? [...baseRows, { label: `GST @ ${gst!.percent}%`, amountInPaise: gstInPaise }]
    : baseRows;
  const totalInPaise = taxableInPaise + gstInPaise;
  const emiInstallments = buildEmiRows(course.fees, course.methods, totalInPaise);
  return {
    taxableInPaise,
    gstInPaise,
    gstPercent: gstInPaise > 0 ? gst!.percent : 0,
    key: course.key,
    classId: course.classId,
    className: course.className,
    // Sections are WRITTEN TO FIRESTORE (onboardingLinks.sections), and
    // Firestore rejects `undefined` — omit the key instead of setting it.
    ...(course.slotLabel ? { slotLabel: course.slotLabel } : {}),
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
export const buildStudentBreakdown = (courses: StudentCourse[], gst?: GstConfig): StudentBreakdown => {
  // Filter inline rather than importing activeCourses() — see the cycle note above.
  const sections = (courses || [])
    .filter((course) => course.status !== "dropped")
    .map((course) => buildCourseBreakdown(course, gst));
  return {
    sections,
    grandTotalInPaise: sections.reduce((sum, section) => sum + section.totalInPaise, 0),
    dueNowInPaise: sections.reduce((sum, section) => sum + section.dueNowInPaise, 0),
    gstInPaise: sections.reduce((sum, section) => sum + section.gstInPaise, 0),
    taxableInPaise: sections.reduce((sum, section) => sum + section.taxableInPaise, 0),
  };
};

/** Flattened rows across every class — for legacy consumers that expect one list. */
export const flattenBreakdownRows = (breakdown: StudentBreakdown): FeeBreakdownRow[] =>
  breakdown.sections.flatMap((section) =>
    breakdown.sections.length > 1
      ? section.rows.map((row) => ({ label: `${section.className} · ${row.label}`, amountInPaise: row.amountInPaise }))
      : section.rows,
  );
