import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock, PlayCircle } from "lucide-react";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import { optimizeImageUrl } from "@/lib/cloudinary";
import { formatTotalDuration, progressPercent, type ElearnCourse } from "@/lib/elearning";
import { GOLD_TEXT, LEVEL_LABELS, lessonsLabel } from "./format";
import { useCourseProgress } from "./useElearn";

interface CourseCardProps {
  course: ElearnCourse;
  owned: boolean;
  /** Keeps ?demo on links in dev. */
  search?: string;
}

const CourseCard = ({ course, owned, search = "" }: CourseCardProps) => {
  const [loaded, setLoaded] = useState(false);
  const progress = useCourseProgress(course.id, owned);
  const percent = owned ? progressPercent(course.sections, progress?.completedLessonIds ?? []) : 0;
  const hasStrike = typeof course.compareAtInPaise === "number" && course.compareAtInPaise > course.priceInPaise;
  const href = `/learn/${encodeURIComponent(course.id)}${search}`;
  const hasPreview = !owned && course.sections.some((section) => section.lessons.some((lesson) => lesson.isPreview && lesson.previewVimeoUrl));

  return (
    <Link
      to={href}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-gold/15 bg-card shadow-[0_1px_0_rgba(51,35,20,0.04),0_14px_32px_-18px_rgba(51,35,20,0.28)] transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.99] motion-safe:hover:-translate-y-0.5 hover:shadow-[0_1px_0_rgba(51,35,20,0.04),0_22px_44px_-20px_rgba(51,35,20,0.38)]"
    >
      <div className="relative aspect-video overflow-hidden bg-muted">
        {!loaded && <div className="absolute inset-0 skeleton-shimmer" aria-hidden="true" />}
        {course.coverImageUrl ? (
          <img
            src={optimizeImageUrl(course.coverImageUrl, 720)}
            alt=""
            loading="lazy"
            onLoad={() => setLoaded(true)}
            className={`h-full w-full object-cover transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] motion-safe:group-hover:scale-[1.03] ${loaded ? "opacity-100" : "opacity-0"}`}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-primary" aria-hidden="true" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" aria-hidden="true" />
        {course.category && (
          <span className="absolute left-3 top-3 rounded-full bg-ivory/95 px-2.5 py-1 font-body text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-charcoal shadow-sm">
            {course.category}
          </span>
        )}
        {owned && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-700 px-2.5 py-1 font-body text-[0.68rem] font-semibold text-white shadow-sm">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Enrolled
          </span>
        )}
        <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 font-body text-[0.72rem] font-medium text-white">
          <PlayCircle className="h-4 w-4" aria-hidden="true" />
          {lessonsLabel(course.lessonCount)}
          <span aria-hidden="true">·</span>
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {formatTotalDuration(course.totalDurationSec)}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <p className={`font-body text-[0.7rem] font-semibold uppercase tracking-[0.14em] ${GOLD_TEXT}`}>{LEVEL_LABELS[course.level]}</p>
        <h3 className="mt-1.5 font-display text-[1.3rem] font-semibold leading-tight text-foreground transition-colors group-hover:text-primary sm:text-[1.42rem]">
          <span className="line-clamp-2">{course.title}</span>
        </h3>
        {course.subtitle && <p className="mt-1.5 line-clamp-2 font-body text-[0.83rem] leading-relaxed text-muted-foreground">{course.subtitle}</p>}

        <div className="mt-auto pt-4">
          {owned ? (
            <div>
              <div className="flex items-center justify-between font-body text-xs text-muted-foreground">
                <span>{percent}% complete</span>
                <span className="font-semibold text-primary">Continue</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${course.title} progress`}>
                <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${percent}%` }} />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-display text-[1.45rem] font-bold text-primary">{course.priceInPaise > 0 ? formatPaiseAsRupees(course.priceInPaise) : "Free"}</span>
              {hasStrike && (
                <span className="font-body text-sm text-muted-foreground line-through">
                  <span className="sr-only">Was </span>{formatPaiseAsRupees(course.compareAtInPaise!)}
                </span>
              )}
              {hasPreview && (
                <span className="ml-auto inline-flex items-center gap-1 self-center rounded-full bg-primary/10 px-2.5 py-1 font-body text-[0.72rem] font-semibold text-primary">
                  <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" /> Free preview
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

export const CourseCardSkeleton = () => (
  <div className="overflow-hidden rounded-xl border border-gold/10 bg-card" aria-hidden="true">
    <div className="aspect-video skeleton-shimmer" />
    <div className="space-y-3 p-5">
      <div className="h-3 w-20 rounded skeleton-shimmer" />
      <div className="h-6 w-4/5 rounded skeleton-shimmer" />
      <div className="h-4 w-full rounded skeleton-shimmer" />
      <div className="h-7 w-24 rounded skeleton-shimmer" />
    </div>
  </div>
);

export default CourseCard;
