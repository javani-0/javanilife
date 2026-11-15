// Sections → lessons builder. Sections: add, rename, delete, move up/down.
// Lessons: add, delete, move up/down inside their section.
import { useState } from "react";
import { ArrowDown, ArrowUp, FolderPlus, Plus, Trash2 } from "lucide-react";
import { confirmDialog } from "@/components/ConfirmDialogHost";
import { formatTotalDuration } from "@/lib/elearning";
import {
  emptyLessonDraft,
  emptySectionDraft,
  moveItem,
  parseDurationInput,
  type LessonDraft,
  type SectionDraft,
} from "@/lib/elearning/adminHelpers";
import LessonRow from "./LessonRow";
import { iconButton, inputClass, secondaryButton } from "./ui";
import { cn } from "@/lib/utils";

const sectionSeconds = (section: SectionDraft) =>
  section.lessons.reduce((sum, lesson) => sum + (parseDurationInput(lesson.durationText) || 0), 0);

const CurriculumBuilder = ({
  sections,
  onChange,
}: {
  sections: SectionDraft[];
  onChange: (update: (sections: SectionDraft[]) => SectionDraft[]) => void;
}) => {
  // The lesson/section just added gets focus, so typing can start at once.
  const [focusId, setFocusId] = useState<string | null>(null);

  const updateSection = (sectionId: string, update: (section: SectionDraft) => SectionDraft) =>
    onChange((current) => current.map((section) => (section.id === sectionId ? update(section) : section)));

  const updateLesson = (sectionId: string, lessonId: string, update: (lesson: LessonDraft) => LessonDraft) =>
    updateSection(sectionId, (section) => ({
      ...section,
      lessons: section.lessons.map((lesson) => (lesson.id === lessonId ? update(lesson) : lesson)),
    }));

  const addSection = () => {
    const section = { ...emptySectionDraft(), lessons: [] };
    setFocusId(section.id);
    onChange((current) => [...current, section]);
  };

  const addLesson = (sectionId: string) => {
    const lesson = emptyLessonDraft();
    setFocusId(lesson.id);
    updateSection(sectionId, (section) => ({ ...section, lessons: [...section.lessons, lesson] }));
  };

  const deleteSection = async (section: SectionDraft, index: number) => {
    if (section.lessons.length > 0 && !(await confirmDialog({
      title: `Delete "${section.title.trim() || `Section ${index + 1}`}"?`,
      description: `Its ${section.lessons.length} lesson${section.lessons.length === 1 ? "" : "s"} and their video links are removed when you save.`,
      confirmText: "Delete section",
      destructive: true,
    }))) return;
    onChange((current) => current.filter((item) => item.id !== section.id));
  };

  let lessonNumber = 0;

  return (
    <div className="space-y-4">
      {sections.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-ivory/50 px-4 py-8 text-center">
          <p className="font-body text-sm text-muted-foreground">No sections yet. A section groups lessons, e.g. "Week 1: Basics".</p>
        </div>
      )}

      <ol className="space-y-4">
        {sections.map((section, sectionIndex) => {
          const seconds = sectionSeconds(section);
          const titleId = `section-title-${section.id}`;
          return (
            <li key={section.id} className="rounded-xl border border-border bg-ivory/40 p-3 sm:p-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1 basis-56">
                  <label htmlFor={titleId} className="mb-1 block font-body text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-primary">
                    Section {sectionIndex + 1}
                  </label>
                  <input
                    id={titleId}
                    autoFocus={focusId === section.id}
                    value={section.title}
                    onChange={(event) => updateSection(section.id, (current) => ({ ...current, title: event.target.value }))}
                    placeholder="e.g. Getting started"
                    className={cn(inputClass, "bg-card font-display text-lg font-semibold")}
                  />
                </div>
                <p className="pb-2.5 font-body text-xs tabular-nums text-muted-foreground">
                  {section.lessons.length} lesson{section.lessons.length === 1 ? "" : "s"}
                  {seconds > 0 ? ` · ${formatTotalDuration(seconds)}` : ""}
                </p>
                <div className="flex items-center pb-0.5">
                  <button type="button" className={iconButton} onClick={() => onChange((current) => moveItem(current, sectionIndex, -1))} disabled={sectionIndex === 0} aria-label={`Move section ${sectionIndex + 1} up`}>
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button type="button" className={iconButton} onClick={() => onChange((current) => moveItem(current, sectionIndex, 1))} disabled={sectionIndex === sections.length - 1} aria-label={`Move section ${sectionIndex + 1} down`}>
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button type="button" className={cn(iconButton, "hover:bg-destructive/10 hover:text-destructive")} onClick={() => void deleteSection(section, sectionIndex)} aria-label={`Delete section ${sectionIndex + 1}`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {section.lessons.length > 0 && (
                <ol className="mt-3 space-y-2.5" aria-label={`Lessons in ${section.title || `section ${sectionIndex + 1}`}`}>
                  {section.lessons.map((lesson, lessonIndex) => {
                    lessonNumber += 1;
                    return (
                      <LessonRow
                        key={lesson.id}
                        lesson={lesson}
                        number={lessonNumber}
                        isFirst={lessonIndex === 0}
                        isLast={lessonIndex === section.lessons.length - 1}
                        autoFocus={focusId === lesson.id}
                        onChange={(update) => updateLesson(section.id, lesson.id, update)}
                        onMove={(delta) => updateSection(section.id, (current) => ({ ...current, lessons: moveItem(current.lessons, lessonIndex, delta) }))}
                        onDelete={() => updateSection(section.id, (current) => ({ ...current, lessons: current.lessons.filter((item) => item.id !== lesson.id) }))}
                      />
                    );
                  })}
                </ol>
              )}

              <button type="button" onClick={() => addLesson(section.id)} className={cn(secondaryButton, "mt-3 w-full border-dashed bg-card/70 py-2 sm:w-auto")}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add lesson
              </button>
            </li>
          );
        })}
      </ol>

      <button type="button" onClick={addSection} className={cn(secondaryButton, "w-full border-dashed py-3")}>
        <FolderPlus className="h-4 w-4" aria-hidden="true" /> Add section
      </button>
    </div>
  );
};

export default CurriculumBuilder;
