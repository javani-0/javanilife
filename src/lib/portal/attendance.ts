import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ---------------------------------------------------------------------------
// Attendance & progress (req P2).
//
// Attendance doc ids are `${enrollmentId}_${date}` so marking the same session
// twice UPDATES rather than duplicating — the admin can reopen a date and edit.
// The summary math is PURE and unit-tested.
// ---------------------------------------------------------------------------

export const ATTENDANCE_COLLECTION = "attendance";
export const PROGRESS_REPORTS_COLLECTION = "progressReports";

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  excused: "Excused",
};

export interface AttendanceRecord {
  id: string;
  enrollmentId: string;
  classId: string;
  className: string;
  studentUid: string;
  studentName: string;
  studentId: string;      // roll number
  date: string;           // "YYYY-MM-DD"
  status: AttendanceStatus;
  sessionLabel?: string;
  note?: string;
  markedBy: string;
  markedAt?: Timestamp;
}

export interface SkillRating {
  name: string;
  rating: number; // 1–5
}

export interface ProgressReport {
  id: string;
  enrollmentId: string;
  classId: string;
  className: string;
  studentUid: string;
  periodLabel: string;    // "July 2026" / "Term 1"
  grade?: string;
  skills: SkillRating[];
  remarks: string;
  createdBy: string;
  publishedAt?: Timestamp;
}

const getString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const ALLOWED: AttendanceStatus[] = ["present", "absent", "late", "excused"];

export const buildAttendanceId = (enrollmentId: string, date: string): string => `${enrollmentId}_${date}`;

export const normalizeAttendance = (id: string, data: DocumentData = {}): AttendanceRecord => ({
  id,
  enrollmentId: getString(data.enrollmentId),
  classId: getString(data.classId),
  className: getString(data.className),
  studentUid: getString(data.studentUid),
  studentName: getString(data.studentName),
  studentId: getString(data.studentId),
  date: getString(data.date),
  status: ALLOWED.includes(data.status as AttendanceStatus) ? (data.status as AttendanceStatus) : "absent",
  sessionLabel: getString(data.sessionLabel) || undefined,
  note: getString(data.note) || undefined,
  markedBy: getString(data.markedBy),
  markedAt: data.markedAt,
});

export const normalizeProgressReport = (id: string, data: DocumentData = {}): ProgressReport => ({
  id,
  enrollmentId: getString(data.enrollmentId),
  classId: getString(data.classId),
  className: getString(data.className),
  studentUid: getString(data.studentUid),
  periodLabel: getString(data.periodLabel),
  grade: getString(data.grade) || undefined,
  skills: Array.isArray(data.skills)
    ? (data.skills as DocumentData[])
        .map((row) => ({ name: getString(row?.name), rating: Math.min(5, Math.max(0, Math.round(toNumber(row?.rating)))) }))
        .filter((skill) => skill.name)
    : [],
  remarks: getString(data.remarks),
  createdBy: getString(data.createdBy),
  publishedAt: data.publishedAt,
});

// ---------------------------------------------------------------------------
// PURE summary math
// ---------------------------------------------------------------------------

export interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  /** 0–100. Late counts as attended; excused is removed from the denominator. */
  percent: number;
  /** Consecutive most-recent sessions attended (present or late). */
  streak: number;
}

/**
 * Attendance stats for a set of records.
 *
 * `late` counts as attended — a student who showed up 10 minutes late was
 * there. `excused` is excluded from BOTH sides: an authorised absence should
 * neither reward nor punish the percentage.
 */
export const summarizeAttendance = (records: AttendanceRecord[]): AttendanceSummary => {
  let present = 0; let absent = 0; let late = 0; let excused = 0;
  for (const record of records || []) {
    if (record.status === "present") present += 1;
    else if (record.status === "late") late += 1;
    else if (record.status === "excused") excused += 1;
    else absent += 1;
  }
  const total = present + absent + late + excused;
  const counted = present + late + absent;
  const percent = counted === 0 ? 0 : Math.round(((present + late) / counted) * 100);

  // Streak: walk backwards through the most recent sessions.
  const sorted = [...(records || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  let streak = 0;
  for (const record of sorted) {
    if (record.status === "present" || record.status === "late") streak += 1;
    else if (record.status === "excused") continue; // doesn't break a streak
    else break;
  }

  return { total, present, absent, late, excused, percent, streak };
};

/** Group records by "YYYY-MM" for a month-by-month view. */
export const groupAttendanceByMonth = (records: AttendanceRecord[]): Record<string, AttendanceRecord[]> => {
  const map: Record<string, AttendanceRecord[]> = {};
  for (const record of records || []) {
    const month = (record.date || "").slice(0, 7);
    if (!month) continue;
    (map[month] ||= []).push(record);
  }
  return map;
};

// ---------------------------------------------------------------------------
// Firestore access
// ---------------------------------------------------------------------------

export interface AttendanceMark {
  enrollmentId: string;
  classId: string;
  className: string;
  studentUid: string;
  studentName: string;
  studentId: string;
  status: AttendanceStatus;
  note?: string;
}

/**
 * Staff: save a whole roster for one date in a single batch. Deterministic ids
 * mean re-saving a date edits the existing rows instead of duplicating them.
 */
export const saveAttendanceForDate = async (
  date: string,
  sessionLabel: string,
  marks: AttendanceMark[],
  markedBy: string,
): Promise<number> => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Pick a valid date.");
  const batch = writeBatch(db);
  for (const mark of marks) {
    const id = buildAttendanceId(mark.enrollmentId, date);
    batch.set(doc(db, ATTENDANCE_COLLECTION, id), {
      enrollmentId: mark.enrollmentId,
      classId: mark.classId,
      className: mark.className,
      studentUid: mark.studentUid,
      studentName: mark.studentName,
      studentId: mark.studentId,
      date,
      status: mark.status,
      // Firestore rejects undefined — omit rather than write it.
      ...(sessionLabel ? { sessionLabel } : {}),
      ...(mark.note ? { note: mark.note } : {}),
      markedBy,
      markedAt: serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
  return marks.length;
};

/** Staff: every attendance row for a class on one date. */
export const listAttendanceForDate = async (classId: string, date: string): Promise<AttendanceRecord[]> => {
  const snapshot = await getDocs(query(
    collection(db, ATTENDANCE_COLLECTION),
    where("classId", "==", classId),
    where("date", "==", date),
  ));
  return snapshot.docs.map((docSnap) => normalizeAttendance(docSnap.id, docSnap.data()));
};

/** Staff or owner: the full attendance history of one enrolment. */
export const listAttendanceForEnrollment = async (enrollmentId: string): Promise<AttendanceRecord[]> => {
  const snapshot = await getDocs(query(
    collection(db, ATTENDANCE_COLLECTION),
    where("enrollmentId", "==", enrollmentId),
  ));
  return snapshot.docs
    .map((docSnap) => normalizeAttendance(docSnap.id, docSnap.data()))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
};

/** Student: their own attendance across every class. */
export const listMyAttendance = async (uid: string): Promise<AttendanceRecord[]> => {
  const snapshot = await getDocs(query(collection(db, ATTENDANCE_COLLECTION), where("studentUid", "==", uid)));
  return snapshot.docs
    .map((docSnap) => normalizeAttendance(docSnap.id, docSnap.data()))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
};

/** Staff: publish a progress report. */
export const saveProgressReport = async (
  report: Omit<ProgressReport, "id" | "publishedAt">,
): Promise<string> => {
  const id = `${report.enrollmentId}_${report.periodLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const batch = writeBatch(db);
  batch.set(doc(db, PROGRESS_REPORTS_COLLECTION, id), {
    ...report,
    ...(report.grade ? { grade: report.grade } : {}),
    publishedAt: serverTimestamp(),
  }, { merge: true });
  await batch.commit();
  return id;
};

/** Student: their own progress reports. */
export const listMyProgressReports = async (uid: string): Promise<ProgressReport[]> => {
  const snapshot = await getDocs(query(collection(db, PROGRESS_REPORTS_COLLECTION), where("studentUid", "==", uid)));
  return snapshot.docs.map((docSnap) => normalizeProgressReport(docSnap.id, docSnap.data()));
};

/** Staff or owner: progress reports for one enrolment. */
export const listProgressForEnrollment = async (enrollmentId: string): Promise<ProgressReport[]> => {
  const snapshot = await getDocs(query(
    collection(db, PROGRESS_REPORTS_COLLECTION),
    where("enrollmentId", "==", enrollmentId),
  ));
  return snapshot.docs.map((docSnap) => normalizeProgressReport(docSnap.id, docSnap.data()));
};
