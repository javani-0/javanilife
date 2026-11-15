// E-Learning (online video courses) data model. See
// docs/superpowers/specs/2026-11-15-elearning-design.md §3.
import type { ElearnEnrollmentStatus, ElearnPaymentMethod, PaymentModes } from "../../../api/_lib/elearn-core";

export type { ElearnEnrollmentStatus, ElearnPaymentMethod, PaymentModes };

/** Firestore Timestamp (has toMillis/toDate), Date, or nothing. Read with `toMillis`. */
export type TimestampLike = { toMillis: () => number; toDate?: () => Date } | Date | null;

export type ElearnLevel = "beginner" | "intermediate" | "advanced" | "all";
export type ElearnCourseStatus = "draft" | "published";

export interface ElearnLesson {
  id: string;
  title: string;
  durationSec: number;
  isPreview: boolean;
  /** Only on free-preview lessons (the public doc). Paid lesson links live in elearnContent. */
  previewVimeoUrl?: string;
}

export interface ElearnSection {
  id: string;
  title: string;
  lessons: ElearnLesson[];
}

/** elearnCourses/{courseId} — the public catalogue doc (no paid video links). */
export interface ElearnCourse {
  id: string;
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
  priceInPaise: number;
  compareAtInPaise?: number;
  paymentModes: PaymentModes;
  /** 0 = lifetime access. */
  accessDays: number;
  status: ElearnCourseStatus;
  featured: boolean;
  sortOrder: number;
  sections: ElearnSection[];
  lessonCount: number;
  totalDurationSec: number;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

/** What the admin editor saves (id/totals/timestamps are set by saveCourse). */
export type ElearnCourseInput = Omit<ElearnCourse, "id" | "lessonCount" | "totalDurationSec" | "createdAt" | "updatedAt">;

export interface ElearnLessonContent {
  vimeoUrl: string;
  resourceUrl?: string;
  notes?: string;
}

/** elearnContent/{courseId} — private: staff or an active enrollment only. */
export interface ElearnCourseContent {
  lessons: Record<string, ElearnLessonContent>;
}

/** elearnEnrollments/{uid}_{courseId} — written by the server only. */
export interface ElearnEnrollment {
  id: string;
  uid: string;
  courseId: string;
  courseTitle: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  status: ElearnEnrollmentStatus;
  method: ElearnPaymentMethod | "";
  amountInPaise: number;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  upiProofUrl?: string;
  upiRef?: string;
  rejectReason?: string;
  reviewedBy?: string;
  /** The status before the latest change, e.g. "rejected" on a resubmitted QR proof. */
  previousStatus?: ElearnEnrollmentStatus;
  previousRejectReason?: string;
  /** Razorpay payment ids received for this purchase; any beyond razorpayPaymentId must be refunded. */
  extraPaymentIds?: string[];
  refundedAt?: TimestampLike;
  submittedAt: TimestampLike;
  activatedAt: TimestampLike;
  /** null = lifetime. */
  expiresAt: TimestampLike;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

/** elearnProgress/{uid}_{courseId} — owner only, whitelisted fields. */
export interface ElearnProgress {
  uid: string;
  courseId: string;
  completedLessonIds: string[];
  lastLessonId: string;
  /** Resume position per lesson, whole seconds. */
  positions: Record<string, number>;
  updatedAt: TimestampLike;
}

export interface FlatLesson extends ElearnLesson {
  sectionId: string;
  sectionTitle: string;
  /** 0-based position across the whole course. */
  index: number;
}
