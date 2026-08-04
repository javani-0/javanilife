import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, FileText, Loader2, MapPin, Ticket } from "lucide-react";
import AccountLayout from "@/components/account/AccountLayout";
import { useStudentPortal } from "@/contexts/StudentPortalContext";
import { examTimingFor, hallTicketEligibility, listExamsForClasses, type Exam } from "@/lib/portal/exams";

// ---------------------------------------------------------------------------
// Examination details (req P4). Hall-ticket access is derived — released by the
// admin, class not fee-locked, exam not already past.
// ---------------------------------------------------------------------------

const Exams = () => {
  const { enrollments, access } = useStudentPortal();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  const classIds = useMemo(() => enrollments.map((item) => item.classId), [enrollments]);
  const classKey = classIds.join(",");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setExams(await listExamsForClasses(classIds).catch(() => []));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classKey]);

  useEffect(() => { load(); }, [load]);

  /** The enrolment (and therefore the lock state) for an exam's class. */
  const contextFor = (exam: Exam) => {
    const enrollment = enrollments.find((item) => item.classId === exam.classId);
    return { enrollment, locked: enrollment ? access[enrollment.id]?.locked === true : true };
  };

  if (loading) {
    return (
      <AccountLayout title="Examinations" description="Exam schedule and hall tickets.">
        <div className="flex items-center justify-center rounded-2xl border border-border/60 bg-card p-10">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      </AccountLayout>
    );
  }

  return (
    <AccountLayout title="Examinations" description="Exam schedule and hall tickets.">
      <div className="space-y-3">
        {exams.length === 0 ? (
          <div className="rounded-2xl border border-gold/15 bg-card p-10 text-center shadow-card">
            <Ticket className="mx-auto mb-3 h-10 w-10 text-gold" />
            <h3 className="font-display text-xl text-foreground">No exams scheduled</h3>
            <p className="mt-1 font-body text-sm text-muted-foreground">Exam details will appear here once they're announced.</p>
          </div>
        ) : (
          exams.map((exam) => {
            const { enrollment, locked } = contextFor(exam);
            const timing = examTimingFor(exam);
            const eligibility = hallTicketEligibility(exam, { locked });
            return (
              <div key={exam.id} className={`rounded-2xl border p-4 shadow-card sm:p-5 ${timing === "past" ? "border-border/60 bg-card/70" : "border-border/60 bg-card"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-display text-lg text-foreground">{exam.title}</h3>
                    <p className="font-body text-xs text-muted-foreground">{exam.className}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 font-body text-[0.68rem] font-semibold ${timing === "today" ? "bg-red-100 text-red-700" : timing === "upcoming" ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground"}`}>
                    {timing === "today" ? "Today" : timing === "upcoming" ? "Upcoming" : "Past"}
                  </span>
                </div>

                <div className="mt-2 space-y-1 font-body text-sm text-muted-foreground">
                  <p className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 shrink-0 text-gold" /> {exam.examDate}{exam.startTime ? ` · ${exam.startTime}${exam.endTime ? ` – ${exam.endTime}` : ""}` : ""}</p>
                  {exam.venue && <p className="flex items-center gap-1.5"><MapPin className="h-4 w-4 shrink-0 text-gold" /> {exam.venue} <span className="capitalize">({exam.mode})</span></p>}
                </div>

                {exam.syllabus && (
                  <div className="mt-2 rounded-lg bg-muted/50 px-3 py-2">
                    <p className="font-body text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">Syllabus</p>
                    <p className="mt-0.5 whitespace-pre-wrap font-body text-xs text-foreground">{exam.syllabus}</p>
                  </div>
                )}

                {exam.instructions.length > 0 && (
                  <ul className="mt-2 list-inside list-disc space-y-0.5 font-body text-xs text-muted-foreground">
                    {exam.instructions.map((line, index) => <li key={index}>{line}</li>)}
                  </ul>
                )}

                <div className="mt-3">
                  {eligibility.allowed && enrollment ? (
                    <Link
                      to={`/account/exams/${exam.id}/hall-ticket?e=${enrollment.id}`}
                      className="flex min-h-10 w-fit items-center gap-2 rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground hover:brightness-110"
                    >
                      <FileText className="h-4 w-4" /> Hall ticket
                    </Link>
                  ) : (
                    <p className="font-body text-xs text-muted-foreground">{eligibility.reason}</p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </AccountLayout>
  );
};

export default Exams;
