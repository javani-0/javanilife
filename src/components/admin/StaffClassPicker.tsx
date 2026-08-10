import { Info } from "lucide-react";
import type { ClassDoc } from "@/lib/classes";

// ---------------------------------------------------------------------------
// The class selector shared by the Attendance and Academics pages. A TEACHER
// only ever sees the classes assigned to them (req 1), so it also owns the
// "no class assigned yet" message — otherwise a new teacher would just see an
// empty dropdown with no explanation.
// ---------------------------------------------------------------------------

interface StaffClassPickerProps {
  classes: ClassDoc[];
  value: string;
  onChange: (classId: string) => void;
  awaitingAssignment?: boolean;
  label?: string;
}

const inputClass = "w-full px-3 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 bg-background";

const StaffClassPicker = ({
  classes,
  value,
  onChange,
  awaitingAssignment = false,
  label = "Class",
}: StaffClassPickerProps) => {
  if (awaitingAssignment) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="font-body text-sm font-semibold text-amber-900">No classes assigned yet</p>
          <p className="mt-0.5 font-body text-xs text-amber-800">
            Ask the admin to assign your classes in Managers → Teachers. Once a class is assigned it
            appears here and you can mark attendance and set work for it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
      <label className="mb-1 block font-body text-[0.8rem] text-muted-foreground">{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
        <option value="">Select a class…</option>
        {classes.map((cls) => (
          <option key={cls.id} value={cls.id}>{cls.name}{cls.active ? "" : " (inactive)"}</option>
        ))}
      </select>
    </div>
  );
};

export default StaffClassPicker;
