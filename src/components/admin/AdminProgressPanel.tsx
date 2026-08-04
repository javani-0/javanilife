import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Save, TrendingUp, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminLog } from "@/hooks/useAdminLog";
import { listEnrollmentsForClass, type ClassDoc, type EnrollmentDoc } from "@/lib/classes";
import {
  listProgressForEnrollment,
  saveProgressReport,
  summarizeAttendance,
  listAttendanceForEnrollment,
  type ProgressReport,
  type SkillRating,
} from "@/lib/portal/attendance";

// ---------------------------------------------------------------------------
// Progress reports (req P2). The student portal has always displayed these —
// this is the screen that actually writes them.
//
// The live attendance % for the chosen student is shown alongside, so the
// person writing the remarks has the real number in front of them.
// ---------------------------------------------------------------------------

const inputClass = "w-full px-3 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 bg-background";
const labelClass = "font-body text-[0.8rem] text-muted-foreground block mb-1";

const defaultPeriod = () =>
  new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });

const AdminProgressPanel = ({ selectedClass }: { selectedClass: ClassDoc | undefined }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const logAction = useAdminLog();

  const [roster, setRoster] = useState<EnrollmentDoc[]>([]);
  const [enrollmentId, setEnrollmentId] = useState("");
  const [periodLabel, setPeriodLabel] = useState(defaultPeriod());
  const [grade, setGrade] = useState("");
  const [remarks, setRemarks] = useState("");
  const [skills, setSkills] = useState<SkillRating[]>([{ name: "", rating: 3 }]);
  const [existing, setExisting] = useState<ProgressReport[]>([]);
  const [attendancePercent, setAttendancePercent] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const classId = selectedClass?.id || "";

  useEffect(() => {
    if (!classId) { setRoster([]); return; }
    setLoading(true);
    listEnrollmentsForClass(classId)
      .then((rows) => setRoster(rows.filter((row) => row.status !== "cancelled")))
      .catch(() => setRoster([]))
      .finally(() => setLoading(false));
  }, [classId]);

  // When a student is picked, show their existing reports + real attendance.
  const loadStudent = useCallback(async () => {
    if (!enrollmentId) { setExisting([]); setAttendancePercent(null); return; }
    const [reports, attendance] = await Promise.all([
      listProgressForEnrollment(enrollmentId).catch(() => []),
      listAttendanceForEnrollment(enrollmentId).catch(() => []),
    ]);
    setExisting(reports);
    setAttendancePercent(attendance.length > 0 ? summarizeAttendance(attendance).percent : null);
  }, [enrollmentId]);

  useEffect(() => { loadStudent(); }, [loadStudent]);

  const save = async () => {
    const enrollment = roster.find((item) => item.id === enrollmentId);
    if (!user || !selectedClass || !enrollment) { toast({ title: "Pick a student", variant: "destructive" }); return; }
    if (!periodLabel.trim()) { toast({ title: "Give the report a period", description: "e.g. July 2026 or Term 1", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await saveProgressReport({
        enrollmentId: enrollment.id,
        classId: selectedClass.id,
        className: selectedClass.name,
        studentUid: enrollment.parentUserId,
        periodLabel: periodLabel.trim(),
        grade: grade.trim() || undefined,
        skills: skills.filter((skill) => skill.name.trim()).map((skill) => ({ name: skill.name.trim(), rating: skill.rating })),
        remarks: remarks.trim(),
        createdBy: user.uid,
      });
      toast({ title: "Progress report published", description: `${enrollment.student.name} · ${periodLabel}` });
      logAction("Published progress report", `${enrollment.student.name} · ${selectedClass.name} · ${periodLabel}`);
      setGrade(""); setRemarks(""); setSkills([{ name: "", rating: 3 }]);
      await loadStudent();
    } catch (error) {
      toast({ title: "Could not publish", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!selectedClass) {
    return <p className="rounded-xl border border-dashed border-border p-10 text-center font-body text-sm text-muted-foreground">Choose a class to write progress reports.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gold/25 bg-gold/5 p-4">
        <p className="flex items-center gap-1.5 font-body text-sm font-semibold text-foreground">
          <TrendingUp className="h-4 w-4 text-gold" /> New progress report
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label className={labelClass}>Student *</label>
            <select value={enrollmentId} onChange={(e) => setEnrollmentId(e.target.value)} className={inputClass} disabled={loading}>
              <option value="">{loading ? "Loading…" : "Select a student…"}</option>
              {roster.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.student.name}{item.studentRollNo ? ` (${item.studentRollNo})` : ""}
                </option>
              ))}
            </select>
            {attendancePercent !== null && (
              <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">
                Their attendance so far: <span className="font-semibold text-foreground">{attendancePercent}%</span>
              </p>
            )}
          </div>
          <div className="min-w-0">
            <label className={labelClass}>Period *</label>
            <input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} className={inputClass} placeholder="e.g. July 2026 / Term 1" />
          </div>
          <div className="min-w-0">
            <label className={labelClass}>Grade (optional)</label>
            <input value={grade} onChange={(e) => setGrade(e.target.value)} className={inputClass} placeholder="e.g. A" />
          </div>
        </div>

        {/* Skill ratings */}
        <div className="mt-3">
          <label className={labelClass}>Skill ratings (optional)</label>
          <div className="space-y-2">
            {skills.map((skill, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <input
                  value={skill.name}
                  onChange={(e) => setSkills((current) => current.map((item, i) => (i === index ? { ...item, name: e.target.value } : item)))}
                  className={`${inputClass} max-w-xs`}
                  placeholder="e.g. Rhythm"
                />
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((step) => (
                    <button
                      key={step}
                      type="button"
                      onClick={() => setSkills((current) => current.map((item, i) => (i === index ? { ...item, rating: step } : item)))}
                      className={`h-7 w-7 rounded font-body text-xs font-semibold ${step <= skill.rating ? "bg-gold text-white" : "bg-muted text-muted-foreground"}`}
                    >
                      {step}
                    </button>
                  ))}
                </div>
                {skills.length > 1 && (
                  <button type="button" onClick={() => setSkills((current) => current.filter((_, i) => i !== index))} className="rounded p-1 text-destructive hover:bg-destructive/10">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setSkills((current) => [...current, { name: "", rating: 3 }])} className="mt-1.5 flex items-center gap-1 font-body text-[0.75rem] font-semibold text-gold hover:underline">
            <Plus className="h-3.5 w-3.5" /> Add a skill
          </button>
        </div>

        <div className="mt-3">
          <label className={labelClass}>Remarks</label>
          <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} className={inputClass} placeholder="What the parent should know about their child's progress." />
        </div>

        <button onClick={save} disabled={saving} className="mt-3 flex min-h-10 items-center gap-2 rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Publish to the student's portal
        </button>
      </div>

      {existing.length > 0 && (
        <div className="space-y-2">
          <p className="font-body text-sm font-semibold text-foreground">Already published for this student</p>
          {existing.map((report) => (
            <div key={report.id} className="rounded-xl border border-border/60 bg-card px-4 py-3 shadow-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-body text-sm font-semibold text-foreground">{report.periodLabel}</p>
                {report.grade && <span className="rounded-full bg-gold/15 px-2 py-0.5 font-body text-[0.68rem] font-bold text-gold">Grade {report.grade}</span>}
              </div>
              {report.skills.length > 0 && (
                <p className="mt-0.5 font-body text-xs text-muted-foreground">
                  {report.skills.map((skill) => `${skill.name} ${skill.rating}/5`).join(" · ")}
                </p>
              )}
              {report.remarks && <p className="mt-1 font-body text-xs text-foreground">{report.remarks}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminProgressPanel;
