import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
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

// ---------------------------------------------------------------------------
// Examinations, hall tickets and certificates (req P4).
//
// There is no exam-registration collection: eligibility is DERIVED from an
// active enrolment in the class plus the class not being fee-locked. Storing a
// registration would just be a second thing to keep in sync.
// ---------------------------------------------------------------------------

export const EXAMS_COLLECTION = "exams";
export const CERTIFICATES_COLLECTION = "certificates";

export type ExamMode = "online" | "offline";
export type CertificateStatus = "issued" | "revoked";

export interface Exam {
  id: string;
  classId: string;
  className: string;
  title: string;
  examDate: string;    // "YYYY-MM-DD"
  startTime: string;   // "10:00"
  endTime: string;     // "12:00"
  venue: string;
  mode: ExamMode;
  syllabus: string;
  instructions: string[];
  /** Students can download a hall ticket only when the admin enables it. */
  hallTicketEnabled: boolean;
  createdBy: string;
  createdAt?: Timestamp;
}

export interface Certificate {
  id: string;
  enrollmentId: string;
  studentUid: string;
  classId: string;
  className: string;
  studentName: string;
  studentId: string;
  title: string;
  issuedOn: string;
  certificateNumber: string;
  imageUrl: string;
  status: CertificateStatus;
  issuedBy: string;
  createdAt?: Timestamp;
}

const getString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);

export const normalizeExam = (id: string, data: DocumentData = {}): Exam => ({
  id,
  classId: getString(data.classId),
  className: getString(data.className),
  title: getString(data.title),
  examDate: getString(data.examDate),
  startTime: getString(data.startTime),
  endTime: getString(data.endTime),
  venue: getString(data.venue),
  mode: data.mode === "online" ? "online" : "offline",
  syllabus: getString(data.syllabus),
  instructions: Array.isArray(data.instructions)
    ? (data.instructions as unknown[]).map((line) => getString(line)).filter(Boolean)
    : [],
  hallTicketEnabled: data.hallTicketEnabled === true,
  createdBy: getString(data.createdBy),
  createdAt: data.createdAt,
});

export const normalizeCertificate = (id: string, data: DocumentData = {}): Certificate => ({
  id,
  enrollmentId: getString(data.enrollmentId),
  studentUid: getString(data.studentUid),
  classId: getString(data.classId),
  className: getString(data.className),
  studentName: getString(data.studentName),
  studentId: getString(data.studentId),
  title: getString(data.title),
  issuedOn: getString(data.issuedOn),
  certificateNumber: getString(data.certificateNumber),
  imageUrl: getString(data.imageUrl),
  status: data.status === "revoked" ? "revoked" : "issued",
  issuedBy: getString(data.issuedBy),
  createdAt: data.createdAt,
});

// ---------------------------------------------------------------------------
// PURE helpers
// ---------------------------------------------------------------------------

/** A slug safe for a Firestore doc id. */
export const slugify = (value: string): string =>
  (value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "certificate";

export const buildCertificateId = (enrollmentId: string, title: string): string =>
  `${enrollmentId}_${slugify(title)}`;

/**
 * The hall-ticket number. Deterministic so reprinting gives the same number,
 * and it carries the exam and the student so it reads sensibly on paper.
 */
export const buildHallTicketNumber = (examId: string, studentRollNo: string): string =>
  `HT-${(examId || "").slice(0, 6).toUpperCase()}-${studentRollNo || "GUEST"}`;

export type ExamTiming = "upcoming" | "today" | "past";

export const examTimingFor = (
  exam: Pick<Exam, "examDate">,
  today: string = new Date().toISOString().slice(0, 10),
): ExamTiming => {
  if (!exam.examDate) return "upcoming";
  if (exam.examDate === today) return "today";
  return exam.examDate > today ? "upcoming" : "past";
};

export interface HallTicketEligibility {
  allowed: boolean;
  reason: string;
}

/**
 * Whether a student may download the hall ticket for an exam.
 *
 * Derived, never stored: the admin must have enabled tickets, the class must
 * not be fee-locked, and the exam must not already be in the past.
 */
export const hallTicketEligibility = (
  exam: Pick<Exam, "hallTicketEnabled" | "examDate">,
  options: { locked: boolean; today?: string },
): HallTicketEligibility => {
  const today = options.today || new Date().toISOString().slice(0, 10);
  if (!exam.hallTicketEnabled) return { allowed: false, reason: "Hall tickets for this exam haven't been released yet." };
  if (options.locked) return { allowed: false, reason: "Clear the pending fee to download your hall ticket." };
  if (examTimingFor(exam, today) === "past") return { allowed: false, reason: "This exam has already taken place." };
  return { allowed: true, reason: "" };
};

// ---------------------------------------------------------------------------
// Firestore
// ---------------------------------------------------------------------------

export const saveExam = async (id: string | null, input: Omit<Exam, "id" | "createdAt">): Promise<string> => {
  const payload = {
    classId: input.classId,
    className: input.className,
    title: input.title.trim(),
    examDate: input.examDate,
    startTime: input.startTime,
    endTime: input.endTime,
    venue: input.venue.trim(),
    mode: input.mode,
    syllabus: input.syllabus.trim(),
    instructions: input.instructions.filter(Boolean),
    hallTicketEnabled: input.hallTicketEnabled,
    createdBy: input.createdBy,
    updatedAt: serverTimestamp(),
  };
  if (id) {
    await updateDoc(doc(db, EXAMS_COLLECTION, id), payload);
    return id;
  }
  const created = await addDoc(collection(db, EXAMS_COLLECTION), { ...payload, createdAt: serverTimestamp() });
  return created.id;
};

export const deleteExam = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, EXAMS_COLLECTION, id));
};

export const getExam = async (id: string): Promise<Exam | null> => {
  if (!id) return null;
  const snapshot = await getDoc(doc(db, EXAMS_COLLECTION, id));
  return snapshot.exists() ? normalizeExam(snapshot.id, snapshot.data()) : null;
};

export const listExamsForClass = async (classId: string): Promise<Exam[]> => {
  if (!classId) return [];
  const snapshot = await getDocs(query(collection(db, EXAMS_COLLECTION), where("classId", "==", classId)));
  return snapshot.docs
    .map((docSnap) => normalizeExam(docSnap.id, docSnap.data()))
    .sort((a, b) => (b.examDate || "").localeCompare(a.examDate || ""));
};

/** Exams across a student's enrolled classes. */
export const listExamsForClasses = async (classIds: string[]): Promise<Exam[]> => {
  const unique = Array.from(new Set((classIds || []).filter(Boolean)));
  if (unique.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 30) chunks.push(unique.slice(i, i + 30));
  const results = await Promise.all(chunks.map(async (chunk) => {
    const snapshot = await getDocs(query(collection(db, EXAMS_COLLECTION), where("classId", "in", chunk)));
    return snapshot.docs.map((docSnap) => normalizeExam(docSnap.id, docSnap.data()));
  }));
  return results.flat().sort((a, b) => (a.examDate || "").localeCompare(b.examDate || ""));
};

export const issueCertificate = async (
  input: Omit<Certificate, "id" | "createdAt" | "status"> & { status?: CertificateStatus },
): Promise<string> => {
  const id = buildCertificateId(input.enrollmentId, input.title);
  await setDoc(doc(db, CERTIFICATES_COLLECTION, id), {
    ...input,
    status: input.status || "issued",
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  }, { merge: true });
  return id;
};

export const setCertificateStatus = async (id: string, status: CertificateStatus): Promise<void> => {
  await updateDoc(doc(db, CERTIFICATES_COLLECTION, id), { status, updatedAt: serverTimestamp() });
};

/**
 * Staff: PERMANENTLY remove a certificate (req). Revoke only hides it from the
 * student and is reversible; this is for one uploaded by mistake — the wrong
 * student, the wrong file — where leaving a revoked row around is just clutter.
 * The Cloudinary image is intentionally left alone (other records may embed the
 * same URL, and an orphaned asset is cheaper than a broken certificate).
 */
export const deleteCertificate = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, CERTIFICATES_COLLECTION, id));
};

/** Student: their own certificates. Revoked ones are filtered out for them. */
export const listMyCertificates = async (uid: string): Promise<Certificate[]> => {
  const snapshot = await getDocs(query(collection(db, CERTIFICATES_COLLECTION), where("studentUid", "==", uid)));
  return snapshot.docs
    .map((docSnap) => normalizeCertificate(docSnap.id, docSnap.data()))
    .filter((certificate) => certificate.status === "issued")
    .sort((a, b) => (b.issuedOn || "").localeCompare(a.issuedOn || ""));
};

/** Staff: every certificate for a class, revoked included. */
export const listCertificatesForClass = async (classId: string): Promise<Certificate[]> => {
  if (!classId) return [];
  const snapshot = await getDocs(query(collection(db, CERTIFICATES_COLLECTION), where("classId", "==", classId)));
  return snapshot.docs
    .map((docSnap) => normalizeCertificate(docSnap.id, docSnap.data()))
    .sort((a, b) => (a.studentName || "").localeCompare(b.studentName || ""));
};
