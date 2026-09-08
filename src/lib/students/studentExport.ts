// ---------------------------------------------------------------------------
// STUDENT EXPORT (req 1): "download the students' data as Excel, by class or
// course".
//
// A student may hold several classes, so there are two honest shapes for this
// file and the admin picks:
//
//   • one row per STUDENT  — the address book view; classes listed in one cell
//   • one row per ENROLMENT — the register view; a student in three classes is
//     three rows, each with that class's own fee, batch, trainer and joining
//     date. This is the one that adds up when you filter to a single class.
//
// PURE: the shaping and filtering live here so they can be asserted in tests;
// the dialog only renders them.
// ---------------------------------------------------------------------------
import type { CellValue } from "@/lib/export/xlsx";
import { buildCourseBreakdown, buildStudentBreakdown, type GstConfig } from "./feeBreakdown";
import { ONBOARDING_STATUS_LABELS } from "./types";
import type { StudentCourse, StudentDoc } from "./types";

export type StudentExportShape = "student" | "enrollment";

export interface StudentExportFilters {
  /** Empty = every class. Matched against each course's classId. */
  classIds: string[];
  /** Include students whose profile is switched off. */
  includeInactive: boolean;
  /** Include courses the admin marked "dropped". */
  includeDropped: boolean;
  /** Only students who finished onboarding (have a roll number / login). */
  approvedOnly: boolean;
}

export const DEFAULT_STUDENT_EXPORT_FILTERS: StudentExportFilters = {
  classIds: [],
  includeInactive: true,
  includeDropped: false,
  approvedOnly: false,
};

/** A student paired with ONE of their classes. */
export interface StudentEnrollmentRow {
  student: StudentDoc;
  course: StudentCourse;
}

const rupees = (paise: number): number => Math.round(paise) / 100;

const courseMatches = (course: StudentCourse, filters: StudentExportFilters): boolean => {
  if (!filters.includeDropped && course.status === "dropped") return false;
  if (filters.classIds.length > 0 && !filters.classIds.includes(course.classId)) return false;
  return true;
};

const studentMatches = (student: StudentDoc, filters: StudentExportFilters): boolean => {
  if (!filters.includeInactive && !student.active) return false;
  if (filters.approvedOnly && student.onboardingStatus !== "approved") return false;
  return true;
};

/** One row per student-and-class pair. */
export const buildEnrollmentRows = (students: StudentDoc[], filters: StudentExportFilters): StudentEnrollmentRow[] => {
  const rows: StudentEnrollmentRow[] = [];
  for (const student of students || []) {
    if (!studentMatches(student, filters)) continue;
    for (const course of student.courses || []) {
      if (!courseMatches(course, filters)) continue;
      rows.push({ student, course });
    }
  }
  return rows;
};

/**
 * One row per student. A class filter still applies — a student with no
 * matching class is left out entirely, so "export class X" never leaks someone
 * who does not attend it.
 */
export const buildStudentRows = (students: StudentDoc[], filters: StudentExportFilters): StudentDoc[] =>
  (students || []).filter((student) => {
    if (!studentMatches(student, filters)) return false;
    return (student.courses || []).some((course) => courseMatches(course, filters));
  });

/** "KP Grades (Mon/Wed) · Diploma 1st Sem" — the classes kept by the filter. */
export const describeClasses = (student: StudentDoc, filters: StudentExportFilters): string =>
  (student.courses || [])
    .filter((course) => courseMatches(course, filters))
    .map((course) => `${course.className}${course.slotLabel ? ` (${course.slotLabel})` : ""}`)
    .join(" · ");

/**
 * What one class costs this student in full, in rupees — the same total the
 * payment link shows, GST included, so the sheet and the parent's link agree.
 */
export const courseFeeInRupees = (course: StudentCourse, gst?: GstConfig): number =>
  rupees(buildCourseBreakdown(course, gst).totalInPaise);

export interface ExportColumnSpec<T> {
  key: string;
  label: string;
  width?: number;
  money?: boolean;
  optional?: boolean;
  value: (row: T) => CellValue;
}

const statusLabel = (student: StudentDoc): string =>
  ONBOARDING_STATUS_LABELS[student.onboardingStatus] || student.onboardingStatus;

const commonStudentColumns = <T,>(get: (row: T) => StudentDoc): ExportColumnSpec<T>[] => [
  { key: "studentId", label: "Roll no", width: 12, value: (row) => get(row).studentId || get(row).desiredStudentId || "—" },
  { key: "name", label: "Student", width: 26, value: (row) => get(row).name },
  { key: "age", label: "Age", width: 8, value: (row) => get(row).age || "" },
  { key: "gender", label: "Gender", width: 10, value: (row) => get(row).gender },
  { key: "parentName", label: "Parent / guardian", width: 24, value: (row) => get(row).parentName },
  { key: "relation", label: "Relation", width: 12, optional: true, value: (row) => get(row).parentRelation },
  { key: "phone", label: "Phone", width: 16, value: (row) => get(row).phone },
  { key: "email", label: "Email (login id)", width: 30, value: (row) => get(row).email },
  { key: "address", label: "Address", width: 40, optional: true, value: (row) => get(row).address },
  { key: "mode", label: "Online / offline", width: 14, optional: true, value: (row) => get(row).mode },
  { key: "status", label: "Onboarding", width: 18, value: (row) => statusLabel(get(row)) },
  { key: "active", label: "Active", width: 10, value: (row) => (get(row).active ? "Yes" : "No") },
];

/** Columns for the register view — one row per class. */
export const enrollmentColumns = (): ExportColumnSpec<StudentEnrollmentRow>[] => [
  { key: "className", label: "Class", width: 34, value: (row) => row.course.className || "—" },
  { key: "slot", label: "Batch", width: 22, value: (row) => row.course.slotLabel || "—" },
  ...commonStudentColumns<StudentEnrollmentRow>((row) => row.student),
  { key: "trainer", label: "Trainer", width: 20, value: (row) => row.course.trainerName || "—" },
  { key: "joining", label: "Joined", width: 12, value: (row) => row.course.joiningDate || "—" },
  { key: "track", label: "Fee track", width: 12, value: (row) => row.course.fees.track },
  { key: "fee", label: "Total fee (₹)", width: 16, money: true, value: (row) => courseFeeInRupees(row.course, row.student.gst) },
  { key: "nextCharge", label: "Next charge", width: 14, value: (row) => row.course.nextChargeDate || "—" },
  { key: "courseStatus", label: "Class status", width: 14, value: (row) => row.course.status },
  { key: "enrollmentId", label: "Enrolment id", width: 24, optional: true, value: (row) => row.course.enrollmentId || "—" },
];

/** Columns for the address-book view — one row per student. */
export const studentColumns = (filters: StudentExportFilters): ExportColumnSpec<StudentDoc>[] => [
  ...commonStudentColumns<StudentDoc>((student) => student),
  { key: "classes", label: "Classes", width: 44, value: (student) => describeClasses(student, filters) || "—" },
  {
    key: "classCount",
    label: "No. of classes",
    width: 14,
    value: (student) => (student.courses || []).filter((course) => course.status !== "dropped").length,
  },
  {
    key: "totalFee",
    label: "Total fee, all classes (₹)",
    width: 22,
    money: true,
    value: (student) => rupees(buildStudentBreakdown(student.courses, student.gst).grandTotalInPaise),
  },
  { key: "joining", label: "Joined", width: 12, value: (student) => student.courses?.[0]?.joiningDate || "—" },
];
