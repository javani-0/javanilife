import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  clampBillingDay,
  monthKeyFor,
  type ClassEmiConfig,
  type ClassFeeType,
  type ClassPaymentMethod,
  type EnrollmentDoc,
  type EnrollmentStatus,
  type Gender,
} from "./types";
import type { CourseInstallmentPlan } from "@/lib/ecommerce/types";

export const ENROLLMENTS_COLLECTION = "enrollments";

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const allowedGenders: Gender[] = ["male", "female", "other"];
const normalizeGender = (value: unknown): Gender => (
  allowedGenders.includes(value as Gender) ? value as Gender : "other"
);

export const normalizeEnrollment = (id: string, data: DocumentData = {}): EnrollmentDoc => {
  const student = (data.student || {}) as DocumentData;
  const parent = (data.parent || {}) as DocumentData;
  const autopay = (data.autopay || {}) as DocumentData;

  return {
    id,
    student: {
      name: typeof student.name === "string" ? student.name : "",
      age: Math.max(0, Math.round(toNumber(student.age))),
      gender: normalizeGender(student.gender),
    },
    parent: {
      name: typeof parent.name === "string" ? parent.name : "",
      phone: typeof parent.phone === "string" ? parent.phone : "",
      whatsappNumber: typeof parent.whatsappNumber === "string" ? parent.whatsappNumber : "",
      address: typeof parent.address === "string" ? parent.address : "",
    },
    parentUserId: typeof data.parentUserId === "string" ? data.parentUserId : "",
    classId: typeof data.classId === "string" ? data.classId : "",
    className: typeof data.className === "string" ? data.className : "",
    monthlyFeeInPaise: Math.max(0, Math.round(toNumber(data.monthlyFeeInPaise))),
    billingDayOfMonth: clampBillingDay(toNumber(data.billingDayOfMonth, 1)),
    startMonthKey: typeof data.startMonthKey === "string" ? data.startMonthKey : "",
    status: (data.status as EnrollmentStatus) || "pending",
    autopay: {
      enabled: autopay.enabled === true,
      method: autopay.method,
      razorpaySubscriptionId: autopay.razorpaySubscriptionId,
      razorpayCustomerId: autopay.razorpayCustomerId,
      mandateStatus: autopay.mandateStatus,
      nextChargeAt: autopay.nextChargeAt,
      authorizedAt: autopay.authorizedAt,
      shortUrl: autopay.shortUrl,
    },
    paymentPlan: typeof data.paymentPlan === "string" ? (data.paymentPlan as ClassPaymentMethod) : undefined,
    slotId: typeof data.slotId === "string" ? data.slotId : undefined,
    slotLabel: typeof data.slotLabel === "string" ? data.slotLabel : undefined,
    feeType: data.feeType === "term" ? "term" : (data.feeType === "monthly" ? "monthly" : undefined),
    termFeeInPaise: data.termFeeInPaise != null ? Math.max(0, Math.round(toNumber(data.termFeeInPaise))) : undefined,
    termStartDate: typeof data.termStartDate === "string" ? data.termStartDate : undefined,
    termEndDate: typeof data.termEndDate === "string" ? data.termEndDate : undefined,
    nextChargeDate: typeof data.nextChargeDate === "string" ? data.nextChargeDate : undefined,
    billingStartMonth: typeof data.billingStartMonth === "string" ? data.billingStartMonth : undefined,
    billingEndMonth: typeof data.billingEndMonth === "string" ? data.billingEndMonth : undefined,
    billingPeriodLabel: typeof data.billingPeriodLabel === "string" ? data.billingPeriodLabel : undefined,
    advancePaid: data.advancePaid === true ? true : undefined,
    studentStatus: data.studentStatus === "existing" ? "existing" : (data.studentStatus === "new" ? "new" : undefined),
    autopayInvited: data.autopayInvited === true ? true : undefined,
    emi: data.emi && typeof data.emi === "object" ? (data.emi as ClassEmiConfig) : undefined,
    installmentPlan: data.installmentPlan && typeof data.installmentPlan === "object"
      ? (data.installmentPlan as CourseInstallmentPlan)
      : undefined,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};

export interface CreateEnrollmentInput {
  parentUserId: string;
  classId: string;
  className: string;
  monthlyFeeInPaise: number;
  billingDayOfMonth: number;
  student: { name: string; age: number; gender: Gender };
  parent: { name: string; phone: string; whatsappNumber?: string; address: string };
  autopayRequested: boolean;
  // The chosen payment rail (autopay/manual/full/emi). Defaults derived from autopayRequested.
  paymentPlan?: ClassPaymentMethod;
  // Chosen time slot (when the class offers slots).
  slotId?: string;
  slotLabel?: string;
  // Term-course fields.
  feeType?: ClassFeeType;
  termFeeInPaise?: number;
  termStartDate?: string;
  termEndDate?: string;
  emi?: ClassEmiConfig;
  installmentPlan?: CourseInstallmentPlan;
  // Next billing/charge date (ISO "YYYY-MM-DD") to show the parent up front.
  nextChargeDate?: string;
  // Billed period (advance vs. arrears) computed at enrolment. "YYYY-MM" keys.
  billingStartMonth?: string;
  billingEndMonth?: string;
  billingPeriodLabel?: string;
  // The parent pre-paid the first cycle at sign-up.
  advancePaid?: boolean;
  // Whether the parent declared this a new or existing student at enrolment.
  studentStatus?: "new" | "existing";
}

/** Create a pending enrollment owned by the signed-in parent. Returns the doc id. */
export const createEnrollment = async (input: CreateEnrollmentInput): Promise<string> => {
  const paymentPlan: ClassPaymentMethod = input.paymentPlan || (input.autopayRequested ? "autopay" : "manual");
  const isTerm = input.feeType === "term";

  // Firestore rejects undefined — build the doc conditionally.
  const docData: Record<string, unknown> = {
    student: {
      name: input.student.name.trim(),
      age: Math.max(0, Math.round(input.student.age)),
      gender: normalizeGender(input.student.gender),
    },
    parent: {
      name: input.parent.name.trim(),
      phone: input.parent.phone.trim(),
      whatsappNumber: (input.parent.whatsappNumber || input.parent.phone).trim(),
      address: input.parent.address.trim(),
    },
    parentUserId: input.parentUserId,
    classId: input.classId,
    className: input.className,
    monthlyFeeInPaise: Math.max(0, Math.round(input.monthlyFeeInPaise)),
    billingDayOfMonth: clampBillingDay(input.billingDayOfMonth),
    startMonthKey: monthKeyFor(new Date()),
    status: "pending",
    autopay: paymentPlan === "autopay" ? { enabled: false, method: "upi" } : { enabled: false },
    paymentPlan,
    feeType: isTerm ? "term" : "monthly",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.slotId) docData.slotId = input.slotId;
  if (input.slotLabel) docData.slotLabel = input.slotLabel;
  if (input.nextChargeDate) docData.nextChargeDate = input.nextChargeDate;
  if (input.billingStartMonth) docData.billingStartMonth = input.billingStartMonth;
  if (input.billingEndMonth) docData.billingEndMonth = input.billingEndMonth;
  if (input.billingPeriodLabel) docData.billingPeriodLabel = input.billingPeriodLabel;
  if (input.advancePaid) docData.advancePaid = true;
  if (input.studentStatus) docData.studentStatus = input.studentStatus;
  if (isTerm) {
    docData.termFeeInPaise = Math.max(0, Math.round(input.termFeeInPaise || 0));
    if (input.termStartDate) docData.termStartDate = input.termStartDate;
    if (input.termEndDate) docData.termEndDate = input.termEndDate;
    if (input.emi) docData.emi = input.emi;
    if (input.installmentPlan) docData.installmentPlan = input.installmentPlan;
  }

  const created = await addDoc(collection(db, ENROLLMENTS_COLLECTION), docData);
  return created.id;
};

/**
 * Admin: patch editable enrolment fields (status, fees, plan, next charge date,
 * term span). Only defined keys are written; money fields are clamped.
 */
export interface AdminEnrollmentPatch {
  status?: EnrollmentStatus;
  paymentPlan?: ClassPaymentMethod;
  feeType?: ClassFeeType;
  monthlyFeeInPaise?: number;
  termFeeInPaise?: number;
  billingDayOfMonth?: number;
  nextChargeDate?: string;
  termStartDate?: string;
  termEndDate?: string;
}

export const updateEnrollment = async (id: string, patch: AdminEnrollmentPatch): Promise<void> => {
  const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.paymentPlan !== undefined) data.paymentPlan = patch.paymentPlan;
  if (patch.feeType !== undefined) data.feeType = patch.feeType;
  if (patch.monthlyFeeInPaise !== undefined) data.monthlyFeeInPaise = Math.max(0, Math.round(patch.monthlyFeeInPaise));
  if (patch.termFeeInPaise !== undefined) data.termFeeInPaise = Math.max(0, Math.round(patch.termFeeInPaise));
  if (patch.billingDayOfMonth !== undefined) data.billingDayOfMonth = clampBillingDay(patch.billingDayOfMonth);
  if (patch.nextChargeDate !== undefined) data.nextChargeDate = patch.nextChargeDate;
  if (patch.termStartDate !== undefined) data.termStartDate = patch.termStartDate;
  if (patch.termEndDate !== undefined) data.termEndDate = patch.termEndDate;
  await updateDoc(doc(db, ENROLLMENTS_COLLECTION, id), data);
};

export const getEnrollment = async (id: string): Promise<EnrollmentDoc | null> => {
  const snapshot = await getDoc(doc(db, ENROLLMENTS_COLLECTION, id));
  return snapshot.exists() ? normalizeEnrollment(snapshot.id, snapshot.data()) : null;
};

export const subscribeToMyEnrollments = (
  uid: string,
  onChange: (enrollments: EnrollmentDoc[]) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  query(collection(db, ENROLLMENTS_COLLECTION), where("parentUserId", "==", uid)),
  (snapshot) => onChange(snapshot.docs.map((enrollmentDoc) => normalizeEnrollment(enrollmentDoc.id, enrollmentDoc.data()))),
  (error) => onError?.(error),
);

export const subscribeToEnrollmentsAdmin = (
  onChange: (enrollments: EnrollmentDoc[]) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  collection(db, ENROLLMENTS_COLLECTION),
  (snapshot) => onChange(snapshot.docs.map((enrollmentDoc) => normalizeEnrollment(enrollmentDoc.id, enrollmentDoc.data()))),
  (error) => onError?.(error),
);

export const listMyEnrollments = async (uid: string): Promise<EnrollmentDoc[]> => {
  const snapshot = await getDocs(query(collection(db, ENROLLMENTS_COLLECTION), where("parentUserId", "==", uid)));
  return snapshot.docs.map((enrollmentDoc) => normalizeEnrollment(enrollmentDoc.id, enrollmentDoc.data()));
};

export const setEnrollmentStatus = async (id: string, status: EnrollmentStatus): Promise<void> => {
  await updateDoc(doc(db, ENROLLMENTS_COLLECTION, id), { status, updatedAt: serverTimestamp() });
};

export const pauseEnrollment = (id: string) => setEnrollmentStatus(id, "paused");
export const resumeEnrollment = (id: string) => setEnrollmentStatus(id, "active");
export const cancelEnrollment = (id: string) => setEnrollmentStatus(id, "cancelled");

export const deleteEnrollment = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, ENROLLMENTS_COLLECTION, id));
};
