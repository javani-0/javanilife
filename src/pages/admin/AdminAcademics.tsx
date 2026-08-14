import { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import ClassAcademicsTabs from "@/components/admin/ClassAcademicsTabs";
import StaffClassPicker from "@/components/admin/StaffClassPicker";
import { useStaffClasses } from "@/hooks/useStaffClasses";

// ---------------------------------------------------------------------------
// Academics manager (req 2, 3, 4): assignments, exams, certificates and
// progress, per class.
//
// Thin by design — the panels live in ClassAcademicsTabs, which Classes
// Manager also mounts on the class you already have open, so a teacher never
// has to pick the same class twice.
// ---------------------------------------------------------------------------

const AdminAcademics = () => {
  const { classes, isTeacher, awaitingAssignment } = useStaffClasses();
  const [classId, setClassId] = useState("");

  const selectedClass = useMemo(() => classes.find((cls) => cls.id === classId), [classes, classId]);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">Academics</p>
        <h1 className="mt-2 flex items-center gap-2 font-display text-3xl text-foreground">
          <ClipboardList className="h-7 w-7 text-gold" /> Academics
        </h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          Attendance, assignments, examinations and certificates — per class.
          {isTeacher && " You see the classes assigned to you."}
        </p>
      </div>

      <StaffClassPicker
        classes={classes}
        value={classId}
        onChange={setClassId}
        awaitingAssignment={awaitingAssignment}
      />

      {/* Opens on Attendance: the standalone Attendance page was removed from
          the nav (req), so this tab is now the way in to marking a roster. */}
      {!awaitingAssignment && (
        <ClassAcademicsTabs selectedClass={selectedClass} initialTab="attendance" />
      )}
    </div>
  );
};

export default AdminAcademics;
