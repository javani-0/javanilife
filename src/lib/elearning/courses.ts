import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  courseTotals,
  ELEARN_CONTENT,
  ELEARN_COURSES,
  ELEARN_ENROLLMENTS,
  normalizeContent,
  normalizeCourse,
  normalizeSections,
  pickFreeSlug,
  slugify,
} from "./helpers";
import type { ElearnCourse, ElearnCourseContent, ElearnCourseInput } from "./types";

// Catalogue order: featured first, then the admin's sortOrder, then title.
// Sorted on the client so no composite index is needed.
export const sortCourses = (courses: ElearnCourse[]): ElearnCourse[] =>
  [...courses].sort((a, b) =>
    Number(b.featured) - Number(a.featured)
    || a.sortOrder - b.sortOrder
    || a.title.localeCompare(b.title));

const publishedQuery = () => query(collection(db, ELEARN_COURSES), where("status", "==", "published"));

/** Public catalogue (published only — the rules refuse anything else to the public). */
export const subscribePublishedCourses = (
  onChange: (courses: ElearnCourse[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe =>
  onSnapshot(
    publishedQuery(),
    (snapshot) => onChange(sortCourses(snapshot.docs.map((item) => normalizeCourse(item.id, item.data())))),
    (error) => onError?.(error),
  );

export const listPublishedCourses = async (): Promise<ElearnCourse[]> => {
  const snapshot = await getDocs(publishedQuery());
  return sortCourses(snapshot.docs.map((item) => normalizeCourse(item.id, item.data())));
};

/** One course, or null when missing / not readable (a draft for the public). */
export const getCourse = async (courseId: string): Promise<ElearnCourse | null> => {
  if (!courseId) return null;
  try {
    const snapshot = await getDoc(doc(db, ELEARN_COURSES, courseId));
    return snapshot.exists() ? normalizeCourse(snapshot.id, snapshot.data()) : null;
  } catch (error) {
    // A draft course is permission-denied for visitors: treat it as not found.
    if ((error as { code?: string })?.code === "permission-denied") return null;
    throw error;
  }
};

export const subscribeCourse = (
  courseId: string,
  onChange: (course: ElearnCourse | null) => void,
  onError?: (error: unknown) => void,
): Unsubscribe =>
  onSnapshot(
    doc(db, ELEARN_COURSES, courseId),
    (snapshot) => onChange(snapshot.exists() ? normalizeCourse(snapshot.id, snapshot.data()) : null),
    (error) => {
      if ((error as { code?: string })?.code === "permission-denied") onChange(null);
      else onError?.(error);
    },
  );

/** Staff: every course including drafts. */
export const subscribeAllCourses = (
  onChange: (courses: ElearnCourse[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe =>
  onSnapshot(
    collection(db, ELEARN_COURSES),
    (snapshot) => onChange(sortCourses(snapshot.docs.map((item) => normalizeCourse(item.id, item.data())))),
    (error) => onError?.(error),
  );

export const listAllCourses = async (): Promise<ElearnCourse[]> => {
  const snapshot = await getDocs(collection(db, ELEARN_COURSES));
  return sortCourses(snapshot.docs.map((item) => normalizeCourse(item.id, item.data())));
};

/** Cleaned, Firestore-ready course fields with derived totals. */
const toCourseRecord = (input: ElearnCourseInput) => {
  // Round-trip through the normalizer so bad values never reach Firestore and
  // a non-preview lesson never keeps a public video link.
  const clean = normalizeCourse("", { ...input, sections: normalizeSections(input.sections) });
  const totals = courseTotals(clean.sections);
  const record: Record<string, unknown> = {
    title: clean.title,
    subtitle: clean.subtitle,
    description: clean.description,
    coverImageUrl: clean.coverImageUrl,
    trailerVimeoUrl: clean.trailerVimeoUrl,
    category: clean.category,
    level: clean.level,
    language: clean.language,
    instructorName: clean.instructorName,
    instructorBio: clean.instructorBio,
    instructorPhotoUrl: clean.instructorPhotoUrl,
    outcomes: clean.outcomes,
    requirements: clean.requirements,
    priceInPaise: clean.priceInPaise,
    compareAtInPaise: clean.compareAtInPaise ?? null,
    paymentModes: clean.paymentModes,
    accessDays: clean.accessDays,
    status: clean.status,
    featured: clean.featured,
    sortOrder: clean.sortOrder,
    sections: clean.sections,
    lessonCount: totals.lessonCount,
    totalDurationSec: totals.totalDurationSec,
    updatedAt: serverTimestamp(),
  };
  return record;
};

/**
 * Create (no `courseId`) or update a course. A new course gets a slug id from
 * its title (`-2`, `-3`… on a clash); the id never changes afterwards.
 * Returns the course id.
 */
export const saveCourse = async (input: ElearnCourseInput, courseId?: string): Promise<string> => {
  const record = toCourseRecord(input);
  if (courseId) {
    await setDoc(doc(db, ELEARN_COURSES, courseId), record, { merge: true });
    return courseId;
  }
  const base = slugify(input.title);
  const taken = new Set<string>();
  let id = base;
  // Bounded probe; ids are only ever created by staff so clashes are rare.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    id = pickFreeSlug(base, taken);
    const existing = await getDoc(doc(db, ELEARN_COURSES, id));
    if (!existing.exists()) break;
    taken.add(id);
  }
  await setDoc(doc(db, ELEARN_COURSES, id), { ...record, createdAt: serverTimestamp() });
  return id;
};

/** Delete a course and its private content. Enrollments stay as the purchase record. */
export const deleteCourse = async (courseId: string): Promise<void> => {
  await deleteDoc(doc(db, ELEARN_CONTENT, courseId)).catch(() => undefined);
  await deleteDoc(doc(db, ELEARN_COURSES, courseId));
};

/** Private lesson links. Readable by staff or an active enrollment; null when denied/missing. */
export const getCourseContent = async (courseId: string): Promise<ElearnCourseContent | null> => {
  try {
    const snapshot = await getDoc(doc(db, ELEARN_CONTENT, courseId));
    return snapshot.exists() ? normalizeContent(snapshot.data()) : { lessons: {} };
  } catch (error) {
    if ((error as { code?: string })?.code === "permission-denied") return null;
    throw error;
  }
};

/** Staff: replace the private lesson links (lessonId → { vimeoUrl, resourceUrl?, notes? }). */
export const saveCourseContent = async (courseId: string, content: ElearnCourseContent): Promise<void> => {
  const clean = normalizeContent(content as unknown as Record<string, unknown>);
  await setDoc(doc(db, ELEARN_CONTENT, courseId), { lessons: clean.lessons, updatedAt: serverTimestamp() });
};

/**
 * Staff: move a course to a new link made from its current title (e.g. after a
 * rename). Copies the course + private content to the new id and deletes the
 * old docs in one batch. Refused while anyone has (or is buying) access, because
 * enrollments and progress are keyed by the course id. Returns the new id.
 */
export const changeCourseLink = async (courseId: string, title: string): Promise<string> => {
  const base = slugify(title);
  if (!base || base === courseId) return courseId;
  const enrollments = await getDocs(query(collection(db, ELEARN_ENROLLMENTS), where("courseId", "==", courseId)));
  const live = enrollments.docs.filter((item) => !["rejected", "revoked"].includes(String(item.data().status)));
  if (live.length > 0) {
    throw new Error(`${live.length} student record(s) use this link, so it can't change now.`);
  }
  const [courseSnap, contentSnap] = await Promise.all([
    getDoc(doc(db, ELEARN_COURSES, courseId)),
    getDoc(doc(db, ELEARN_CONTENT, courseId)),
  ]);
  if (!courseSnap.exists()) throw new Error("Course not found.");
  const taken = new Set<string>();
  let id = base;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    id = pickFreeSlug(base, taken);
    if (id === courseId) break;
    const existing = await getDoc(doc(db, ELEARN_COURSES, id));
    if (!existing.exists()) break;
    taken.add(id);
  }
  if (id === courseId) return courseId;
  const batch = writeBatch(db);
  batch.set(doc(db, ELEARN_COURSES, id), { ...courseSnap.data(), updatedAt: serverTimestamp() });
  if (contentSnap.exists()) batch.set(doc(db, ELEARN_CONTENT, id), contentSnap.data());
  batch.delete(doc(db, ELEARN_CONTENT, courseId));
  batch.delete(doc(db, ELEARN_COURSES, courseId));
  await batch.commit();
  return id;
};
