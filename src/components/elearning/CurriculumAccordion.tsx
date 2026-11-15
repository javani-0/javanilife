import { CheckCircle2, Lock, PlayCircle } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { formatDuration, formatTotalDuration, type ElearnLesson, type ElearnSection } from "@/lib/elearning";
import { lessonsLabel } from "./format";

interface CurriculumAccordionProps {
  sections: ElearnSection[];
  /** The student owns the course: no lock icons, rows show ticks instead. */
  unlocked?: boolean;
  completedIds?: Set<string>;
  onPreview?: (lesson: ElearnLesson) => void;
}

const CurriculumAccordion = ({ sections, unlocked = false, completedIds, onPreview }: CurriculumAccordionProps) => {
  const visible = sections.filter((section) => section.lessons.length > 0);
  if (visible.length === 0) return <p className="font-body text-sm text-muted-foreground">The lesson list will appear here soon.</p>;

  return (
    <Accordion type="multiple" defaultValue={[visible[0].id]} className="overflow-hidden rounded-xl border border-gold/20 bg-card">
      {visible.map((section, sectionIndex) => {
        const total = section.lessons.reduce((sum, lesson) => sum + lesson.durationSec, 0);
        return (
          <AccordionItem key={section.id} value={section.id} className="border-gold/15 last:border-b-0">
            <AccordionTrigger className="gap-3 bg-ivory/50 px-4 py-4 text-left hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-5">
              <span className="min-w-0 flex-1">
                <span className="block font-body text-[0.95rem] font-semibold text-foreground">
                  <span className="text-muted-foreground">{sectionIndex + 1}. </span>{section.title || `Section ${sectionIndex + 1}`}
                </span>
                <span className="mt-0.5 block font-body text-xs font-normal text-muted-foreground">
                  {lessonsLabel(section.lessons.length)} · {formatTotalDuration(total)}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-0">
              <ul className="divide-y divide-gold/10">
                {section.lessons.map((lesson) => {
                  const canPreview = !unlocked && lesson.isPreview && !!lesson.previewVimeoUrl && !!onPreview;
                  const done = completedIds?.has(lesson.id);
                  return (
                    <li key={lesson.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                      {unlocked ? (
                        done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" aria-label="Completed" /> : <PlayCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      ) : canPreview ? (
                        <PlayCircle className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      ) : (
                        <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Locked" />
                      )}
                      <span className="min-w-0 flex-1 font-body text-sm text-foreground">{lesson.title || "Untitled lesson"}</span>
                      {canPreview && (
                        <button
                          type="button"
                          onClick={() => onPreview!(lesson)}
                          className="shrink-0 rounded-full border border-primary/40 px-2.5 py-1 font-body text-[0.72rem] font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.97]"
                        >
                          Preview<span className="sr-only">: {lesson.title}</span>
                        </button>
                      )}
                      {lesson.durationSec > 0 && <span className="shrink-0 font-body text-xs tabular-nums text-muted-foreground">{formatDuration(lesson.durationSec)}</span>}
                    </li>
                  );
                })}
              </ul>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
};

export default CurriculumAccordion;
