import { useMemo, useState } from "react";
import { CalendarCheck } from "lucide-react";
import AdminAttendancePanel from "@/components/admin/AdminAttendancePanel";
import StaffClassPicker from "@/components/admin/StaffClassPicker";
import { useStaffClasses } from "@/hooks/useStaffClasses";

// ---------------------------------------------------------------------------
// Attendance Manager (req P2). Pick a class, mark the roster, save.
//
// Thin by design: the roster itself is AdminAttendancePanel, which is also
// mounted inside Classes Manager with the class already fixed, so both entry
// points behave identically (req 1).
// ---------------------------------------------------------------------------

const AdminAttendance = () => {
  const { classes, isTeacher, awaitingAssignment } = useStaffClasses();
  const [classId, setClassId] = useState("");

  const selectedClass = useMemo(() => classes.find((cls) => cls.id === classId), [classes, classId]);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">Academics</p>
        <h1 className="mt-2 flex items-center gap-2 font-display text-3xl text-foreground">
          <CalendarCheck className="h-7 w-7 text-gold" /> Attendance
        </h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          Pick a class and date, mark the roster, and save. Re-open a date to edit it.
          {isTeacher && " You see the classes assigned to you."}
        </p>
      </div>

      <StaffClassPicker
        classes={classes}
        value={classId}
        onChange={setClassId}
        awaitingAssignment={awaitingAssignment}
      />

      {!awaitingAssignment && <AdminAttendancePanel selectedClass={selectedClass} />}
    </div>
  );
};

export default AdminAttendance;
