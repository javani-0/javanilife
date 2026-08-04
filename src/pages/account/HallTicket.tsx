import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import SEO from "@/components/SEO";
import { useStudentPortal } from "@/contexts/StudentPortalContext";
import { buildHallTicketNumber, getExam, hallTicketEligibility, type Exam } from "@/lib/portal/exams";

// ---------------------------------------------------------------------------
// Hall ticket (req P4): a printable A4 document. "Download" is the browser's
// own Print → Save as PDF, so there is no PDF dependency and the output is
// whatever the student's device already renders well.
// ---------------------------------------------------------------------------

const HallTicket = () => {
  const { examId = "" } = useParams();
  const [params] = useSearchParams();
  const enrollmentId = params.get("e") || "";
  const { enrollments, access, loading: portalLoading } = useStudentPortal();

  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const found = await getExam(examId).catch(() => null);
        if (!cancelled) setExam(found);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [examId]);

  const enrollment = useMemo(
    () => enrollments.find((item) => item.id === enrollmentId) || enrollments.find((item) => item.classId === exam?.classId),
    [enrollments, enrollmentId, exam],
  );
  const locked = enrollment ? access[enrollment.id]?.locked === true : true;
  const eligibility = exam ? hallTicketEligibility(exam, { locked }) : { allowed: false, reason: "" };

  if (loading || portalLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-muted/30"><Loader2 className="h-7 w-7 animate-spin text-gold" /></div>;
  }

  if (!exam || !enrollment || !eligibility.allowed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/30 px-6 text-center">
        <h1 className="font-display text-2xl text-foreground">Hall ticket unavailable</h1>
        <p className="max-w-md font-body text-sm text-muted-foreground">
          {eligibility.reason || "This exam isn't linked to your account."}
        </p>
        <Link to="/account/exams" className="rounded-sm bg-gradient-primary px-5 py-2.5 font-body text-sm font-semibold text-primary-foreground hover:brightness-110">
          Back to examinations
        </Link>
      </div>
    );
  }

  // Prefer the real roll number; fall back to the enrolment id so a student
  // approved before roll numbers were stamped still gets a stable ticket.
  const ticketNumber = buildHallTicketNumber(exam.id, enrollment.studentRollNo || enrollment.id.slice(-6).toUpperCase());

  return (
    <div className="min-h-screen bg-muted/30 py-6 print:bg-white print:py-0">
      <SEO title={`Hall Ticket — ${exam.title}`} description="Examination hall ticket." />
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 14mm; }
          html, body { background: #fff !important; }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-[820px] flex-wrap items-center justify-between gap-2 px-4">
        <Link to="/account/exams" className="inline-flex items-center gap-2 font-body text-sm font-semibold text-gold hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <button onClick={() => window.print()} className="flex min-h-10 items-center gap-2 rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground hover:brightness-110">
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </button>
      </div>

      <div className="mx-auto max-w-[820px] bg-white px-4 print:max-w-none print:px-0">
        <div className="rounded-2xl border border-border/60 p-6 shadow-card print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-9">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-foreground/80 pb-4">
            <div className="min-w-0">
              <h1 className="font-display text-2xl text-foreground">Javani Spiritual Hub</h1>
              <p className="mt-0.5 font-body text-sm font-semibold uppercase tracking-[0.15em] text-gold">Hall Ticket</p>
            </div>
            <div className="text-right">
              <p className="font-body text-[0.7rem] uppercase tracking-wide text-muted-foreground">Ticket No.</p>
              <p className="font-body text-sm font-bold text-foreground">{ticketNumber}</p>
            </div>
          </div>

          <div className="grid gap-5 py-5 sm:grid-cols-[1fr_auto]">
            <div className="min-w-0 space-y-2">
              <Field label="Student" value={enrollment.student.name} strong />
              {enrollment.studentRollNo && <Field label="Roll no." value={enrollment.studentRollNo} />}
              <Field label="Class" value={exam.className} />
              {enrollment.slotLabel && <Field label="Batch" value={enrollment.slotLabel} />}
              <Field label="Examination" value={exam.title} strong />
              <Field label="Date" value={exam.examDate} strong />
              <Field label="Time" value={exam.startTime ? `${exam.startTime}${exam.endTime ? ` – ${exam.endTime}` : ""}` : "—"} />
              <Field label="Venue" value={`${exam.venue || "—"} (${exam.mode})`} />
            </div>
            <div className="flex shrink-0 flex-col items-center gap-2">
              <QRCodeSVG value={ticketNumber} size={110} />
              <p className="font-body text-[0.65rem] text-muted-foreground">Scan to verify</p>
            </div>
          </div>

          {exam.instructions.length > 0 && (
            <div className="border-t border-border/60 pt-4">
              <p className="font-body text-[0.72rem] font-semibold uppercase tracking-wide text-muted-foreground">Instructions</p>
              <ul className="mt-1.5 list-inside list-decimal space-y-1 font-body text-sm text-foreground">
                {exam.instructions.map((line, index) => <li key={index}>{line}</li>)}
              </ul>
            </div>
          )}

          <div className="mt-8 flex items-end justify-between gap-6 border-t border-border/60 pt-6">
            <div className="w-40 border-t border-foreground/60 pt-1 text-center font-body text-[0.7rem] text-muted-foreground">Student signature</div>
            <div className="w-40 border-t border-foreground/60 pt-1 text-center font-body text-[0.7rem] text-muted-foreground">Authorised signatory</div>
          </div>

          <p className="mt-5 text-center font-body text-[0.7rem] text-muted-foreground">
            Please carry this hall ticket to the examination. Entry may be refused without it.
          </p>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className="flex gap-2">
    <span className="w-28 shrink-0 font-body text-[0.78rem] text-muted-foreground">{label}</span>
    <span className={`min-w-0 font-body text-sm ${strong ? "font-bold text-foreground" : "text-foreground"}`}>{value}</span>
  </div>
);

export default HallTicket;
