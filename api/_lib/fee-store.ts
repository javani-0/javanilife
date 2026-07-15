// ---------------------------------------------------------------------------
// Server-side fee-ledger helpers (Admin SDK). Shared by create-fee-order,
// the webhook, the cron, and api/classes/notify.
// ---------------------------------------------------------------------------
import { FieldValue } from "./firebase-admin.js";
import { buildFeePaymentId, clampBillingDay, computeBillingPeriodFromMonthKey, dueDateFor, periodLabel } from "./class-fees.js";
import type { ClassFeeNotificationContext } from "./notify.js";

type Firestore = FirebaseFirestore.Firestore;

export const FEE_PAYMENTS_COLLECTION = "feePayments";
export const ENROLLMENTS_COLLECTION = "enrollments";

const getString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export interface TermInstallment {
  installmentNumber: number;
  label?: string;
  percentage?: number;
  amountInPaise?: number;
  status?: string;
  dueDate?: string;
}

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
  // Term-course fields.
  feeType?: string;
  termFeeInPaise?: number;
  paymentPlan?: string;
  installmentPlan?: { installments?: TermInstallment[] };
  // Slot booking.
  slotId?: string;
  slotLabel?: string;
  seatCounted?: boolean;
  // Billed period + next charge (computed at enrolment; see class-fees.ts).
  billingStartMonth?: string;
  billingEndMonth?: string;
  billingPeriodLabel?: string;
  nextChargeDate?: string;
  // "new" | "existing" — a NEW student's first Pay Now is labelled "Pre-payment"
  // in history + WhatsApp (the fee doc gets prepayment: true).
  studentStatus?: string;
}

export const CLASSES_COLLECTION = "classes";

/** True when this enrollment is a one-off term course (not a recurring monthly class). */
export const isTermEnrollment = (enrollment: EnrollmentRecord): boolean => enrollment.feeType === "term";

/**
 * Count one seat for an enrolment exactly once (guarded by `seatCounted`).
 * Transactionally bumps the class-level seatsTaken and, when a slot was chosen,
 * that slot's seatsTaken. Best-effort: never throws into the caller.
 */
export const countSlotSeatOnce = async (db: Firestore, enrollmentId: string): Promise<void> => {
  try {
    await db.runTransaction(async (tx) => {
      const enrollmentRef = db.collection(ENROLLMENTS_COLLECTION).doc(enrollmentId);
      const enrollmentSnap = await tx.get(enrollmentRef);
      if (!enrollmentSnap.exists) return;
      const enrollment = enrollmentSnap.data() || {};
      if (enrollment.seatCounted === true) return; // already counted

      const classId = getString(enrollment.classId);
      const slotId = getString(enrollment.slotId);
      const updates: Record<string, unknown> = { seatCounted: true, updatedAt: FieldValue.serverTimestamp() };

      if (classId) {
        const classRef = db.collection(CLASSES_COLLECTION).doc(classId);
        const classSnap = await tx.get(classRef);
        if (classSnap.exists) {
          const classData = classSnap.data() || {};
          const classUpdates: Record<string, unknown> = {
            seatsTaken: Math.max(0, Math.round(toNumber(classData.seatsTaken))) + 1,
            updatedAt: FieldValue.serverTimestamp(),
          };
          if (slotId && Array.isArray(classData.timeSlots)) {
            classUpdates.timeSlots = classData.timeSlots.map((slot: Record<string, unknown>) =>
              getString(slot.id) === slotId
                ? { ...slot, seatsTaken: Math.max(0, Math.round(toNumber(slot.seatsTaken))) + 1 }
                : slot,
            );
          }
          tx.update(classRef, classUpdates);
        }
      }
      tx.update(enrollmentRef, updates);
    });
  } catch (error) {
    console.error("Seat count update failed", { enrollmentId, error });
  }
};

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

/**
 * Batch + payment-plan fields denormalized onto every fee doc so the admin
 * popup + parent dashboard always have the batch/plan even when the live
 * enrolment can't be matched (the original "batch missing for today's payments"
 * bug). `slotLabel` falls back to empty string (never undefined — Firestore
 * rejects undefined).
 */
const slotAndPlanFields = (enrollment: EnrollmentRecord) => ({
  paymentPlan: getString(enrollment.paymentPlan),
  slotId: getString(enrollment.slotId),
  slotLabel: getString(enrollment.slotLabel),
});

/** Denormalized base fields for a monthly fee doc derived from an enrollment + month. */
export const buildFeePaymentSeed = (enrollment: EnrollmentRecord, monthKey: string) => {
  const billingDay = clampBillingDay(toNumber(enrollment.billingDayOfMonth, 5));
  // Monthly fee → 1-month period, shifted to arrears unless it's the Advance Fee rail.
  const billing = computeBillingPeriodFromMonthKey(monthKey, enrollment.paymentPlan, 1);
  return {
    enrollmentId: enrollment.id,
    classId: getString(enrollment.classId),
    className: getString(enrollment.className),
    parentUserId: getString(enrollment.parentUserId),
    studentName: getString(enrollment.student?.name),
    parentName: getString(enrollment.parent?.name),
    parentPhone: getString(enrollment.parent?.whatsappNumber) || getString(enrollment.parent?.phone),
    ...slotAndPlanFields(enrollment),
    monthKey,
    // periodLabel reflects the *billed* month (arrears-shifted), shown to parents.
    periodLabel: billing.periodLabel,
    billingPeriodLabel: billing.periodLabel,
    billingStartMonth: billing.startMonthKey,
    billingEndMonth: billing.endMonthKey,
    nextChargeDate: dueDateFor(billing.nextChargeMonthKey, billingDay),
    amountInPaise: Math.max(0, Math.round(toNumber(enrollment.monthlyFeeInPaise))),
    // dueDate stays the *collection* month (when payment is expected).
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

/** Denormalized identity fields shared by every fee doc for an enrollment. */
const feeIdentity = (enrollment: EnrollmentRecord) => ({
  enrollmentId: enrollment.id,
  classId: getString(enrollment.classId),
  className: getString(enrollment.className),
  parentUserId: getString(enrollment.parentUserId),
  studentName: getString(enrollment.student?.name),
  parentName: getString(enrollment.parent?.name),
  parentPhone: getString(enrollment.parent?.whatsappNumber) || getString(enrollment.parent?.phone),
});

/**
 * Ensure a single non-monthly fee doc (deterministic id `${enrollmentId}_${suffix}`).
 * Used for term-course "pay full" and EMI installment docs. Idempotent.
 */
export const ensureCustomFeePayment = async (
  db: Firestore,
  enrollment: EnrollmentRecord,
  params: { suffix: string; amountInPaise: number; periodLabel: string; dueDate: string },
): Promise<{ id: string; data: FirebaseFirestore.DocumentData; created: boolean }> => {
  const id = `${enrollment.id}_${params.suffix}`;
  const ref = db.collection(FEE_PAYMENTS_COLLECTION).doc(id);
  const snapshot = await ref.get();
  if (snapshot.exists) return { id, data: snapshot.data() || {}, created: false };

  const monthKey = (params.dueDate || "").slice(0, 7);
  const seed = {
    ...feeIdentity(enrollment),
    ...slotAndPlanFields(enrollment),
    monthKey,
    periodLabel: params.periodLabel,
    // Term billed period ("May to August") + next charge were computed at enrolment.
    billingPeriodLabel: getString(enrollment.billingPeriodLabel),
    billingStartMonth: getString(enrollment.billingStartMonth),
    billingEndMonth: getString(enrollment.billingEndMonth),
    nextChargeDate: getString(enrollment.nextChargeDate),
    amountInPaise: Math.max(0, Math.round(toNumber(params.amountInPaise))),
    dueDate: params.dueDate,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(seed, { merge: true });
  return { id, data: seed, created: true };
};

/**
 * For an EMI term enrollment, ensure one fee doc per installment exists (pending).
 * Returns them ordered by installment number. Reads the schedule from the
 * enrollment's stored installmentPlan.
 */
export const ensureTermInstallmentFees = async (
  db: Firestore,
  enrollment: EnrollmentRecord,
): Promise<Array<{ installmentNumber: number; id: string }>> => {
  const installments = enrollment.installmentPlan?.installments || [];
  const results: Array<{ installmentNumber: number; id: string }> = [];
  for (const installment of installments) {
    const number = Math.round(toNumber(installment.installmentNumber, 0));
    if (number <= 0) continue;
    const { id } = await ensureCustomFeePayment(db, enrollment, {
      suffix: `emi-${number}`,
      amountInPaise: Math.max(0, Math.round(toNumber(installment.amountInPaise))),
      periodLabel: getString(installment.label) || `Installment ${number}`,
      dueDate: getString(installment.dueDate),
    });
    results.push({ installmentNumber: number, id });
  }
  return results;
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
  // Enriched payment details (batch + billed period + next charge) for the
  // post-payment message + web push (client-confirmed: in-app + push now).
  slotLabel: getString(fee.slotLabel),
  billingPeriodLabel: getString(fee.billingPeriodLabel) || getString(fee.periodLabel),
  nextChargeDate: getString(fee.nextChargeDate),
});
