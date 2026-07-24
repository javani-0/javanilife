import { formatPaiseAsRupees } from "@/lib/ecommerce";
import type { StudentBreakdown } from "@/lib/students";

interface StudentFeeSummaryProps {
  breakdown: StudentBreakdown;
  firstMonthFreeNotes: string[];
}

/**
 * The transparent price the admin sees while filling the form — and the exact
 * same numbers the parent sees on the payment link (req). One section per
 * class, each itemised (kit / books / uniform / course / pre-payment /
 * discount), then the one grand total the parent actually pays.
 */
const StudentFeeSummary = ({ breakdown, firstMonthFreeNotes }: StudentFeeSummaryProps) => {
  const multi = breakdown.sections.length > 1;

  return (
    <div className="mt-4 rounded-lg border border-gold/25 bg-gold/5 p-3">
      <p className="font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment link total</p>

      {breakdown.grandTotalInPaise === 0 ? (
        <p className="mt-1 font-body text-sm text-muted-foreground">Nothing to pay now — a login can be issued directly after saving.</p>
      ) : (
        <div className="mt-2 space-y-2.5">
          {breakdown.sections.map((section) => (
            <div key={section.key} className={multi ? "rounded-md border border-gold/20 bg-background/60 p-2.5" : ""}>
              {multi && (
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2">
                  <p className="min-w-0 font-body text-xs font-semibold text-foreground">{section.className || "Class"}</p>
                  {section.slotLabel && <p className="font-body text-[0.7rem] text-muted-foreground">{section.slotLabel}</p>}
                </div>
              )}

              <div className="space-y-0.5">
                {section.rows.length === 0 ? (
                  <p className="font-body text-xs text-muted-foreground">No charges for this class.</p>
                ) : section.rows.map((row, index) => (
                  <div key={index} className="flex justify-between gap-2 font-body text-xs text-muted-foreground">
                    <span className="min-w-0">{row.label}</span>
                    <span className={row.amountInPaise < 0 ? "shrink-0 text-green-700" : "shrink-0 text-foreground"}>
                      {row.amountInPaise < 0 ? "−" : ""}{formatPaiseAsRupees(Math.abs(row.amountInPaise))}
                    </span>
                  </div>
                ))}
              </div>

              {multi && (
                <div className="mt-1 flex justify-between gap-2 border-t border-gold/20 pt-1 font-body text-xs font-semibold text-foreground">
                  <span className="min-w-0">Subtotal</span>
                  <span className="shrink-0">{formatPaiseAsRupees(section.totalInPaise)}</span>
                </div>
              )}

              {section.recurring && (
                <p className="mt-0.5 font-body text-[0.7rem] text-muted-foreground">
                  Then {formatPaiseAsRupees(section.recurring.amountInPaise)} / month
                </p>
              )}

              {section.emiInstallments && (
                <div className="mt-1.5 border-t border-gold/20 pt-1.5">
                  <p className="font-body text-[0.7rem] font-semibold uppercase tracking-wide text-gold">EMI Payment Schedule</p>
                  <div className="mt-1 space-y-0.5">
                    {section.emiInstallments.map((row, index) => (
                      <div key={index} className="flex justify-between gap-2 font-body text-xs">
                        <span className={index === 0 ? "min-w-0 font-semibold text-foreground" : "min-w-0 text-muted-foreground"}>{row.label}</span>
                        <span className="shrink-0 text-foreground">{formatPaiseAsRupees(row.amountInPaise)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="flex justify-between gap-2 border-t border-gold/30 pt-1.5 font-body text-sm font-bold text-foreground">
            <span className="min-w-0">{multi ? `Total for ${breakdown.sections.length} classes` : "Total"}</span>
            <span className="shrink-0">{formatPaiseAsRupees(breakdown.grandTotalInPaise)}</span>
          </div>

          {/* On EMI the parent is asked for installment 1 only — call that out so
              the grand total above can never be misread as what they pay today. */}
          {breakdown.dueNowInPaise !== breakdown.grandTotalInPaise && (
            <div className="flex justify-between gap-2 font-body text-sm font-semibold text-gold">
              <span className="min-w-0">Parent pays now</span>
              <span className="shrink-0">{formatPaiseAsRupees(breakdown.dueNowInPaise)}</span>
            </div>
          )}
        </div>
      )}

      {firstMonthFreeNotes.map((note) => (
        <p key={note} className="mt-1 font-body text-[0.72rem] text-green-700">{note}</p>
      ))}
    </div>
  );
};

export default StudentFeeSummary;
