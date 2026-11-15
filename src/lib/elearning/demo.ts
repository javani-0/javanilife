// DEV-ONLY sample data for the public e-learning pages. Used only when
// `import.meta.env.DEV` and the URL has `?demo` (see src/components/elearning/useElearn.ts),
// so production builds drop it. Never written to Firestore.
import danceClass from "@/assets/dance-class.jpg";
import carnatic from "@/assets/carnatic-music.jpg";
import type { ElearnCourse, ElearnCourseContent, ElearnEnrollment, ElearnProgress } from "./types";

export type DemoEnrollmentState = "active" | "processing" | "rejected" | "none";

/** A public Vimeo video, only so the dev player has something real to load. */
const SAMPLE_VIMEO = "https://vimeo.com/76979871";

const now = Date.now();
const day = 86_400_000;

const lesson = (id: string, title: string, durationSec: number, isPreview = false) => ({
  id, title, durationSec, isPreview, ...(isPreview ? { previewVimeoUrl: SAMPLE_VIMEO } : {}),
});

const withTotals = (course: Omit<ElearnCourse, "lessonCount" | "totalDurationSec">): ElearnCourse => {
  const lessons = course.sections.flatMap((s) => s.lessons);
  return { ...course, lessonCount: lessons.length, totalDurationSec: lessons.reduce((sum, l) => sum + l.durationSec, 0) };
};

export const DEMO_COURSES: ElearnCourse[] = [
  withTotals({
    id: "demo-bharatanatyam-foundations",
    title: "Bharatanatyam Foundations",
    subtitle: "Sample course · Adavus, posture and rhythm for your first year of practice",
    description:
      "A step-by-step start to Bharatanatyam you can follow at home.\n\nEach lesson shows one idea slowly from the front and the side, then once at full speed. Practise along, pause whenever you need, and come back to any lesson as often as you like.",
    coverImageUrl: danceClass,
    trailerVimeoUrl: SAMPLE_VIMEO,
    category: "Bharatanatyam",
    level: "beginner",
    language: "Telugu & English",
    instructorName: "Sample Instructor",
    instructorBio: "Placeholder bio for the sample course. The real course shows the guru's own introduction here.",
    instructorPhotoUrl: "",
    outcomes: [
      "Hold aramandi with a steady, safe posture",
      "Perform the first eight adavu families in three speeds",
      "Keep time with tattukazhi and simple sollukattu",
      "Understand basic hastas and their meanings",
      "Warm up and cool down without strain",
      "Practise on your own with a clear weekly routine",
    ],
    requirements: ["About 2 m × 2 m of clear floor space", "Comfortable clothes you can sit low in", "No dance experience needed"],
    priceInPaise: 249_900,
    compareAtInPaise: 349_900,
    paymentModes: { razorpay: true, upi: true },
    accessDays: 0,
    status: "published",
    featured: true,
    sortOrder: 1,
    sections: [
      {
        id: "s1", title: "Getting started", lessons: [
          lesson("l1", "Welcome and how to practise", 245, true),
          lesson("l2", "Warm-up for dancers", 612),
          lesson("l3", "Aramandi: the base posture", 498, true),
        ],
      },
      {
        id: "s2", title: "First adavus", lessons: [
          lesson("l4", "Tatta adavu, three speeds", 734),
          lesson("l5", "Natta adavu", 681),
          lesson("l6", "Visharu adavu", 702),
          lesson("l7", "Putting it together", 540),
        ],
      },
      {
        id: "s3", title: "Rhythm and hands", lessons: [
          lesson("l8", "Tattukazhi and counting", 466),
          lesson("l9", "Asamyuta hastas, part 1", 588),
          lesson("l10", "Your weekly practice plan", 312),
        ],
      },
    ],
    createdAt: new Date(now - 20 * day),
    updatedAt: new Date(now - 2 * day),
  }),
  withTotals({
    id: "demo-carnatic-vocal-basics",
    title: "Carnatic Vocal Basics",
    subtitle: "Sample course · Sruti, sarali varisai and your first geetham",
    description:
      "Learn to sing in sruti and build a daily practice from the very first swaras.\n\nShort lessons with call-and-response so you can sing along with the teacher.",
    coverImageUrl: carnatic,
    trailerVimeoUrl: "",
    category: "Carnatic music",
    level: "all",
    language: "English",
    instructorName: "Sample Instructor",
    instructorBio: "",
    instructorPhotoUrl: "",
    outcomes: ["Find and hold your sruti", "Sing sarali and janta varisai", "Learn a first geetham in Malahari"],
    requirements: ["A sruti box app or tanpura app", "Headphones help"],
    priceInPaise: 149_900,
    paymentModes: { razorpay: false, upi: true },
    accessDays: 365,
    status: "published",
    featured: false,
    sortOrder: 2,
    sections: [
      { id: "c1", title: "Sruti", lessons: [lesson("m1", "What is sruti?", 380, true), lesson("m2", "Holding Sa", 420)] },
      { id: "c2", title: "Varisai", lessons: [lesson("m3", "Sarali varisai 1-4", 655), lesson("m4", "Janta varisai", 610)] },
    ],
    createdAt: new Date(now - 10 * day),
    updatedAt: new Date(now - day),
  }),
];

export const demoCourseContent = (course: ElearnCourse): ElearnCourseContent => ({
  lessons: Object.fromEntries(
    course.sections.flatMap((s) => s.lessons).map((l, i) => [
      l.id,
      { vimeoUrl: SAMPLE_VIMEO, ...(i === 0 ? { notes: "Sample notes: watch once fully, then practise along at half speed." } : {}) },
    ]),
  ),
});

export const demoEnrollment = (course: ElearnCourse, state: DemoEnrollmentState): ElearnEnrollment | null => {
  if (state === "none") return null;
  return {
    id: `demo_${course.id}`,
    uid: "demo",
    courseId: course.id,
    courseTitle: course.title,
    userName: "Demo",
    userEmail: "",
    userPhone: "",
    status: state,
    method: "upi",
    amountInPaise: course.priceInPaise,
    ...(state === "rejected" ? { rejectReason: "The screenshot did not show the amount. Please pay again and upload a clear screenshot." } : {}),
    submittedAt: new Date(now - day),
    activatedAt: state === "active" ? new Date(now - day) : null,
    expiresAt: state === "active" && course.accessDays > 0 ? new Date(now + course.accessDays * day) : null,
    createdAt: new Date(now - day),
    updatedAt: new Date(now - day),
  };
};

export const demoProgress = (course: ElearnCourse): ElearnProgress => {
  const ids = course.sections.flatMap((s) => s.lessons).map((l) => l.id);
  return { uid: "demo", courseId: course.id, completedLessonIds: ids.slice(0, 3), lastLessonId: ids[3] || ids[0], positions: {}, updatedAt: new Date(now) };
};
