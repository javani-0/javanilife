import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Award, CalendarClock, ChevronRight, GraduationCap, Loader2, Lock, PlayCircle, Radio, TrendingUp, Wallet,
} from "lucide-react";
import AccountLayout from "@/components/account/AccountLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useStudentPortal } from "@/contexts/StudentPortalContext";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import { summarizeStudentFees } from "@/lib/students";
import { joinStatusFor, nextSessionsFor, type SessionOccurrence } from "@/lib/portal/schedule";
import {
  listMyAttendance,
  listMyProgressReports,
  summarizeAttendance,
  type AttendanceRecord,
  type ProgressReport,
} from "@/lib/portal/attendance";

// ---------------------------------------------------------------------------
// Personalized student dashboard (req P1): the whole learning journey in one
// place — classes, this week's sessions with a gated Join, what's owed, and any
// access restriction, across every class the student takes.
// ---------------------------------------------------------------------------

interface WeekSession extends SessionOccurrence {
  enrollmentId: string;
  className: string;
  locked: boolean;
}

/** "2026-07-02" → "2 Jul 2026". Never show a parent a raw ISO date. */
const niceDate = (iso?: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!match) return iso || "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`;
};

const StudentDashboard = () => {
  const { user, userProfile } = useAuth();
  const { loading, isStudent, enrollments, classes, feesByEnrollment, access, hasLockedClass } = useStudentPortal();

  const allFees = useMemo(() => Object.values(feesByEnrollment).flat(), [feesByEnrollment]);
  const summary = useMemo(() => summarizeStudentFees(allFees), [allFees]);

  // Progress (req): the reports used to sit at the bottom of a page nobody
  // opened, so the dashboard now carries the headline itself.
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [reports, setReports] = useState<ProgressReport[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    (async () => {
      const [marks, published] = await Promise.all([
        listMyAttendance(user.uid).catch(() => []),
        listMyProgressReports(user.uid).catch(() => []),
      ]);
      if (cancelled) return;
      setAttendance(marks);
      setReports(published);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const attendanceSummary = useMemo(() => summarizeAttendance(attendance), [attendance]);
  const latestReport = reports[0];

  // This week's sessions across EVERY class, soonest first.
  const week = useMemo(() => {
    const now = new Date();
    const horizon = now.getTime() + 7 * 86_400_000;
    const rows: WeekSession[] = [];
    for (const enrollment of enrollments) {
      if (enrollment.status === "cancelled") continue;
      const cls = classes[enrollment.classId];
      for (const session of nextSessionsFor(cls, enrollment.slotId, now, 4)) {
        if (session.start.getTime() > horizon) break;
        rows.push({
          ...session,
          enrollmentId: enrollment.id,
          className: enrollment.className,
          locked: access[enrollment.id]?.locked === true,
        });
      }
    }
    return rows.sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, 6);
  }, [enrollments, classes, access]);

  if (loading) {
    return (
      <AccountLayout title="Dashboard" description="Your classes, schedule and fees in one place.">
        <div className="flex items-center justify-center rounded-2xl border border-border/60 bg-card p-10">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      </AccountLayout>
    );
  }

  if (!isStudent) {
    return (
      <AccountLayout title="Dashboard" description="Your classes, schedule and fees in one place.">
        <div className="rounded-2xl border border-gold/15 bg-card p-10 text-center shadow-card">
          <GraduationCap className="mx-auto mb-3 h-10 w-10 text-gold" />
          <h3 className="font-display text-xl text-foreground">No classes yet</h3>
          <p className="mt-1 font-body text-sm text-muted-foreground">Once you're enrolled, your dashboard appears here.</p>
          <Link to="/classes" className="mt-4 inline-block rounded-sm bg-gradient-primary px-5 py-2.5 font-body text-sm font-semibold text-primary-foreground hover:brightness-110">Browse classes</Link>
        </div>
      </AccountLayout>
    );
  }

  const studentName = enrollments[0]?.student.name || userProfile?.username || "Student";

  return (
    <AccountLayout title={`Hi, ${studentName}`} description="Your classes, schedule and fees in one place.">
      <div className="space-y-4">
        {/* Access banner — the single most important thing when it applies. */}
        {hasLockedClass && (
          <div className="flex flex-col gap-3 rounded-2xl border border-red-300 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <div className="min-w-0">
                <p className="font-body text-sm font-semibold text-red-800">Some class content is paused</p>
                <p className="font-body text-xs text-red-700">
                  {Object.entries(access).filter(([, item]) => item.locked)
                    .map(([id]) => enrollments.find((e) => e.id === id)?.className)
                    .filter(Boolean).join(", ")}
                  {" "}— it unlocks as soon as the payment is recorded.
                </p>
              </div>
            </div>
            <Link to="/account/classes" className="flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-sm bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground hover:brightness-110">
              <Wallet className="h-4 w-4" /> Pay now
            </Link>
          </div>
        )}

        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
            <p className="font-body text-xs text-muted-foreground">Classes</p>
            <p className="mt-1 font-display text-2xl text-foreground">{enrollments.length}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
            <p className="font-body text-xs text-muted-foreground">Amount due</p>
            <p className={`mt-1 font-display text-2xl ${summary.hasOutstanding ? "text-amber-700" : "text-green-700"}`}>
              {summary.hasOutstanding ? formatPaiseAsRupees(summary.outstandingInPaise) : "₹0"}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
            <p className="font-body text-xs text-muted-foreground">Next due</p>
            <p className="mt-1 font-body text-sm font-semibold text-foreground">
              {summary.nextDue ? niceDate(summary.nextDue.dueDate) : "—"}
            </p>
            {summary.nextDue && <p className="font-body text-[0.7rem] text-muted-foreground">{summary.nextDue.periodLabel}</p>}
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
            <p className="font-body text-xs text-muted-foreground">Next session</p>
            <p className="mt-1 font-body text-sm font-semibold text-foreground">{week[0]?.dayLabel || "—"}</p>
            {week[0] && <p className="font-body text-[0.7rem] text-muted-foreground">{week[0].timeLabel}</p>}
          </div>
        </div>

        {/* Progress — its own category on the dashboard (req). Always shown, so
            a parent can see there is a progress section even before the first
            report is published. */}
        <Link
          to="/account/progress"
          className="flex flex-col gap-3 rounded-2xl border border-gold/25 bg-card p-5 shadow-card transition-colors hover:border-gold/60 sm:flex-row sm:items-center sm:justify-between sm:p-6"
        >
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 font-display text-lg text-foreground">
              <TrendingUp className="h-5 w-5 text-gold" /> Progress
            </h3>
            {latestReport ? (
              <p className="mt-1 font-body text-sm text-muted-foreground">
                Latest report: <span className="font-semibold text-foreground">{latestReport.periodLabel}</span>
                {latestReport.className ? ` · ${latestReport.className}` : ""}
                {latestReport.grade ? ` · Grade ${latestReport.grade}` : ""}
              </p>
            ) : (
              <p className="mt-1 font-body text-sm text-muted-foreground">
                Progress reports appear here as soon as your teacher publishes one.
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <div className="text-center">
              <p className="font-body text-[0.7rem] uppercase tracking-wide text-muted-foreground">Attendance</p>
              <p className={`font-display text-2xl ${attendanceSummary.total === 0 ? "text-muted-foreground" : attendanceSummary.percent >= 75 ? "text-green-700" : attendanceSummary.percent >= 50 ? "text-amber-700" : "text-red-700"}`}>
                {attendanceSummary.total === 0 ? "—" : `${attendanceSummary.percent}%`}
              </p>
            </div>
            <div className="text-center">
              <p className="font-body text-[0.7rem] uppercase tracking-wide text-muted-foreground">Reports</p>
              <p className="flex items-center justify-center gap-1 font-display text-2xl text-foreground">
                <Award className="h-4 w-4 text-gold" />{reports.length}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-gold" />
          </div>
        </Link>

        {/* This week's schedule with a gated Join. */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-card sm:p-6">
          <h3 className="flex items-center gap-2 font-display text-lg text-foreground">
            <CalendarClock className="h-5 w-5 text-gold" /> This week
          </h3>
          {week.length === 0 ? (
            <p className="mt-2 font-body text-sm text-muted-foreground">No sessions scheduled in the next 7 days.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {week.map((session, index) => {
                // The live URL is no longer on the public class doc (req P1b) —
                // the dashboard sends the student into the class room, where the
                // server hands out the link after re-checking their fees.
                // Timing is shown as information; only the fee lock hides the
                // way in. Gating on the session window meant students whose slot
                // data had drifted could never reach their class at all.
                const status = joinStatusFor([session], new Date());
                const canJoin = !session.locked;
                return (
                  <div key={`${session.enrollmentId}-${index}`} className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/70 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-body text-sm font-semibold text-foreground">{session.className}</p>
                      <p className="font-body text-xs text-muted-foreground">{session.label}</p>
                    </div>
                    {session.locked ? (
                      <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-red-100 px-3 py-1.5 font-body text-xs font-semibold text-red-700">
                        <Lock className="h-3.5 w-3.5" /> Locked
                      </span>
                    ) : canJoin ? (
                      <Link to={`/account/classes/${session.enrollmentId}`} className="flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-gradient-primary px-4 font-body text-xs font-semibold text-primary-foreground hover:brightness-110">
                        <Radio className="h-3.5 w-3.5" /> Join now
                      </Link>
                    ) : (
                      <span className="shrink-0 rounded-md border border-border px-3 py-1.5 font-body text-xs text-muted-foreground">{status.message}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Per-class cards */}
        <div className="grid gap-3 sm:grid-cols-2">
          {enrollments.map((enrollment) => {
            const cls = classes[enrollment.classId];
            const locked = access[enrollment.id]?.locked === true;
            const classFees = feesByEnrollment[enrollment.id] || [];
            const classSummary = summarizeStudentFees(classFees);
            return (
              <div key={enrollment.id} className={`rounded-2xl border p-4 shadow-card ${locked ? "border-red-200 bg-red-50/40" : "border-border/60 bg-card"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="truncate font-display text-lg text-foreground">{enrollment.className}</h4>
                    {(enrollment.trainerName || cls?.facultyName) && (
                      <p className="truncate font-body text-xs text-muted-foreground">Trainer: {enrollment.trainerName || cls?.facultyName}</p>
                    )}
                    {enrollment.slotLabel && <p className="truncate font-body text-xs text-muted-foreground">{enrollment.slotLabel}</p>}
                  </div>
                  {locked && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 font-body text-[0.65rem] font-semibold text-red-700">
                      <Lock className="h-3 w-3" /> Locked
                    </span>
                  )}
                </div>

                {classSummary.hasOutstanding ? (
                  <p className="mt-2 font-body text-xs font-semibold text-amber-700">
                    {formatPaiseAsRupees(classSummary.outstandingInPaise)} due
                    {classSummary.nextDue ? ` · ${classSummary.nextDue.periodLabel}` : ""}
                  </p>
                ) : (
                  <p className="mt-2 font-body text-xs text-green-700">All fees clear</p>
                )}

                <Link
                  to={`/account/classes/${enrollment.id}`}
                  className="mt-3 flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-gold/40 px-3 font-body text-xs font-semibold text-gold hover:bg-gold/10"
                >
                  <PlayCircle className="h-3.5 w-3.5" /> Open class room
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </AccountLayout>
  );
};

export default StudentDashboard;
