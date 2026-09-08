import { useMemo, useState } from "react";
import DataExportDialog from "@/components/admin/DataExportDialog";
import type { ClassDoc } from "@/lib/classes";
import {
  DEFAULT_STUDENT_EXPORT_FILTERS,
  buildEnrollmentRows,
  buildStudentRows,
  enrollmentColumns,
  studentColumns,
  type StudentEnrollmentRow,
  type StudentExportFilters,
  type StudentExportShape,
} from "@/lib/students/studentExport";
import type { StudentDoc } from "@/lib/students";

// ---------------------------------------------------------------------------
// "Download the students of this class / course" (req 1).
//
// The class picker is the point of the whole thing, so it comes first, with the
// live student count next to every class — the admin can see before downloading
// that "Diploma 1st Sem" really does hold 11 students.
// ---------------------------------------------------------------------------

interface StudentExportDialogProps {
  open: boolean;
  onClose: () => void;
  students: StudentDoc[];
  classes: ClassDoc[];
}

const StudentExportDialog = ({ open, onClose, students, classes }: StudentExportDialogProps) => {
  const [shape, setShape] = useState<StudentExportShape>("enrollment");
  const [filters, setFilters] = useState<StudentExportFilters>(DEFAULT_STUDENT_EXPORT_FILTERS);

  // Every class that appears on a student, even one deleted from Classes
  // Manager — otherwise a class the admin still has students in would be
  // missing from the picker.
  const classOptions = useMemo(() => {
    const counts = new Map<string, { id: string; name: string; count: number }>();
    for (const student of students) {
      for (const course of student.courses || []) {
        if (!course.classId) continue;
        const existing = counts.get(course.classId);
        if (existing) existing.count += 1;
        else counts.set(course.classId, { id: course.classId, name: course.className || "(unnamed class)", count: 1 });
      }
    }
    for (const cls of classes) {
      if (!counts.has(cls.id)) counts.set(cls.id, { id: cls.id, name: cls.name, count: 0 });
    }
    return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [students, classes]);

  const enrollmentRows = useMemo(() => buildEnrollmentRows(students, filters), [students, filters]);
  const studentRows = useMemo(() => buildStudentRows(students, filters), [students, filters]);

  const selectedNames = classOptions
    .filter((option) => filters.classIds.includes(option.id))
    .map((option) => option.name);
  const scopeName = selectedNames.length === 1 ? selectedNames[0] : selectedNames.length > 1 ? `${selectedNames.length}-classes` : "all-classes";
  const filename = `javani-students-${scopeName}-${new Date().toISOString().slice(0, 10)}`
    .replace(/[^a-zA-Z0-9._-]/g, "-");

  const toggleClass = (id: string) => setFilters((current) => ({
    ...current,
    classIds: current.classIds.includes(id) ? current.classIds.filter((value) => value !== id) : [...current.classIds, id],
  }));

  const chip = (active: boolean) =>
    `rounded-md border px-3 py-1.5 font-body text-xs font-semibold transition-colors ${active ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`;

  const filterUi = (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setShape("enrollment")} className={chip(shape === "enrollment")}>
          One row per class
        </button>
        <button type="button" onClick={() => setShape("student")} className={chip(shape === "student")}>
          One row per student
        </button>
      </div>
      <p className="font-body text-[0.7rem] text-muted-foreground">
        {shape === "enrollment"
          ? "A student in three classes becomes three rows — each with that class's batch, trainer and fee."
          : "One line per student, with their classes listed together and their total fee."}
      </p>

      <div className="rounded-md border border-border/60 p-2">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="font-body text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">Class / course</span>
          <button type="button" onClick={() => setFilters((current) => ({ ...current, classIds: [] }))} className={chip(filters.classIds.length === 0)}>
            All classes
          </button>
        </div>
        <div className="max-h-44 space-y-1 overflow-y-auto">
          {classOptions.map((option) => (
            <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 font-body text-xs text-foreground hover:bg-muted">
              <input
                type="checkbox"
                checked={filters.classIds.includes(option.id)}
                onChange={() => toggleClass(option.id)}
                className="h-4 w-4 shrink-0"
              />
              <span className="min-w-0 flex-1 truncate">{option.name}</span>
              <span className="shrink-0 font-body text-[0.68rem] text-muted-foreground">{option.count}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setFilters((current) => ({ ...current, approvedOnly: !current.approvedOnly }))} className={chip(filters.approvedOnly)}>
          {filters.approvedOnly ? "Approved students only" : "All onboarding statuses"}
        </button>
        <button type="button" onClick={() => setFilters((current) => ({ ...current, includeInactive: !current.includeInactive }))} className={chip(!filters.includeInactive)}>
          {filters.includeInactive ? "Including inactive" : "Active students only"}
        </button>
        <button type="button" onClick={() => setFilters((current) => ({ ...current, includeDropped: !current.includeDropped }))} className={chip(filters.includeDropped)}>
          {filters.includeDropped ? "Including dropped classes" : "Dropped classes excluded"}
        </button>
      </div>
    </>
  );

  if (shape === "enrollment") {
    return (
      <DataExportDialog<StudentEnrollmentRow>
        open={open}
        onClose={onClose}
        title="Export students"
        description="Pick the class (or leave it on all), then the columns you want."
        rows={enrollmentRows}
        columns={enrollmentColumns()}
        sheetName="Students by class"
        defaultFilename={filename}
        filters={filterUi}
        summary={`across ${new Set(enrollmentRows.map((row) => row.student.id)).size} students`}
      />
    );
  }

  return (
    <DataExportDialog<StudentDoc>
      open={open}
      onClose={onClose}
      title="Export students"
      description="Pick the class (or leave it on all), then the columns you want."
      rows={studentRows}
      columns={studentColumns(filters)}
      sheetName="Students"
      defaultFilename={filename}
      filters={filterUi}
    />
  );
};

export default StudentExportDialog;
