import type { Timestamp } from "firebase/firestore";
import type { CourseInstallmentPlan } from "@/lib/ecommerce/types";

// Re-export the pure fee-math helpers so consumers can import everything from
// "@/lib/classes" in one place.
export * from "./feeMath";

export type Gender = "male" | "female" | "other";
export type EnrollmentStatus = "pending" | "active" | "paused" | "cancelled";
export type FeeStatus = "pending" | "processing" | "paid" | "overdue" | "failed" | "waived";
export type FeePaymentMethod = "autopay" | "manual" | "cash";
export type AutopayMethod = "upi" | "card" | "emandate";
export type MandateStatus = "created" | "authenticated" | "active" | "halted" | "cancelled";

// A class is either a recurring **monthly** fee (autopay / pay-monthly) or a
// one-off **term** course (pay-full / EMI installments). Admin picks at creation.
export type ClassFeeType = "monthly" | "term";

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
  feeType: ClassFeeType;
  termFeeInPaise?: number;   // total fee for a term course (term only)
  startDate?: string;        // "YYYY-MM-DD" (term only)
  endDate?: string;          // "YYYY-MM-DD" (term only)
  durationMonths?: number;   // derived from start/end (term only)
  payment: ClassPaymentOptions;
  emi?: ClassEmiConfig;      // per-class EMI split (term + emi enabled)
  timeSlots?: ClassTimeSlot[];
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
  emi?: ClassEmiConfig;
  installmentPlan?: CourseInstallmentPlan; // when paymentPlan === "emi"
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface FeeReminderInfo {
  preDebitSentAt?: string;
  preDebitMonthKey?: string;
  count?: number;
}

// 4.3 — the monthly ledger (one per student per month). Doc id =
// `${enrollmentId}_${monthKey}` for idempotency.
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
  dueDate: string;
  status: FeeStatus;
  paymentMethod?: FeePaymentMethod;
  razorpaySubscriptionId?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  paidAt?: Timestamp;
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
