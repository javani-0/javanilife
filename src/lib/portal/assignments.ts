import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@/lib/cloudinary";

// ---------------------------------------------------------------------------
// Assignment / practice submission (req P3): staff set work, the student
// uploads a PDF from the portal, staff review it.
//
// Submission ids are `${assignmentId}_${enrollmentId}` so a re-upload REPLACES
// the previous attempt instead of creating a second row for the same student.
// ---------------------------------------------------------------------------

export const ASSIGNMENTS_COLLECTION = "assignments";
export const ASSIGNMENT_SUBMISSIONS_COLLECTION = "assignmentSubmissions";

/** Only PDFs, per the requirement. */
export const ACCEPTED_MIME = "application/pdf";
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export type SubmissionStatus = "submitted" | "reviewed" | "needs-revision";

/** What the student sees for a piece of work. */
export type AssignmentState = "open" | "overdue" | "submitted" | "reviewed" | "needs-revision";

export interface Assignment {
  id: string;
  classId: string;
  className: string;
  title: string;
  description: string;
  dueDate: string;        // "YYYY-MM-DD"
  attachmentUrl?: string; // optional brief/worksheet
  maxMarks?: number;
  active: boolean;
  createdBy: string;
  createdAt?: Timestamp;
}

export interface AssignmentSubmission {
  id: string;
  assignmentId: string;
  enrollmentId: string;
  studentUid: string;
  studentName: string;
  studentId: string;
  classId: string;
  fileUrl: string;
  fileName: string;
  sizeBytes: number;
  status: SubmissionStatus;
  marks?: number;
  feedback?: string;
  reviewedBy?: string;
  submittedAt?: Timestamp;
  reviewedAt?: Timestamp;
}

const getString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const STATUSES: SubmissionStatus[] = ["submitted", "reviewed", "needs-revision"];

export const normalizeAssignment = (id: string, data: DocumentData = {}): Assignment => ({
  id,
  classId: getString(data.classId),
  className: getString(data.className),
  title: getString(data.title),
  description: getString(data.description),
  dueDate: getString(data.dueDate),
  attachmentUrl: getString(data.attachmentUrl) || undefined,
  maxMarks: toNumber(data.maxMarks) > 0 ? Math.round(toNumber(data.maxMarks)) : undefined,
  active: data.active !== false,
  createdBy: getString(data.createdBy),
  createdAt: data.createdAt,
});

export const normalizeSubmission = (id: string, data: DocumentData = {}): AssignmentSubmission => ({
  id,
  assignmentId: getString(data.assignmentId),
  enrollmentId: getString(data.enrollmentId),
  studentUid: getString(data.studentUid),
  studentName: getString(data.studentName),
  studentId: getString(data.studentId),
  classId: getString(data.classId),
  fileUrl: getString(data.fileUrl),
  fileName: getString(data.fileName),
  sizeBytes: Math.max(0, Math.round(toNumber(data.sizeBytes))),
  status: STATUSES.includes(data.status as SubmissionStatus) ? (data.status as SubmissionStatus) : "submitted",
  marks: data.marks != null ? Math.round(toNumber(data.marks)) : undefined,
  feedback: getString(data.feedback) || undefined,
  reviewedBy: getString(data.reviewedBy) || undefined,
  submittedAt: data.submittedAt,
  reviewedAt: data.reviewedAt,
});

// ---------------------------------------------------------------------------
// PURE helpers
// ---------------------------------------------------------------------------

export const buildSubmissionId = (assignmentId: string, enrollmentId: string): string =>
  `${assignmentId}_${enrollmentId}`;

/**
 * Why a file can't be uploaded, or null when it's fine. PDF-only and size are
 * checked here so the student gets a clear message before any network work.
 */
export const validateSubmissionFile = (file: { type?: string; size?: number; name?: string } | null): string | null => {
  if (!file) return "Choose a PDF file to upload.";
  const isPdf = file.type === ACCEPTED_MIME || /\.pdf$/i.test(file.name || "");
  if (!isPdf) return "Only PDF files can be submitted.";
  if ((file.size || 0) > MAX_UPLOAD_BYTES) return "That PDF is larger than 10 MB. Please compress it and try again.";
  if ((file.size || 0) === 0) return "That file appears to be empty.";
  return null;
};

/**
 * What state a piece of work is in for a student. A reviewed submission keeps
 * its review state even past the due date — only UNSUBMITTED work goes overdue.
 */
export const assignmentStateFor = (
  assignment: Pick<Assignment, "dueDate">,
  submission: Pick<AssignmentSubmission, "status"> | undefined,
  today: string = new Date().toISOString().slice(0, 10),
): AssignmentState => {
  if (submission) return submission.status;
  if (assignment.dueDate && assignment.dueDate < today) return "overdue";
  return "open";
};

export const ASSIGNMENT_STATE_LABELS: Record<AssignmentState, string> = {
  open: "To do",
  overdue: "Overdue",
  submitted: "Submitted",
  reviewed: "Reviewed",
  "needs-revision": "Needs revision",
};

/** Can the student still upload? Reviewed work is closed; revisions reopen it. */
export const canSubmit = (state: AssignmentState): boolean =>
  state === "open" || state === "overdue" || state === "needs-revision" || state === "submitted";

// ---------------------------------------------------------------------------
// Firestore + upload
// ---------------------------------------------------------------------------

/** Upload a submission PDF to Cloudinary. Validate BEFORE calling this. */
export const uploadSubmissionPdf = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", "assignments");
  // `auto` so a PDF is stored as a raw/document asset, not forced through the
  // image pipeline (same as the class-materials upload).
  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) throw new Error("Could not upload the PDF. Please try again.");
  const data = await response.json();
  const url = getString(data?.secure_url) || getString(data?.url);
  if (!url) throw new Error("Upload succeeded but no file URL was returned.");
  return url;
};

/** Staff: create or update an assignment. */
export const saveAssignment = async (
  id: string | null,
  input: Omit<Assignment, "id" | "createdAt">,
): Promise<string> => {
  const payload = {
    classId: input.classId,
    className: input.className,
    title: input.title.trim(),
    description: input.description.trim(),
    dueDate: input.dueDate,
    ...(input.attachmentUrl ? { attachmentUrl: input.attachmentUrl } : {}),
    ...(input.maxMarks ? { maxMarks: input.maxMarks } : {}),
    active: input.active,
    createdBy: input.createdBy,
    updatedAt: serverTimestamp(),
  };
  if (id) {
    await updateDoc(doc(db, ASSIGNMENTS_COLLECTION, id), payload);
    return id;
  }
  const created = await addDoc(collection(db, ASSIGNMENTS_COLLECTION), { ...payload, createdAt: serverTimestamp() });
  return created.id;
};

export const deleteAssignment = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, ASSIGNMENTS_COLLECTION, id));
};

/** Assignments for a set of classes (the student's enrolled classes). */
export const listAssignmentsForClasses = async (classIds: string[]): Promise<Assignment[]> => {
  const unique = Array.from(new Set((classIds || []).filter(Boolean)));
  if (unique.length === 0) return [];
  // Firestore `in` caps at 30 values; chunk to stay safe.
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 30) chunks.push(unique.slice(i, i + 30));
  const results = await Promise.all(chunks.map(async (chunk) => {
    const snapshot = await getDocs(query(collection(db, ASSIGNMENTS_COLLECTION), where("classId", "in", chunk)));
    return snapshot.docs.map((docSnap) => normalizeAssignment(docSnap.id, docSnap.data()));
  }));
  return results.flat()
    .filter((assignment) => assignment.active)
    .sort((a, b) => (b.dueDate || "").localeCompare(a.dueDate || ""));
};

/** Staff: every assignment for one class. */
export const listAssignmentsForClass = async (classId: string): Promise<Assignment[]> => {
  if (!classId) return [];
  const snapshot = await getDocs(query(collection(db, ASSIGNMENTS_COLLECTION), where("classId", "==", classId)));
  return snapshot.docs
    .map((docSnap) => normalizeAssignment(docSnap.id, docSnap.data()))
    .sort((a, b) => (b.dueDate || "").localeCompare(a.dueDate || ""));
};

export interface SubmitInput {
  assignment: Assignment;
  enrollmentId: string;
  studentUid: string;
  studentName: string;
  studentId: string;
  fileUrl: string;
  fileName: string;
  sizeBytes: number;
}

/**
 * Student: submit (or re-submit) their PDF. Deterministic id means one row per
 * student per assignment. Status resets to "submitted" so a revision goes back
 * into the review queue — and the student can never write their own marks.
 */
export const submitAssignment = async (input: SubmitInput): Promise<string> => {
  const id = buildSubmissionId(input.assignment.id, input.enrollmentId);
  await setDoc(doc(db, ASSIGNMENT_SUBMISSIONS_COLLECTION, id), {
    assignmentId: input.assignment.id,
    enrollmentId: input.enrollmentId,
    studentUid: input.studentUid,
    studentName: input.studentName,
    studentId: input.studentId,
    classId: input.assignment.classId,
    fileUrl: input.fileUrl,
    fileName: input.fileName,
    sizeBytes: input.sizeBytes,
    status: "submitted" as SubmissionStatus,
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return id;
};

/** Staff: record a review. */
export const reviewSubmission = async (
  id: string,
  input: { status: SubmissionStatus; marks?: number; feedback?: string; reviewedBy: string },
): Promise<void> => {
  await updateDoc(doc(db, ASSIGNMENT_SUBMISSIONS_COLLECTION, id), {
    status: input.status,
    ...(input.marks != null ? { marks: Math.round(input.marks) } : {}),
    ...(input.feedback ? { feedback: input.feedback } : {}),
    reviewedBy: input.reviewedBy,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

/** Student: their own submissions. */
export const listMySubmissions = async (uid: string): Promise<AssignmentSubmission[]> => {
  const snapshot = await getDocs(query(collection(db, ASSIGNMENT_SUBMISSIONS_COLLECTION), where("studentUid", "==", uid)));
  return snapshot.docs.map((docSnap) => normalizeSubmission(docSnap.id, docSnap.data()));
};

/** Staff: every submission for one assignment. */
export const listSubmissionsForAssignment = async (assignmentId: string): Promise<AssignmentSubmission[]> => {
  if (!assignmentId) return [];
  const snapshot = await getDocs(query(
    collection(db, ASSIGNMENT_SUBMISSIONS_COLLECTION),
    where("assignmentId", "==", assignmentId),
  ));
  return snapshot.docs
    .map((docSnap) => normalizeSubmission(docSnap.id, docSnap.data()))
    .sort((a, b) => (a.studentName || "").localeCompare(b.studentName || ""));
};
