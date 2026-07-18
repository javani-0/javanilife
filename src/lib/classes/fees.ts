import {
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import {
  addMonths,
  buildFeePaymentId,
  clampBillingDay,
  computeBillingPeriodFromMonthKey,
  computeFeeEditChanges,
  dueDateFor,
  isOverdue,
  nextFeePeriodLabel,
  periodLabel as periodLabelFor,
  type EnrollmentDoc,
  type FeeBreakdownItem,
  type FeeCollectionEvent,
  type FeePaymentDoc,
  type FeePaymentMethod,
  type FeeStatus,
} from "./types";

export const FEE_PAYMENTS_COLLECTION = "feePayments";

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizeFeePayment = (id: string, data: DocumentData = {}): FeePaymentDoc => {
  const monthKey = typeof data.monthKey === "string" ? data.monthKey : "";
  return {
    id,
    enrollmentId: typeof data.enrollmentId === "string" ? data.enrollmentId : "",
    classId: typeof data.classId === "string" ? data.classId : "",
    className: typeof data.className === "string" ? data.className : "",
    parentUserId: typeof data.parentUserId === "string" ? data.parentUserId : "",
    studentName: typeof data.studentName === "string" ? data.studentName : "",
    parentName: typeof data.parentName === "string" ? data.parentName : "",
    parentPhone: typeof data.parentPhone === "string" ? data.parentPhone : "",
    monthKey,
    periodLabel: typeof data.periodLabel === "string" && data.periodLabel ? data.periodLabel : periodLabelFor(monthKey),
    amountInPaise: Math.max(0, Math.round(toNumber(data.amountInPaise))),
    originalAmountInPaise: data.originalAmountInPaise != null ? Math.max(0, Math.round(toNumber(data.originalAmountInPaise))) : undefined,
    couponCode: typeof data.couponCode === "string" ? data.couponCode : undefined,
    couponDiscountInPaise: data.couponDiscountInPaise != null ? Math.max(0, Math.round(toNumber(data.couponDiscountInPaise))) : undefined,
    dueDate: typeof data.dueDate === "string" ? data.dueDate : "",
    status: (data.status as FeeStatus) || "pending",
    paymentMethod: data.paymentMethod as FeePaymentMethod | undefined,
    paymentPlan: typeof data.paymentPlan === "string" ? (data.paymentPlan as FeePaymentDoc["paymentPlan"]) : undefined,
    slotId: typeof data.slotId === "string" ? data.slotId : undefined,
    slotLabel: typeof data.slotLabel === "string" ? data.slotLabel : undefined,
    billingStartMonth: typeof data.billingStartMonth === "string" ? data.billingStartMonth : undefined,
    billingEndMonth: typeof data.billingEndMonth === "string" ? data.billingEndMonth : undefined,
    billingPeriodLabel: typeof data.billingPeriodLabel === "string" ? data.billingPeriodLabel : undefined,
    nextChargeDate: typeof data.nextChargeDate === "string" ? data.nextChargeDate : undefined,
    razorpaySubscriptionId: data.razorpaySubscriptionId,
    razorpayOrderId: data.razorpayOrderId,
    razorpayPaymentId: data.razorpayPaymentId,
    upiProofUrl: typeof data.upiProofUrl === "string" ? data.upiProofUrl : undefined,
    upiRef: typeof data.upiRef === "string" ? data.upiRef : undefined,
    upiSubmittedAt: data.upiSubmittedAt,
    upiRejectedReason: typeof data.upiRejectedReason === "string" ? data.upiRejectedReason : undefined,
    approvedBy: typeof data.approvedBy === "string" ? data.approvedBy : undefined,
    approvedAt: data.approvedAt,
    paidAt: data.paidAt,
    prepayment: data.prepayment === true,
    breakdown: Array.isArray(data.breakdown)
      ? data.breakdown
          .map((row: DocumentData): FeeBreakdownItem => ({
            label: typeof row?.label === "string" ? row.label : "",
            amountInPaise: Math.round(toNumber(row?.amountInPaise)),
          }))
          .filter((row) => row.label)
      : undefined,
    cashProofUrl: typeof data.cashProofUrl === "string" ? data.cashProofUrl : undefined,
    collectedBy: typeof data.collectedBy === "string" ? data.collectedBy : undefined,
    collectionHistory: Array.isArray(data.collectionHistory) ? data.collectionHistory : undefined,
    reminders: data.reminders,
    notifiedParentAt: data.notifiedParentAt,
    notifiedAdminAt: data.notifiedAdminAt,
    adminNote: typeof data.adminNote === "string" ? data.adminNote : "",
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};

/**
 * The status to display to a user: a still-"pending" fee whose due date has
 * passed reads as "overdue" even if the cron hasn't flipped it yet.
 */
export const deriveDisplayFeeStatus = (fee: Pick<FeePaymentDoc, "status" | "dueDate">, now: Date = new Date()): FeeStatus => {
  if (fee.status === "pending" && fee.dueDate && isOverdue(fee.dueDate, now)) return "overdue";
  return fee.status;
};

export const isFeePayable = (fee: Pick<FeePaymentDoc, "status">): boolean => (
  fee.status === "pending" || fee.status === "overdue" || fee.status === "failed"
);

export const formatFeeAmount = (fee: Pick<FeePaymentDoc, "amountInPaise">): string => formatPaiseAsRupees(fee.amountInPaise);

export const sortFeesByMonthDesc = <T extends Pick<FeePaymentDoc, "monthKey">>(fees: T[]): T[] => (
  [...fees].sort((a, b) => (b.monthKey || "").localeCompare(a.monthKey || ""))
);

export const subscribeToMyFees = (
  uid: string,
  onChange: (fees: FeePaymentDoc[]) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  query(collection(db, FEE_PAYMENTS_COLLECTION), where("parentUserId", "==", uid)),
  (snapshot) => onChange(sortFeesByMonthDesc(snapshot.docs.map((feeDoc) => normalizeFeePayment(feeDoc.id, feeDoc.data())))),
  (error) => onError?.(error),
);

export const listMyFees = async (uid: string): Promise<FeePaymentDoc[]> => {
  const snapshot = await getDocs(query(collection(db, FEE_PAYMENTS_COLLECTION), where("parentUserId", "==", uid)));
  return sortFeesByMonthDesc(snapshot.docs.map((feeDoc) => normalizeFeePayment(feeDoc.id, feeDoc.data())));
};

/**
 * Admin view for one billing month. Queries by `monthKey` equality (single
 * field — no composite index needed) and filters class/status client-side.
 */
export const subscribeToFeesAdmin = (
  monthKey: string,
  onChange: (fees: FeePaymentDoc[]) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  query(collection(db, FEE_PAYMENTS_COLLECTION), where("monthKey", "==", monthKey)),
  (snapshot) => onChange(snapshot.docs.map((feeDoc) => normalizeFeePayment(feeDoc.id, feeDoc.data()))),
  (error) => onError?.(error),
);

export const listFeesAdmin = async (monthKey: string): Promise<FeePaymentDoc[]> => {
  const snapshot = await getDocs(query(collection(db, FEE_PAYMENTS_COLLECTION), where("monthKey", "==", monthKey)));
  return snapshot.docs.map((feeDoc) => normalizeFeePayment(feeDoc.id, feeDoc.data()));
};

/** Every fee record for one enrolment (admin or owner) — the full payment history. */
export const listFeesForEnrollment = async (enrollmentId: string): Promise<FeePaymentDoc[]> => {
  const snapshot = await getDocs(query(collection(db, FEE_PAYMENTS_COLLECTION), where("enrollmentId", "==", enrollmentId)));
  return sortFeesByMonthDesc(snapshot.docs.map((feeDoc) => normalizeFeePayment(feeDoc.id, feeDoc.data())));
};

/**
 * Admin: create the pending fee due for (enrollment, monthKey) if it doesn't
 * exist yet. Client mirror of the server cron's roll-forward (api/_lib/fee-store
 * buildFeePaymentSeed) with the same deterministic id, so the two never
 * duplicate. Lets the Fee Collections page self-heal when the cron hasn't run:
 * every active monthly student gets their month's due row (and therefore
 * appears in Pending totals and receives the daily WhatsApp reminders).
 * Returns true when a doc was created, false when it already existed.
 */
/**
 * FIXED STRUCTURE (client-confirmed): a NEW student's enrolment payment is a
 * standalone "Pre-payment" (not any month's fee); their monthly fees bill in
 * ARREARS — June's fee is due on July's billing day. Mirrors the server's
 * isPrepaymentEnrollment in api/_lib/fee-store.ts — keep in sync.
 */
export const isPrepaymentEnrollment = (
  enrollment: Pick<EnrollmentDoc, "paymentPlan" | "studentStatus" | "feeType">,
): boolean =>
  enrollment.paymentPlan === "manual" && enrollment.studentStatus === "new" && enrollment.feeType !== "term";

export const ensureMonthlyDueFee = async (
  enrollment: Pick<
    EnrollmentDoc,
    "id" | "classId" | "className" | "parentUserId" | "student" | "parent" | "monthlyFeeInPaise" | "billingDayOfMonth" | "paymentPlan" | "slotId" | "slotLabel" | "studentStatus" | "feeType" | "startMonthKey"
  >,
  monthKey: string,
): Promise<boolean> => {
  // Prepayment enrolments: never create a due for the joining month or earlier
  // (their first collectable month is the one AFTER joining, billed in arrears).
  if (isPrepaymentEnrollment(enrollment) && monthKey <= (enrollment.startMonthKey || "")) return false;

  const id = buildFeePaymentId(enrollment.id, monthKey);
  const ref = doc(db, FEE_PAYMENTS_COLLECTION, id);
  const existing = await getDoc(ref);
  if (existing.exists()) return false;

  const billingDay = clampBillingDay(enrollment.billingDayOfMonth);
  const billingMethod = isPrepaymentEnrollment(enrollment) ? "arrears" : enrollment.paymentPlan;
  const billing = computeBillingPeriodFromMonthKey(monthKey, billingMethod, 1);
  await setDoc(ref, {
    enrollmentId: enrollment.id,
    classId: enrollment.classId || "",
    className: enrollment.className || "",
    parentUserId: enrollment.parentUserId || "",
    studentName: enrollment.student?.name || "",
    parentName: enrollment.parent?.name || "",
    parentPhone: enrollment.parent?.whatsappNumber || enrollment.parent?.phone || "",
    paymentPlan: enrollment.paymentPlan || "",
    slotId: enrollment.slotId || "",
    slotLabel: enrollment.slotLabel || "",
    monthKey,
    periodLabel: billing.periodLabel,
    billingPeriodLabel: billing.periodLabel,
    billingStartMonth: billing.startMonthKey,
    billingEndMonth: billing.endMonthKey,
    nextChargeDate: dueDateFor(billing.nextChargeMonthKey, billingDay),
    amountInPaise: Math.max(0, Math.round(enrollment.monthlyFeeInPaise || 0)),
    dueDate: dueDateFor(monthKey, billingDay),
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return true;
};

/**
 * Admin: live queue of manual-UPI payments awaiting approval. Queries the single
 * `status == "processing"` field (no composite index) and filters to the UPI
 * rail client-side. Ordered newest submission first.
 */
export const subscribeToPendingUpiApprovals = (
  onChange: (fees: FeePaymentDoc[]) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  query(collection(db, FEE_PAYMENTS_COLLECTION), where("status", "==", "processing")),
  (snapshot) => {
    const fees = snapshot.docs
      .map((feeDoc) => normalizeFeePayment(feeDoc.id, feeDoc.data()))
      .filter((fee) => fee.paymentMethod === "upi" && Boolean(fee.upiProofUrl));
    onChange(fees);
  },
  (error) => onError?.(error),
);

/** Admin: record an offline cash payment against a month. */
export const markFeeCash = async (feeId: string, adminNote?: string): Promise<void> => {
  await updateDoc(doc(db, FEE_PAYMENTS_COLLECTION, feeId), {
    status: "paid",
    paymentMethod: "cash",
    paidAt: serverTimestamp(),
    ...(adminNote ? { adminNote } : {}),
    updatedAt: serverTimestamp(),
  });
};

/**
 * Admin: full fee edit (req) — amount, due date (past/present/future), billed
 * month, and the Pre-payment/Regular label. Changing the month rewrites the
 * period label; the Pre-payment suffix follows the toggle. Every edit that
 * actually changes something is appended to `collectionHistory` as a
 * "fee-edited" audit event, so both the admin popups and the parent's own
 * dashboard show what was changed, by whom, and when (req). NOTE: fee doc ids
 * are `${enrollmentId}_${monthKey}` — moving a fee to another month keeps the
 * old id, so the ledger self-heal may regenerate a pending due for the
 * original month (waive it if the student shouldn't pay it).
 */
export const updateFeeDetails = async (
  fee: Pick<FeePaymentDoc, "id" | "periodLabel" | "monthKey" | "amountInPaise" | "dueDate">,
  params: { amountInPaise: number; dueDate: string; monthKey?: string; prepayment: boolean; adminUid?: string },
): Promise<void> => {
  const periodLabel = nextFeePeriodLabel(fee, params);
  const changes = computeFeeEditChanges(fee, params);
  await updateDoc(doc(db, FEE_PAYMENTS_COLLECTION, fee.id), {
    amountInPaise: Math.max(100, Math.round(params.amountInPaise)),
    dueDate: params.dueDate || "",
    ...(params.monthKey && /^\d{4}-\d{2}$/.test(params.monthKey) ? { monthKey: params.monthKey } : {}),
    periodLabel,
    prepayment: params.prepayment,
    ...(changes.length > 0 ? {
      collectionHistory: arrayUnion({
        action: "fee-edited",
        at: new Date().toISOString(),
        by: params.adminUid || "",
        amountInPaise: Math.max(100, Math.round(params.amountInPaise)),
        changes,
      } satisfies FeeCollectionEvent),
    } : {}),
    updatedAt: serverTimestamp(),
  });
};

/**
 * Admin: collect a fee in cash with an editable amount + REQUIRED proof
 * screenshot (req). Appends a "cash-collected" entry to the audit trail so the
 * collection (and any later undo) stays in the record forever.
 */
export const collectFeeCash = async (
  feeId: string,
  params: { amountInPaise: number; proofUrl: string; adminUid: string },
): Promise<void> => {
  const amountInPaise = Math.max(100, Math.round(params.amountInPaise));
  await updateDoc(doc(db, FEE_PAYMENTS_COLLECTION, feeId), {
    status: "paid",
    paymentMethod: "cash",
    amountInPaise,
    cashProofUrl: params.proofUrl,
    collectedBy: params.adminUid,
    paidAt: serverTimestamp(),
    collectionHistory: arrayUnion({
      action: "cash-collected",
      at: new Date().toISOString(),
      by: params.adminUid,
      amountInPaise,
      proofUrl: params.proofUrl,
    } satisfies FeeCollectionEvent),
    updatedAt: serverTimestamp(),
  });
};

/** "2026-07-18" → a Timestamp anchored at noon (avoids timezone day-shift). */
const paidOnTimestamp = (dateStr: string): Timestamp => {
  const parsed = new Date(`${dateStr}T12:00:00`);
  return Timestamp.fromDate(Number.isNaN(parsed.getTime()) ? new Date() : parsed);
};

/**
 * Admin (Student Manager fee tab, req): record a fee payment for a specific
 * month — "fee month | fee ₹ | fee date (default today, editable)". The admin
 * picks the month the fee is FOR; this maps it to the correct ledger doc id
 * (arrears-billed enrolments collect month M's fee in month M+1) so the cron /
 * self-heal never create a duplicate due for the same month. If the doc already
 * exists (a pending due) it's marked paid instead. Returns the fee doc id.
 */
type FeeEntryEnrollment = Pick<
  EnrollmentDoc,
  "id" | "classId" | "className" | "parentUserId" | "student" | "parent" | "monthlyFeeInPaise" | "billingDayOfMonth" | "paymentPlan" | "slotId" | "slotLabel" | "studentStatus" | "feeType" | "startMonthKey"
>;

/**
 * The ledger doc month that carries the fee OF `feeMonthKey` for this
 * enrolment: advance billing (existing manual students) collects month M's fee
 * in M; every arrears rail collects it in M+1. Shared by the entry forms so
 * the duplicate-month guard and the write always agree.
 */
export const feeDocMonthKeyFor = (
  enrollment: Pick<EnrollmentDoc, "paymentPlan" | "studentStatus" | "feeType">,
  feeMonthKey: string,
): string => {
  const billingMethod = isPrepaymentEnrollment(enrollment) ? "arrears" : (enrollment.paymentPlan === "manual" ? "manual" : "arrears");
  return billingMethod === "manual" ? feeMonthKey : addMonths(feeMonthKey, 1);
};

export const recordFeeForMonth = async (
  enrollment: FeeEntryEnrollment,
  params: { feeMonthKey: string; amountInPaise: number; paidOn: string; method?: FeePaymentMethod; adminUid: string },
): Promise<string> => {
  const billingMethod = isPrepaymentEnrollment(enrollment) ? "arrears" : (enrollment.paymentPlan === "manual" ? "manual" : "arrears");
  const docMonthKey = feeDocMonthKeyFor(enrollment, params.feeMonthKey);
  const id = buildFeePaymentId(enrollment.id, docMonthKey);
  const ref = doc(db, FEE_PAYMENTS_COLLECTION, id);
  const amountInPaise = Math.max(100, Math.round(params.amountInPaise));
  const method: FeePaymentMethod = params.method || "cash";
  const paidAt = paidOnTimestamp(params.paidOn);
  const audit: FeeCollectionEvent = {
    action: "cash-collected",
    at: new Date().toISOString(),
    by: params.adminUid,
    amountInPaise,
    note: `Fee entry added by admin for ${periodLabelFor(params.feeMonthKey)}`,
  };

  const existing = await getDoc(ref);
  // Guard (req): never silently double-collect a month that's already settled.
  if (existing.exists() && existing.data()?.status === "paid") {
    throw new Error(`${periodLabelFor(params.feeMonthKey)} fee is already paid. Use Edit on that entry instead.`);
  }
  if (existing.exists() && existing.data()?.status === "waived") {
    throw new Error(`${periodLabelFor(params.feeMonthKey)} was waived. Delete the waived record first if you want to collect it.`);
  }
  if (existing.exists()) {
    await updateDoc(ref, {
      status: "paid",
      paymentMethod: method,
      amountInPaise,
      paidAt,
      collectionHistory: arrayUnion(audit),
      updatedAt: serverTimestamp(),
    });
    return id;
  }

  const billingDay = clampBillingDay(enrollment.billingDayOfMonth);
  const billing = computeBillingPeriodFromMonthKey(docMonthKey, billingMethod, 1);
  await setDoc(ref, {
    enrollmentId: enrollment.id,
    classId: enrollment.classId || "",
    className: enrollment.className || "",
    parentUserId: enrollment.parentUserId || "",
    studentName: enrollment.student?.name || "",
    parentName: enrollment.parent?.name || "",
    parentPhone: enrollment.parent?.whatsappNumber || enrollment.parent?.phone || "",
    paymentPlan: enrollment.paymentPlan || "",
    slotId: enrollment.slotId || "",
    slotLabel: enrollment.slotLabel || "",
    monthKey: docMonthKey,
    periodLabel: billing.periodLabel,
    billingPeriodLabel: billing.periodLabel,
    billingStartMonth: billing.startMonthKey,
    billingEndMonth: billing.endMonthKey,
    nextChargeDate: dueDateFor(billing.nextChargeMonthKey, billingDay),
    amountInPaise,
    dueDate: params.paidOn || dueDateFor(docMonthKey, billingDay),
    status: "paid",
    paymentMethod: method,
    paidAt,
    collectedBy: params.adminUid,
    collectionHistory: [audit],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
};

/**
 * Admin: mark an existing fee row paid with an editable amount, paid-on date
 * and method (Student Manager fee tab). Audit-trailed like cash collection.
 */
export const markFeePaidWithDate = async (
  feeId: string,
  params: { amountInPaise: number; paidOn: string; method?: FeePaymentMethod; adminUid: string },
): Promise<void> => {
  const amountInPaise = Math.max(100, Math.round(params.amountInPaise));
  await updateDoc(doc(db, FEE_PAYMENTS_COLLECTION, feeId), {
    status: "paid",
    paymentMethod: params.method || "cash",
    amountInPaise,
    paidAt: paidOnTimestamp(params.paidOn),
    collectedBy: params.adminUid,
    collectionHistory: arrayUnion({
      action: "cash-collected",
      at: new Date().toISOString(),
      by: params.adminUid,
      amountInPaise,
      note: "Marked paid by admin",
    } satisfies FeeCollectionEvent),
    updatedAt: serverTimestamp(),
  });
};

/**
 * Admin: undo a mistaken cash collection. The fee returns to "pending" but the
 * original collection AND this undo both stay in `collectionHistory` (req).
 */
export const undoFeeCollection = async (
  feeId: string,
  params: { adminUid: string; amountInPaise: number; note?: string },
): Promise<void> => {
  await updateDoc(doc(db, FEE_PAYMENTS_COLLECTION, feeId), {
    status: "pending",
    paidAt: deleteField(),
    cashProofUrl: deleteField(),
    collectedBy: deleteField(),
    collectionHistory: arrayUnion({
      action: "collection-undone",
      at: new Date().toISOString(),
      by: params.adminUid,
      amountInPaise: Math.max(0, Math.round(params.amountInPaise)),
      ...(params.note ? { note: params.note } : {}),
    } satisfies FeeCollectionEvent),
    updatedAt: serverTimestamp(),
  });
};

/** Admin: waive a month so it stops showing as due/overdue. */
export const waiveFee = async (feeId: string, adminNote?: string): Promise<void> => {
  await updateDoc(doc(db, FEE_PAYMENTS_COLLECTION, feeId), {
    status: "waived",
    ...(adminNote ? { adminNote } : {}),
    updatedAt: serverTimestamp(),
  });
};

/** Admin: delete a fee record. */
export const deleteFee = async (feeId: string): Promise<void> => {
  await deleteDoc(doc(db, FEE_PAYMENTS_COLLECTION, feeId));
};

/**
 * Admin: record a one-off paid fee for an enrolment (e.g. correcting a term
 * full payment that came in outside the app). Writes/merges a paid fee doc with
 * a stable id so re-running is idempotent. `suffix` keys the doc — "full" for a
 * full course payment, "advance" for a pre-paid first cycle.
 */
export const recordManualPaidFee = async (
  enrollment: Pick<EnrollmentDoc, "id" | "classId" | "className" | "parentUserId" | "student" | "parent">,
  params: { amountInPaise: number; suffix?: string; periodLabel?: string; paymentMethod?: FeePaymentMethod },
): Promise<string> => {
  const suffix = params.suffix || "full";
  const id = `${enrollment.id}_${suffix}`;
  const monthKey = new Date().toISOString().slice(0, 7);
  await setDoc(doc(db, FEE_PAYMENTS_COLLECTION, id), {
    enrollmentId: enrollment.id,
    classId: enrollment.classId || "",
    className: enrollment.className || "",
    parentUserId: enrollment.parentUserId || "",
    studentName: enrollment.student?.name || "",
    parentName: enrollment.parent?.name || "",
    parentPhone: enrollment.parent?.phone || "",
    monthKey,
    periodLabel: params.periodLabel || "Full course fee",
    amountInPaise: Math.max(0, Math.round(params.amountInPaise)),
    dueDate: `${monthKey}-01`,
    status: "paid",
    paymentMethod: params.paymentMethod || "manual",
    paidAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return id;
};

export interface FeeTotals {
  collectedInPaise: number;
  pendingInPaise: number;
  overdueInPaise: number;
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
  failedCount: number;
  waivedCount: number;
  total: number;
}

/** Roll up a month's fee docs into the admin summary tiles. */
export const summarizeFees = (fees: FeePaymentDoc[], now: Date = new Date()): FeeTotals => {
  const totals: FeeTotals = {
    collectedInPaise: 0,
    pendingInPaise: 0,
    overdueInPaise: 0,
    paidCount: 0,
    pendingCount: 0,
    overdueCount: 0,
    failedCount: 0,
    waivedCount: 0,
    total: fees.length,
  };

  for (const fee of fees) {
    const status = deriveDisplayFeeStatus(fee, now);
    if (status === "paid") {
      totals.collectedInPaise += fee.amountInPaise;
      totals.paidCount += 1;
    } else if (status === "overdue") {
      totals.overdueInPaise += fee.amountInPaise;
      totals.overdueCount += 1;
    } else if (status === "pending" || status === "processing") {
      totals.pendingInPaise += fee.amountInPaise;
      totals.pendingCount += 1;
    } else if (status === "failed") {
      totals.failedCount += 1;
    } else if (status === "waived") {
      totals.waivedCount += 1;
    }
  }

  return totals;
};
