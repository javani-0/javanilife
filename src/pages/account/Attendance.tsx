import { useEffect, useMemo, useState } from "react";
import { Award, CalendarCheck, Flame, Loader2, TrendingUp } from "lucide-react";
import AccountLayout from "@/components/account/AccountLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useStudentPortal } from "@/contexts/StudentPortalContext";
import {
  ATTENDANCE_STATUS_LABELS,
  groupAttendanceByMonth,
  listMyAttendance,
  listMyProgressReports,
  summarizeAttendance,
  type AttendanceRecord,
  type AttendanceStatus,
  type ProgressReport,
} from "@/lib/portal/attendance";

// ---------------------------------------------------------------------------
// Attendance & progress for the student (req P2): live stats computed from
// real records, plus the staff-written progress reports.
// ---------------------------------------------------------------------------

const DOT: Record<AttendanceStatus, string> = {
  present: "bg-green-500",
  late: "bg-amber-500",
  absent: "bg-red-500",
  excused: "bg-muted-foreground/40",
};

const monthLabel = (monthKey: string): string => {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return monthKey;
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};

const Attendance = () => {
  const { user } = useAuth();
  const { enrollments } = useStudentPortal();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [reports, setReports] = useState<ProgressReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [classFilter, setClassFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) { setLoading(false); return; }
      setLoading(true);
      try {
        const [attendance, progress] = await Promise.all([
          listMyAttendance(user.uid).catch(() => []),
          listMyProgressReports(user.uid).catch(() => []),
        ]);
        if (cancelled) return;
        setRecords(attendance);
        setReports(progress);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const visible = useMemo(
    () => (classFilter === "all" ? records : records.filter((r) => r.enrollmentId === classFilter)),
    [records, classFilter],
  );
  const summary = useMemo(() => summarizeAttendance(visible), [visible]);
  const byMonth = useMemo(() => groupAttendanceByMonth(visible), [visible]);
  const months = useMemo(() => Object.keys(byMonth).sort().reverse(), [byMonth]);

  const visibleReports = useMemo(
    () => (classFilter === "all" ? reports : reports.filter((r) => r.enrollmentId === classFilter)),
    [reports, classFilter],
  );

  if (loading) {
    return (
      <AccountLayout title="Attendance & Progress" description="Your attendance record and progress reports.">
        <div className="flex items-center justify-center rounded-2xl border border-border/60 bg-card p-10">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      </AccountLayout>
    );
  }

  return (
    <AccountLayout title="Attendance & Progress" description="Your attendance record and progress reports.">
      <div className="space-y-4">
        {enrollments.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setClassFilter("all")}
              className={`rounded-md border px-3 py-1.5 font-body text-xs font-semibold transition-colors ${classFilter === "all" ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`}
            >
              All classes
            </button>
            {enrollments.map((enrollment) => (
              <button
                key={enrollment.id}
                onClick={() => setClassFilter(enrollment.id)}
                className={`rounded-md border px-3 py-1.5 font-body text-xs font-semibold transition-colors ${classFilter === enrollment.id ? "border-gold bg-gold/10 text-gold" : "border-border text-muted-foreground hover:border-gold/40"}`}
              >
                {enrollment.className}
              </button>
            ))}
          </div>
        )}

        {/* Live stats */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
            <p className="flex items-center gap-1.5 font-body text-xs text-muted-foreground"><TrendingUp className="h-3.5 w-3.5 text-gold" /> Attendance</p>
            <p className={`mt-1 font-display text-2xl ${summary.percent >= 75 ? "text-green-700" : summary.percent >= 50 ? "text-amber-700" : "text-red-700"}`}>
              {summary.percent}%
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
            <p className="font-body text-xs text-muted-foreground">Classes attended</p>
            <p className="mt-1 font-display text-2xl text-foreground">{summary.present + summary.late}<span className="font-body text-sm text-muted-foreground"> / {summary.total}</span></p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
            <p className="flex items-center gap-1.5 font-body text-xs text-muted-foreground"><Flame className="h-3.5 w-3.5 text-gold" /> Current streak</p>
            <p className="mt-1 font-display text-2xl text-foreground">{summary.streak}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
            <p className="font-body text-xs text-muted-foreground">Missed</p>
            <p className="mt-1 font-display text-2xl text-foreground">{summary.absent}</p>
            {summary.excused > 0 && <p className="font-body text-[0.7rem] text-muted-foreground">{summary.excused} excused</p>}
          </div>
        </div>

        {/* Month-by-month record */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-card sm:p-6">
          <h3 className="flex items-center gap-2 font-display text-lg text-foreground">
            <CalendarCheck className="h-5 w-5 text-gold" /> Attendance record
          </h3>
          {months.length === 0 ? (
            <p className="mt-2 font-body text-sm text-muted-foreground">No attendance has been marked yet.</p>
          ) : (
            <div className="mt-3 space-y-4">
              {months.map((month) => (
                <div key={month}>
                  <p className="font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">{monthLabel(month)}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[...byMonth[month]].sort((a, b) => a.date.localeCompare(b.date)).map((record) => (
                      <span
                        key={record.id}
                        title={`${record.date} · ${ATTENDANCE_STATUS_LABELS[record.status]}${record.className ? ` · ${record.className}` : ""}`}
                        className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background/70 px-2 py-1 font-body text-[0.7rem] text-muted-foreground"
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[record.status]}`} />
                        {Number(record.date.slice(-2))}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-3 border-t border-border/60 pt-3">
                {(Object.keys(DOT) as AttendanceStatus[]).map((status) => (
                  <span key={status} className="flex items-center gap-1.5 font-body text-[0.7rem] text-muted-foreground">
                    <span className={`h-2 w-2 rounded-full ${DOT[status]}`} /> {ATTENDANCE_STATUS_LABELS[status]}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Progress reports */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-card sm:p-6">
          <h3 className="flex items-center gap-2 font-display text-lg text-foreground">
            <Award className="h-5 w-5 text-gold" /> Progress reports
          </h3>
          {visibleReports.length === 0 ? (
            <p className="mt-2 font-body text-sm text-muted-foreground">No progress reports have been published yet.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {visibleReports.map((report) => (
                <div key={report.id} className="rounded-lg border border-border/60 bg-background/70 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-body text-sm font-semibold text-foreground">{report.periodLabel}</p>
                    <p className="font-body text-xs text-muted-foreground">{report.className}</p>
                  </div>
                  {report.grade && (
                    <span className="mt-1 inline-block rounded-full bg-gold/15 px-2.5 py-0.5 font-body text-[0.7rem] font-bold text-gold">
                      Grade {report.grade}
                    </span>
                  )}
                  {report.skills.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {report.skills.map((skill) => (
                        <div key={skill.name} className="flex items-center justify-between gap-3">
                          <span className="min-w-0 font-body text-xs text-muted-foreground">{skill.name}</span>
                          <span className="flex shrink-0 gap-0.5">
                            {[1, 2, 3, 4, 5].map((step) => (
                              <span key={step} className={`h-2 w-4 rounded-sm ${step <= skill.rating ? "bg-gold" : "bg-muted"}`} />
                            ))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {report.remarks && <p className="mt-2 font-body text-xs text-foreground">{report.remarks}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AccountLayout>
  );
};

export default Attendance;
