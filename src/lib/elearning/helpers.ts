// Pure E-Learning helpers (no Firebase). The rules the server also needs
// (expiry, access, payment modes, proof URL) live in api/_lib/elearn-core.ts
// and are re-exported here so there is one copy.
import {
  ELEARN_ENROLLMENT_STATUSES,
  ELEARN_MAX_ACCESS_DAYS,
  hasActiveAccess,
  toMillis,
} from "../../../api/_lib/elearn-core";
import type {
  ElearnCourse,
  ElearnCourseContent,
  ElearnEnrollment,
  ElearnEnrollmentStatus,
  ElearnLesson,
  ElearnLevel,
  ElearnProgress,
  ElearnSection,
  FlatLesson,
  TimestampLike,
} from "./types";

export {
  availablePaymentModes,
  clampAccessDays,
  computeExpiresAt,
  ELEARN_MAX_ACCESS_DAYS,
  normalizeUpiUtr,
  ELEARN_CLOUDINARY_CLOUD,
  ELEARN_CONTENT,
  ELEARN_COURSES,
  ELEARN_ENROLLMENTS,
  ELEARN_PROGRESS,
  elearnDocId,
  hasActiveAccess,
  isAllowedProofUrl,
  toMillis,
} from "../../../api/_lib/elearn-core";

// ── Small readers ─────────────────────────────────────────────────────────

type Data = Record<string, unknown>;

const str = (value: unknown, fallback = "") => (typeof value === "string" ? value.trim() : fallback);
const nonNegInt = (value: unknown) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const strList = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
const timestamp = (value: unknown): TimestampLike =>
  value && (value instanceof Date || typeof (value as { toMillis?: unknown }).toMillis === "function") ? (value as TimestampLike) : null;

/** Short random id for new sections/lessons (admin editor). */
export const makeId = (prefix = "id") => {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
    : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${random}`;
};

// ── Vimeo links (spec §5) ─────────────────────────────────────────────────

export interface VimeoRef { id: string; hash: string }

const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

/**
 * Parse a Vimeo link to `{ id, hash }` (hash = the unlisted-video privacy key,
 * "" when none). Accepts vimeo.com/123, vimeo.com/123/abcdef,
 * player.vimeo.com/video/123?h=abcdef and channel/group/showcase links.
 * Anything not on Vimeo returns null.
 */
export const parseVimeoUrl = (raw: unknown): VimeoRef | null => {
  if (typeof raw !== "string") return null;
  let value = raw.trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!VIMEO_HOSTS.has(url.hostname.toLowerCase())) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  const queryHash = (url.searchParams.get("h") || "").trim();
  const cleanHash = (hash: string) => (/^[a-zA-Z0-9]+$/.test(hash) ? hash : "");

  if (url.hostname.toLowerCase() === "player.vimeo.com") {
    if (parts[0] !== "video" || !/^\d+$/.test(parts[1] || "")) return null;
    return { id: parts[1], hash: cleanHash(queryHash) };
  }

  // vimeo.com/123 or vimeo.com/123/hash
  if (/^\d+$/.test(parts[0] || "")) {
    return { id: parts[0], hash: cleanHash(parts[1] || queryHash) };
  }
  // vimeo.com/channels/x/123, /groups/x/videos/123, /showcase/x/video/123, /album/x/video/123
  if (["channels", "groups", "showcase", "album"].includes(parts[0] || "")) {
    const last = parts[parts.length - 1] || "";
    if (parts.length >= 3 && /^\d+$/.test(last)) return { id: last, hash: cleanHash(queryHash) };
  }
  return null;
};

export const buildVimeoEmbedUrl = ({ id, hash }: VimeoRef): string => {
  const params = new URLSearchParams();
  if (hash) params.set("h", hash);
  params.set("dnt", "1");
  params.set("title", "0");
  params.set("byline", "0");
  params.set("portrait", "0");
  return `https://player.vimeo.com/video/${id}?${params.toString()}`;
};

export const vimeoEmbedUrlFromLink = (raw: unknown): string | null => {
  const ref = parseVimeoUrl(raw);
  return ref ? buildVimeoEmbedUrl(ref) : null;
};

/** Vimeo oEmbed lookup URL (title, duration, thumbnail) for a valid link, else null. */
export const vimeoOembedUrl = (raw: unknown): string | null =>
  parseVimeoUrl(raw) ? `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(String(raw).trim())}` : null;

// ── Slugs ─────────────────────────────────────────────────────────────────

export const slugify = (title: string, fallback = "course"): string => {
  const slug = String(title || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || fallback;
};

/** `base`, else `base-2`, `base-3`… — the first id not in `taken`. */
export const pickFreeSlug = (base: string, taken: Set<string>): string => {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
};

// ── Curriculum ────────────────────────────────────────────────────────────

export const flattenLessons = (sections: ElearnSection[]): FlatLesson[] => {
  const flat: FlatLesson[] = [];
  for (const section of sections || []) {
    for (const lesson of section.lessons || []) {
      flat.push({ ...lesson, sectionId: section.id, sectionTitle: section.title, index: flat.length });
    }
  }
  return flat;
};

export const courseTotals = (sections: ElearnSection[]) => {
  const lessons = flattenLessons(sections);
  return {
    lessonCount: lessons.length,
    totalDurationSec: lessons.reduce((sum, lesson) => sum + nonNegInt(lesson.durationSec), 0),
  };
};

export const neighbourLessons = (sections: ElearnSection[], lessonId: string) => {
  const lessons = flattenLessons(sections);
  const index = lessons.findIndex((lesson) => lesson.id === lessonId);
  if (index < 0) return { prevId: null as string | null, nextId: null as string | null };
  return {
    prevId: index > 0 ? lessons[index - 1].id : null,
    nextId: index < lessons.length - 1 ? lessons[index + 1].id : null,
  };
};

// ── Durations + progress ──────────────────────────────────────────────────

/** Lesson clock: "1:05", "1:02:03". */
export const formatDuration = (seconds: number): string => {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

/** Course total: "45m", "1h", "3h 20m" (rounded up to whole minutes). */
export const formatTotalDuration = (seconds: number): string => {
  const total = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const minutes = Math.ceil(total / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

/** Whole-number % of the course's CURRENT lessons that are completed. */
export const progressPercent = (sections: ElearnSection[], completedLessonIds: string[]): number => {
  const lessons = flattenLessons(sections);
  if (lessons.length === 0) return 0;
  const done = new Set(completedLessonIds || []);
  const count = lessons.filter((lesson) => done.has(lesson.id)).length;
  return Math.round((count / lessons.length) * 100);
};

export const AUTO_COMPLETE_RATIO = 0.9;

export const shouldAutoComplete = (positionSec: number, durationSec: number): boolean =>
  durationSec > 0 && positionSec >= durationSec * AUTO_COMPLETE_RATIO;

// ── Normalizers (Firestore data → typed, safe defaults) ───────────────────

const LEVELS: ElearnLevel[] = ["beginner", "intermediate", "advanced", "all"];

const normalizeLesson = (raw: unknown, index: number): ElearnLesson | null => {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Data;
  const isPreview = data.isPreview === true;
  const lesson: ElearnLesson = {
    id: str(data.id) || `lesson_${index + 1}`,
    title: str(data.title),
    durationSec: nonNegInt(data.durationSec),
    isPreview,
  };
  const preview = str(data.previewVimeoUrl);
  if (isPreview && preview) lesson.previewVimeoUrl = preview;
  return lesson;
};

export const normalizeSections = (value: unknown): ElearnSection[] =>
  (Array.isArray(value) ? value : [])
    .filter((raw): raw is Data => Boolean(raw) && typeof raw === "object")
    .map((data, sectionIndex) => ({
      id: str(data.id) || `section_${sectionIndex + 1}`,
      title: str(data.title),
      lessons: (Array.isArray(data.lessons) ? data.lessons : [])
        .map((raw, lessonIndex) => normalizeLesson(raw, lessonIndex))
        .filter((lesson): lesson is ElearnLesson => lesson !== null),
    }));

export const normalizeCourse = (id: string, data: Data = {}): ElearnCourse => {
  const sections = normalizeSections(data.sections);
  const totals = courseTotals(sections);
  const priceInPaise = nonNegInt(data.priceInPaise);
  const compareAt = nonNegInt(data.compareAtInPaise);
  const modes = (data.paymentModes && typeof data.paymentModes === "object" ? data.paymentModes : {}) as Data;
  const course: ElearnCourse = {
    id,
    title: str(data.title),
    subtitle: str(data.subtitle),
    description: str(data.description),
    coverImageUrl: str(data.coverImageUrl),
    trailerVimeoUrl: str(data.trailerVimeoUrl),
    category: str(data.category),
    level: LEVELS.includes(data.level as ElearnLevel) ? (data.level as ElearnLevel) : "all",
    language: str(data.language),
    instructorName: str(data.instructorName),
    instructorBio: str(data.instructorBio),
    instructorPhotoUrl: str(data.instructorPhotoUrl),
    outcomes: strList(data.outcomes),
    requirements: strList(data.requirements),
    priceInPaise,
    paymentModes: { razorpay: modes.razorpay !== false, upi: modes.upi === true },
    accessDays: Math.min(nonNegInt(data.accessDays), ELEARN_MAX_ACCESS_DAYS),
    status: data.status === "published" ? "published" : "draft",
    featured: data.featured === true,
    sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0,
    sections,
    lessonCount: totals.lessonCount,
    totalDurationSec: totals.totalDurationSec,
    createdAt: timestamp(data.createdAt),
    updatedAt: timestamp(data.updatedAt),
  };
  if (compareAt > priceInPaise) course.compareAtInPaise = compareAt;
  return course;
};

export const normalizeContent = (data: Data = {}): ElearnCourseContent => {
  const lessons: ElearnCourseContent["lessons"] = {};
  const raw = data.lessons && typeof data.lessons === "object" ? (data.lessons as Data) : {};
  for (const [lessonId, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Data;
    const item: ElearnCourseContent["lessons"][string] = { vimeoUrl: str(entry.vimeoUrl) };
    const resourceUrl = str(entry.resourceUrl);
    const notes = str(entry.notes);
    if (resourceUrl) item.resourceUrl = resourceUrl;
    if (notes) item.notes = notes;
    lessons[lessonId] = item;
  }
  return { lessons };
};

export const normalizeEnrollment = (id: string, data: Data = {}): ElearnEnrollment => {
  const status = ELEARN_ENROLLMENT_STATUSES.includes(data.status as ElearnEnrollmentStatus)
    ? (data.status as ElearnEnrollmentStatus)
    : "awaiting-payment";
  const method = data.method === "razorpay" || data.method === "upi" || data.method === "grant" ? data.method : "";
  const optional = (key: string) => (str(data[key]) ? { [key]: str(data[key]) } : {});
  return {
    id,
    uid: str(data.uid),
    courseId: str(data.courseId),
    courseTitle: str(data.courseTitle),
    userName: str(data.userName),
    userEmail: str(data.userEmail),
    userPhone: str(data.userPhone),
    status,
    method,
    amountInPaise: nonNegInt(data.amountInPaise),
    ...optional("razorpayOrderId"),
    ...optional("razorpayPaymentId"),
    ...optional("upiProofUrl"),
    ...optional("upiRef"),
    ...optional("rejectReason"),
    ...optional("reviewedBy"),
    ...(ELEARN_ENROLLMENT_STATUSES.includes(data.previousStatus as ElearnEnrollmentStatus)
      ? { previousStatus: data.previousStatus as ElearnEnrollmentStatus }
      : {}),
    ...optional("previousRejectReason"),
    ...(Array.isArray(data.extraPaymentIds)
      ? { extraPaymentIds: data.extraPaymentIds.filter((item): item is string => typeof item === "string" && item.length > 0) }
      : {}),
    ...(timestamp(data.refundedAt) ? { refundedAt: timestamp(data.refundedAt) } : {}),
    submittedAt: timestamp(data.submittedAt),
    activatedAt: timestamp(data.activatedAt),
    expiresAt: timestamp(data.expiresAt),
    createdAt: timestamp(data.createdAt),
    updatedAt: timestamp(data.updatedAt),
  };
};

export const normalizeProgress = (data: Data = {}): ElearnProgress => {
  const positions: Record<string, number> = {};
  const raw = data.positions && typeof data.positions === "object" ? (data.positions as Data) : {};
  for (const [lessonId, value] of Object.entries(raw)) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) positions[lessonId] = Math.round(value);
  }
  return {
    uid: str(data.uid),
    courseId: str(data.courseId),
    completedLessonIds: Array.from(new Set(strList(data.completedLessonIds))),
    lastLessonId: str(data.lastLessonId),
    positions,
    updatedAt: timestamp(data.updatedAt),
  };
};

// ── Access + publishing ───────────────────────────────────────────────────

/** Days of access left, or null for lifetime / no access. */
export const daysLeft = (enrollment: Pick<ElearnEnrollment, "status" | "expiresAt"> | null | undefined, now = Date.now()): number | null => {
  if (!hasActiveAccess(enrollment, now)) return null;
  const expires = toMillis(enrollment?.expiresAt);
  return expires === null ? null : Math.ceil((expires - now) / (24 * 60 * 60 * 1000));
};

/**
 * Why a course cannot be published (empty = ok). With `content`, also checks
 * that every paid lesson has a valid Vimeo link.
 */
export const publishProblems = (course: ElearnCourse, content?: ElearnCourseContent | null): string[] => {
  const problems: string[] = [];
  if (!course.title.trim()) problems.push("Add a course title.");
  if (course.priceInPaise <= 0) problems.push("Set a price above ₹0.");
  if (!course.paymentModes.razorpay && !course.paymentModes.upi) problems.push("Turn on at least one payment mode.");
  const lessons = flattenLessons(course.sections);
  if (lessons.length === 0) problems.push("Add at least one lesson.");
  for (const lesson of lessons) {
    const name = lesson.title || `Lesson ${lesson.index + 1}`;
    if (lesson.isPreview && !parseVimeoUrl(lesson.previewVimeoUrl)) {
      problems.push(`"${name}" is a free preview but has no valid Vimeo link.`);
    } else if (!lesson.isPreview && content && !parseVimeoUrl(content.lessons[lesson.id]?.vimeoUrl)) {
      problems.push(`"${name}" has no valid Vimeo link.`);
    }
  }
  return problems;
};
