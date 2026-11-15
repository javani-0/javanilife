import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, Check, Clock, Globe2, Hourglass, Infinity as InfinityIcon, Layers, Loader2, PlayCircle, ShieldCheck, UserRound } from "lucide-react";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { breadcrumbJsonLd, elearnCourseJsonLd, graph } from "../../api/_lib/seo";
import { useAuth } from "@/contexts/AuthContext";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import { optimizeImageUrl } from "@/lib/cloudinary";
import { availablePaymentModes, formatTotalDuration, progressPercent, type ElearnCourse, type ElearnLesson } from "@/lib/elearning";
import BuyCourseDialog, { usePayOnline } from "@/components/elearning/BuyCourseDialog";
import CurriculumAccordion from "@/components/elearning/CurriculumAccordion";
import VideoModal from "@/components/elearning/VideoModal";
import { useCourse, useMyCourseAccess, usePaymentSettingsLive } from "@/components/elearning/useElearn";
import { GOLD_TEXT, LEVEL_LABELS, REVOKED_MESSAGE, accessLabel, accessStateOf, canBuy, formatDate, lessonsLabel, type AccessState } from "@/components/elearning/format";

const LearnCourse = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { course, loading } = useCourse(courseId);
  const access = useMyCourseAccess(courseId);
  const { settings, loaded: settingsLoaded } = usePaymentSettingsLive();
  const { pay, paying } = usePayOnline(course, access.isDemo);
  const [buyOpen, setBuyOpen] = useState(false);
  const [video, setVideo] = useState<{ title: string; url: string; subtitle: string } | null>(null);

  const linkSearch = import.meta.env.DEV && new URLSearchParams(search).has("demo") ? search : "";
  const signedIn = !!user || access.isDemo;
  const state: AccessState = accessStateOf(signedIn, access.enrollment);
  const modes = useMemo(() => (course ? availablePaymentModes(course, settings) : { razorpay: false, upi: false }), [course, settings]);
  const purchasable = modes.razorpay || modes.upi;
  const percent = course ? progressPercent(course.sections, access.progress?.completedLessonIds ?? []) : 0;

  const startBuy = () => {
    if (!course) return;
    if (state === "signed-out") {
      navigate(`/login?redirect=${encodeURIComponent(pathname + search)}`);
      return;
    }
    if (modes.razorpay && !modes.upi) void pay();
    else setBuyOpen(true);
  };

  if (loading) return <CourseSkeleton />;

  if (!course) {
    return (
      <>
        <SEO title="Course not found | Javani Spiritual Hub" description="This online course is not available." noindex />
        <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 pb-20 pt-[120px] text-center">
          <p className={`font-body text-xs font-semibold uppercase tracking-[0.16em] ${GOLD_TEXT}`}>E-Learning</p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-foreground sm:text-4xl">This course isn't available</h1>
          <p className="mt-3 font-body text-sm leading-relaxed text-muted-foreground">It may have been removed or isn't published yet.</p>
          <Link to={`/learn${linkSearch}`} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-md bg-gradient-primary px-6 font-body text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.97]">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All online courses
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  const path = `/learn/${course.id}`;
  const watchHref = `/learn/${encodeURIComponent(course.id)}/watch${linkSearch}`;
  const hasStrike = typeof course.compareAtInPaise === "number" && course.compareAtInPaise > course.priceInPaise;
  const busy = paying || authLoading || access.loading || !settingsLoaded;

  const openPreview = (lesson: ElearnLesson) => lesson.previewVimeoUrl && setVideo({ title: lesson.title, url: lesson.previewVimeoUrl, subtitle: "Free preview" });

  const panelProps: BuyPanelProps = {
    course, state, percent, purchasable, busy, paying, watchHref,
    enrollmentExpires: access.enrollment?.expiresAt,
    rejectReason: access.enrollment?.rejectReason,
    onBuy: startBuy,
  };

  return (
    <>
      <SEO
        title={`${course.title} | Online Course | Javani Spiritual Hub`}
        description={course.subtitle || course.description.slice(0, 155)}
        canonical={path}
        ogImage={course.coverImageUrl || undefined}
        jsonLd={graph(
          elearnCourseJsonLd({
            path,
            name: course.title,
            description: course.description || course.subtitle,
            image: course.coverImageUrl,
            priceInPaise: course.priceInPaise,
            totalDurationSec: course.totalDurationSec,
            language: course.language,
            level: LEVEL_LABELS[course.level],
            instructorName: course.instructorName,
          }),
          breadcrumbJsonLd([{ name: "E-Learning", path: "/learn" }, { name: course.title, path }]),
        )}
      />

      <main className="bg-background pb-28 lg:pb-0">
        {/* Hero */}
        <section className="relative overflow-hidden bg-charcoal text-ivory">
          <div className="pointer-events-none absolute inset-0 opacity-25" aria-hidden="true">
            {course.coverImageUrl && <img src={optimizeImageUrl(course.coverImageUrl, 1600)} alt="" className="h-full w-full scale-110 object-cover blur-2xl" />}
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-charcoal/70 via-charcoal/85 to-charcoal" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-7xl gap-8 px-4 pb-10 pt-[100px] sm:px-6 sm:pt-[116px] lg:grid-cols-[1fr_380px] lg:gap-12 lg:pb-14">
            <div className="min-w-0">
              <nav aria-label="Breadcrumb" className="font-body text-xs text-ivory/75">
                <ol className="flex flex-wrap items-center gap-1.5">
                  <li><Link to="/" className="rounded hover:text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Home</Link></li>
                  <li aria-hidden="true">›</li>
                  <li><Link to={`/learn${linkSearch}`} className="rounded hover:text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">E-Learning</Link></li>
                  <li aria-hidden="true">›</li>
                  <li aria-current="page" className="max-w-[16rem] truncate text-ivory/90">{course.title}</li>
                </ol>
              </nav>

              {/* Cover on mobile */}
              <div className="relative mt-5 aspect-video overflow-hidden rounded-xl bg-black/40 ring-1 ring-white/10 lg:hidden">
                <Cover course={course} onPlay={course.trailerVimeoUrl ? () => setVideo({ title: course.title, url: course.trailerVimeoUrl, subtitle: "Course trailer" }) : undefined} />
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2">
                {course.category && <span className="rounded-full bg-gold/20 px-3 py-1 font-body text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-[hsl(40_80%_78%)]">{course.category}</span>}
                <span className="rounded-full bg-white/10 px-3 py-1 font-body text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-ivory/90">{LEVEL_LABELS[course.level]}</span>
              </div>
              <h1 className="mt-3 font-display text-[2.1rem] font-semibold leading-[1.08] text-ivory sm:text-5xl">{course.title}</h1>
              {course.subtitle && <p className="mt-3 max-w-2xl font-body text-[0.95rem] leading-relaxed text-ivory/80 sm:text-base">{course.subtitle}</p>}

              <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2.5 font-body text-[0.85rem] text-ivory/85">
                <Meta icon={<PlayCircle className="h-4 w-4" />}>{lessonsLabel(course.lessonCount)}</Meta>
                <Meta icon={<Clock className="h-4 w-4" />}>{formatTotalDuration(course.totalDurationSec)} total</Meta>
                <Meta icon={<Layers className="h-4 w-4" />}>{LEVEL_LABELS[course.level]}</Meta>
                {course.language && <Meta icon={<Globe2 className="h-4 w-4" />}>{course.language}</Meta>}
                <Meta icon={course.accessDays > 0 ? <Hourglass className="h-4 w-4" /> : <InfinityIcon className="h-4 w-4" />}>{accessLabel(course)}</Meta>
                {course.instructorName && <Meta icon={<UserRound className="h-4 w-4" />}>{course.instructorName}</Meta>}
              </ul>

              {course.trailerVimeoUrl && (
                <button
                  type="button"
                  onClick={() => setVideo({ title: course.title, url: course.trailerVimeoUrl, subtitle: "Course trailer" })}
                  className="mt-7 hidden min-h-11 items-center gap-2 rounded-full border border-ivory/30 px-5 font-body text-sm font-semibold text-ivory transition-colors hover:border-gold hover:text-[hsl(40_80%_78%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold active:scale-[0.97] lg:inline-flex"
                >
                  <PlayCircle className="h-5 w-5" aria-hidden="true" /> Play trailer
                </button>
              )}
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_380px] lg:gap-12">
          {/* Content */}
          <div className="min-w-0 space-y-12 py-10 lg:py-14">
            {course.outcomes.length > 0 && (
              <Section title="What you'll learn">
                <ul className="grid gap-x-8 gap-y-3 rounded-xl border border-gold/20 bg-card p-5 sm:grid-cols-2 sm:p-6">
                  {course.outcomes.map((item, i) => (
                    <li key={i} className="flex gap-3 font-body text-sm leading-relaxed text-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{item}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title="Course content" aside={`${course.sections.length} ${course.sections.length === 1 ? "section" : "sections"} · ${lessonsLabel(course.lessonCount)} · ${formatTotalDuration(course.totalDurationSec)}`}>
              <CurriculumAccordion sections={course.sections} unlocked={state === "active"} completedIds={new Set(access.progress?.completedLessonIds ?? [])} onPreview={openPreview} />
            </Section>

            {course.requirements.length > 0 && (
              <Section title="Requirements">
                <ul className="space-y-2.5">
                  {course.requirements.map((item, i) => (
                    <li key={i} className="flex gap-3 font-body text-sm leading-relaxed text-foreground">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden="true" />{item}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {course.description && (
              <Section title="About this course">
                <div className="max-w-prose whitespace-pre-line font-body text-[0.95rem] leading-[1.75] text-foreground/90">{course.description}</div>
              </Section>
            )}

            {course.instructorName && (
              <Section title="Your instructor">
                <div className="flex flex-col gap-5 rounded-xl border border-gold/20 bg-card p-5 sm:flex-row sm:p-6">
                  {course.instructorPhotoUrl ? (
                    <img src={optimizeImageUrl(course.instructorPhotoUrl, 240)} alt={course.instructorName} loading="lazy" className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-gold/30" />
                  ) : (
                    <span className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-primary/10 font-display text-3xl font-semibold text-primary" aria-hidden="true">{course.instructorName.charAt(0)}</span>
                  )}
                  <div>
                    <p className="font-display text-xl font-semibold text-foreground">{course.instructorName}</p>
                    {course.instructorBio && <p className="mt-2 whitespace-pre-line font-body text-sm leading-relaxed text-muted-foreground">{course.instructorBio}</p>}
                  </div>
                </div>
              </Section>
            )}
          </div>

          {/* Desktop buy card (pulled up into the hero) */}
          <aside className="hidden lg:block" aria-label="Buy this course">
            <div className="sticky top-[100px] -mt-[22rem] mb-14 overflow-hidden rounded-2xl border border-gold/20 bg-card shadow-[0_30px_60px_-30px_rgba(40,20,10,0.45)]">
              <div className="relative aspect-video bg-black">
                <Cover course={course} onPlay={course.trailerVimeoUrl ? () => setVideo({ title: course.title, url: course.trailerVimeoUrl, subtitle: "Course trailer" }) : undefined} />
              </div>
              <div className="p-6">
                <BuyPanel {...panelProps} hasStrike={hasStrike} />
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Mobile sticky bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/20 bg-card/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-4 pr-[92px] pt-3 shadow-[0_-10px_30px_-18px_rgba(40,20,10,0.4)] backdrop-blur lg:hidden">
        <MobileBar {...panelProps} hasStrike={hasStrike} />
      </div>

      <div className="hidden sm:block"><Footer /></div>

      {purchasable && (
        <BuyCourseDialog course={course} modes={modes} settings={settings} open={buyOpen} onOpenChange={setBuyOpen} onPayOnline={() => void pay()} isDemo={access.isDemo} />
      )}
      <VideoModal open={!!video} onOpenChange={(open) => !open && setVideo(null)} title={video?.title ?? ""} vimeoUrl={video?.url ?? ""} subtitle={video?.subtitle} />
    </>
  );
};

// ── Pieces ────────────────────────────────────────────────────────────────

const Meta = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
  <li className="inline-flex items-center gap-1.5"><span className="text-[hsl(40_80%_78%)]" aria-hidden="true">{icon}</span>{children}</li>
);

const Section = ({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) => (
  <section>
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="font-display text-2xl font-semibold text-foreground sm:text-[1.75rem]">{title}</h2>
      {aside && <p className="font-body text-xs text-muted-foreground">{aside}</p>}
    </div>
    {children}
  </section>
);

const Cover = ({ course, onPlay }: { course: ElearnCourse; onPlay?: () => void }) => (
  <>
    {course.coverImageUrl ? (
      <img src={optimizeImageUrl(course.coverImageUrl, 900)} alt={`${course.title} course cover`} className="h-full w-full object-cover" />
    ) : (
      <div className="h-full w-full bg-gradient-primary" aria-hidden="true" />
    )}
    {onPlay && (
      <button
        type="button"
        onClick={onPlay}
        className="group absolute inset-0 grid place-items-center bg-black/25 transition-colors hover:bg-black/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold"
      >
        <span className="flex flex-col items-center gap-2">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-white/95 text-primary shadow-lg transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-safe:group-hover:scale-105 motion-safe:group-active:scale-95">
            <PlayCircle className="h-8 w-8" aria-hidden="true" />
          </span>
          <span className="rounded-full bg-black/55 px-3 py-1 font-body text-xs font-semibold text-white">Play trailer</span>
        </span>
      </button>
    )}
  </>
);

interface BuyPanelProps {
  course: ElearnCourse;
  state: AccessState;
  percent: number;
  purchasable: boolean;
  busy: boolean;
  paying: boolean;
  watchHref: string;
  enrollmentExpires: unknown;
  rejectReason?: string;
  onBuy: () => void;
  hasStrike?: boolean;
}

const primaryBtn =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-gradient-primary px-5 font-body text-[0.95rem] font-semibold text-primary-foreground shadow-gold transition-[transform,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";

// Same button without w-full, for rows that share space (w-auto would lose to w-full in the CSS order).
const inlineBtn = primaryBtn.replace(" w-full", "");

const buyLabel = (state: AccessState) => (state === "rejected" ? "Pay again" : state === "expired" ? "Buy again" : "Buy now");

const Price = ({ course, hasStrike, size = "lg" }: { course: ElearnCourse; hasStrike?: boolean; size?: "lg" | "sm" }) => (
  <div className="flex items-baseline gap-2">
    <span className={`font-display font-bold text-primary ${size === "lg" ? "text-[2.1rem] leading-none" : "text-2xl leading-none"}`}>
      {course.priceInPaise > 0 ? formatPaiseAsRupees(course.priceInPaise) : "Free"}
    </span>
    {hasStrike && <span className="font-body text-sm text-muted-foreground line-through"><span className="sr-only">Was </span>{formatPaiseAsRupees(course.compareAtInPaise!)}</span>}
  </div>
);

const StatusNote = ({ state, rejectReason, enrollmentExpires }: Pick<BuyPanelProps, "state" | "rejectReason" | "enrollmentExpires">) => {
  if (state === "processing")
    return (
      <p role="status" className="flex gap-2.5 rounded-lg bg-amber-50 p-3 font-body text-sm leading-relaxed text-amber-900 ring-1 ring-amber-200">
        <Hourglass className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Payment under review: we'll unlock it soon.
      </p>
    );
  if (state === "rejected")
    return (
      <div role="status" className="rounded-lg bg-destructive/10 p-3 font-body text-sm leading-relaxed text-destructive">
        <p className="flex gap-2.5 font-semibold"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> We couldn't verify your payment.</p>
        {rejectReason && <p className="mt-1 pl-[1.6rem] text-foreground/80">Reason: {rejectReason}</p>}
      </div>
    );
  if (state === "expired")
    return <p role="status" className="font-body text-sm text-muted-foreground">Your access ended{formatDate(enrollmentExpires) ? ` on ${formatDate(enrollmentExpires)}` : ""}. Buy again to keep learning.</p>;
  if (state === "revoked")
    return (
      <p role="status" className="flex gap-2.5 rounded-lg bg-muted p-3 font-body text-sm leading-relaxed text-foreground">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" /> {REVOKED_MESSAGE}
      </p>
    );
  return null;
};

const BuyPanel = ({ course, state, percent, purchasable, busy, paying, watchHref, enrollmentExpires, rejectReason, onBuy, hasStrike }: BuyPanelProps) => {
  if (state === "active") {
    const until = formatDate(enrollmentExpires);
    return (
      <div>
        <p className="inline-flex items-center gap-1.5 font-body text-sm font-semibold text-emerald-700"><Check className="h-4 w-4" aria-hidden="true" /> You're enrolled</p>
        <div className="mt-3 flex items-center justify-between font-body text-xs text-muted-foreground"><span>Your progress</span><span className="font-semibold text-foreground">{percent}%</span></div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Course progress">
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
        <Link to={watchHref} className={`${primaryBtn} mt-5`}><PlayCircle className="h-5 w-5" aria-hidden="true" /> {percent > 0 ? "Continue learning" : "Start learning"}</Link>
        <p className="mt-3 text-center font-body text-xs text-muted-foreground">{until ? `Access until ${until}` : "Lifetime access"}</p>
      </div>
    );
  }

  return (
    <div>
      {state !== "revoked" && <Price course={course} hasStrike={hasStrike} />}
      <div className={state !== "revoked" ? "mt-4 space-y-4" : "space-y-4"}>
        <StatusNote state={state} rejectReason={rejectReason} enrollmentExpires={enrollmentExpires} />
        {(state === "signed-out" || canBuy(state)) && (
          purchasable ? (
            <button type="button" onClick={onBuy} disabled={busy} className={primaryBtn}>
              {paying && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {paying ? "Opening payment…" : buyLabel(state)}
            </button>
          ) : (
            <p className="rounded-lg bg-muted p-3 font-body text-sm text-foreground">Enrolment for this course isn't open yet. <Link to="/contact" className="font-semibold text-primary underline-offset-4 hover:underline">Contact us</Link> to join.</p>
          )
        )}
        {state === "revoked" && <Link to="/contact" className={primaryBtn}>Contact us</Link>}
        {state === "processing" && <Link to="/account/learning" className="block text-center font-body text-sm font-semibold text-primary underline-offset-4 hover:underline">See My Learning</Link>}
      </div>
      {(state === "signed-out" || canBuy(state)) && purchasable && (
        <ul className="mt-5 space-y-2 border-t border-gold/15 pt-4 font-body text-[0.82rem] text-muted-foreground">
          <li className="flex items-center gap-2"><InfinityIcon className="h-4 w-4 text-primary" aria-hidden="true" /> {accessLabel(course)}</li>
          <li className="flex items-center gap-2"><PlayCircle className="h-4 w-4 text-primary" aria-hidden="true" /> {lessonsLabel(course.lessonCount)} · watch on any device</li>
          <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" /> Secure payment</li>
        </ul>
      )}
    </div>
  );
};

const MobileBar = ({ course, state, percent, purchasable, busy, paying, watchHref, rejectReason, enrollmentExpires, onBuy, hasStrike }: BuyPanelProps) => {
  if (state === "active")
    return (
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-body text-xs font-semibold text-emerald-700">Enrolled · {percent}% done</p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full bg-primary" style={{ width: `${percent}%` }} /></div>
        </div>
        <Link to={watchHref} className={`${inlineBtn} shrink-0`}>Continue learning</Link>
      </div>
    );
  if (state === "processing" || state === "revoked")
    return <StatusNote state={state} rejectReason={rejectReason} enrollmentExpires={enrollmentExpires} />;
  return (
    <div className="space-y-2">
      {state === "rejected" && <p className="font-body text-xs font-medium text-destructive">We couldn't verify your payment{rejectReason ? `: ${rejectReason}` : "."}</p>}
      {state === "expired" && <p className="font-body text-xs text-muted-foreground">Your access has ended.</p>}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1"><Price course={course} hasStrike={hasStrike} size="sm" /></div>
        {purchasable ? (
          <button type="button" onClick={onBuy} disabled={busy} className={`${inlineBtn} shrink-0 px-7`}>
            {paying && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {paying ? "Opening…" : buyLabel(state)}
          </button>
        ) : (
          <Link to="/contact" className="shrink-0 font-body text-sm font-semibold text-primary">Contact us</Link>
        )}
      </div>
    </div>
  );
};

const CourseSkeleton = () => (
  <main className="bg-background" aria-busy="true" aria-label="Loading course">
    <div className="bg-charcoal">
      <div className="mx-auto max-w-7xl space-y-4 px-4 pb-12 pt-[100px] sm:px-6">
        <div className="h-4 w-40 rounded bg-white/10" />
        <div className="h-10 w-3/4 max-w-xl rounded bg-white/10" />
        <div className="h-4 w-1/2 max-w-md rounded bg-white/10" />
        <div className="h-4 w-2/3 max-w-lg rounded bg-white/10" />
      </div>
    </div>
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-10 sm:px-6">
      <div className="h-6 w-48 rounded skeleton-shimmer" />
      <div className="h-40 rounded-xl skeleton-shimmer" />
      <div className="h-64 rounded-xl skeleton-shimmer" />
    </div>
  </main>
);

export default LearnCourse;
