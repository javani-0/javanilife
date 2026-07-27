import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Gender } from "@/lib/classes";

// ---------------------------------------------------------------------------
// Public class-enrolment LEADS (req 1). A visitor fills the class page's "Enrol
// Now" form (no login) → one of these docs. The admin sees them in the Student
// Manager "Enrolls" tab and clicks "Add to student" to open the pre-filled Add
// Student form. Then the normal onboarding (link → approve → login) takes over.
// ---------------------------------------------------------------------------

export const ENROLLMENT_REQUESTS_COLLECTION = "enrollmentRequests";

export type EnrollmentRequestStatus = "new" | "added" | "dismissed";

/** ONE class a visitor asked to join. A lead may carry several (req). */
export interface RequestedClass {
  classId: string;
  className: string;
  slotId?: string;
  slotLabel?: string;
}

export interface EnrollmentRequestDoc {
  id: string;
  studentName: string;
  age: number;
  gender: Gender;
  parentName: string;
  phone: string;
  whatsapp: string;
  email: string;      // optional on the form
  address: string;
  /** Every class requested (req: a student can ask to join several at once). */
  classes: RequestedClass[];
  // Legacy singular mirror of classes[0] — kept so older readers keep working.
  classId: string;
  className: string;
  slotId?: string;
  slotLabel?: string;
  status: EnrollmentRequestStatus;
  createdAt?: Timestamp;
}

const getString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const allowedGenders: Gender[] = ["male", "female", "other"];

/**
 * Normalize one requested class. Slot keys are OMITTED when blank rather than
 * set to undefined — Firestore rejects undefined outright (no
 * ignoreUndefinedProperties), so a stray one makes the whole write throw.
 */
const normalizeRequestedClass = (raw: Record<string, unknown>): RequestedClass => ({
  classId: getString(raw.classId),
  className: getString(raw.className),
  ...(getString(raw.slotId) ? { slotId: getString(raw.slotId) } : {}),
  ...(getString(raw.slotLabel) ? { slotLabel: getString(raw.slotLabel) } : {}),
});

/**
 * Every class on a lead. Prefers the `classes` array; falls back to the LEGACY
 * flat fields so leads submitted before multi-class still read correctly.
 */
export const readRequestedClasses = (data: DocumentData = {}): RequestedClass[] => {
  const stored = Array.isArray(data.classes) ? (data.classes as Record<string, unknown>[]) : [];
  if (stored.length > 0) return stored.map(normalizeRequestedClass).filter((item) => item.classId);
  if (!getString(data.classId)) return [];
  return [normalizeRequestedClass(data)];
};

export const normalizeEnrollmentRequest = (id: string, data: DocumentData = {}): EnrollmentRequestDoc => {
  const classes = readRequestedClasses(data);
  const primary = classes[0];
  return {
    id,
    studentName: getString(data.studentName),
    age: Math.max(0, Math.round(Number(data.age) || 0)),
    gender: allowedGenders.includes(data.gender as Gender) ? (data.gender as Gender) : "other",
    parentName: getString(data.parentName),
    phone: getString(data.phone),
    whatsapp: getString(data.whatsapp),
    email: getString(data.email),
    address: getString(data.address),
    classes,
    classId: primary?.classId || "",
    className: primary?.className || "",
    slotId: primary?.slotId,
    slotLabel: primary?.slotLabel,
    status: data.status === "added" || data.status === "dismissed" ? data.status : "new",
    createdAt: data.createdAt,
  };
};

export interface EnrollmentRequestInput {
  studentName: string;
  age: number;
  gender: Gender;
  parentName: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  address: string;
  /** Every class the visitor selected. At least one is required. */
  classes: RequestedClass[];
}

/**
 * The exact Firestore payload for a lead — pure, so the "no undefined anywhere"
 * rule is unit-testable. `classes[0]` is mirrored onto the flat fields so the
 * legacy single-class readers keep working with no migration.
 */
export const buildEnrollmentRequestPayload = (input: EnrollmentRequestInput) => {
  const classes = (input.classes || [])
    .filter((item) => (item.classId || "").trim())
    .map((item) => ({
      classId: item.classId.trim(),
      className: (item.className || "").trim(),
      ...(item.slotId ? { slotId: item.slotId } : {}),
      ...(item.slotLabel ? { slotLabel: item.slotLabel } : {}),
    }));
  const primary = classes[0];
  return {
    studentName: input.studentName.trim(),
    age: Math.max(0, Math.round(input.age || 0)),
    gender: input.gender,
    parentName: input.parentName.trim(),
    phone: (input.phone || "").trim(),
    whatsapp: (input.whatsapp || input.phone || "").trim(),
    email: (input.email || "").trim().toLowerCase(),
    address: (input.address || "").trim(),
    classes,
    // Legacy singular mirror (never undefined — Firestore would reject it).
    classId: primary?.classId || "",
    className: primary?.className || "",
    slotId: primary?.slotId || "",
    slotLabel: primary?.slotLabel || "",
    status: "new" as const,
  };
};

/** A human summary of the classes on a lead, e.g. "Vocal · Mon 6PM + Veena". */
export const requestedClassLabel = (classes: RequestedClass[]): string =>
  (classes || [])
    .map((item) => `${item.className}${item.slotLabel ? ` · ${item.slotLabel}` : ""}`)
    .join(" + ") || "—";

/** Public: submit an enrolment lead (no login). Returns the doc id. */
export const createEnrollmentRequest = async (input: EnrollmentRequestInput): Promise<string> => {
  const created = await addDoc(collection(db, ENROLLMENT_REQUESTS_COLLECTION), {
    ...buildEnrollmentRequestPayload(input),
    createdAt: serverTimestamp(),
  });
  return created.id;
};

/** Staff: live list of enrolment leads, newest first. */
export const subscribeToEnrollmentRequests = (
  onChange: (requests: EnrollmentRequestDoc[]) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  query(collection(db, ENROLLMENT_REQUESTS_COLLECTION), orderBy("createdAt", "desc")),
  (snapshot) => onChange(snapshot.docs.map((docSnap) => normalizeEnrollmentRequest(docSnap.id, docSnap.data()))),
  (error) => onError?.(error),
);

/** Staff: mark a lead as added-to-a-student (kept for the record). */
export const markEnrollmentRequestAdded = async (id: string): Promise<void> => {
  await updateDoc(doc(db, ENROLLMENT_REQUESTS_COLLECTION, id), { status: "added", updatedAt: serverTimestamp() });
};

/** Staff: delete a lead. */
export const deleteEnrollmentRequest = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, ENROLLMENT_REQUESTS_COLLECTION, id));
};
