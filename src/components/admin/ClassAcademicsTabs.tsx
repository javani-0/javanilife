import { useState } from "react";
import { Award, CalendarCheck, ClipboardList, Ticket, TrendingUp } from "lucide-react";
import AdminAssignmentsPanel from "@/components/admin/AdminAssignmentsPanel";
import AdminAttendancePanel from "@/components/admin/AdminAttendancePanel";
import AdminCertificatesPanel from "@/components/admin/AdminCertificatesPanel";
import AdminExamsPanel from "@/components/admin/AdminExamsPanel";
import AdminProgressPanel from "@/components/admin/AdminProgressPanel";
import type { ClassDoc } from "@/lib/classes";

// ---------------------------------------------------------------------------
// Everything academic for ONE class, behind tabs (req 2, 3, 4).
//
// Mounted in two places with identical behaviour:
//   - Classes Manager, on the class you already opened
//   - the standalone Academics page, after its class picker
// ---------------------------------------------------------------------------

export type AcademicsTab = "attendance" | "assignments" | "exams" | "certificates" | "progress";

const TABS = [
  ["attendance", "Attendance", CalendarCheck],
  ["assignments", "Assignments", ClipboardList],
  ["exams", "Exams", Ticket],
  ["certificates", "Certificates", Award],
  ["progress", "Progress", TrendingUp],
] as const;

interface ClassAcademicsTabsProps {
  selectedClass: ClassDoc | undefined;
  /** Tabs to hide. Nothing hides attendance any more — Academics owns it. */
  exclude?: AcademicsTab[];
  initialTab?: AcademicsTab;
}

const ClassAcademicsTabs = ({ selectedClass, exclude = [], initialTab }: ClassAcademicsTabsProps) => {
  const visible = TABS.filter(([key]) => !exclude.includes(key));
  const [tab, setTab] = useState<AcademicsTab>(initialTab || visible[0][0]);

  if (!selectedClass) {
    return (
      <p className="rounded-xl border border-dashed border-border p-10 text-center font-body text-sm text-muted-foreground">
        Choose a class to manage its attendance, assignments, exams and certificates.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex flex-wrap rounded-lg border border-border bg-card p-1 shadow-card">
        {visible.map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-md px-4 py-2 font-body text-[0.82rem] font-semibold transition-colors ${tab === key ? "bg-gradient-primary text-primary-foreground" : "text-muted-foreground hover:text-gold"}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "attendance" && <AdminAttendancePanel selectedClass={selectedClass} />}
      {tab === "assignments" && <AdminAssignmentsPanel selectedClass={selectedClass} />}
      {tab === "exams" && <AdminExamsPanel selectedClass={selectedClass} />}
      {tab === "certificates" && <AdminCertificatesPanel selectedClass={selectedClass} />}
      {tab === "progress" && <AdminProgressPanel selectedClass={selectedClass} />}
    </div>
  );
};

export default ClassAcademicsTabs;
