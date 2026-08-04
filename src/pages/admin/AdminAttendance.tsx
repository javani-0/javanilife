import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck, Check, Loader2, Save, Users, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminLog } from "@/hooks/useAdminLog";
import {
  listEnrollmentsForClass,
  subscribeToClasses,
  type ClassDoc,
  type EnrollmentDoc,
} from "@/lib/classes";
import {
  ATTENDANCE_STATUS_LABELS,
  listAttendanceForDate,
  saveAttendanceForDate,
  summarizeAttendance,
  type AttendanceMark,
  type AttendanceStatus,
} from "@/lib/portal/attendance";

// ---------------------------------------------------------------------------
// Attendance Manager (req P2): pick a class + date, mark the roster, save all
// in one batch. Re-opening a marked date loads what's there and edits it.
// ---------------------------------------------------------------------------

const inputClass = "w-full px-3 py-2 rounded-md border border-border font-body text-[0.875rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 bg-background";

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: "border-green-500 bg-green-50 text-green-700",
  absent: "border-red-400 bg-red-50 text-red-700",
  late: "border-amber-400 bg-amber-50 text-amber-700",
  excused: "border-border bg-muted text-muted-foreground",
};

const todayIso = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const AdminAttendance = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const logAction = useAdminLog();

  const [classes, setClasses] = useState<ClassDoc[]>([]);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [roster, setRoster] = useState<EnrollmentDoc[]>([]);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [alreadyMarked, setAlreadyMarked] = useState(false);

  useEffect(() => subscribeToClasses(setClasses, () => undefined), []);

  const selectedClass = useMemo(() => classes.find((cls) => cls.id === classId), [classes, classId]);

  const load = useCallback(async () => {
    if (!classId || !date) { setRoster([]); setMarks({}); return; }
    setLoading(true);
    try {
      const [enrollments, existing] = await Promise.all([
        listEnrollmentsForClass(classId).catch(() => [] as EnrollmentDoc[]),
        listAttendanceForDate(classId, date).catch(() => []),
      ]);
      const active = enrollments.filter((item) => item.status === "active" || item.status === "pending");
      setRoster(active);

      // Prefill from what's saved; default everyone else to present so the
      // common case (a full class) is one click.
      const byEnrollment: Record<string, AttendanceStatus> = {};
      for (const record of existing) byEnrollment[record.enrollmentId] = record.status;
      setAlreadyMarked(existing.length > 0);
      setMarks(Object.fromEntries(active.map((item) => [item.id, byEnrollment[item.id] || "present"])));
    } finally {
      setLoading(false);
    }
  }, [classId, date]);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(
    () => summarizeAttendance(roster.map((item) => ({
      id: item.id, enrollmentId: item.id, classId, className: "", studentUid: "",
      studentName: "", studentId: "", date, status: marks[item.id] || "present", markedBy: "",
    }))),
    [roster, marks, classId, date],
  );

  const setAll = (status: AttendanceStatus) =>
    setMarks(Object.fromEntries(roster.map((item) => [item.id, status])));

  const save = async () => {
    if (!user || roster.length === 0) return;
    setSaving(true);
    try {
      const payload: AttendanceMark[] = roster.map((item) => ({
        enrollmentId: item.id,
        classId: item.classId,
        className: item.className,
        studentUid: item.parentUserId,
        studentName: item.student.name,
        studentId: item.studentRollNo || "",
        status: marks[item.id] || "present",
      }));
      await saveAttendanceForDate(date, selectedClass?.schedule || "", payload, user.uid);
      toast({ title: "Attendance saved", description: `${payload.length} student${payload.length === 1 ? "" : "s"} · ${date}` });
      logAction("Marked attendance", `${selectedClass?.name || classId} · ${date} · ${summary.present + summary.late}/${roster.length} present`);
      setAlreadyMarked(true);
    } catch (error) {
      toast({ title: "Could not save attendance", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">Academics</p>
        <h1 className="mt-2 flex items-center gap-2 font-display text-3xl text-foreground">
          <CalendarCheck className="h-7 w-7 text-gold" /> Attendance
        </h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">Pick a class and date, mark the roster, and save. Re-open a date to edit it.</p>
      </div>

      <div className="grid gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-card sm:grid-cols-[1fr_200px]">
        <div className="min-w-0">
          <label className="mb-1 block font-body text-[0.8rem] text-muted-foreground">Class</label>
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className={inputClass}>
            <option value="">Select a class…</option>
            {classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}{cls.active ? "" : " (inactive)"}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <label className="mb-1 block font-body text-[0.8rem] text-muted-foreground">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </div>
      </div>

      {!classId ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Users className="mx-auto mb-2 h-9 w-9 text-gold/60" />
          <p className="font-body text-sm text-muted-foreground">Choose a class to load its roster.</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center rounded-xl border border-border/60 bg-card p-10">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      ) : roster.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="font-body text-sm text-muted-foreground">No active students in this class yet.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-card">
            <div className="font-body text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{summary.present + summary.late}</span> of {roster.length} present
              {alreadyMarked && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[0.68rem] font-semibold text-green-700">Already marked — editing</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setAll("present")} className="rounded-md border border-green-500 px-3 py-1.5 font-body text-xs font-semibold text-green-700 hover:bg-green-50">All present</button>
              <button onClick={() => setAll("absent")} className="rounded-md border border-red-400 px-3 py-1.5 font-body text-xs font-semibold text-red-700 hover:bg-red-50">All absent</button>
            </div>
          </div>

          <div className="space-y-2">
            {roster.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-card">
                <div className="min-w-0">
                  <p className="truncate font-body text-sm font-semibold text-foreground">{item.student.name}</p>
                  <p className="truncate font-body text-xs text-muted-foreground">{item.slotLabel || item.className}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(ATTENDANCE_STATUS_LABELS) as AttendanceStatus[]).map((status) => (
                    <button
                      key={status}
                      onClick={() => setMarks((current) => ({ ...current, [item.id]: status }))}
                      className={`rounded-md border px-2.5 py-1.5 font-body text-xs font-semibold transition-colors ${marks[item.id] === status ? STATUS_STYLES[status] : "border-border text-muted-foreground hover:border-gold/40"}`}
                    >
                      {marks[item.id] === status && status === "present" ? <Check className="mr-1 inline h-3 w-3" /> : null}
                      {marks[item.id] === status && status === "absent" ? <X className="mr-1 inline h-3 w-3" /> : null}
                      {ATTENDANCE_STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-gradient-primary px-5 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save attendance for {date}
          </button>
        </>
      )}
    </div>
  );
};

export default AdminAttendance;
