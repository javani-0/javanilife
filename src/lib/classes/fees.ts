import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import {
  isOverdue,
  periodLabel as periodLabelFor,
  type EnrollmentDoc,
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
    paidAt: data.paidAt,
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
