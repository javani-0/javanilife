import type { EnrollmentDoc } from "@/lib/classes";

// ---------------------------------------------------------------------------
// Broken enrolments (req 6).
//
// An enrolment stores `classId` plus a denormalized `className`. When a class
// document is deleted the enrolment survives, still pointing at an id nothing
// answers to. The student then reaches their class room and finds no live
// link, no recordings and no materials — not because none were uploaded, but
// because the class they are attached to no longer exists.
//
// Three live enrolments were in exactly this state. This module finds them so
// the admin can re-link each one to a real class; the mapping is never guessed.
// ---------------------------------------------------------------------------

export interface BrokenEnrollment {
  enrollment: EnrollmentDoc;
  /** The class id the enrolment points at — kept for the admin to see. */
  missingClassId: string;
  /** The class name as it was when the enrolment was created. */
  rememberedClassName: string;
  /**
   * True when NO student profile claims this enrolment any more — the student
   * was deleted and this row is all that survived them. Re-linking such a row
   * helps nobody; it should simply be deleted (req 2).
   */
  studentDeleted: boolean;
}

/**
 * The enrolments and logins that live student profiles still claim. Anything
 * outside this index belongs to a student who no longer exists.
 */
export interface StudentClaimIndex {
  enrollmentIds: Set<string>;
  userUids: Set<string>;
}

export interface StudentClaimSource {
  enrollmentId?: string;
  enrollmentIds?: string[];
  userUid?: string;
  courses?: { enrollmentId?: string }[];
}

export const buildStudentClaimIndex = (students: StudentClaimSource[]): StudentClaimIndex => {
  const enrollmentIds = new Set<string>();
  const userUids = new Set<string>();
  for (const student of students || []) {
    if (student.enrollmentId) enrollmentIds.add(student.enrollmentId);
    for (const id of student.enrollmentIds || []) if (id) enrollmentIds.add(id);
    for (const course of student.courses || []) if (course?.enrollmentId) enrollmentIds.add(course.enrollmentId);
    if (student.userUid) userUids.add(student.userUid);
  }
  return { enrollmentIds, userUids };
};

/**
 * Does a live student profile still own this enrolment? Matched by enrolment id
 * first and by the portal login second, because enrolments created before the
 * Student Manager existed are only tied to their parent's uid.
 */
export const isClaimedByAStudent = (enrollment: EnrollmentDoc, index?: StudentClaimIndex): boolean => {
  if (!index) return true; // no student list supplied → never claim someone is gone
  if (index.enrollmentIds.has(enrollment.id)) return true;
  return Boolean(enrollment.parentUserId) && index.userUids.has(enrollment.parentUserId);
};

/**
 * Enrolments whose class no longer exists. Cancelled enrolments are ignored:
 * nobody is trying to attend those, so flagging them is just noise.
 */
export const findBrokenEnrollments = (
  enrollments: EnrollmentDoc[],
  classIds: Iterable<string>,
  /** Live student profiles — supply them to spot enrolments left by a deleted student. */
  studentIndex?: StudentClaimIndex,
): BrokenEnrollment[] => {
  const known = new Set(classIds);
  return (enrollments || [])
    .filter((enrollment) => enrollment.status !== "cancelled")
    .filter((enrollment) => Boolean(enrollment.classId) && !known.has(enrollment.classId))
    .map((enrollment) => ({
      enrollment,
      missingClassId: enrollment.classId,
      rememberedClassName: enrollment.className || "",
      studentDeleted: !isClaimedByAStudent(enrollment, studentIndex),
    }));
};

/**
 * A best-effort suggestion for which class a broken enrolment belonged to,
 * matched on the remembered name. Live data is messy — an enrolment recorded
 * as "DIPLOMA IN KUCHIPUDI (JKDP)" belongs to "DIPLOMA IN KUCHIPUDI (JKDP)
 * 1st SEM" — so a prefix match either way counts.
 *
 * This only PRE-SELECTS a choice for the admin; it never re-links anything on
 * its own.
 */
export const suggestClassFor = <T extends { id: string; name: string }>(
  broken: Pick<BrokenEnrollment, "rememberedClassName">,
  classes: T[],
): T | null => {
  const remembered = normalize(broken.rememberedClassName);
  if (!remembered) return null;

  const exact = (classes || []).find((cls) => normalize(cls.name) === remembered);
  if (exact) return exact;

  const prefix = (classes || []).find((cls) => {
    const name = normalize(cls.name);
    return name.startsWith(remembered) || remembered.startsWith(name);
  });
  return prefix || null;
};

const normalize = (value: string): string =>
  (value || "").trim().toLowerCase().replace(/\s+/g, " ");
