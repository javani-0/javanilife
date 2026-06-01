import type { Timestamp } from "firebase/firestore";

// Re-export the pure fee-math helpers so consumers can import everything from
// "@/lib/classes" in one place.
export * from "./feeMath";

export type Gender = "male" | "female" | "other";
export type EnrollmentStatus = "pending" | "active" | "paused" | "cancelled";
export type FeeStatus = "pending" | "processing" | "paid" | "overdue" | "failed" | "waived";
export type FeePaymentMethod = "autopay" | "manual" | "cash";
export type AutopayMethod = "upi" | "card" | "emandate";
export type MandateStatus = "created" | "authenticated" | "active" | "halted" | "cancelled";

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
  billingDayOfMonth: number;
  active: boolean;
  razorpayPlanId?: string;
  seatsTotal?: number;
  seatsTaken?: number;
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
