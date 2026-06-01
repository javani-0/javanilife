// ---------------------------------------------------------------------------
// Server-side fee-ledger helpers (Admin SDK). Shared by create-fee-order,
// the webhook, the cron, and api/classes/notify.
// ---------------------------------------------------------------------------
import { FieldValue } from "./firebase-admin.js";
import { buildFeePaymentId, clampBillingDay, dueDateFor, periodLabel } from "./class-fees.js";
import type { ClassFeeNotificationContext } from "./notify.js";

type Firestore = FirebaseFirestore.Firestore;

export const FEE_PAYMENTS_COLLECTION = "feePayments";
export const ENROLLMENTS_COLLECTION = "enrollments";

const getString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export interface EnrollmentRecord {
  id: string;
  parentUserId?: string;
  classId?: string;
  className?: string;
  monthlyFeeInPaise?: number;
  billingDayOfMonth?: number;
  status?: string;
  student?: { name?: string };
  parent?: { name?: string; phone?: string; whatsappNumber?: string; address?: string };
  autopay?: { razorpaySubscriptionId?: string };
}

export interface FeePaymentRecord {
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
  status: string;
  paymentMethod?: string;
  razorpaySubscriptionId?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  reminders?: { preDebitSentAt?: string; preDebitMonthKey?: string; count?: number };
}

/** Denormalized base fields for a fee doc derived from an enrollment + month. */
export const buildFeePaymentSeed = (enrollment: EnrollmentRecord, monthKey: string) => {
  const billingDay = clampBillingDay(toNumber(enrollment.billingDayOfMonth, 5));
  return {
    enrollmentId: enrollment.id,
    classId: getString(enrollment.classId),
    className: getString(enrollment.className),
    parentUserId: getString(enrollment.parentUserId),
    studentName: getString(enrollment.student?.name),
    parentName: getString(enrollment.parent?.name),
    parentPhone: getString(enrollment.parent?.whatsappNumber) || getString(enrollment.parent?.phone),
    monthKey,
    periodLabel: periodLabel(monthKey),
    amountInPaise: Math.max(0, Math.round(toNumber(enrollment.monthlyFeeInPaise))),
    dueDate: dueDateFor(monthKey, billingDay),
  };
};

/**
 * Ensure a fee doc exists for (enrollment, monthKey). Idempotent via the
 * deterministic doc id; never duplicates or overwrites an existing status.
 * Returns the loaded/created fee data plus whether it was created now.
 */
export const ensureFeePayment = async (
  db: Firestore,
  enrollment: EnrollmentRecord,
  monthKey: string,
): Promise<{ id: string; data: FirebaseFirestore.DocumentData; created: boolean }> => {
  const id = buildFeePaymentId(enrollment.id, monthKey);
  const ref = db.collection(FEE_PAYMENTS_COLLECTION).doc(id);
  const snapshot = await ref.get();

  if (snapshot.exists) {
    return { id, data: snapshot.data() || {}, created: false };
  }

  const seed = {
    ...buildFeePaymentSeed(enrollment, monthKey),
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(seed, { merge: true });
  return { id, data: seed, created: true };
};

/** Build the notification context from a stored fee doc. */
export const notificationContextFromFee = (
  feeId: string,
  fee: FirebaseFirestore.DocumentData,
): ClassFeeNotificationContext => ({
  feePaymentId: feeId,
  enrollmentId: getString(fee.enrollmentId),
  classId: getString(fee.classId),
  className: getString(fee.className),
  studentName: getString(fee.studentName),
  parentName: getString(fee.parentName),
  parentUserId: getString(fee.parentUserId),
  parentPhone: getString(fee.parentPhone),
  amountInPaise: Math.max(0, Math.round(toNumber(fee.amountInPaise))),
  monthLabel: getString(fee.periodLabel) || periodLabel(getString(fee.monthKey)),
  dueDate: getString(fee.dueDate),
});
