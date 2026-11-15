import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  ELEARN_ENROLLMENTS,
  ELEARN_PROGRESS,
  elearnDocId,
  normalizeEnrollment,
  normalizeProgress,
  toMillis,
} from "./helpers";
import type { ElearnEnrollment, ElearnEnrollmentStatus, ElearnProgress } from "./types";

// Enrollments are written ONLY by the server (api/_razorpay/elearn.ts); the
// client just reads them. Progress is the student's own doc.

const newestFirst = (a: ElearnEnrollment, b: ElearnEnrollment) =>
  (toMillis(b.updatedAt) ?? 0) - (toMillis(a.updatedAt) ?? 0);

/** The signed-in user's enrollments (all statuses), newest first. */
export const subscribeMyEnrollments = (
  uid: string,
  onChange: (enrollments: ElearnEnrollment[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe =>
  onSnapshot(
    query(collection(db, ELEARN_ENROLLMENTS), where("uid", "==", uid)),
    (snapshot) => onChange(snapshot.docs.map((item) => normalizeEnrollment(item.id, item.data())).sort(newestFirst)),
    (error) => onError?.(error),
  );

/** One user's enrollment for one course (null when none yet). */
export const subscribeEnrollment = (
  uid: string,
  courseId: string,
  onChange: (enrollment: ElearnEnrollment | null) => void,
  onError?: (error: unknown) => void,
): Unsubscribe =>
  onSnapshot(
    doc(db, ELEARN_ENROLLMENTS, elearnDocId(uid, courseId)),
    (snapshot) => onChange(snapshot.exists() ? normalizeEnrollment(snapshot.id, snapshot.data()) : null),
    (error) => onError?.(error),
  );

/** Staff: all enrollments, or only those with the given status(es), newest first. */
export const subscribeStaffEnrollments = (
  filter: { status?: ElearnEnrollmentStatus | ElearnEnrollmentStatus[]; courseId?: string },
  onChange: (enrollments: ElearnEnrollment[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe => {
  const constraints = [];
  const statuses = filter.status === undefined ? [] : Array.isArray(filter.status) ? filter.status : [filter.status];
  if (statuses.length === 1) constraints.push(where("status", "==", statuses[0]));
  else if (statuses.length > 1) constraints.push(where("status", "in", statuses.slice(0, 10)));
  if (filter.courseId) constraints.push(where("courseId", "==", filter.courseId));
  return onSnapshot(
    query(collection(db, ELEARN_ENROLLMENTS), ...constraints),
    (snapshot) => onChange(snapshot.docs.map((item) => normalizeEnrollment(item.id, item.data())).sort(newestFirst)),
    (error) => onError?.(error),
  );
};

// ── Progress (owner only; the rules whitelist these exact fields) ─────────

export const getProgress = async (uid: string, courseId: string): Promise<ElearnProgress | null> => {
  const snapshot = await getDoc(doc(db, ELEARN_PROGRESS, elearnDocId(uid, courseId)));
  return snapshot.exists() ? normalizeProgress(snapshot.data()) : null;
};

export const subscribeProgress = (
  uid: string,
  courseId: string,
  onChange: (progress: ElearnProgress | null) => void,
  onError?: (error: unknown) => void,
): Unsubscribe =>
  onSnapshot(
    doc(db, ELEARN_PROGRESS, elearnDocId(uid, courseId)),
    (snapshot) => onChange(snapshot.exists() ? normalizeProgress(snapshot.data()) : null),
    (error) => onError?.(error),
  );

export interface ProgressPatch {
  /** Remember where the student is (resume). */
  lastLessonId?: string;
  /** Resume position for one lesson, in seconds. */
  position?: { lessonId: string; seconds: number };
  /** Mark a lesson complete / not complete. */
  complete?: { lessonId: string; done: boolean };
}

/**
 * Merge a progress change into elearnProgress/{uid}_{courseId}. Only the
 * whitelisted fields are ever written (uid, courseId, completedLessonIds,
 * lastLessonId, positions, updatedAt), so the rules accept it.
 */
export const saveProgress = async (uid: string, courseId: string, patch: ProgressPatch): Promise<void> => {
  const data: Record<string, unknown> = { uid, courseId, updatedAt: serverTimestamp() };
  if (patch.lastLessonId) data.lastLessonId = patch.lastLessonId;
  if (patch.position && patch.position.lessonId) {
    const seconds = Math.max(0, Math.round(Number(patch.position.seconds) || 0));
    data.positions = { [patch.position.lessonId]: seconds };
  }
  if (patch.complete && patch.complete.lessonId) {
    data.completedLessonIds = patch.complete.done
      ? arrayUnion(patch.complete.lessonId)
      : arrayRemove(patch.complete.lessonId);
  }
  await setDoc(doc(db, ELEARN_PROGRESS, elearnDocId(uid, courseId)), data, { merge: true });
};
