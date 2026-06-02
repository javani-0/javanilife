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
    billingDayOfMonth: clampBillingDay(toNumber(data.billingDayOfMonth, 5)),
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
  emi?: ClassEmiConfig;
  installmentPlan?: CourseInstallmentPlan;
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
  if (isTerm) {
    docData.termFeeInPaise = Math.max(0, Math.round(input.termFeeInPaise || 0));
    if (input.emi) docData.emi = input.emi;
    if (input.installmentPlan) docData.installmentPlan = input.installmentPlan;
  }

  const created = await addDoc(collection(db, ENROLLMENTS_COLLECTION), docData);
  return created.id;
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
