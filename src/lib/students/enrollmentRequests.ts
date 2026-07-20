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
  classId: string;
  className: string;
  slotId?: string;
  slotLabel?: string;
  status: EnrollmentRequestStatus;
  createdAt?: Timestamp;
}

const getString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const allowedGenders: Gender[] = ["male", "female", "other"];

export const normalizeEnrollmentRequest = (id: string, data: DocumentData = {}): EnrollmentRequestDoc => ({
  id,
  studentName: getString(data.studentName),
  age: Math.max(0, Math.round(Number(data.age) || 0)),
  gender: allowedGenders.includes(data.gender as Gender) ? (data.gender as Gender) : "other",
  parentName: getString(data.parentName),
  phone: getString(data.phone),
  whatsapp: getString(data.whatsapp),
  email: getString(data.email),
  address: getString(data.address),
  classId: getString(data.classId),
  className: getString(data.className),
  slotId: getString(data.slotId) || undefined,
  slotLabel: getString(data.slotLabel) || undefined,
  status: data.status === "added" || data.status === "dismissed" ? data.status : "new",
  createdAt: data.createdAt,
});

export interface EnrollmentRequestInput {
  studentName: string;
  age: number;
  gender: Gender;
  parentName: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  address: string;
  classId: string;
  className: string;
  slotId?: string;
  slotLabel?: string;
}

/** Public: submit an enrolment lead (no login). Returns the doc id. */
export const createEnrollmentRequest = async (input: EnrollmentRequestInput): Promise<string> => {
  const created = await addDoc(collection(db, ENROLLMENT_REQUESTS_COLLECTION), {
    studentName: input.studentName.trim(),
    age: Math.max(0, Math.round(input.age || 0)),
    gender: input.gender,
    parentName: input.parentName.trim(),
    phone: (input.phone || "").trim(),
    whatsapp: (input.whatsapp || input.phone || "").trim(),
    email: (input.email || "").trim().toLowerCase(),
    address: (input.address || "").trim(),
    classId: input.classId,
    className: input.className.trim(),
    slotId: input.slotId || "",
    slotLabel: input.slotLabel || "",
    status: "new",
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
