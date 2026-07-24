import type { Timestamp } from "firebase/firestore";
import type { Gender } from "@/lib/classes";

// ---------------------------------------------------------------------------
// Student Manager (req): the admin creates and manages every student profile.
// A `students` doc is the admin-side record; approval materializes the normal
// EnrollmentDoc + login so the existing fee engine and portal work unchanged.
// All money fields are paise (integer).
// ---------------------------------------------------------------------------

export type ParentRelation = "father" | "mother" | "guardian";
export type StudentMode = "offline" | "online";
export type StudentType = "new" | "existing";
export type StudentTrack = "monthly" | "term";

// The onboarding-link lifecycle. The link doubles as the credentials page once
// approved (req: "the temporary payment link now contains the credentials").
export type OnboardingStatus =
  | "awaiting-payment"   // link created / payment rejected — parent must (re)pay
  | "payment-submitted"  // QR screenshot uploaded, awaiting admin approval
  | "counter-chosen"     // parent chose to pay at the counter
  | "paid-online"        // Razorpay payment captured + verified
  | "approved";          // admin approved — credentials issued

// Which payment options the parent sees on the link (admin-selected, req).
export interface StudentPaymentMethods {
  razorpay: boolean; // pay online via Razorpay (autopay mandate completes post-login)
  qr: boolean;       // UPI QR / payment number + screenshot upload
  counter: boolean;  // cash / POS at the centre
  emi: boolean;      // term courses only — pay in installments (EMI plan)
}

export interface StudentInventory {
  uniform: boolean;
  kit: boolean;
  books: boolean;
}

// EMI split configuration stored on the student when EMI is enabled.
// Default: 50% upfront, then two 25% installments.
export interface EmiSplitConfig {
  upfrontPercentage: number;        // e.g. 50
  installmentPercentages: number[]; // e.g. [25, 25]
}

export const DEFAULT_EMI_SPLIT: EmiSplitConfig = {
  upfrontPercentage: 50,
  installmentPercentages: [25, 25],
};

export interface StudentFeeSetup {
  studentType: StudentType;
  track: StudentTrack;
  kitFeeInPaise: number;
  booksFeeInPaise: number;
  uniformFeeInPaise: number;
  monthlyFeeInPaise: number; // recurring monthly class fee
  termFeeInPaise: number;    // one-shot term fee (track === "term")
  discountInPaise: number;   // manual flat discount off the onboarding total
  firstMonthFree: boolean;   // monthly only: waive the first billable month
  emiSplit?: EmiSplitConfig; // EMI split when EMI is selected (term only)
}

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

export interface StudentDoc {
  id: string;
  // A. Personal details
  name: string;
  age: number;
  gender: Gender;
  email: string;       // mandatory — the login user id
  phone: string;
  parentName: string;
  parentRelation: ParentRelation;
  address: string;
  mode: StudentMode;
  // Admin-uploaded profile photo (also synced to the login's users doc so the
  // parent portal shows it). Powers the Student Manager gallery view.
  photoUrl?: string;
  // B. Class details
  classId: string;
  className: string;
  slotId?: string;
  slotLabel?: string;
  trainerName?: string;    // copied from the class (shown to the parent, req)
  // When the student joined (YYYY-MM-DD) — defaults to today, admin-editable.
  joiningDate?: string;
  // The date the NEXT fee is due (YYYY-MM-DD). The admin sets this; it drives
  // the pending due + the WhatsApp reminder, and the parent sees a Pay button.
  nextChargeDate?: string;
  inventory: StudentInventory;
  // C. Fees & payment setup
  fees: StudentFeeSetup;
  methods: StudentPaymentMethods;
  // Onboarding link state
  linkToken: string;
  onboardingStatus: OnboardingStatus;
  proofUrl?: string;
  upiRef?: string;
  rejectReason?: string;
  paidVia?: "qr" | "counter" | "razorpay";
  razorpayPaymentId?: string;
  // EMI (term + emi): which installment the parent has declared paid on the
  // link (1 = the first). Drives the admin's "1st installment paid — verify"
  // card. `submittedAmountInPaise` is what the link asked them to pay.
  emiInstallmentSubmitted?: number;
  submittedAmountInPaise?: number;
  linkSharedAt?: Timestamp;
  // Admin-chosen roll number (req): suggested at creation, editable until
  // approval. Becomes the Student ID AND the login password at approval. A
  // dropped (inactive) student's number may be reassigned to a new student.
  desiredStudentId?: string;
  // Issued at approval
  studentId?: string;    // "STU001"
  userUid?: string;
  enrollmentId?: string;
  approvedAt?: Timestamp;
  // Every class this student takes. Legacy docs carry only the singular fields
  // above; `normalizeCourses` synthesises a one-entry array from them and every
  // write mirrors courses[0] back, so no backfill migration is needed.
  courses: StudentCourse[];
  enrollmentIds: string[];
  // Admin override: force portal access unlocked through this date (YYYY-MM-DD)
  // even when a fee is overdue. Consumed from P1; stored from P0 on.
  accessOverrideUntil?: string;
  // D. Status — inactive keeps the full history (never delete).
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// The public payment-link snapshot at onboardingLinks/{token}. Readable only by
// direct token (rules: get yes, list no); every parent-side change goes through
// the server. After approval it carries the login credentials for the parent.
export interface FeeBreakdownRow {
  label: string;
  amountInPaise: number; // negative = discount row
}

export interface OnboardingLinkDoc {
  token: string;
  studentDocId: string;
  studentName: string;
  parentName: string;
  className: string;
  slotLabel?: string;
  trainerName?: string;
  rows: FeeBreakdownRow[];
  totalInPaise: number;
  // What the parent must pay RIGHT NOW to confirm the admission. Equals
  // totalInPaise normally; on an EMI link it is only the FIRST installment
  // (req: the parent is asked for the first installment, not the whole fee).
  dueNowInPaise: number;
  methods: StudentPaymentMethods;
  status: OnboardingStatus;
  rejectReason?: string;
  freeMonthNote?: string;
  emiSplit?: EmiSplitConfig;   // EMI installment breakdown (term + EMI)
  emiInstallments?: FeeBreakdownRow[]; // computed installment rows for display
  credentials?: { email: string; password: string; studentId: string };
  updatedAt?: Timestamp;
}

export interface StudentCredential {
  studentDocId: string;
  studentId: string;
  email: string;
  password: string;
  name: string;
  whatsapp?: string;
}

export const PARENT_RELATION_LABELS: Record<ParentRelation, string> = {
  father: "Father",
  mother: "Mother",
  guardian: "Guardian",
};

export const ONBOARDING_STATUS_LABELS: Record<OnboardingStatus, string> = {
  "awaiting-payment": "Awaiting Payment",
  "payment-submitted": "Payment Submitted",
  "counter-chosen": "Pays at Counter",
  "paid-online": "Paid Online",
  approved: "Approved",
};

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in students.test.ts)
// ---------------------------------------------------------------------------

/** "STU001" from a sequence number (grows past 999 naturally: "STU1000"). */
export const formatStudentId = (sequence: number): string =>
  `STU${String(Math.max(1, Math.round(sequence))).padStart(3, "0")}`;

/** Roll numbers double as the login password — Firebase needs ≥ 6 chars. */
export const ROLL_NUMBER_PATTERN = /^[A-Za-z0-9-]{6,20}$/;

/**
 * Suggest the next roll number from the numbers already in use (assigned or
 * pending): highest numeric suffix + 1. The admin can overwrite it (req) —
 * e.g. to reassign a dropped student's number.
 */
export const suggestNextStudentId = (
  students: Array<Pick<StudentDoc, "studentId" | "desiredStudentId">>,
): string => {
  let highest = 0;
  for (const student of students) {
    for (const value of [student.studentId, student.desiredStudentId]) {
      const match = /(\d+)\s*$/.exec(value || "");
      if (match) highest = Math.max(highest, Number(match[1]));
    }
  }
  return formatStudentId(highest + 1);
};

const clampPaise = (value: number): number => Math.max(0, Math.round(Number(value) || 0));

// ---------------------------------------------------------------------------
// Multi-class helpers (req: one student, several classes)
// ---------------------------------------------------------------------------

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
    ? data.installmentPercentages.map((value) => Math.round(courseNumber(value))).filter((value) => value > 0)
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
 * The student's courses. Prefers a stored `courses` array; otherwise synthesises
 * ONE course from the legacy flat fields (classId/fees/methods/…) so
 * pre-multi-class documents keep working with no migration. Returns [] when
 * there is no class at all (a half-filled draft).
 */
export const normalizeCourses = (data: Record<string, unknown> = {}): StudentCourse[] => {
  const stored = Array.isArray(data.courses) ? (data.courses as Record<string, unknown>[]) : [];
  if (stored.length > 0) return stored.map((raw, index) => normalizeCourse(raw, `course-${index + 1}`));
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

const emptyCourseFees = (): StudentFeeSetup => ({
  studentType: "new", track: "monthly", kitFeeInPaise: 0, booksFeeInPaise: 0,
  uniformFeeInPaise: 0, monthlyFeeInPaise: 0, termFeeInPaise: 0,
  discountInPaise: 0, firstMonthFree: false,
});

/**
 * Mirror courses[0] back into the LEGACY flat fields (classId/className/fees/…)
 * so every existing reader — StudentFeeCollections, the student list, search,
 * activity-log captions — keeps working untouched while consumers migrate to
 * `courses`. Firestore rejects `undefined`, so blanks are written as "".
 */
export const mirrorPrimaryCourse = (courses: StudentCourse[]) => {
  const primary = (courses || [])[0];
  return {
    classId: primary?.classId || "",
    className: primary?.className || "",
    slotId: primary?.slotId || "",
    slotLabel: primary?.slotLabel || "",
    trainerName: primary?.trainerName || "",
    joiningDate: primary?.joiningDate || "",
    nextChargeDate: primary?.nextChargeDate || "",
    inventory: primary?.inventory || { uniform: false, kit: false, books: false },
    fees: { ...(primary?.fees || emptyCourseFees()), emiSplit: primary?.fees.emiSplit || null },
    methods: primary?.methods || { razorpay: false, qr: true, counter: true, emi: false },
    enrollmentId: primary?.enrollmentId || "",
    enrollmentIds: (courses || []).map((course) => course.enrollmentId || "").filter(Boolean),
  };
};

/**
 * The onboarding payment breakdown shown to the admin AND on the parent link.
 * New students pay kit/books/uniform + the first recurring fee (pre-payment for
 * monthly, the full term fee for term) minus any discount. Existing students
 * never see pre-payment rows (req) — only the one-time items minus discount.
 * "First month free" (monthly) keeps today's total unchanged; the first
 * billable month is waived at approval instead.
 */
export const buildFeeBreakdown = (fees: StudentFeeSetup): { rows: FeeBreakdownRow[]; totalInPaise: number; emiInstallments?: FeeBreakdownRow[] } => {
  const rows: FeeBreakdownRow[] = [];
  if (clampPaise(fees.kitFeeInPaise) > 0) rows.push({ label: "Kit fee", amountInPaise: clampPaise(fees.kitFeeInPaise) });
  if (clampPaise(fees.booksFeeInPaise) > 0) rows.push({ label: "Books fee", amountInPaise: clampPaise(fees.booksFeeInPaise) });
  if (clampPaise(fees.uniformFeeInPaise) > 0) rows.push({ label: "Uniform fee", amountInPaise: clampPaise(fees.uniformFeeInPaise) });

  // A TERM course is a one-time full payment — charged for BOTH new and
  // existing students (it isn't a recurring "pre-payment"). Only the MONTHLY
  // pre-payment (the first advance) is skipped for existing students, who bill
  // in arrears from their first collectable month.
  if (fees.track === "term" && clampPaise(fees.termFeeInPaise) > 0) {
    rows.push({ label: "Course fee (full term)", amountInPaise: clampPaise(fees.termFeeInPaise) });
  }
  if (fees.studentType === "new" && fees.track === "monthly" && clampPaise(fees.monthlyFeeInPaise) > 0) {
    rows.push({ label: "Pre-payment (first fee)", amountInPaise: clampPaise(fees.monthlyFeeInPaise) });
  }

  const subtotal = rows.reduce((sum, row) => sum + row.amountInPaise, 0);
  const discount = Math.min(clampPaise(fees.discountInPaise), subtotal);
  if (discount > 0) rows.push({ label: "Discount", amountInPaise: -discount });

  const totalInPaise = Math.max(0, subtotal - discount);

  // Build EMI installment rows when EMI split is configured (term only)
  let emiInstallments: FeeBreakdownRow[] | undefined;
  if (fees.emiSplit && fees.track === "term" && totalInPaise > 0) {
    const { upfrontPercentage, installmentPercentages } = fees.emiSplit;
    const upfrontAmount = Math.round((totalInPaise * upfrontPercentage) / 100);
    emiInstallments = [
      { label: `Pay now (${upfrontPercentage}%)`, amountInPaise: upfrontAmount },
    ];
    let remaining = totalInPaise - upfrontAmount;
    installmentPercentages.forEach((pct, i) => {
      const isLast = i === installmentPercentages.length - 1;
      const amount = isLast ? remaining : Math.round((totalInPaise * pct) / 100);
      remaining -= amount;
      emiInstallments!.push({
        label: `${ordinal(i + 2)} installment (${pct}%)`,
        amountInPaise: amount,
      });
    });
  }

  return { rows, totalInPaise, emiInstallments };
};

/** Convert 2 → "2nd", 3 → "3rd", etc. */
const ordinal = (n: number): string => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/**
 * The EMI schedule actually in force: only when the admin enabled the EMI
 * method AND the split produced installment rows (term courses only).
 */
export const emiScheduleFor = (
  fees: StudentFeeSetup,
  methods: Pick<StudentPaymentMethods, "emi">,
): FeeBreakdownRow[] | undefined => {
  if (methods.emi !== true) return undefined;
  const { emiInstallments } = buildFeeBreakdown(fees);
  return emiInstallments && emiInstallments.length > 1 ? emiInstallments : undefined;
};

/**
 * What the parent must pay NOW to confirm the admission (req): on an EMI
 * onboarding that is the FIRST installment only — never the whole course fee.
 */
export const onboardingDueNowInPaise = (
  fees: StudentFeeSetup,
  methods: Pick<StudentPaymentMethods, "emi">,
): number => {
  const schedule = emiScheduleFor(fees, methods);
  return schedule ? schedule[0].amountInPaise : buildFeeBreakdown(fees).totalInPaise;
};

/** A zero-total onboarding needs no payment link — create the login directly. */
export const isPaymentFreeOnboarding = (fees: StudentFeeSetup): boolean =>
  buildFeeBreakdown(fees).totalInPaise <= 0;

/** The synthetic login-email domain for admin-created students. */
export const STUDENT_EMAIL_DOMAIN = "javani.com";

/**
 * Suggest a login email from the student's name (req): "Krishna Sree" →
 * "krishnasree@javani.com". Falls back to a numeric suffix when that address is
 * already taken by another student, so two same-named students never collide.
 * Returns "" for an empty/symbol-only name. The admin can always override it.
 */
export const suggestStudentEmail = (name: string, takenEmails: string[] = []): string => {
  const base = (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!base) return "";
  const taken = new Set(takenEmails.map((email) => email.trim().toLowerCase()).filter(Boolean));
  let candidate = `${base}@${STUDENT_EMAIL_DOMAIN}`;
  let suffix = 1;
  while (taken.has(candidate)) {
    candidate = `${base}${suffix}@${STUDENT_EMAIL_DOMAIN}`;
    suffix += 1;
  }
  return candidate;
};
