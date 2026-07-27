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
  mirrorPrimaryCourse,
  normalizeCourses,
  type EmiSplitConfig,
  type OnboardingStatus,
  type ParentRelation,
  type StudentCourse,
  type StudentCredential,
  type StudentDoc,
  type StudentInventory,
  type StudentMode,
  type StudentPaymentMethods,
} from "./types";
import { buildStudentBreakdown, flattenBreakdownRows } from "./feeBreakdown";

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
    emiInstallmentSubmitted: Math.max(0, Math.round(toNumber(data.emiInstallmentSubmitted))) || undefined,
    submittedAmountInPaise: clampPaise(data.submittedAmountInPaise) || undefined,
    linkSharedAt: data.linkSharedAt,
    studentId: getString(data.studentId) || undefined,
    userUid: getString(data.userUid) || undefined,
    enrollmentId: getString(data.enrollmentId) || undefined,
    approvedAt: data.approvedAt,
    courses: normalizeCourses(data),
    enrollmentIds: Array.isArray(data.enrollmentIds)
      ? (data.enrollmentIds as unknown[]).map((value) => getString(value)).filter(Boolean)
      : [getString(data.enrollmentId)].filter(Boolean),
    accessOverrideUntil: getString(data.accessOverrideUntil) || undefined,
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
  desiredStudentId?: string;
  /** Every class this student takes (req). At least one is required. */
  courses: StudentCourse[];
}

const buildStudentPayload = (input: StudentWriteInput) => {
  const courses: StudentCourse[] = (input.courses || []).map((course, index) => ({
    ...course,
    key: course.key || `course-${index + 1}`,
    classId: course.classId,
    className: (course.className || "").trim(),
    slotId: course.slotId || "",
    slotLabel: course.slotLabel || "",
    trainerName: (course.trainerName || "").trim(),
    joiningDate: (course.joiningDate || "").trim(),
    nextChargeDate: (course.nextChargeDate || "").trim(),
    enrollmentId: course.enrollmentId || "",
    inventory: {
      uniform: course.inventory.uniform === true,
      kit: course.inventory.kit === true,
      books: course.inventory.books === true,
    },
    fees: {
      studentType: course.fees.studentType,
      track: course.fees.track,
      kitFeeInPaise: clampPaise(course.fees.kitFeeInPaise),
      booksFeeInPaise: clampPaise(course.fees.booksFeeInPaise),
      uniformFeeInPaise: clampPaise(course.fees.uniformFeeInPaise),
      monthlyFeeInPaise: clampPaise(course.fees.monthlyFeeInPaise),
      termFeeInPaise: clampPaise(course.fees.termFeeInPaise),
      discountInPaise: clampPaise(course.fees.discountInPaise),
      firstMonthFree: course.fees.firstMonthFree === true && course.fees.track === "monthly",
      // Firestore rejects undefined — a missing split is stored as null.
      emiSplit: course.fees.emiSplit || null,
    },
    methods: {
      razorpay: course.methods.razorpay === true,
      qr: course.methods.qr === true,
      counter: course.methods.counter === true,
      emi: course.methods.emi === true && course.fees.track === "term",
    },
    status: course.status === "dropped" ? "dropped" : "active",
  })) as StudentCourse[];

  return {
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
    desiredStudentId: (input.desiredStudentId || "").trim().toUpperCase(),
    courses,
    // Keep the legacy singular fields in step so every existing reader works.
    ...mirrorPrimaryCourse(courses),
    updatedAt: serverTimestamp(),
  };
};

/**
 * Keep the public link snapshot in sync with the student record. Before
 * approval the link is a payment page; after approval the server owns the doc
 * (it holds the credentials) and we only refresh display fields.
 */
/**
 * The payment methods offered on the COMBINED link. The parent pays one total
 * across every class, so a method is offered only when EVERY active course
 * allows it — the strictest class wins, otherwise a class that forbids online
 * payment could still be paid online. EMI only applies to a single-course link.
 */
const mergeLinkMethods = (courses: StudentCourse[]): StudentPaymentMethods => {
  const active = courses.filter((course) => course.status !== "dropped");
  if (active.length === 0) return { razorpay: false, qr: true, counter: true, emi: false };
  return {
    razorpay: active.every((course) => course.methods.razorpay === true),
    qr: active.every((course) => course.methods.qr === true),
    counter: active.every((course) => course.methods.counter === true),
    emi: active.length === 1 && active[0].methods.emi === true,
  };
};

const syncOnboardingLink = async (student: StudentDoc): Promise<void> => {
  if (!student.linkToken) return;
  const breakdown = buildStudentBreakdown(student.courses);
  const primary = student.courses[0];
  const multi = breakdown.sections.length > 1;
  // "First month free" is per class — name the class when there is more than one.
  const freeMonthNote = student.courses
    .filter((course) => course.status !== "dropped" && course.fees.firstMonthFree && course.fees.track === "monthly")
    .map((course) => (multi
      ? `${course.className}: first month's class fee is FREE.`
      : "Offer: the first month's class fee is FREE — nothing extra to pay for it later."))
    .join(" ");

  await setDoc(
    doc(db, ONBOARDING_LINKS_COLLECTION, student.linkToken),
    {
      token: student.linkToken,
      studentDocId: student.id,
      studentName: student.name,
      parentName: student.parentName,
      // Legacy single-class display fields — the first class, kept for old readers.
      className: primary?.className || "",
      slotLabel: primary?.slotLabel || "",
      trainerName: primary?.trainerName || "",
      // Multi-class: one section per class, plus the flattened legacy rows.
      sections: breakdown.sections,
      rows: flattenBreakdownRows(breakdown),
      totalInPaise: breakdown.grandTotalInPaise,
      // EMI links ask for the first installment only (req) — the rest are billed
      // as dues after approval.
      dueNowInPaise: breakdown.dueNowInPaise,
      methods: mergeLinkMethods(student.courses),
      status: student.onboardingStatus,
      freeMonthNote,
      emiSplit: primary?.fees.emiSplit || null,
      emiInstallments: breakdown.sections[0]?.emiInstallments || null,
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
  const payload = buildStudentPayload(input);
  await updateDoc(doc(db, STUDENTS_COLLECTION, existing.id), payload);
  await syncOnboardingLink({
    ...existing,
    ...normalizeStudent(existing.id, payload),
    linkToken: existing.linkToken,
    onboardingStatus: existing.onboardingStatus,
  });
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
  // Per-COURSE syncs, matched to the previous state by course key.
  for (const course of input.courses) {
    if (!course.enrollmentId || course.status === "dropped") continue;
    const before = existing.courses.find((item) => item.key === course.key);

    // Keep the parent's autopay OPTION in sync (req): turning the Razorpay
    // toggle off in the Student Manager removes the autopay UI from their
    // portal immediately (and turning it on invites them to enable it).
    if (before && course.methods.razorpay !== before.methods.razorpay) {
      try {
        await updateDoc(doc(db, "enrollments", course.enrollmentId), {
          autopayInvited: course.methods.razorpay === true,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.error("Could not sync the autopay option to the enrollment", error);
      }
    }

    // Next charge date changed on an approved MONTHLY course → refresh the
    // enrollment's next-charge date + the pending due the parent pays and the
    // reminder targets (req 7/8).
    const nextChargeDate = (course.nextChargeDate || "").trim();
    if (
      existing.onboardingStatus === "approved"
      && course.fees.track === "monthly"
      && nextChargeDate
      && nextChargeDate !== (before?.nextChargeDate || "")
    ) {
      try {
        const enrollment = await getEnrollment(course.enrollmentId);
        if (enrollment) await applyNextChargeDue(enrollment, nextChargeDate);
      } catch (error) {
        console.error("Could not apply the next charge date", error);
      }
    }
  }

  // A course the admin DROPPED stops billing immediately (history is kept).
  for (const course of input.courses) {
    if (course.status !== "dropped" || !course.enrollmentId) continue;
    const before = existing.courses.find((item) => item.key === course.key);
    if (before?.status === "dropped") continue; // already handled previously
    try {
      await setEnrollmentStatus(course.enrollmentId, "paused");
    } catch (error) {
      console.error("Could not pause the dropped course's enrollment", course.classId, error);
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
  // Every class the student takes follows the toggle. A DROPPED course stays
  // paused even when the student is reactivated.
  for (const course of student.courses) {
    if (!course.enrollmentId) continue;
    const target = active && course.status !== "dropped" ? "active" : "paused";
    try {
      await setEnrollmentStatus(course.enrollmentId, target);
    } catch (error) {
      console.error("Could not sync enrollment status for student", student.id, course.classId, error);
    }
  }
};

/**
 * Staff: force the public link snapshot to match the student record right now.
 *
 * The link doc is only rewritten on create/update, so a link shared from a
 * stale tab — or one written before a pricing change like the EMI split —
 * keeps showing the parent the OLD amount. Sharing or copying the link
 * re-syncs it first, so what the parent opens is always what the admin sees.
 */
export const resyncOnboardingLink = async (student: StudentDoc): Promise<void> => {
  await syncOnboardingLink(student);
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
