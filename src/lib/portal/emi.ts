import { deriveDisplayFeeStatus, isFeePayable, type FeePaymentDoc } from "@/lib/classes";

// ---------------------------------------------------------------------------
// Class-fee EMI (req 5).
//
// There are TWO unrelated EMI systems in this app:
//   1. e-commerce course orders  → `orders/{id}.payment.installmentPlan`
//   2. CLASS fees (this module)  → `feePayments/${enrollmentId}_emi-N`
//
// The EMI Payments page only ever read (1), so the six students on a class EMI
// plan saw "No EMI Orders Found" while their installments rendered on the
// Classes tab instead. Both screens now derive everything from here, so they
// cannot disagree about what is paid.
//
// Approval (api/_razorpay/approve-onboarding.ts) creates one
// `${enrollmentId}_emi-N` doc per installment: #1 paid on the admission link,
// the rest pending.
// ---------------------------------------------------------------------------

const EMI_ID_PATTERN = /_emi-(\d+)$/;

/** An EMI fee — by its deterministic installment id, or by its payment rail. */
export const isEmiFee = (fee: Pick<FeePaymentDoc, "id" | "paymentPlan">): boolean =>
  EMI_ID_PATTERN.test(fee.id) || fee.paymentPlan === "emi";

/**
 * Specifically a numbered installment doc. Narrower than `isEmiFee`: an
 * enrolment on the EMI rail also has ordinary monthly docs, and those are not
 * part of the installment schedule.
 */
export const isEmiInstallment = (fee: Pick<FeePaymentDoc, "id">): boolean => EMI_ID_PATTERN.test(fee.id);

/** The installment number in the doc id, or 0 when the id carries none. */
export const emiInstallmentNumber = (fee: Pick<FeePaymentDoc, "id">): number =>
  Number(EMI_ID_PATTERN.exec(fee.id)?.[1] || 0);

/**
 * Every installment doc for an enrolment, in schedule order. Sorted NUMERICALLY
 * so installment 10 follows 9 rather than sorting between 1 and 2.
 */
export const emiInstallmentsOf = (fees: FeePaymentDoc[]): FeePaymentDoc[] =>
  (fees || [])
    .filter((fee) => EMI_ID_PATTERN.test(fee.id))
    .sort((a, b) => emiInstallmentNumber(a) - emiInstallmentNumber(b));

/**
 * Whether these fees represent a real installment PLAN. A single `_emi-1` doc
 * is just the admission payment, not a schedule worth its own screen.
 */
export const hasEmiPlan = (fees: FeePaymentDoc[]): boolean => emiInstallmentsOf(fees).length >= 2;

export interface EmiPlanSummary {
  installments: FeePaymentDoc[];
  totalInPaise: number;
  paidInPaise: number;
  remainingInPaise: number;
  paidCount: number;
  pendingCount: number;
  processingCount: number;
  overdueCount: number;
  /** The earliest installment the student can pay right now, or null. */
  nextDue: FeePaymentDoc | null;
  /** Nothing left to collect — every installment is paid or waived. */
  complete: boolean;
}

const EMPTY: EmiPlanSummary = {
  installments: [],
  totalInPaise: 0,
  paidInPaise: 0,
  remainingInPaise: 0,
  paidCount: 0,
  pendingCount: 0,
  processingCount: 0,
  overdueCount: 0,
  nextDue: null,
  complete: false,
};

/**
 * The state of one enrolment's installment plan.
 *
 * A `waived` installment is SETTLED (the office wrote it off), so it clears
 * from the outstanding total exactly like a paid one. A `processing` one is a
 * UPI proof waiting on admin approval — the money is gone from the parent's
 * account, so it is neither settled nor payable again.
 */
export const summarizeEmiPlan = (fees: FeePaymentDoc[], now: Date = new Date()): EmiPlanSummary => {
  const installments = emiInstallmentsOf(fees);
  if (installments.length === 0) return { ...EMPTY };

  let totalInPaise = 0;
  let paidInPaise = 0;
  let remainingInPaise = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let processingCount = 0;
  let overdueCount = 0;
  let nextDue: FeePaymentDoc | null = null;

  for (const fee of installments) {
    const status = deriveDisplayFeeStatus(fee, now);
    totalInPaise += fee.amountInPaise;

    if (status === "paid") {
      paidInPaise += fee.amountInPaise;
      paidCount += 1;
      continue;
    }
    if (status === "waived") continue;

    remainingInPaise += fee.amountInPaise;
    if (status === "processing") { processingCount += 1; continue; }
    if (status === "overdue") overdueCount += 1;
    pendingCount += 1;
    if (!nextDue && isFeePayable({ status })) nextDue = fee;
  }

  return {
    installments,
    totalInPaise,
    paidInPaise,
    remainingInPaise,
    paidCount,
    pendingCount,
    processingCount,
    overdueCount,
    nextDue,
    complete: remainingInPaise === 0,
  };
};

/**
 * Razorpay is only the rail when the admin actually offered it. Student-Manager
 * EMI students pay each installment on the manual UPI rail, the same way they
 * paid the first one on the admission link.
 */
export const emiUsesRazorpay = (enrollment: { autopayInvited?: boolean }): boolean =>
  enrollment.autopayInvited === true;
