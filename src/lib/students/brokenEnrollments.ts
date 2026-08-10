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
}

/**
 * Enrolments whose class no longer exists. Cancelled enrolments are ignored:
 * nobody is trying to attend those, so flagging them is just noise.
 */
export const findBrokenEnrollments = (
  enrollments: EnrollmentDoc[],
  classIds: Iterable<string>,
): BrokenEnrollment[] => {
  const known = new Set(classIds);
  return (enrollments || [])
    .filter((enrollment) => enrollment.status !== "cancelled")
    .filter((enrollment) => Boolean(enrollment.classId) && !known.has(enrollment.classId))
    .map((enrollment) => ({
      enrollment,
      missingClassId: enrollment.classId,
      rememberedClassName: enrollment.className || "",
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
