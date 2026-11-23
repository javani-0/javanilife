// One lesson in the curriculum builder: title, Vimeo link (validated, oEmbed
// auto-fill of title + duration + thumbnail), duration, free-preview switch,
// optional resource link + notes, and an on-demand inline player.
import { useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Eye, Loader2, PlayCircle, Trash2, CheckCircle2, Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { fetchVimeoOembed, isVideoUrl, videoEmbedUrlFromLink, videoProvider } from "@/lib/elearning";
import { durationToInput, parseDurationInput, type LessonDraft } from "@/lib/elearning/adminHelpers";
import { confirmDialog } from "@/components/ConfirmDialogHost";
import { errorClass, hintClass, iconButton, inputClass, labelClass, VimeoFrame } from "./ui";
import { cn } from "@/lib/utils";

type Lookup = { state: "idle" } | { state: "loading" } | { state: "ok"; thumbnailUrl: string } | { state: "failed" };

const LessonRow = ({
  lesson,
  number,
  isFirst,
  isLast,
  autoFocus,
  onChange,
  onMove,
  onDelete,
}: {
  lesson: LessonDraft;
  /** 1-based number across the whole course. */
  number: number;
  isFirst: boolean;
  isLast: boolean;
  autoFocus?: boolean;
  onChange: (update: (lesson: LessonDraft) => LessonDraft) => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
}) => {
  const id = useId();
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [showPlayer, setShowPlayer] = useState(false);
  const [showMore, setShowMore] = useState(Boolean(lesson.resourceUrl || lesson.notes));
  const [linkTouched, setLinkTouched] = useState(false);
  // Only look up links the admin changes in this session (not every saved
  // lesson on open), so opening a long course makes no network calls.
  const lastLookedUp = useRef(lesson.vimeoUrl.trim());

  const link = lesson.vimeoUrl.trim();
  const linkValid = link ? isVideoUrl(link) : true;
  const host = videoProvider(link) === "youtube" ? "YouTube" : "Vimeo";
  const durationValid = parseDurationInput(lesson.durationText) !== null;
  const embedUrl = link && linkValid ? videoEmbedUrlFromLink(link) : null;

  useEffect(() => {
    if (!link || link === lastLookedUp.current || !isVideoUrl(link)) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      lastLookedUp.current = link;
      setLookup({ state: "loading" });
      const info = await fetchVimeoOembed(link);
      if (cancelled) return;
      if (!info) {
        setLookup({ state: "failed" });
        return;
      }
      // YouTube gives no length: ask for it like a failed lookup (the title still fills in).
      setLookup(info.durationSec > 0 ? { state: "ok", thumbnailUrl: info.thumbnailUrl } : { state: "failed" });
      onChange((current) => ({
        ...current,
        title: current.title.trim() ? current.title : info.title,
        // A new video has a new length: take the host's (the admin can still edit it).
        durationText: info.durationSec > 0 ? durationToInput(info.durationSec) : current.durationText,
      }));
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // onChange is a fresh closure each render; the link is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link]);

  useEffect(() => {
    if (!embedUrl) setShowPlayer(false);
  }, [embedUrl]);

  const confirmDelete = async () => {
    const hasWork = lesson.title.trim() || link;
    if (hasWork && !(await confirmDialog({
      title: `Delete "${lesson.title.trim() || `Lesson ${number}`}"?`,
      description: "The lesson and its video link are removed from this course when you save.",
      confirmText: "Delete lesson",
      destructive: true,
    }))) return;
    onDelete();
  };

  const linkError = linkTouched && !linkValid ? "This is not a Vimeo or YouTube link. Paste the video link, e.g. https://vimeo.com/123456789/abc123 or https://youtu.be/abcdefghijk" : null;

  return (
    <li className="rounded-lg border border-border/70 bg-background/60 p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="hidden shrink-0 sm:block">
          {lookup.state === "ok" && lookup.thumbnailUrl ? (
            <img src={lookup.thumbnailUrl} alt="" className="h-14 w-24 rounded-md object-cover" />
          ) : (
            <span aria-hidden="true" className="flex h-14 w-24 items-center justify-center rounded-md bg-ivory font-display text-lg font-semibold text-primary/70">{number}</span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_7.5rem]">
            <div>
              <label htmlFor={`${id}-title`} className={labelClass}>
                <span className="sm:hidden">{number}. </span>Lesson title
              </label>
              <input
                id={`${id}-title`}
                autoFocus={autoFocus}
                value={lesson.title}
                onChange={(event) => onChange((current) => ({ ...current, title: event.target.value }))}
                placeholder="e.g. Namaskaram and posture"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor={`${id}-link`} className={labelClass}>Video link (Vimeo or YouTube)</label>
              <div className="relative">
                <input
                  id={`${id}-link`}
                  value={lesson.vimeoUrl}
                  onChange={(event) => onChange((current) => ({ ...current, vimeoUrl: event.target.value }))}
                  onBlur={() => setLinkTouched(true)}
                  onPaste={() => setLinkTouched(true)}
                  inputMode="url"
                  placeholder="https://vimeo.com/… or https://youtu.be/…"
                  aria-invalid={Boolean(linkError)}
                  aria-describedby={`${id}-link-status`}
                  className={cn(inputClass, "pr-9")}
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" aria-hidden="true">
                  {lookup.state === "loading" ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    : link && linkValid ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
                </span>
              </div>
              <div id={`${id}-link-status`} aria-live="polite">
                {linkError && <p className={errorClass}>{linkError}</p>}
                {!linkError && lookup.state === "loading" && <p className={hintClass}>Reading details from {host}…</p>}
                {!linkError && lookup.state === "failed" && (
                  <p className={cn(hintClass, "text-amber-800")}>{host === "YouTube" ? "YouTube doesn't share the video length; please type the duration." : "Couldn't read details from Vimeo; please type the duration."}</p>
                )}
                {!linkError && lookup.state === "ok" && <p className={cn(hintClass, "text-emerald-800")}>Details filled in from {host}.</p>}
              </div>
            </div>
            <div>
              <label htmlFor={`${id}-duration`} className={labelClass}>Duration</label>
              <input
                id={`${id}-duration`}
                value={lesson.durationText}
                onChange={(event) => onChange((current) => ({ ...current, durationText: event.target.value }))}
                placeholder="mm:ss"
                inputMode="numeric"
                aria-invalid={!durationValid}
                aria-describedby={!durationValid ? `${id}-duration-error` : undefined}
                className={cn(inputClass, "tabular-nums")}
              />
              {!durationValid && <p id={`${id}-duration-error`} className={errorClass}>Use mm:ss, e.g. 12:30</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-2">
              <Switch
                id={`${id}-preview`}
                checked={lesson.isPreview}
                onCheckedChange={(checked) => onChange((current) => ({ ...current, isPreview: checked }))}
              />
              <label htmlFor={`${id}-preview`} className="flex items-center gap-1.5 font-body text-sm text-foreground">
                <Eye className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> Free preview
              </label>
            </div>
            <button
              type="button"
              onClick={() => setShowPlayer((open) => !open)}
              disabled={!embedUrl}
              aria-expanded={showPlayer}
              className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 font-body text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:pointer-events-none disabled:text-muted-foreground disabled:opacity-60"
            >
              <PlayCircle className="h-4 w-4" aria-hidden="true" /> {showPlayer ? "Hide video" : "Watch video"}
            </button>
            <button
              type="button"
              onClick={() => setShowMore((open) => !open)}
              aria-expanded={showMore}
              aria-controls={`${id}-more`}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-body text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", showMore && "rotate-180")} aria-hidden="true" />
              Resource & notes{lesson.resourceUrl || lesson.notes ? " (added)" : ""}
            </button>
          </div>
          {lesson.isPreview && (
            <p className={cn(hintClass, "flex items-start gap-1.5 -mt-1")}>
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Anyone can watch this lesson for free on the course page, without buying.
            </p>
          )}

          {showMore && (
            <div id={`${id}-more`} className="grid gap-3 md:grid-cols-2">
              <div>
                <label htmlFor={`${id}-resource`} className={labelClass}>Resource link (optional)</label>
                <input
                  id={`${id}-resource`}
                  value={lesson.resourceUrl}
                  onChange={(event) => onChange((current) => ({ ...current, resourceUrl: event.target.value }))}
                  inputMode="url"
                  placeholder="https://… (PDF, Drive file)"
                  className={inputClass}
                />
                <p className={hintClass}>Only students who bought the course can see this.</p>
              </div>
              <div>
                <label htmlFor={`${id}-notes`} className={labelClass}>Notes for students (optional)</label>
                <textarea
                  id={`${id}-notes`}
                  value={lesson.notes}
                  onChange={(event) => onChange((current) => ({ ...current, notes: event.target.value }))}
                  rows={3}
                  className={cn(inputClass, "resize-y")}
                />
              </div>
            </div>
          )}

          {showPlayer && embedUrl && <VimeoFrame src={embedUrl} title={`Preview of ${lesson.title || `lesson ${number}`}`} />}
        </div>

        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <button type="button" className={iconButton} onClick={() => onMove(-1)} disabled={isFirst} aria-label={`Move lesson ${number} up`}>
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" className={iconButton} onClick={() => onMove(1)} disabled={isLast} aria-label={`Move lesson ${number} down`}>
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" className={cn(iconButton, "hover:bg-destructive/10 hover:text-destructive")} onClick={() => void confirmDelete()} aria-label={`Delete lesson ${number}`}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  );
};

export default LessonRow;
