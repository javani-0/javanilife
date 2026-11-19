// Full-page course editor: basics, instructor, outcomes, pricing, payment
// modes, curriculum. Public fields → elearnCourses/{id} (saveCourse); every
// lesson's video link → the private elearnContent/{id} (saveCourseContent).
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, BadgeIndianRupee, CheckCircle2, ExternalLink, Loader2,
  Link2, QrCode, Send, ShieldCheck, Smartphone, Save, EyeOff, CircleAlert,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { confirmDialog } from "@/components/ConfirmDialogHost";
import { formatPaiseAsRupees, parsePriceToPaise } from "@/lib/ecommerce/pricing";
import type { PaymentSettings } from "@/lib/settings/paymentSettings";
import {
  availablePaymentModes,
  changeCourseLink,
  formatTotalDuration,
  getCourseContent,
  parseVimeoUrl,
  saveCourse,
  saveCourseContent,
  slugify,
  vimeoEmbedUrlFromLink,
  type ElearnCourse,
  type ElearnCourseStatus,
  type ElearnLevel,
} from "@/lib/elearning";
import {
  draftErrors,
  draftFromCourse,
  draftPublishProblems,
  draftToSave,
  emptyCourseDraft,
  parseDurationInput,
  sameDraft,
  type CourseDraft,
} from "@/lib/elearning/adminHelpers";
import CurriculumBuilder from "./CurriculumBuilder";
import ListEditor from "./ListEditor";
import { LEAVE_CONFIRM, useUnsavedGuard } from "./useUnsavedGuard";
import {
  EditorSection,
  Field,
  ImageUploadField,
  StatusPill,
  VimeoFrame,
  errorClass,
  hintClass,
  inputClass,
  primaryButton,
  secondaryButton,
} from "./ui";
import { cn } from "@/lib/utils";

const LEVELS: { value: ElearnLevel; label: string }[] = [
  { value: "all", label: "All levels" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const ACCESS_PRESETS = [
  { days: "0", label: "Lifetime" },
  { days: "365", label: "1 year" },
  { days: "180", label: "6 months" },
  { days: "90", label: "3 months" },
];

const NAV = [
  { id: "ce-basics", label: "Basics" },
  { id: "ce-instructor", label: "Instructor" },
  { id: "ce-learn", label: "What they learn" },
  { id: "ce-pricing", label: "Pricing & access" },
  { id: "ce-payment", label: "Payment mode" },
  { id: "ce-curriculum", label: "Curriculum" },
];

const SITE_HOST = "javanilife.com";

const CourseEditor = ({
  course,
  allCourses,
  paymentSettings,
  onClose,
}: {
  /** null = a new course. */
  course: ElearnCourse | null;
  allCourses: ElearnCourse[];
  /** null while loading. */
  paymentSettings: PaymentSettings | null;
  onClose: () => void;
}) => {
  const { toast } = useToast();
  const [courseId, setCourseId] = useState<string | undefined>(course?.id);
  const [draft, setDraft] = useState<CourseDraft>(() => emptyCourseDraft());
  const [baseline, setBaseline] = useState<CourseDraft>(() => draft);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(course ? "loading" : "ready");
  const [saving, setSaving] = useState<ElearnCourseStatus | null>(null);
  const [problems, setProblems] = useState<{ kind: "save" | "publish"; items: string[] } | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [uploads, setUploads] = useState(0);
  const [relinking, setRelinking] = useState(false);
  const problemsRef = useRef<HTMLDivElement>(null);

  const dirty = loadState === "ready" && !sameDraft(draft, baseline);
  useUnsavedGuard(dirty);

  // Load the private lesson links once when editing an existing course.
  const load = async () => {
    if (!course) return;
    setLoadState("loading");
    try {
      const content = await getCourseContent(course.id);
      if (content === null) throw new Error("permission-denied");
      const loaded = draftFromCourse(course, content);
      setDraft(loaded);
      setBaseline(loaded);
      setLoadState("ready");
    } catch (error) {
      console.error("Could not load course content", error);
      setLoadState("error");
    }
  };
  useEffect(() => {
    void load();
    // Load once per opened course; live updates must not overwrite edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.id]);

  const set = <K extends keyof CourseDraft>(key: K, value: CourseDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  // ── Derived values ──────────────────────────────────────────────────────
  const publishList = useMemo(() => draftPublishProblems(draft), [draft]);
  const priceInPaise = draft.priceRupees.trim() ? parsePriceToPaise(draft.priceRupees) : 0;
  const compareAtInPaise = draft.compareAtRupees.trim() ? parsePriceToPaise(draft.compareAtRupees) : 0;
  const priceError = priceInPaise === null
    ? "Type the price as a number, e.g. 999"
    : attempted && priceInPaise <= 0 ? "Set a price above ₹0." : null;
  const compareAtError = compareAtInPaise === null
    ? "Type the MRP as a number, e.g. 1499"
    : compareAtInPaise > 0 && priceInPaise !== null && compareAtInPaise <= priceInPaise ? "The MRP must be higher than the price." : null;
  const accessDaysError = draft.accessDays.trim() && !/^\d+$/.test(draft.accessDays.trim()) ? "Use a whole number of days (0 = lifetime)." : null;
  const trailerLink = draft.trailerVimeoUrl.trim();
  const trailerError = trailerLink && !parseVimeoUrl(trailerLink) ? "This is not a Vimeo link." : null;
  const trailerEmbed = trailerLink && !trailerError ? vimeoEmbedUrlFromLink(trailerLink) : null;
  const upiReady = paymentSettings
    ? availablePaymentModes({ priceInPaise: 1, paymentModes: { razorpay: false, upi: true } }, paymentSettings).upi
    : true;
  const noModeError = attempted && !draft.paymentModes.razorpay && !draft.paymentModes.upi;
  const totals = useMemo(() => {
    let lessons = 0;
    let seconds = 0;
    for (const section of draft.sections) {
      for (const lesson of section.lessons) {
        lessons += 1;
        seconds += parseDurationInput(lesson.durationText) || 0;
      }
    }
    return { lessons, seconds };
  }, [draft.sections]);

  const categorySuggestions = useMemo(
    () => Array.from(new Set(allCourses.map((item) => item.category).filter(Boolean))).sort(),
    [allCourses],
  );
  const languageSuggestions = useMemo(
    () => Array.from(new Set(["English", "Telugu", "Hindi", ...allCourses.map((item) => item.language).filter(Boolean)])),
    [allCourses],
  );

  // ── Actions ─────────────────────────────────────────────────────────────
  const showProblems = (kind: "save" | "publish", items: string[]) => {
    setProblems({ kind, items });
    window.requestAnimationFrame(() => {
      problemsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      problemsRef.current?.focus({ preventScroll: true });
    });
  };

  const save = async (status: ElearnCourseStatus) => {
    setAttempted(true);
    const issues = status === "published" ? draftPublishProblems(draft) : draftErrors(draft);
    if (issues.length > 0) {
      showProblems(status === "published" ? "publish" : "save", issues);
      return;
    }
    setProblems(null);
    setSaving(status);
    const wasPublished = baseline.status === "published";
    try {
      const { input, content } = draftToSave(draft, status);
      const id = await saveCourse(input, courseId);
      setCourseId(id);
      try {
        await saveCourseContent(id, content);
      } catch (error) {
        console.error("Lesson links save failed", error);
        toast({ title: "Course saved, but the lesson links were not", description: "Please press Save again.", variant: "destructive" });
        return;
      }
      const saved = { ...draft, status };
      setDraft(saved);
      setBaseline(saved);
      setAttempted(false);
      toast({
        title: status === "published"
          ? wasPublished ? "Changes are live" : "Course published"
          : wasPublished ? "Course moved to drafts" : "Draft saved",
        description: status === "published" ? `Students can now see it at ${SITE_HOST}/learn/${id}` : "Only staff can see it until you publish.",
      });
    } catch (error) {
      console.error("Course save failed", error);
      toast({ title: "Could not save the course", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const unpublish = async () => {
    if (!(await confirmDialog({
      title: "Unpublish this course?",
      description: "It disappears from the catalogue and nobody new can buy it. Students who already bought it keep their access.",
      confirmText: "Unpublish",
    }))) return;
    void save("draft");
  };

  // Move the course to a link made from its current title (e.g. after a rename).
  const updateLink = async () => {
    if (!courseId) return;
    const next = slugify(draft.title);
    if (!(await confirmDialog({
      title: "Change the course link?",
      description: `The link becomes ${SITE_HOST}/learn/${next}. Links shared earlier will stop working. This is only allowed while nobody has bought the course.`,
      confirmText: "Change link",
    }))) return;
    setRelinking(true);
    try {
      const id = await changeCourseLink(courseId, draft.title);
      setCourseId(id);
      toast({ title: "Course link updated", description: `${SITE_HOST}/learn/${id}` });
    } catch (error) {
      console.error("Course link change failed", error);
      toast({ title: "Could not change the link", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setRelinking(false);
    }
  };

  const leave = async () => {
    if (dirty && !(await confirmDialog(LEAVE_CONFIRM))) return;
    onClose();
  };

  const busy = saving !== null || uploads > 0 || relinking;
  const titleSlug = slugify(draft.title);
  const canRelink = Boolean(courseId && titleSlug && titleSlug !== courseId && !courseId.startsWith(`${titleSlug}-`) && !dirty);
  const isPublished = baseline.status === "published";
  const slugPreview = courseId || slugify(draft.title);

  // ── Render ──────────────────────────────────────────────────────────────
  if (loadState === "loading") {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading course">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div role="alert" className="rounded-xl border border-destructive/30 bg-card p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto h-8 w-8 text-destructive" aria-hidden="true" />
        <h2 className="mt-3 font-display text-xl font-semibold">Couldn't open this course</h2>
        <p className="mt-1 font-body text-sm text-muted-foreground">The lesson links could not be loaded. Check your connection, or ask the admin to give you E-Learning access.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" className={secondaryButton} onClick={onClose}>Back to courses</button>
          <button type="button" className={primaryButton} onClick={() => void load()}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-10">
      {/* Sticky action bar */}
      <div className="sticky top-16 z-20 -mx-3 mb-5 border-b border-border/70 bg-background/95 px-3 py-3 backdrop-blur sm:-mx-5 sm:px-5 md:-mx-8 md:px-8 lg:top-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button type="button" onClick={() => void leave()} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 font-body text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All courses
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h1 className="truncate font-display text-xl font-semibold text-foreground sm:text-2xl">{draft.title.trim() || (courseId ? "Untitled course" : "New course")}</h1>
            <StatusPill status={baseline.status} />
            {dirty && <span className="hidden whitespace-nowrap font-body text-xs font-medium text-amber-800 sm:inline">Unsaved changes</span>}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {courseId && (
              <a href={`/learn/${courseId}`} target="_blank" rel="noreferrer" className={cn(secondaryButton, "px-3")}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> Preview
              </a>
            )}
            {isPublished ? (
              <>
                <button type="button" onClick={() => void unpublish()} disabled={busy} className={cn(secondaryButton, "px-3")}>
                  {saving === "draft" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />} Unpublish
                </button>
                <button type="button" onClick={() => void save("published")} disabled={busy || !dirty} className={cn(primaryButton, "flex-1 sm:flex-none")}>
                  {saving === "published" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                  {saving === "published" ? "Saving…" : "Save changes"}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => void save("draft")} disabled={busy} className={cn(secondaryButton, "flex-1 sm:flex-none")}>
                  {saving === "draft" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                  {saving === "draft" ? "Saving…" : "Save draft"}
                </button>
                <button type="button" onClick={() => void save("published")} disabled={busy} className={cn(primaryButton, "flex-1 sm:flex-none")}>
                  {saving === "published" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                  {saving === "published" ? "Publishing…" : "Publish"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {problems && (
        <div
          ref={problemsRef}
          tabIndex={-1}
          role="alert"
          className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
        >
          <p className="flex items-center gap-2 font-body text-sm font-semibold text-destructive">
            <CircleAlert className="h-4 w-4" aria-hidden="true" />
            {problems.kind === "publish" ? "Before you can publish, fix these:" : "Please fix these before saving:"}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6 font-body text-sm text-foreground">
            {problems.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-5">
          {/* 1. Basics */}
          <EditorSection id="ce-basics" step={1} title="Basics" description="What students see first on the course page.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Course title" required className="sm:col-span-2"
                hint={courseId
                  ? <>
                      Course link: <span className="break-all font-medium text-foreground">{SITE_HOST}/learn/{courseId}</span>
                      {canRelink ? (
                        <>
                          {" "}It doesn't match the title.{" "}
                          <button type="button" onClick={() => void updateLink()} disabled={busy} className="inline-flex items-center gap-1 rounded font-semibold text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-60">
                            {relinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Link2 className="h-3.5 w-3.5" aria-hidden="true" />}
                            Update link to /learn/{titleSlug}
                          </button>
                        </>
                      ) : dirty && courseId && titleSlug !== courseId ? " (save first to update the link)." : "."}
                    </>
                  : draft.title.trim() ? <>The link will be <span className="font-medium text-foreground">{SITE_HOST}/learn/{slugPreview}</span>. It is fixed after the first save.</> : "The course link is made from the title on the first save."}
                error={attempted && !draft.title.trim() ? "Add a course title." : null}
              >
                {({ id, describedBy, invalid }) => (
                  <input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={draft.title} onChange={(event) => set("title", event.target.value)} placeholder="e.g. Bharatanatyam for Beginners" className={cn(inputClass, "text-base")} />
                )}
              </Field>
              <Field label="Subtitle" hint="One short line under the title." className="sm:col-span-2">
                {({ id, describedBy }) => (
                  <input id={id} aria-describedby={describedBy} value={draft.subtitle} onChange={(event) => set("subtitle", event.target.value)} placeholder="e.g. Learn the first 10 adavus at home, step by step" className={inputClass} />
                )}
              </Field>
              <Field label="Description" hint="Leave an empty line between paragraphs." className="sm:col-span-2">
                {({ id, describedBy }) => (
                  <textarea id={id} aria-describedby={describedBy} value={draft.description} onChange={(event) => set("description", event.target.value)} rows={6} className={cn(inputClass, "resize-y leading-relaxed")} />
                )}
              </Field>
              <Field label="Category" hint="Type a new one or pick an existing one.">
                {({ id, describedBy }) => (
                  <>
                    <input id={id} aria-describedby={describedBy} list={`${id}-list`} value={draft.category} onChange={(event) => set("category", event.target.value)} placeholder="e.g. Classical dance" className={inputClass} />
                    <datalist id={`${id}-list`}>{categorySuggestions.map((item) => <option key={item} value={item} />)}</datalist>
                  </>
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Level">
                  {({ id }) => (
                    <select id={id} value={draft.level} onChange={(event) => set("level", event.target.value as ElearnLevel)} className={cn(inputClass, "h-[2.4rem]")}>
                      {LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
                    </select>
                  )}
                </Field>
                <Field label="Language">
                  {({ id }) => (
                    <>
                      <input id={id} list={`${id}-list`} value={draft.language} onChange={(event) => set("language", event.target.value)} placeholder="Telugu" className={inputClass} />
                      <datalist id={`${id}-list`}>{languageSuggestions.map((item) => <option key={item} value={item} />)}</datalist>
                    </>
                  )}
                </Field>
              </div>
              <div className="sm:col-span-2">
                <ImageUploadField
                  label="Cover image"
                  hint="Wide 16:9 picture, at least 1280 × 720. Shown on the catalogue card and course page."
                  value={draft.coverImageUrl}
                  onChange={(url) => set("coverImageUrl", url)}
                  onBusyChange={(isBusy) => setUploads((count) => Math.max(0, count + (isBusy ? 1 : -1)))}
                />
              </div>
              <Field label="Trailer video (Vimeo link, optional)" className="sm:col-span-2" error={trailerError}
                hint="A short free intro video. Anyone can watch it on the course page.">
                {({ id, describedBy, invalid }) => (
                  <input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={draft.trailerVimeoUrl} onChange={(event) => set("trailerVimeoUrl", event.target.value)} inputMode="url" placeholder="https://vimeo.com/123456789" className={inputClass} />
                )}
              </Field>
              {trailerEmbed && (
                <div className="sm:col-span-2 sm:max-w-xl">
                  <VimeoFrame src={trailerEmbed} title="Trailer preview" />
                </div>
              )}
            </div>
          </EditorSection>

          {/* 2. Instructor */}
          <EditorSection id="ce-instructor" step={2} title="Instructor" description="Who teaches this course.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                {({ id }) => <input id={id} value={draft.instructorName} onChange={(event) => set("instructorName", event.target.value)} className={inputClass} />}
              </Field>
              <div className="sm:row-span-2">
                <ImageUploadField
                  label="Photo"
                  hint="Square photo; you can crop it after choosing."
                  square
                  value={draft.instructorPhotoUrl}
                  onChange={(url) => set("instructorPhotoUrl", url)}
                  onBusyChange={(isBusy) => setUploads((count) => Math.max(0, count + (isBusy ? 1 : -1)))}
                />
              </div>
              <Field label="Short bio" hint="2–4 lines: experience, training, achievements (real facts only).">
                {({ id, describedBy }) => (
                  <textarea id={id} aria-describedby={describedBy} value={draft.instructorBio} onChange={(event) => set("instructorBio", event.target.value)} rows={4} className={cn(inputClass, "resize-y")} />
                )}
              </Field>
            </div>
          </EditorSection>

          {/* 3. Outcomes + requirements */}
          <EditorSection id="ce-learn" step={3} title="What students will learn" description="Short, concrete lines. They appear as a checklist on the course page.">
            <div className="grid gap-6 lg:grid-cols-2">
              <ListEditor label="Students will learn" itemName="outcome" placeholder="e.g. Perform the first 10 adavus with correct posture" items={draft.outcomes} onChange={(items) => set("outcomes", items)} hint="Aim for 4–8 lines. Press Enter to add." />
              <ListEditor label="Requirements" itemName="requirement" placeholder="e.g. A clear space of 2 × 2 metres" items={draft.requirements} onChange={(items) => set("requirements", items)} hint="What they need before starting. Leave empty if none." />
            </div>
          </EditorSection>

          {/* 4. Pricing & access */}
          <EditorSection id="ce-pricing" step={4} title="Pricing & access">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Price (₹)" required error={priceError}
                hint={priceInPaise ? <>Students pay <span className="font-semibold text-foreground">{formatPaiseAsRupees(priceInPaise)}</span></> : "What the student pays."}>
                {({ id, describedBy, invalid }) => (
                  <div className="relative">
                    <BadgeIndianRupee className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={draft.priceRupees} onChange={(event) => set("priceRupees", event.target.value)} inputMode="decimal" placeholder="999" className={cn(inputClass, "pl-9 tabular-nums")} />
                  </div>
                )}
              </Field>
              <Field label="MRP / original price (₹, optional)" error={compareAtError}
                hint="Shown struck through next to the price. Only if it is a real earlier price.">
                {({ id, describedBy, invalid }) => (
                  <div className="relative">
                    <BadgeIndianRupee className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={draft.compareAtRupees} onChange={(event) => set("compareAtRupees", event.target.value)} inputMode="decimal" placeholder="1499" className={cn(inputClass, "pl-9 tabular-nums")} />
                  </div>
                )}
              </Field>
              <div className="sm:col-span-2">
                <Field label="Access after purchase" error={accessDaysError}
                  hint={Number(draft.accessDays) > 0 ? `Access ends ${draft.accessDays} days after the purchase is unlocked.` : "Students keep the course forever."}>
                  {({ id, describedBy, invalid }) => (
                    <div className="flex flex-wrap items-center gap-2">
                      <div role="group" aria-label="Access presets" className="flex flex-wrap gap-1.5">
                        {ACCESS_PRESETS.map((preset) => {
                          const active = (Number(draft.accessDays) || 0) === Number(preset.days) && !accessDaysError;
                          return (
                            <button key={preset.days} type="button" aria-pressed={active} onClick={() => set("accessDays", preset.days)}
                              className={cn(
                                "rounded-full border px-3 py-1.5 font-body text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
                                active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted",
                              )}>
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-2">
                        <input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={draft.accessDays} onChange={(event) => set("accessDays", event.target.value)} inputMode="numeric" className={cn(inputClass, "w-24 tabular-nums")} />
                        <span className="font-body text-sm text-muted-foreground">days (0 = lifetime)</span>
                      </div>
                    </div>
                  )}
                </Field>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-ivory/50 p-3 sm:col-span-2">
                <Switch id="ce-featured" checked={draft.featured} onCheckedChange={(checked) => set("featured", checked)} className="mt-0.5" />
                <label htmlFor="ce-featured" className="font-body text-sm">
                  <span className="font-semibold text-foreground">Featured course</span>
                  <span className="block text-muted-foreground">Shown first in the course catalogue.</span>
                </label>
              </div>
            </div>
          </EditorSection>

          {/* 5. Payment mode */}
          <EditorSection id="ce-payment" step={5} title="Payment mode" description="Choose how students can pay for this course. Turn on at least one.">
            <div className="grid gap-3 md:grid-cols-2">
              {([
                {
                  key: "razorpay" as const,
                  icon: Smartphone,
                  title: "Razorpay",
                  body: "UPI apps, cards, netbanking. Unlocks instantly after payment.",
                },
                {
                  key: "upi" as const,
                  icon: QrCode,
                  title: "QR scan",
                  body: "Student scans your UPI QR and uploads the payment screenshot. You approve it in Purchases.",
                },
              ]).map((mode) => {
                const on = draft.paymentModes[mode.key];
                const Icon = mode.icon;
                return (
                  <div key={mode.key} className={cn("flex items-start gap-3 rounded-xl border p-4 transition-colors", on ? "border-primary/40 bg-primary/[0.04]" : "border-border bg-card")}>
                    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")} aria-hidden="true">
                      <Icon className="h-5 w-5" />
                    </span>
                    <label htmlFor={`ce-mode-${mode.key}`} className="min-w-0 flex-1 font-body text-sm">
                      <span className="block font-semibold text-foreground">{mode.title}</span>
                      <span className="block text-muted-foreground">{mode.body}</span>
                    </label>
                    <Switch
                      id={`ce-mode-${mode.key}`}
                      checked={on}
                      onCheckedChange={(checked) => set("paymentModes", { ...draft.paymentModes, [mode.key]: checked })}
                    />
                  </div>
                );
              })}
            </div>
            {noModeError && <p className={errorClass} role="alert">Turn on at least one payment mode.</p>}
            {draft.paymentModes.upi && !upiReady && (
              <div role="status" className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 font-body text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p>
                  QR payments are not set up yet{paymentSettings && !paymentSettings.manualPaymentsEnabled ? " (manual payments are switched off)" : ""}, so students won't see the QR option.{" "}
                  <Link to="/admin/payment-settings" className="font-semibold underline underline-offset-2">Open Payment Settings</Link> to add your UPI ID or QR image.
                </p>
              </div>
            )}
            {draft.paymentModes.upi && upiReady && paymentSettings && (
              <p className={cn(hintClass, "mt-3 flex items-center gap-1.5")}>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                Students pay to {paymentSettings.upiId || "your uploaded QR"} (from Payment Settings).
              </p>
            )}
          </EditorSection>

          {/* 6. Curriculum */}
          <EditorSection
            id="ce-curriculum"
            step={6}
            title="Curriculum"
            description="Sections with lessons. Paste each lesson's Vimeo link: the title and length fill in by themselves."
            aside={<p className="font-body text-sm tabular-nums text-muted-foreground">{totals.lessons} lesson{totals.lessons === 1 ? "" : "s"}{totals.seconds > 0 ? ` · ${formatTotalDuration(totals.seconds)}` : ""}</p>}
          >
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-gold/50 bg-ivory p-3.5">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="font-body text-sm text-foreground">
                <p className="font-semibold">Keep your videos private on Vimeo</p>
                <p className="mt-0.5 text-muted-foreground">
                  For every video in Vimeo, set <span className="font-medium text-foreground">Privacy → "Hide from Vimeo"</span> and{" "}
                  <span className="font-medium text-foreground">Embed → "Specific domains" → {SITE_HOST}</span>, so videos play only on your site.
                  Paid lesson links are only shown to students who bought the course.
                </p>
              </div>
            </div>
            <CurriculumBuilder sections={draft.sections} onChange={(update) => setDraft((current) => ({ ...current, sections: update(current.sections) }))} />
          </EditorSection>
        </div>

        {/* Side: jump links + live publish checklist */}
        <aside className="hidden xl:block">
          <div className="sticky top-24 space-y-4">
            <nav aria-label="Editor sections" className="rounded-xl border border-border/70 bg-card p-3 shadow-sm">
              <ul className="space-y-0.5">
                {NAV.map((item, index) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`} onClick={(event) => { event.preventDefault(); document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 font-body text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
                      <span className="w-4 text-right text-xs tabular-nums">{index + 1}</span> {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm" aria-live="polite">
              {publishList.length === 0 ? (
                <p className="flex items-start gap-2 font-body text-sm text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Ready to publish.
                </p>
              ) : (
                <>
                  <p className="font-body text-sm font-semibold text-foreground">To publish, still needed:</p>
                  <ul className="mt-2 space-y-1.5">
                    {publishList.slice(0, 6).map((item) => (
                      <li key={item} className="flex items-start gap-2 font-body text-[0.8rem] leading-snug text-muted-foreground">
                        <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" /> {item}
                      </li>
                    ))}
                    {publishList.length > 6 && <li className="font-body text-[0.8rem] text-muted-foreground">+ {publishList.length - 6} more</li>}
                  </ul>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default CourseEditor;
