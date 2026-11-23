// Pure helpers for the admin course editor (/admin/elearning). The editor works
// on a "draft" (strings for every typed field) and converts it to the saved
// shapes (ElearnCourseInput for the public doc, ElearnCourseContent for the
// private lesson links) only on save. No Firebase here, so it is unit-tested.
import { parsePriceToPaise } from "@/lib/ecommerce/pricing";
import { isVideoUrl, makeId, normalizeCourse, publishProblems } from "./helpers";
import type {
  ElearnCourse,
  ElearnCourseContent,
  ElearnCourseInput,
  ElearnCourseStatus,
  ElearnEnrollment,
  ElearnLevel,
  PaymentModes,
} from "./types";

export interface LessonDraft {
  id: string;
  title: string;
  vimeoUrl: string;
  /** What the admin typed: "mm:ss", "h:mm:ss" or whole minutes. */
  durationText: string;
  isPreview: boolean;
  resourceUrl: string;
  notes: string;
}

export interface SectionDraft {
  id: string;
  title: string;
  lessons: LessonDraft[];
}

export interface CourseDraft {
  title: string;
  subtitle: string;
  description: string;
  coverImageUrl: string;
  trailerVimeoUrl: string;
  category: string;
  level: ElearnLevel;
  language: string;
  instructorName: string;
  instructorBio: string;
  instructorPhotoUrl: string;
  outcomes: string[];
  requirements: string[];
  priceRupees: string;
  compareAtRupees: string;
  /** Whole days as typed; "0" or "" = lifetime. */
  accessDays: string;
  featured: boolean;
  sortOrder: number;
  paymentModes: PaymentModes;
  status: ElearnCourseStatus;
  sections: SectionDraft[];
}

// ── Durations ─────────────────────────────────────────────────────────────

/**
 * Read a typed lesson length. "12:30" = 12 min 30 s, "1:02:03" = 1 h 2 min 3 s,
 * a plain number = minutes ("12" = 12:00). Empty = 0. Anything else = null.
 */
export const parseDurationInput = (raw: string): number | null => {
  const value = String(raw ?? "").trim();
  if (!value) return 0;
  if (/^\d+(\.\d+)?$/.test(value)) return Math.round(Number(value) * 60);
  const parts = value.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const numbers = parts.map(Number);
  const [h, m, s] = numbers.length === 3 ? numbers : [0, numbers[0], numbers[1]];
  if (s > 59 || (numbers.length === 3 && m > 59)) return null;
  return h * 3600 + m * 60 + s;
};

/** Seconds back to the editor's "m:ss" / "h:mm:ss" text ("" for 0). */
export const durationToInput = (seconds: number): string => {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  if (total === 0) return "";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

// ── Drafts ────────────────────────────────────────────────────────────────

export const emptyLessonDraft = (): LessonDraft => ({
  id: makeId("lesson"),
  title: "",
  vimeoUrl: "",
  durationText: "",
  isPreview: false,
  resourceUrl: "",
  notes: "",
});

export const emptySectionDraft = (title = ""): SectionDraft => ({
  id: makeId("section"),
  title,
  lessons: [emptyLessonDraft()],
});

export const emptyCourseDraft = (): CourseDraft => ({
  title: "",
  subtitle: "",
  description: "",
  coverImageUrl: "",
  trailerVimeoUrl: "",
  category: "",
  level: "all",
  language: "",
  instructorName: "",
  instructorBio: "",
  instructorPhotoUrl: "",
  outcomes: [],
  requirements: [],
  priceRupees: "",
  compareAtRupees: "",
  accessDays: "0",
  featured: false,
  sortOrder: 0,
  paymentModes: { razorpay: true, upi: false },
  status: "draft",
  sections: [emptySectionDraft("Introduction")],
});

const paiseToInput = (paise: number | undefined) => (paise && paise > 0 ? String(paise / 100) : "");

/** A saved course (+ its private links) → editor draft. */
export const draftFromCourse = (course: ElearnCourse, content: ElearnCourseContent | null): CourseDraft => ({
  title: course.title,
  subtitle: course.subtitle,
  description: course.description,
  coverImageUrl: course.coverImageUrl,
  trailerVimeoUrl: course.trailerVimeoUrl,
  category: course.category,
  level: course.level,
  language: course.language,
  instructorName: course.instructorName,
  instructorBio: course.instructorBio,
  instructorPhotoUrl: course.instructorPhotoUrl,
  outcomes: [...course.outcomes],
  requirements: [...course.requirements],
  priceRupees: paiseToInput(course.priceInPaise),
  compareAtRupees: paiseToInput(course.compareAtInPaise),
  accessDays: String(course.accessDays || 0),
  featured: course.featured,
  sortOrder: course.sortOrder,
  paymentModes: { ...course.paymentModes },
  status: course.status,
  sections: course.sections.map((section) => ({
    id: section.id,
    title: section.title,
    lessons: section.lessons.map((lesson) => {
      const saved = content?.lessons[lesson.id];
      return {
        id: lesson.id,
        title: lesson.title,
        vimeoUrl: saved?.vimeoUrl || lesson.previewVimeoUrl || "",
        durationText: durationToInput(lesson.durationSec),
        isPreview: lesson.isPreview,
        resourceUrl: saved?.resourceUrl || "",
        notes: saved?.notes || "",
      };
    }),
  })),
});

const parseAccessDays = (raw: string) => {
  const n = Math.floor(Number(String(raw ?? "").trim() || 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Draft → what gets saved. Every lesson's link goes to the private content
 * doc; a free-preview lesson's link is ALSO put on the public doc
 * (`previewVimeoUrl`), because previews are meant to be watched by anyone.
 */
export const draftToSave = (draft: CourseDraft, status: ElearnCourseStatus = draft.status) => {
  const priceInPaise = parsePriceToPaise(draft.priceRupees) || 0;
  const compareAt = parsePriceToPaise(draft.compareAtRupees) || 0;
  const clean = (items: string[]) => items.map((item) => item.trim()).filter(Boolean);
  const content: ElearnCourseContent = { lessons: {} };

  const input: ElearnCourseInput = {
    title: draft.title.trim(),
    subtitle: draft.subtitle.trim(),
    description: draft.description.trim(),
    coverImageUrl: draft.coverImageUrl.trim(),
    trailerVimeoUrl: draft.trailerVimeoUrl.trim(),
    category: draft.category.trim(),
    level: draft.level,
    language: draft.language.trim(),
    instructorName: draft.instructorName.trim(),
    instructorBio: draft.instructorBio.trim(),
    instructorPhotoUrl: draft.instructorPhotoUrl.trim(),
    outcomes: clean(draft.outcomes),
    requirements: clean(draft.requirements),
    priceInPaise,
    ...(compareAt > priceInPaise ? { compareAtInPaise: compareAt } : {}),
    paymentModes: { razorpay: draft.paymentModes.razorpay, upi: draft.paymentModes.upi },
    accessDays: parseAccessDays(draft.accessDays),
    status,
    featured: draft.featured,
    sortOrder: draft.sortOrder,
    sections: draft.sections.map((section) => ({
      id: section.id,
      title: section.title.trim(),
      lessons: section.lessons.map((lesson) => {
        const vimeoUrl = lesson.vimeoUrl.trim();
        const resourceUrl = lesson.resourceUrl.trim();
        const notes = lesson.notes.trim();
        content.lessons[lesson.id] = {
          vimeoUrl,
          ...(resourceUrl ? { resourceUrl } : {}),
          ...(notes ? { notes } : {}),
        };
        return {
          id: lesson.id,
          title: lesson.title.trim(),
          durationSec: parseDurationInput(lesson.durationText) ?? 0,
          isPreview: lesson.isPreview,
          ...(lesson.isPreview && vimeoUrl ? { previewVimeoUrl: vimeoUrl } : {}),
        };
      }),
    })),
  };
  return { input, content };
};

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

/**
 * Typing mistakes that block ANY save (draft or publish): no title, a bad
 * price/MRP, a link that is not Vimeo, a duration that can't be read.
 * Empty optional fields are fine for a draft.
 */
export const draftErrors = (draft: CourseDraft): string[] => {
  const errors: string[] = [];
  if (!draft.title.trim()) errors.push("Add a course title.");
  const price = draft.priceRupees.trim() ? parsePriceToPaise(draft.priceRupees) : 0;
  if (price === null) errors.push("The price is not a number.");
  if (draft.compareAtRupees.trim()) {
    const compareAt = parsePriceToPaise(draft.compareAtRupees);
    if (compareAt === null) errors.push("The MRP is not a number.");
    else if (price !== null && compareAt <= price) errors.push("The MRP must be higher than the price (or leave it empty).");
  }
  if (draft.accessDays.trim() && !/^\d+$/.test(draft.accessDays.trim())) errors.push("Access days must be a whole number (0 = lifetime).");
  if (draft.trailerVimeoUrl.trim() && !isVideoUrl(draft.trailerVimeoUrl)) errors.push("The trailer link is not a valid Vimeo or YouTube link.");
  let lessonNumber = 0;
  for (const section of draft.sections) {
    for (const lesson of section.lessons) {
      lessonNumber += 1;
      const name = lesson.title.trim() || `Lesson ${lessonNumber}`;
      if (lesson.vimeoUrl.trim() && !isVideoUrl(lesson.vimeoUrl)) errors.push(`"${name}": the video link is not a valid Vimeo or YouTube link.`);
      if (parseDurationInput(lesson.durationText) === null) errors.push(`"${name}": type the duration as mm:ss (for example 12:30).`);
      if (lesson.resourceUrl.trim() && !isHttpUrl(lesson.resourceUrl.trim())) errors.push(`"${name}": the resource link must start with https://`);
    }
  }
  return errors;
};

/** Everything that stops a publish: typing mistakes + the shared publish rules + section titles. */
export const draftPublishProblems = (draft: CourseDraft): string[] => {
  const { input, content } = draftToSave(draft, "published");
  const course = normalizeCourse("", input as unknown as Record<string, unknown>);
  const problems = [...draftErrors(draft), ...publishProblems(course, content)];
  if (draft.sections.some((section) => !section.title.trim())) problems.push("Give every section a title.");
  if (draft.sections.some((section) => section.lessons.some((lesson) => !lesson.title.trim()))) problems.push("Give every lesson a title.");
  return Array.from(new Set(problems));
};

/** Stable comparison for the unsaved-changes guard. */
export const sameDraft = (a: CourseDraft, b: CourseDraft) => JSON.stringify(a) === JSON.stringify(b);

/** Move one item up (-1) or down (+1); out-of-range moves return the same list. */
export const moveItem = <T>(items: T[], index: number, delta: number): T[] => {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
};

// ── Purchases ─────────────────────────────────────────────────────────────

export interface PurchaseTotals {
  /** Paid by students (Razorpay + approved QR) on currently active access. */
  revenueInPaise: number;
  activeStudents: number;
  pending: number;
}

export const purchaseTotals = (enrollments: ElearnEnrollment[]): PurchaseTotals => {
  const active = enrollments.filter((item) => item.status === "active");
  return {
    revenueInPaise: active.filter((item) => item.method !== "grant").reduce((sum, item) => sum + (item.amountInPaise || 0), 0),
    activeStudents: new Set(active.map((item) => item.uid || item.id)).size,
    pending: enrollments.filter((item) => item.status === "processing").length,
  };
};

/** Case-insensitive match on name / email / phone / UTR. */
export const matchesPurchaseSearch = (enrollment: ElearnEnrollment, search: string): boolean => {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  const digits = needle.replace(/\D/g, "");
  const haystack = [enrollment.userName, enrollment.userEmail, enrollment.upiRef || "", enrollment.courseTitle].join(" ").toLowerCase();
  if (haystack.includes(needle)) return true;
  return digits.length >= 3 && enrollment.userPhone.replace(/\D/g, "").includes(digits);
};
