import type { Timestamp } from "firebase/firestore";
import type { CourseInstallmentPlan } from "@/lib/ecommerce/types";
import type { FeeEditChange } from "./feeMath";

// Re-export the pure fee-math helpers so consumers can import everything from
// "@/lib/classes" in one place.
export * from "./feeMath";

export type Gender = "male" | "female" | "other";
export type EnrollmentStatus = "pending" | "active" | "paused" | "cancelled";
export type FeeStatus = "pending" | "processing" | "paid" | "overdue" | "failed" | "waived";
export type FeePaymentMethod = "autopay" | "manual" | "cash" | "upi";
export type AutopayMethod = "upi" | "card" | "emandate";
export type MandateStatus = "created" | "authenticated" | "active" | "halted" | "cancelled";

// A class is either a recurring **monthly** fee (autopay / pay-monthly) or a
// one-off **term** course (pay-full / EMI installments). `feeType` records the
// *primary/default* track for a class and for backward compatibility; a class
// may now offer BOTH tracks (see `offersMonthly` / `offersTerm`), in which case
// the parent chooses which one at enrolment.
export type ClassFeeType = "monthly" | "term";

// A parent-chosen enrolment track for a class that offers both.
export type ClassTrack = "monthly" | "term";

// The four payment rails a parent can use. Which appear is admin-controlled per
// class and constrained by feeType (monthly → autopay/manual, term → full/emi).
export type ClassPaymentMethod = "autopay" | "manual" | "full" | "emi" | "cash";

// Admin toggles for which payment rails a class offers parents.
export interface ClassPaymentOptions {
  autopay: boolean; // monthly: recurring auto-debit
  manual: boolean;  // monthly: pay each month yourself
  full: boolean;    // term: pay the whole term fee once
  emi: boolean;     // term: split the term fee into installments
  cash: boolean;    // monthly: parent pays cash, admin collects offline
}

// Per-class EMI split. Mirrors EmiSettings (ecommerce) but scoped to one class.
export interface ClassEmiConfig {
  upfrontPercentage: number;        // e.g. 50 (paid now)
  installmentPercentages: number[]; // e.g. [25, 25] (each later)
  // Flat convenience fee (paise) added ONCE to the term total when a parent
  // chooses to pay by EMI instead of in one shot. 0 / undefined = no surcharge.
  emiSurchargeInPaise?: number;
}

// One link row of class content (a recorded-class video or a study material).
// Admin manages these in the Classes Manager; enrolled students see them in
// their portal class room. `url` may be a YouTube/Drive link or an uploaded
// Cloudinary file (PDFs).
export interface ClassContentLink {
  id: string;
  title: string;
  url: string;
}

// One bookable time slot. Admin can create several per class; parent picks one.
export interface ClassTimeSlot {
  id: string;
  days: string[];      // ["Mon","Wed","Fri"]
  start: string;       // "18:00" (24h)
  end: string;         // "19:00" (24h)
  label: string;       // composed display, e.g. "Mon–Fri · 6:00 PM – 7:00 PM"
  seatsTotal?: number; // capacity for this slot (optional = unlimited)
  seatsTaken?: number;
}

export const DEFAULT_CLASS_PAYMENT_OPTIONS: ClassPaymentOptions = {
  autopay: true,
  manual: true,
  full: false,
  emi: false,
  cash: false,
};

export const DEFAULT_CLASS_EMI_CONFIG: ClassEmiConfig = {
  upfrontPercentage: 50,
  installmentPercentages: [25, 25],
};

// 4.1 — class catalog (admin-managed). All money fields are paise (integer).
export interface ClassDoc {
  id: string;
  name: string;
  description?: string;
  image?: string;
  category?: string;
  facultyId?: string;
  facultyName?: string;
  schedule?: string;            // composed display string, e.g. "Mon–Fri · 6:00 PM – 7:00 PM"
  scheduleDays?: string[];      // ["Mon","Wed","Fri"]
  scheduleStart?: string;       // "18:00" (24h)
  scheduleEnd?: string;         // "19:00" (24h)
  ageGroup?: string;            // composed display string, e.g. "8–16 yrs"
  ageFrom?: number;
  ageTo?: number;
  monthlyFeeInPaise: number;
  autopayDiscountInPaise?: number; // flat ₹ discount for autopay (paise). 0 or undefined = no discount.
  billingDayOfMonth: number;
  active: boolean;
  razorpayPlanId?: string;
  seatsTotal?: number;
  seatsTaken?: number;
  // 4.1b — fee type + term-course fields. Legacy docs without `feeType` are
  // treated as "monthly" for backward compatibility.
  feeType: ClassFeeType;     // primary/default track (headline + legacy)
  // A class can expose one or both tracks. When absent, derived from feeType so
  // existing single-type classes keep working unchanged.
  offersMonthly?: boolean;   // monthly track available (autopay / pay-monthly / cash)
  offersTerm?: boolean;      // term track available (pay-full / EMI)
  termFeeInPaise?: number;   // total fee for the term track
  startDate?: string;        // "YYYY-MM-DD" (term track)
  endDate?: string;          // "YYYY-MM-DD" (term track)
  durationMonths?: number;   // derived from start/end (term track)
  // Pay-full offer: number of free months when a parent pays the whole term fee
  // upfront. e.g. a 4-month ₹8,000 course with 1 free month → pay ₹6,000.
  // 0 / undefined = no offer. Only applies to the "full" payment, not EMI.
  termFreeMonthsOnFullPayment?: number;
  // Explicit pay-full FINAL price (paise). When set (> 0 and < termFee) it
  // overrides the free-months calculation: users see price → final price and
  // the "You save ₹X" discount. 0 / undefined = fall back to free months.
  termPayFullPriceInPaise?: number;
  payment: ClassPaymentOptions;
  emi?: ClassEmiConfig;      // per-class EMI split (term + emi enabled)
  timeSlots?: ClassTimeSlot[];
  // Portal class-room content (req): the daily live-class link, past recorded
  // class links, and downloadable study materials (PDFs).
  liveClassUrl?: string;
  recordings?: ClassContentLink[];
  materials?: ClassContentLink[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface EnrollmentStudent {
  name: string;
  age: number;
  gender: Gender;
}

export interface EnrollmentParent {
  name: string;
  phone: string;
  whatsappNumber?: string;
  address: string;
}

export interface EnrollmentAutopay {
  enabled: boolean;
  method?: AutopayMethod;
  razorpaySubscriptionId?: string;
  razorpayCustomerId?: string;
  mandateStatus?: MandateStatus;
  nextChargeAt?: string;
  authorizedAt?: Timestamp;
  shortUrl?: string;
}

// 4.2 — one student enrolled in one class.
export interface EnrollmentDoc {
  id: string;
  student: EnrollmentStudent;
  parent: EnrollmentParent;
  parentUserId: string;
  classId: string;
  className: string;
  monthlyFeeInPaise: number;
  billingDayOfMonth: number;
  startMonthKey: string;
  status: EnrollmentStatus;
  autopay: EnrollmentAutopay;
  // The payment rail the parent chose at enrolment.
  paymentPlan?: ClassPaymentMethod;
  // Chosen time slot (when the class defines slots).
  slotId?: string;
  slotLabel?: string;
  // Term-course enrolment fields (feeType === "term").
  feeType?: ClassFeeType;
  termFeeInPaise?: number;
  // Term span copied from the class at enrolment so the parent's profile + fee
  // records can show "May to August" without re-fetching the class.
  termStartDate?: string; // "YYYY-MM-DD"
  termEndDate?: string;   // "YYYY-MM-DD"
  emi?: ClassEmiConfig;
  installmentPlan?: CourseInstallmentPlan; // when paymentPlan === "emi"
  // Admin-editable next charge/billing date (ISO "YYYY-MM-DD"). Shown to the
  // parent, included in messages, and surfaced in the fee-collection popup.
  nextChargeDate?: string;
  // The billed period (advance vs. arrears, see feeMath.computeBillingPeriod).
  // "YYYY-MM" keys — the first and last month this enrolment's fees cover.
  billingStartMonth?: string;
  billingEndMonth?: string;
  // Human label for the billed period, e.g. "May 2026" or "May to August".
  billingPeriodLabel?: string;
  // True once the parent has pre-paid the first cycle in advance at sign-up.
  advancePaid?: boolean;
  // Parent-declared enrolment status: a "new" student is not forced into autopay.
  studentStatus?: "new" | "existing";
  // Admin onboarded this student with the Razorpay/autopay option enabled — the
  // parent is invited to complete the recurring mandate from their portal (a
  // UPI/RBI mandate can only be authorized by the payer, not set up on their
  // behalf), so it surfaces an "Enable autopay" CTA in My Classes.
  autopayInvited?: boolean;
  // Admin-set metadata surfaced to the parent (Student Manager).
  joiningDate?: string;   // YYYY-MM-DD
  trainerName?: string;   // the class trainer/faculty
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface FeeReminderInfo {
  preDebitSentAt?: string;
  preDebitMonthKey?: string;
  // The calendar day ("YYYY-MM-DD") a reminder was last sent — guards the daily
  // countdown so the cron sends at most one reminder per day per fee.
  preDebitDateKey?: string;
  count?: number;
}

// 4.3 — the monthly ledger (one per student per month). Doc id =
// `${enrollmentId}_${monthKey}` for idempotency.
// One audit entry for an admin cash collection, its undo, or an admin edit of
// the fee's details (month/price/due date — req: the parent must be able to
// see what the admin changed). Timestamps are ISO strings (Firestore
// arrayUnion cannot hold serverTimestamp()).
export interface FeeCollectionEvent {
  action: "cash-collected" | "collection-undone" | "fee-edited";
  at: string;          // ISO timestamp
  by: string;          // admin uid
  amountInPaise: number;
  proofUrl?: string;
  note?: string;
  // "fee-edited" only: the before→after diff shown to admin AND parent.
  changes?: FeeEditChange[];
}

// One line of an itemized fee (the onboarding/admission payment stores the
// kit/books/uniform/pre-payment/discount split so parents see exactly what
// they paid for, not just one total). Negative amount = discount row.
export interface FeeBreakdownItem {
  label: string;
  amountInPaise: number;
}

export interface FeePaymentDoc {
  id: string;
  enrollmentId: string;
  classId: string;
  className: string;
  parentUserId: string;
  studentName: string;
  parentName: string;
  parentPhone: string;
  monthKey: string;
  periodLabel: string;
  amountInPaise: number;
  // The pre-discount amount, kept when a coupon reduces `amountInPaise` (req 2).
  originalAmountInPaise?: number;
  couponCode?: string;
  couponDiscountInPaise?: number;
  dueDate: string;
  status: FeeStatus;
  paymentMethod?: FeePaymentMethod;
  // The payment rail chosen at enrolment (autopay/manual/full/emi/cash) — drives
  // the advance-vs-arrears billing period and is shown in the admin popup.
  paymentPlan?: ClassPaymentMethod;
  // Chosen batch/time-slot, denormalized onto the fee doc so the admin popup +
  // parent dashboard always have it even if the enrolment can't be matched.
  slotId?: string;
  slotLabel?: string;
  // Billed period (see feeMath.computeBillingPeriod). "YYYY-MM" keys + a label
  // like "May 2026" or "May to August", and the next charge date ("YYYY-MM-DD").
  billingStartMonth?: string;
  billingEndMonth?: string;
  billingPeriodLabel?: string;
  nextChargeDate?: string;
  razorpaySubscriptionId?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  // Manual-UPI flow: the student's uploaded receipt + reference, pending admin
  // approval. When a UPI proof is submitted the fee sits at status "processing"
  // until an admin approves (→ paid) or rejects (→ back to pending).
  upiProofUrl?: string;
  upiRef?: string;
  upiSubmittedAt?: Timestamp;
  upiRejectedReason?: string;
  approvedBy?: string;
  approvedAt?: Timestamp;
  paidAt?: Timestamp;
  // NEW student's enrolment-time payment — shown as "Pre-payment" (req).
  prepayment?: boolean;
  // Itemized split of this payment (admission fees). Shown to parent + admin.
  breakdown?: FeeBreakdownItem[];
  // Admin cash collection (Fee Collections): required proof screenshot + a full
  // audit trail of collect/undo actions (undo keeps the record, per req).
  cashProofUrl?: string;
  collectedBy?: string;
  collectionHistory?: FeeCollectionEvent[];
  reminders?: FeeReminderInfo;
  notifiedParentAt?: Timestamp;
  notifiedAdminAt?: Timestamp;
  adminNote?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  pending: "Pending",
  active: "Active",
  paused: "Paused",
  cancelled: "Cancelled",
};

export const FEE_STATUS_LABELS: Record<FeeStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  paid: "Paid",
  overdue: "Overdue",
  failed: "Failed",
  waived: "Waived",
};

export const FEE_PAYMENT_METHOD_LABELS: Record<FeePaymentMethod, string> = {
  autopay: "Autopay",
  manual: "Manual",
  cash: "Cash",
  upi: "UPI",
};

export const MANDATE_STATUS_LABELS: Record<MandateStatus, string> = {
  created: "Created",
  authenticated: "Authenticated",
  active: "Active",
  halted: "Halted",
  cancelled: "Cancelled",
};

// RBI e-mandate AFA cap — true silent autopay only works at or below this.
export const AUTOPAY_AFA_CAP_IN_PAISE = 15_000_00;
