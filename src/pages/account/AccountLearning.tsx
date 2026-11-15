import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlertCircle, BookOpen, CheckCircle2, Hourglass, PlayCircle } from "lucide-react";
import AccountLayout from "@/components/account/AccountLayout";
import { optimizeImageUrl } from "@/lib/cloudinary";
import { progressPercent, toMillis, type ElearnCourse, type ElearnEnrollment } from "@/lib/elearning";
import { useCourseProgress, useMyEnrollments, usePublishedCourses } from "@/components/elearning/useElearn";
import { REVOKED_MESSAGE, accessStateOf, formatDate, type AccessState } from "@/components/elearning/format";

const ORDER: Partial<Record<AccessState, number>> = { active: 0, processing: 1, rejected: 2, "awaiting-payment": 3, expired: 4, revoked: 5 };

const AccountLearning = () => {
  const { search } = useLocation();
  const linkSearch = import.meta.env.DEV && new URLSearchParams(search).has("demo") ? search : "";
  const { enrollments, loading } = useMyEnrollments();
  const { courses, loading: coursesLoading } = usePublishedCourses();

  const items = useMemo(() => {
    const byId = new Map(courses.map((c) => [c.id, c]));
    const now = Date.now();
    return enrollments
      .map((enrollment) => ({ enrollment, course: byId.get(enrollment.courseId) ?? null, state: accessStateOf(true, enrollment, now) }))
      // An unpaid checkout that was never finished isn't a purchase yet.
      .filter((item) => item.state !== "awaiting-payment")
      .sort((a, b) => (ORDER[a.state] ?? 9) - (ORDER[b.state] ?? 9) || (toMillis(b.enrollment.updatedAt) ?? 0) - (toMillis(a.enrollment.updatedAt) ?? 0));
  }, [enrollments, courses]);

  return (
    <AccountLayout title="My Learning" description="Your online video courses and their progress.">
      {loading || coursesLoading ? (
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true" aria-label="Loading your courses">
          {[0, 1].map((i) => <div key={i} className="h-40 rounded-2xl skeleton-shimmer" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-gold/15 bg-card px-6 py-12 text-center shadow-card">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary"><BookOpen className="h-6 w-6" aria-hidden="true" /></span>
          <h2 className="mt-4 font-display text-2xl font-semibold text-foreground">No online courses yet</h2>
          <p className="mx-auto mt-2 max-w-sm font-body text-sm text-muted-foreground">Courses you buy appear here, ready to watch at your own pace.</p>
          <Link to={`/learn${linkSearch}`} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-gradient-primary px-6 font-body text-sm font-semibold text-primary-foreground shadow-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.97]">
            Browse courses
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {items.map(({ enrollment, course, state }) => (
            <li key={enrollment.id}><LearningCard enrollment={enrollment} course={course} state={state} linkSearch={linkSearch} /></li>
          ))}
        </ul>
      )}
    </AccountLayout>
  );
};

const LearningCard = ({ enrollment, course, state, linkSearch }: { enrollment: ElearnEnrollment; course: ElearnCourse | null; state: AccessState; linkSearch: string }) => {
  const progress = useCourseProgress(enrollment.courseId, state === "active");
  const percent = course ? progressPercent(course.sections, progress?.completedLessonIds ?? []) : 0;
  const title = course?.title || enrollment.courseTitle || "Online course";
  const courseHref = `/learn/${encodeURIComponent(enrollment.courseId)}${linkSearch}`;
  const until = formatDate(enrollment.expiresAt);

  return (
    <article className="flex h-full overflow-hidden rounded-2xl border border-gold/15 bg-card shadow-card">
      <div className="relative w-28 shrink-0 bg-muted sm:w-36">
        {course?.coverImageUrl ? (
          <img src={optimizeImageUrl(course.coverImageUrl, 320)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-primary" aria-hidden="true" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <h2 className="font-display text-lg font-semibold leading-snug text-foreground">{title}</h2>

        {state === "active" && (
          <>
            <div className="mt-3 flex items-center justify-between font-body text-xs text-muted-foreground">
              <span>{percent}% complete</span>
              <span>{until ? `Until ${until}` : "Lifetime access"}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${title} progress`}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
            </div>
            {percent === 100 && (
              <p className="mt-2 inline-flex items-center gap-1.5 font-body text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Course completed</p>
            )}
            <div className="mt-auto pt-4">
              <Link to={`/learn/${encodeURIComponent(enrollment.courseId)}/watch${linkSearch}`} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.97]">
                <PlayCircle className="h-4 w-4" aria-hidden="true" /> {percent > 0 ? "Continue" : "Start"}<span className="sr-only">: {title}</span>
              </Link>
            </div>
          </>
        )}

        {state === "processing" && (
          <p className="mt-2 inline-flex items-start gap-2 font-body text-sm text-amber-900"><Hourglass className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Under review: we'll unlock it as soon as your payment is verified.</p>
        )}

        {state === "rejected" && (
          <>
            <p className="mt-2 inline-flex items-start gap-2 font-body text-sm font-medium text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Payment not verified</p>
            {enrollment.rejectReason && <p className="mt-1 font-body text-xs leading-relaxed text-muted-foreground">Reason: {enrollment.rejectReason}</p>}
            <Link to={courseHref} className="mt-3 w-fit font-body text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Pay again</Link>
          </>
        )}

        {state === "expired" && (
          <>
            <p className="mt-2 font-body text-sm text-muted-foreground">Access ended{until ? ` on ${until}` : ""}.</p>
            <Link to={courseHref} className="mt-3 w-fit font-body text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Buy again</Link>
          </>
        )}

        {state === "revoked" && (
          <>
            <p className="mt-2 font-body text-sm text-muted-foreground">{REVOKED_MESSAGE}</p>
            <Link to="/contact" className="mt-3 w-fit font-body text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Contact us</Link>
          </>
        )}

      </div>
    </article>
  );
};

export default AccountLearning;
