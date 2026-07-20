import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { applyNextChargeDue, getEnrollment, setEnrollmentStatus } from "@/lib/classes";
import type { Gender } from "@/lib/classes";
import {
  buildFeeBreakdown,
  type EmiSplitConfig,
  type OnboardingStatus,
  type ParentRelation,
  type StudentCredential,
  type StudentDoc,
  type StudentFeeSetup,
  type StudentInventory,
  type StudentMode,
  type StudentPaymentMethods,
  type StudentTrack,
  type StudentType,
} from "./types";

export const STUDENTS_COLLECTION = "students";
export const ONBOARDING_LINKS_COLLECTION = "onboardingLinks";
export const STUDENT_CREDENTIALS_COLLECTION = "studentCredentials";

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const getString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const clampPaise = (value: unknown): number => Math.max(0, Math.round(toNumber(value)));

const normalizeEmiSplit = (raw: unknown): EmiSplitConfig | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const data = raw as Record<string, unknown>;
  const upfront = Math.round(toNumber(data.upfrontPercentage, 50));
  const pcts = Array.isArray(data.installmentPercentages)
    ? data.installmentPercentages.map((v) => Math.round(toNumber(v))).filter((v) => v > 0)
    : [];
  if (upfront <= 0 || pcts.length === 0) return undefined;
  return {
    upfrontPercentage: Math.min(100, Math.max(1, upfront)),
    installmentPercentages: pcts,
  };
};

const allowedGenders: Gender[] = ["male", "female", "other"];
const allowedRelations: ParentRelation[] = ["father", "mother", "guardian"];
const allowedStatuses: OnboardingStatus[] = ["awaiting-payment", "payment-submitted", "counter-chosen", "paid-online", "approved"];

/** An unguessable link token — the capability that opens /pay/:token. */
export const generateLinkToken = (): string => {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const normalizeStudent = (id: string, data: DocumentData = {}): StudentDoc => {
  const fees = (data.fees || {}) as DocumentData;
  const inventory = (data.inventory || {}) as DocumentData;
  const methods = (data.methods || {}) as DocumentData;
  return {
    id,
    name: getString(data.name),
    age: Math.max(0, Math.round(toNumber(data.age))),
    gender: allowedGenders.includes(data.gender as Gender) ? (data.gender as Gender) : "other",
    email: getString(data.email),
    phone: getString(data.phone),
    parentName: getString(data.parentName),
    parentRelation: allowedRelations.includes(data.parentRelation as ParentRelation) ? (data.parentRelation as ParentRelation) : "guardian",
    address: getString(data.address),
    mode: data.mode === "online" ? "online" : "offline",
    photoUrl: getString(data.photoUrl) || undefined,
    classId: getString(data.classId),
    className: getString(data.className),
    slotId: getString(data.slotId) || undefined,
    slotLabel: getString(data.slotLabel) || undefined,
    trainerName: getString(data.trainerName) || undefined,
    joiningDate: getString(data.joiningDate) || undefined,
    nextChargeDate: getString(data.nextChargeDate) || undefined,
    inventory: {
      uniform: inventory.uniform === true,
      kit: inventory.kit === true,
      books: inventory.books === true,
    },
    fees: {
      studentType: fees.studentType === "existing" ? "existing" : "new",
      track: fees.track === "term" ? "term" : "monthly",
      kitFeeInPaise: clampPaise(fees.kitFeeInPaise),
      booksFeeInPaise: clampPaise(fees.booksFeeInPaise),
      uniformFeeInPaise: clampPaise(fees.uniformFeeInPaise),
      monthlyFeeInPaise: clampPaise(fees.monthlyFeeInPaise),
      termFeeInPaise: clampPaise(fees.termFeeInPaise),
      discountInPaise: clampPaise(fees.discountInPaise),
      firstMonthFree: fees.firstMonthFree === true,
      emiSplit: normalizeEmiSplit(fees.emiSplit),
    },
    methods: {
      razorpay: methods.razorpay === true,
      qr: methods.qr !== false,
      counter: methods.counter !== false,
      emi: methods.emi === true,
    },
    desiredStudentId: getString(data.desiredStudentId) || undefined,
    linkToken: getString(data.linkToken),
    onboardingStatus: allowedStatuses.includes(data.onboardingStatus as OnboardingStatus)
      ? (data.onboardingStatus as OnboardingStatus)
      : "awaiting-payment",
    proofUrl: getString(data.proofUrl) || undefined,
    upiRef: getString(data.upiRef) || undefined,
    rejectReason: getString(data.rejectReason) || undefined,
    paidVia: data.paidVia === "qr" || data.paidVia === "counter" || data.paidVia === "razorpay" ? data.paidVia : undefined,
    razorpayPaymentId: getString(data.razorpayPaymentId) || undefined,
    linkSharedAt: data.linkSharedAt,
    studentId: getString(data.studentId) || undefined,
    userUid: getString(data.userUid) || undefined,
    enrollmentId: getString(data.enrollmentId) || undefined,
    approvedAt: data.approvedAt,
    active: data.active !== false,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};

/** Staff: live list of every student profile. */
export const subscribeToStudents = (
  onChange: (students: StudentDoc[]) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  collection(db, STUDENTS_COLLECTION),
  (snapshot) => onChange(snapshot.docs.map((studentDoc) => normalizeStudent(studentDoc.id, studentDoc.data()))),
  (error) => onError?.(error),
);

/** Staff: live map of stored student credentials, keyed by student doc id. */
export const subscribeToStudentCredentials = (
  onChange: (credentials: Record<string, StudentCredential>) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  collection(db, STUDENT_CREDENTIALS_COLLECTION),
  (snapshot) => {
    const map: Record<string, StudentCredential> = {};
    for (const credDoc of snapshot.docs) {
      const data = credDoc.data() || {};
      map[credDoc.id] = {
        studentDocId: credDoc.id,
        studentId: getString(data.studentId),
        email: getString(data.email),
        password: getString(data.password),
        name: getString(data.name),
        whatsapp: getString(data.whatsapp),
      };
    }
    onChange(map);
  },
  (error) => onError?.(error),
);

export interface StudentWriteInput {
  name: string;
  age: number;
  gender: Gender;
  email: string;
  phone: string;
  parentName: string;
  parentRelation: ParentRelation;
  address: string;
  mode: StudentMode;
  photoUrl?: string;
  classId: string;
  className: string;
  slotId?: string;
  slotLabel?: string;
  trainerName?: string;
  joiningDate?: string;
  nextChargeDate?: string;
  desiredStudentId?: string;
  inventory: StudentInventory;
  fees: {
    studentType: StudentType;
    track: StudentTrack;
    kitFeeInPaise: number;
    booksFeeInPaise: number;
    uniformFeeInPaise: number;
    monthlyFeeInPaise: number;
    termFeeInPaise: number;
    discountInPaise: number;
    firstMonthFree: boolean;
    emiSplit?: EmiSplitConfig;
  };
  methods: StudentPaymentMethods;
}

const buildStudentPayload = (input: StudentWriteInput) => ({
  name: input.name.trim(),
  age: Math.max(0, Math.round(toNumber(input.age))),
  gender: input.gender,
  email: input.email.trim().toLowerCase(),
  phone: input.phone.trim(),
  parentName: input.parentName.trim(),
  parentRelation: input.parentRelation,
  address: input.address.trim(),
  mode: input.mode,
  photoUrl: (input.photoUrl || "").trim(),
  classId: input.classId,
  className: input.className.trim(),
  slotId: input.slotId || "",
  slotLabel: input.slotLabel || "",
  trainerName: (input.trainerName || "").trim(),
  joiningDate: (input.joiningDate || "").trim(),
  nextChargeDate: (input.nextChargeDate || "").trim(),
  desiredStudentId: (input.desiredStudentId || "").trim().toUpperCase(),
  inventory: {
    uniform: input.inventory.uniform === true,
    kit: input.inventory.kit === true,
    books: input.inventory.books === true,
  },
  fees: {
    studentType: input.fees.studentType,
    track: input.fees.track,
    kitFeeInPaise: clampPaise(input.fees.kitFeeInPaise),
    booksFeeInPaise: clampPaise(input.fees.booksFeeInPaise),
    uniformFeeInPaise: clampPaise(input.fees.uniformFeeInPaise),
    monthlyFeeInPaise: clampPaise(input.fees.monthlyFeeInPaise),
    termFeeInPaise: clampPaise(input.fees.termFeeInPaise),
    discountInPaise: clampPaise(input.fees.discountInPaise),
    firstMonthFree: input.fees.firstMonthFree === true && input.fees.track === "monthly",
    emiSplit: input.fees.emiSplit || null,
  },
  methods: {
    razorpay: input.methods.razorpay === true,
    qr: input.methods.qr === true,
    counter: input.methods.counter === true,
    emi: input.methods.emi === true && input.fees.track === "term",
  },
  updatedAt: serverTimestamp(),
});

/**
 * Keep the public link snapshot in sync with the student record. Before
 * approval the link is a payment page; after approval the server owns the doc
 * (it holds the credentials) and we only refresh display fields.
 */
const syncOnboardingLink = async (student: StudentDoc): Promise<void> => {
  if (!student.linkToken) return;
  const { rows, totalInPaise, emiInstallments } = buildFeeBreakdown(student.fees);
  const freeMonthNote = student.fees.firstMonthFree && student.fees.track === "monthly"
    ? "Offer: the first month's class fee is FREE — nothing extra to pay for it later."
    : "";
  await setDoc(
    doc(db, ONBOARDING_LINKS_COLLECTION, student.linkToken),
    {
      token: student.linkToken,
      studentDocId: student.id,
      studentName: student.name,
      parentName: student.parentName,
      className: student.className,
      slotLabel: student.slotLabel || "",
      trainerName: student.trainerName || "",
      rows,
      totalInPaise,
      methods: student.methods,
      status: student.onboardingStatus,
      freeMonthNote,
      emiSplit: student.fees.emiSplit || null,
      emiInstallments: emiInstallments || null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

/** Staff: create a student profile + its payment link doc. Returns the doc id. */
export const createStudent = async (input: StudentWriteInput): Promise<StudentDoc> => {
  const id = doc(collection(db, STUDENTS_COLLECTION)).id;
  const linkToken = generateLinkToken();
  const payload = {
    ...buildStudentPayload(input),
    linkToken,
    onboardingStatus: "awaiting-payment" as OnboardingStatus,
    active: true,
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(db, STUDENTS_COLLECTION, id), payload);
  const student = normalizeStudent(id, payload);
  await syncOnboardingLink(student);
  return student;
};

/** Staff: update an existing student profile and refresh its link snapshot. */
export const updateStudent = async (existing: StudentDoc, input: StudentWriteInput): Promise<void> => {
  await updateDoc(doc(db, STUDENTS_COLLECTION, existing.id), buildStudentPayload(input));
  await syncOnboardingLink({ ...existing, ...normalizeStudent(existing.id, buildStudentPayload(input)), linkToken: existing.linkToken, onboardingStatus: existing.onboardingStatus });
  // Keep the portal avatar in sync for approved students (best-effort — the
  // admin role may write users docs; managers without that right just skip).
  const photoUrl = (input.photoUrl || "").trim();
  if (existing.userUid && photoUrl && photoUrl !== (existing.photoUrl || "")) {
    try {
      await updateDoc(doc(db, "users", existing.userUid), { photoURL: photoUrl, updatedAt: serverTimestamp() });
    } catch (error) {
      console.error("Could not sync the student photo to the portal account", error);
    }
  }
  // Keep the parent's autopay OPTION in sync (req): turning the Razorpay
  // toggle off in the Student Manager removes the autopay UI from their
  // portal immediately (and turning it on invites them to enable it).
  if (existing.enrollmentId && input.methods.razorpay !== existing.methods.razorpay) {
    try {
      await updateDoc(doc(db, "enrollments", existing.enrollmentId), {
        autopayInvited: input.methods.razorpay === true,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Could not sync the autopay option to the enrollment", error);
    }
  }
  // Next charge date changed on an approved MONTHLY student → refresh the
  // enrollment's next-charge date + the pending due the parent pays and the
  // reminder targets (req 7/8).
  const nextChargeDate = (input.nextChargeDate || "").trim();
  if (
    existing.enrollmentId
    && existing.onboardingStatus === "approved"
    && existing.fees.track === "monthly"
    && nextChargeDate
    && nextChargeDate !== (existing.nextChargeDate || "")
  ) {
    try {
      const enrollment = await getEnrollment(existing.enrollmentId);
      if (enrollment) await applyNextChargeDue(enrollment, nextChargeDate);
    } catch (error) {
      console.error("Could not apply the next charge date", error);
    }
  }
};

/** Staff: toggle inventory received flags in place. */
export const updateStudentInventory = async (id: string, inventory: StudentInventory): Promise<void> => {
  await updateDoc(doc(db, STUDENTS_COLLECTION, id), {
    inventory: { uniform: inventory.uniform === true, kit: inventory.kit === true, books: inventory.books === true },
    updatedAt: serverTimestamp(),
  });
};

/**
 * Staff: Active/Inactive toggle (req D). Inactive marks the linked enrollment
 * "paused" so dues/reminders stop, but every record stays — no deletes.
 */
export const setStudentActive = async (student: StudentDoc, active: boolean): Promise<void> => {
  await updateDoc(doc(db, STUDENTS_COLLECTION, student.id), { active, updatedAt: serverTimestamp() });
  if (student.enrollmentId) {
    try {
      await setEnrollmentStatus(student.enrollmentId, active ? "active" : "paused");
    } catch (error) {
      console.error("Could not sync enrollment status for student", student.id, error);
    }
  }
};

/** Staff: mark that the payment link was shared (for the list's status chips). */
export const markLinkShared = async (id: string): Promise<void> => {
  await updateDoc(doc(db, STUDENTS_COLLECTION, id), { linkSharedAt: serverTimestamp(), updatedAt: serverTimestamp() });
};

/**
 * Staff: issue a fresh link token (invalidates the old URL). Only sensible
 * before approval; the old link doc is removed.
 */
export const regenerateLinkToken = async (student: StudentDoc): Promise<string> => {
  const linkToken = generateLinkToken();
  await updateDoc(doc(db, STUDENTS_COLLECTION, student.id), { linkToken, updatedAt: serverTimestamp() });
  if (student.linkToken) {
    try { await deleteDoc(doc(db, ONBOARDING_LINKS_COLLECTION, student.linkToken)); } catch { /* already gone */ }
  }
  await syncOnboardingLink({ ...student, linkToken });
  return linkToken;
};

/** Staff: delete a never-approved draft (approved students are kept forever). */
export const deleteDraftStudent = async (student: StudentDoc): Promise<void> => {
  if (student.onboardingStatus === "approved") throw new Error("Approved students can't be deleted — mark them inactive instead.");
  await deleteDoc(doc(db, STUDENTS_COLLECTION, student.id));
  if (student.linkToken) {
    try { await deleteDoc(doc(db, ONBOARDING_LINKS_COLLECTION, student.linkToken)); } catch { /* already gone */ }
  }
};

/** The public payment-link URL for a token. */
export const buildPayLinkUrl = (token: string, origin: string = window.location.origin): string =>
  `${origin}/pay/${token}`;
