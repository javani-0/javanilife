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
}

export interface StudentInventory {
  uniform: boolean;
  kit: boolean;
  books: boolean;
}

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
  linkSharedAt?: Timestamp;
  // Issued at approval
  studentId?: string;    // "STU001"
  userUid?: string;
  enrollmentId?: string;
  approvedAt?: Timestamp;
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
  rows: FeeBreakdownRow[];
  totalInPaise: number;
  methods: StudentPaymentMethods;
  status: OnboardingStatus;
  rejectReason?: string;
  freeMonthNote?: string;
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

const clampPaise = (value: number): number => Math.max(0, Math.round(Number(value) || 0));

/**
 * The onboarding payment breakdown shown to the admin AND on the parent link.
 * New students pay kit/books/uniform + the first recurring fee (pre-payment for
 * monthly, the full term fee for term) minus any discount. Existing students
 * never see pre-payment rows (req) — only the one-time items minus discount.
 * "First month free" (monthly) keeps today's total unchanged; the first
 * billable month is waived at approval instead.
 */
export const buildFeeBreakdown = (fees: StudentFeeSetup): { rows: FeeBreakdownRow[]; totalInPaise: number } => {
  const rows: FeeBreakdownRow[] = [];
  if (clampPaise(fees.kitFeeInPaise) > 0) rows.push({ label: "Kit fee", amountInPaise: clampPaise(fees.kitFeeInPaise) });
  if (clampPaise(fees.booksFeeInPaise) > 0) rows.push({ label: "Books fee", amountInPaise: clampPaise(fees.booksFeeInPaise) });
  if (clampPaise(fees.uniformFeeInPaise) > 0) rows.push({ label: "Uniform fee", amountInPaise: clampPaise(fees.uniformFeeInPaise) });

  if (fees.studentType === "new") {
    if (fees.track === "term" && clampPaise(fees.termFeeInPaise) > 0) {
      rows.push({ label: "Course fee (full term)", amountInPaise: clampPaise(fees.termFeeInPaise) });
    }
    if (fees.track === "monthly" && clampPaise(fees.monthlyFeeInPaise) > 0) {
      rows.push({ label: "Pre-payment (first fee)", amountInPaise: clampPaise(fees.monthlyFeeInPaise) });
    }
  }

  const subtotal = rows.reduce((sum, row) => sum + row.amountInPaise, 0);
  const discount = Math.min(clampPaise(fees.discountInPaise), subtotal);
  if (discount > 0) rows.push({ label: "Discount", amountInPaise: -discount });

  return { rows, totalInPaise: Math.max(0, subtotal - discount) };
};

/** A zero-total onboarding needs no payment link — create the login directly. */
export const isPaymentFreeOnboarding = (fees: StudentFeeSetup): boolean =>
  buildFeeBreakdown(fees).totalInPaise <= 0;
