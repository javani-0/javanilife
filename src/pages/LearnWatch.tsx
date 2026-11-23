import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, CheckCircle2, ChevronLeft, ChevronRight, Circle, Download, PlayCircle, X } from "lucide-react";
import SEO from "@/components/SEO";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  flattenLessons,
  formatDuration,
  getCourseContent,
  hasActiveAccess,
  neighbourLessons,
  progressPercent,
  saveProgress,
  shouldAutoComplete,
  vimeoEmbedUrlFromLink,
  type ElearnCourse,
  type ElearnCourseContent,
  type FlatLesson,
  type ProgressPatch,
} from "@/lib/elearning";
import VimeoLessonPlayer from "@/components/elearning/VimeoLessonPlayer";
import { useCourse, useDemoState, useMyCourseAccess } from "@/components/elearning/useElearn";
import { formatDate } from "@/components/elearning/format";

const AUTO_NEXT_SEC = 5;

const LearnWatch = () => {
  const { courseId = "", lessonId } = useParams<{ courseId: string; lessonId?: string }>();
  const { search } = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const demo = useDemoState();
  const linkSearch = import.meta.env.DEV && demo ? search : "";
  const { course, loading: courseLoading } = useCourse(courseId);
  const access = useMyCourseAccess(courseId);
  const [content, setContent] = useState<ElearnCourseContent | null | undefined>(undefined);
  const [localDone, setLocalDone] = useState<Record<string, boolean>>({});
  const [countdown, setCountdown] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const deniedRef = useRef(false);

  const enrollmentStatus = access.enrollment?.status;

  // Private lesson links: null = no access (rules deny).
  useEffect(() => {
    if (!course) return;
    let alive = true;
    if (import.meta.env.DEV && demo) {
      void import("@/lib/elearning/demo").then((m) => alive && setContent(demo === "active" ? m.demoCourseContent(course) : null));
    } else {
      getCourseContent(course.id).then((next) => alive && setContent(next)).catch(() => alive && setContent(null));
    }
    return () => { alive = false; };
  }, [course, demo, enrollmentStatus]);

  // Guard: missing course → catalogue; no access → course page.
  useEffect(() => {
    if (deniedRef.current) return;
    if (!courseLoading && !course) {
      deniedRef.current = true;
      navigate(`/learn${linkSearch}`, { replace: true });
    } else if (course && content === null) {
      deniedRef.current = true;
      toast({ title: "This master class is locked", description: "Buy the master class to watch its lessons." });
      navigate(`/learn/${encodeURIComponent(course.id)}${linkSearch}`, { replace: true });
    }
  }, [courseLoading, course, content, navigate, toast, linkSearch]);

  const lessons = useMemo(() => (course ? flattenLessons(course.sections) : []), [course]);
  const lastLessonId = access.progress?.lastLessonId;
  const current: FlatLesson | undefined =
    lessons.find((l) => l.id === lessonId) ?? lessons.find((l) => l.id === lastLessonId) ?? lessons[0];

  const completedIds = useMemo(() => {
    const set = new Set(access.progress?.completedLessonIds ?? []);
    for (const [id, done] of Object.entries(localDone)) (done ? set.add(id) : set.delete(id));
    return set;
  }, [access.progress, localDone]);

  // Progress writes are allowed only with an active, unexpired enrollment (staff previews and demo don't save).
  const canSave = !access.isDemo && !!access.uid && hasActiveAccess(access.enrollment);
  const save = useCallback(
    (patch: ProgressPatch) => {
      if (!canSave || !access.uid) return;
      void saveProgress(access.uid, courseId, patch).catch(() => undefined);
    },
    [canSave, access.uid, courseId],
  );

  const currentId = current?.id;
  useEffect(() => {
    if (!currentId) return;
    setCountdown(null);
    setFinished(false);
    save({ lastLessonId: currentId });
  }, [currentId, save]);

  const { prevId, nextId } = course && currentId ? neighbourLessons(course.sections, currentId) : { prevId: null, nextId: null };
  const goTo = useCallback(
    (id: string) => navigate(`/learn/${encodeURIComponent(courseId)}/watch/${encodeURIComponent(id)}${linkSearch}`),
    [navigate, courseId, linkSearch],
  );

  const setDone = (id: string, done: boolean) => {
    setLocalDone((prev) => ({ ...prev, [id]: done }));
    save({ complete: { lessonId: id, done } });
  };

  const handleProgress = (id: string, seconds: number, duration: number) => {
    save({ position: { lessonId: id, seconds } });
    if (shouldAutoComplete(seconds, duration) && !completedIds.has(id)) setDone(id, true);
  };

  const handleEnded = (id: string) => {
    if (!completedIds.has(id)) setDone(id, true);
    if (id !== currentId) return;
    if (nextId) setCountdown(AUTO_NEXT_SEC);
    else setFinished(true);
  };

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) { setCountdown(null); if (nextId) goTo(nextId); return; }
    const timer = window.setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, nextId, goTo]);

  if (courseLoading || access.loading || content === undefined || !course || content === null) {
    return (
      <main className="mx-auto max-w-7xl px-4 pb-6 pt-[104px] sm:px-6" aria-busy="true" aria-label="Loading lesson">
        <SEO title="Loading lesson | Javani Spiritual Hub" description="Online master class lesson." noindex />
        <div className="h-5 w-48 rounded skeleton-shimmer" />
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="aspect-video rounded-xl skeleton-shimmer" />
          <div className="hidden h-[420px] rounded-xl skeleton-shimmer lg:block" />
        </div>
      </main>
    );
  }

  const lessonContent = currentId ? content.lessons[currentId] : undefined;
  const embedUrl = lessonContent ? vimeoEmbedUrlFromLink(lessonContent.vimeoUrl) : null;
  const percent = progressPercent(course.sections, [...completedIds]);
  const until = formatDate(access.enrollment?.expiresAt);
  const currentDone = !!currentId && completedIds.has(currentId);
  const nextLesson = nextId ? lessons.find((l) => l.id === nextId) : undefined;
  const courseHref = `/learn/${encodeURIComponent(course.id)}${linkSearch}`;

  const lessonList = <LessonList course={course} currentId={currentId} completedIds={completedIds} onSelect={goTo} />;
  const notes = (
    <div className="space-y-4">
      {lessonContent?.notes ? (
        <div className="whitespace-pre-line font-body text-sm leading-relaxed text-foreground/90">{lessonContent.notes}</div>
      ) : (
        <p className="font-body text-sm text-muted-foreground">No notes for this lesson.</p>
      )}
      {lessonContent?.resourceUrl && (
        <a
          href={lessonContent.resourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-gold/30 px-4 font-body text-sm font-semibold text-primary hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Download className="h-4 w-4" aria-hidden="true" /> Open lesson resource<span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </div>
  );

  return (
    <>
      <SEO title={`${current?.title || "Lesson"} | ${course.title}`} description={course.subtitle || course.title} noindex />
      <main className="bg-background pb-16 pt-[80px]">
        <div className="border-b border-gold/15 bg-card">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
            <Link to={courseHref} className="inline-flex items-center gap-1.5 rounded font-body text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Course page
            </Link>
            <p className="min-w-0 flex-1 truncate font-display text-lg font-semibold text-foreground">{course.title}</p>
            <div className="flex items-center gap-3 font-body text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Course progress">
                  <span className="block h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${percent}%` }} />
                </span>
                <span className="font-semibold text-foreground">{percent}%</span>
              </span>
              <span aria-hidden="true">·</span>
              <span>{access.enrollment && hasActiveAccess(access.enrollment) ? (until ? `Access until ${until}` : "Lifetime access") : "Preview: progress isn't saved"}</span>
            </div>
          </div>
        </div>

        <div className="mx-auto grid max-w-7xl gap-6 px-0 sm:px-6 sm:pt-6 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0">
            <div className="relative overflow-hidden bg-black sm:rounded-xl">
              {embedUrl ? (
                <VimeoLessonPlayer
                  embedUrl={embedUrl}
                  lessonId={currentId!}
                  title={current?.title || course.title}
                  startAt={(currentId && access.progress?.positions?.[currentId]) || 0}
                  onProgress={handleProgress}
                  onFlush={handleProgress}
                  onEnded={handleEnded}
                />
              ) : (
                <div className="grid aspect-video place-items-center px-6 text-center font-body text-sm text-white/80">This lesson's video isn't ready yet.</div>
              )}

              {(countdown !== null || finished) && (
                <div className="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center text-white" role="status" aria-live="polite">
                  {finished ? (
                    <div>
                      <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" aria-hidden="true" />
                      <p className="mt-3 font-display text-2xl font-semibold">You finished the last lesson</p>
                      <p className="mt-1 font-body text-sm text-white/80">Well done. You can rewatch any lesson whenever you like.</p>
                      <button type="button" onClick={() => setFinished(false)} className="mt-5 min-h-10 rounded-md border border-white/40 px-5 font-body text-sm font-semibold hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Close</button>
                    </div>
                  ) : (
                    <div>
                      <p className="font-body text-xs uppercase tracking-[0.14em] text-white/70">Next lesson in {countdown} s</p>
                      <p className="mt-2 font-display text-2xl font-semibold">{nextLesson?.title}</p>
                      <div className="mt-5 flex justify-center gap-3">
                        <button type="button" onClick={() => nextId && goTo(nextId)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-white px-5 font-body text-sm font-semibold text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold active:scale-[0.97]">
                          <PlayCircle className="h-4 w-4" aria-hidden="true" /> Play now
                        </button>
                        <button type="button" onClick={() => setCountdown(null)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-white/40 px-5 font-body text-sm font-semibold hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-[0.97]">
                          <X className="h-4 w-4" aria-hidden="true" /> Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-4 pt-4 sm:px-0">
              <p className="font-body text-xs text-muted-foreground">{current?.sectionTitle} · Lesson {(current?.index ?? 0) + 1} of {lessons.length}</p>
              <h1 className="mt-1 font-display text-2xl font-semibold leading-tight text-foreground sm:text-[1.75rem]">{current?.title || "Lesson"}</h1>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" disabled={!prevId} onClick={() => prevId && goTo(prevId)} className="inline-flex min-h-10 items-center gap-1 rounded-md border border-gold/30 px-3 font-body text-sm font-semibold text-foreground hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40">
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
                </button>
                {currentId && (
                  <button
                    type="button"
                    aria-pressed={currentDone}
                    onClick={() => setDone(currentId, !currentDone)}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 font-body text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.97] ${currentDone ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "border border-gold/30 text-foreground hover:border-primary"}`}
                  >
                    {currentDone ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                    {currentDone ? "Completed" : "Mark complete"}
                  </button>
                )}
                <button type="button" disabled={!nextId} onClick={() => nextId && goTo(nextId)} className="ml-auto inline-flex min-h-10 items-center gap-1 rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.97] disabled:opacity-40">
                  Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {/* Mobile: tabs */}
              <Tabs defaultValue="lessons" className="mt-6 lg:hidden">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="lessons">Lessons</TabsTrigger>
                  <TabsTrigger value="notes">Notes &amp; resources</TabsTrigger>
                </TabsList>
                <TabsContent value="lessons" className="mt-4">{lessonList}</TabsContent>
                <TabsContent value="notes" className="mt-4">{notes}</TabsContent>
              </Tabs>

              {/* Desktop: notes under the player */}
              <section className="mt-8 hidden border-t border-gold/15 pt-6 lg:block" aria-labelledby="lesson-notes-heading">
                <h2 id="lesson-notes-heading" className="mb-3 font-display text-xl font-semibold text-foreground">Notes &amp; resources</h2>
                {notes}
              </section>
            </div>
          </div>

          <aside className="hidden lg:block" aria-label="Course lessons">
            <div className="sticky top-[96px] max-h-[calc(100dvh-120px)] overflow-y-auto rounded-xl border border-gold/20 bg-card">
              <div className="border-b border-gold/15 px-4 py-3">
                <p className="font-body text-sm font-semibold text-foreground">Master class lessons</p>
                <p className="font-body text-xs text-muted-foreground">{completedIds.size > 0 ? `${[...completedIds].filter((id) => lessons.some((l) => l.id === id)).length} of ${lessons.length} done` : `${lessons.length} lessons`}</p>
              </div>
              {lessonList}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
};

const LessonList = ({ course, currentId, completedIds, onSelect }: { course: ElearnCourse; currentId?: string; completedIds: Set<string>; onSelect: (id: string) => void }) => (
  <nav aria-label="Lessons">
    {course.sections.filter((s) => s.lessons.length > 0).map((section, i) => (
      <div key={section.id}>
        <p className="bg-ivory/60 px-4 py-2 font-body text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{i + 1}. {section.title}</p>
        <ul>
          {section.lessons.map((lesson) => {
            const active = lesson.id === currentId;
            const done = completedIds.has(lesson.id);
            return (
              <li key={lesson.id}>
                <button
                  type="button"
                  onClick={() => onSelect(lesson.id)}
                  aria-current={active ? "true" : undefined}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${active ? "bg-primary/[0.07]" : "hover:bg-muted/60"}`}
                >
                  {done ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-label="Completed" />
                  ) : active ? (
                    <PlayCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                  )}
                  <span className={`min-w-0 flex-1 font-body text-sm leading-snug ${active ? "font-semibold text-primary" : "text-foreground"}`}>{lesson.title}</span>
                  {lesson.durationSec > 0 && <span className="shrink-0 font-body text-xs tabular-nums text-muted-foreground">{formatDuration(lesson.durationSec)}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    ))}
  </nav>
);

export default LearnWatch;
