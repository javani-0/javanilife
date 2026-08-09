import { Link } from "react-router-dom";
import { CalendarClock, CheckCircle2, Clock, GraduationCap, Loader2, Wallet } from "lucide-react";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import {
  deriveDisplayFeeStatus,
  feePaidStatement,
  FEE_STATUS_LABELS,
  formatFeeAmount,
  formatNiceDate,
  isFeePayable,
  type EnrollmentDoc,
  type FeePaymentDoc,
  type FeeStatus,
} from "@/lib/classes";
import { summarizeEmiPlan } from "@/lib/portal/emi";

// ---------------------------------------------------------------------------
// One class-fee EMI plan (req 5). Lives on the EMI Payments page — the Classes
// tab now only links here, so there is exactly one screen that can take an
// installment payment.
// ---------------------------------------------------------------------------

const feeStatusStyles: Record<FeeStatus, string> = {
  paid: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  overdue: "bg-red-100 text-red-700",
  failed: "bg-red-100 text-red-700",
  waived: "bg-muted text-muted-foreground",
};

interface ClassEmiCardProps {
  enrollment: EnrollmentDoc;
  fees: FeePaymentDoc[];
  /** The class's weekly schedule, when the enrolment has no slot of its own. */
  scheduleLabel?: string;
  busyId: string | null;
  onPay: (fee: FeePaymentDoc) => void;
}

const ClassEmiCard = ({ enrollment, fees, scheduleLabel, busyId, onPay }: ClassEmiCardProps) => {
  const summary = summarizeEmiPlan(fees);
  if (summary.installments.length === 0) return null;

  const paidPercent = summary.totalInPaise > 0
    ? Math.round((summary.paidInPaise / summary.totalInPaise) * 100)
    : 0;
  const timing = enrollment.slotLabel || scheduleLabel || "";

  return (
    <div className="overflow-hidden rounded-2xl border border-gold/20 bg-card shadow-card">
      {/* Which course this plan is for — the client could not tell before. */}
      <div className="border-b border-border bg-muted/30 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-lg font-medium text-foreground">{enrollment.className}</h3>
              {summary.complete ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-body text-[0.65rem] font-bold uppercase tracking-wider text-emerald-800">
                  <CheckCircle2 className="h-3 w-3" /> Fully Paid
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-body text-[0.65rem] font-bold uppercase tracking-wider text-amber-800">
                  <Clock className="h-3 w-3" /> Active EMI
                </span>
              )}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><GraduationCap className="h-3.5 w-3.5 text-gold" /> {enrollment.student.name}</span>
              {timing && <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-gold" /> {timing}</span>}
            </p>
          </div>
          <Link
            to={`/account/classes/${enrollment.id}`}
            className="shrink-0 font-body text-xs font-semibold text-gold hover:text-gold-light"
          >
            Open class →
          </Link>
        </div>

        {/* Progress: paid of total, with what is still owed. */}
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-primary transition-all" style={{ width: `${paidPercent}%` }} />
          </div>
          <p className="mt-1.5 font-body text-xs text-muted-foreground">
            Paid <span className="font-semibold text-green-700">{formatPaiseAsRupees(summary.paidInPaise)}</span> of {formatPaiseAsRupees(summary.totalInPaise)}
            {summary.remainingInPaise > 0 && (
              <> · <span className="font-semibold text-foreground">{formatPaiseAsRupees(summary.remainingInPaise)}</span> remaining</>
            )}
            <> · {summary.paidCount}/{summary.installments.length} installments</>
          </p>
        </div>
      </div>

      <div className="divide-y divide-border">
        {summary.installments.map((fee, index) => {
          const status = deriveDisplayFeeStatus(fee);
          const payable = isFeePayable({ status });
          const isPaid = status === "paid";
          return (
            <div key={fee.id} id={`fee-${fee.id}`} className="flex flex-col gap-3 px-5 py-4 transition-colors scroll-mt-28 hover:bg-muted/10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex min-w-0 items-start gap-3">
                <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-body text-xs font-bold ${isPaid ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <p className="font-body text-sm font-semibold text-foreground">
                    {fee.periodLabel} — {formatFeeAmount(fee)}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 font-body text-xs text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {isPaid ? (feePaidStatement(fee) || "Paid") : `Due ${fee.dueDate ? formatNiceDate(fee.dueDate) : "soon"}`}
                  </p>
                  {status === "processing" && (
                    <p className="mt-0.5 font-body text-[0.7rem] text-blue-600">⏳ Awaiting admin approval</p>
                  )}
                  {fee.upiRejectedReason && payable && (
                    <p className="mt-0.5 font-body text-[0.7rem] text-destructive">Rejected: {fee.upiRejectedReason}</p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:self-center">
                <span className={`rounded-full px-2.5 py-1 font-body text-xs font-semibold ${feeStatusStyles[status]}`}>
                  {FEE_STATUS_LABELS[status]}
                </span>
                {payable && (
                  <button
                    onClick={() => onPay(fee)}
                    disabled={busyId === fee.id}
                    className="flex min-h-9 items-center gap-1.5 rounded-md bg-gradient-primary px-4 py-1.5 font-body text-xs font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60"
                  >
                    {busyId === fee.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />} Pay now
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {summary.remainingInPaise > 0 && (
        <p className="border-t border-border bg-muted/20 px-5 py-3 font-body text-[0.72rem] text-muted-foreground sm:px-6">
          You can pay any pending installment early — there's no need to wait for its due date.
        </p>
      )}
    </div>
  );
};

export default ClassEmiCard;
