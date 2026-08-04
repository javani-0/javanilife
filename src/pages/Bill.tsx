import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, Copy, Download, FileText, Loader2, Printer, Share2 } from "lucide-react";
import SEO from "@/components/SEO";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import { subscribeToBill, type BillDoc } from "@/lib/students";

// ---------------------------------------------------------------------------
// Public bill / receipt (req: printable, downloadable, shareable URL).
// Opened by unguessable token — no login — so a parent can just tap the link.
// "Download" is window.print() → Save as PDF: no PDF dependency, and the output
// is the same A4 layout every browser already knows how to render.
// ---------------------------------------------------------------------------

const niceDate = (iso?: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!match) return "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`;
};

const Bill = () => {
  const { token = "" } = useParams();
  const [bill, setBill] = useState<BillDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    return subscribeToBill(token, (doc) => { setBill(doc); setLoading(false); }, () => setLoading(false));
  }, [token]);

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: "Javani — Bill", url }); return; } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-7 w-7 animate-spin text-gold" />
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/30 px-6 text-center">
        <FileText className="h-11 w-11 text-gold/60" />
        <h1 className="font-display text-2xl text-foreground">Bill not found</h1>
        <p className="font-body text-sm text-muted-foreground">This bill link is invalid or has been replaced. Please contact Javani Spiritual Hub.</p>
      </div>
    );
  }

  const paid = bill.status === "paid";

  return (
    <div className="min-h-screen bg-muted/30 py-6 print:bg-white print:py-0">
      <SEO title={`Bill ${bill.billNumber} | Javani Spiritual Hub`} description={`Fee bill for ${bill.studentName}.`} />

      {/* Print rules: hide the toolbar, drop shadows/edges, keep it to one A4. */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 14mm; }
          html, body { background: #fff !important; }
        }
      `}</style>

      {/* Toolbar — never printed. */}
      <div className="no-print mx-auto mb-4 flex max-w-[820px] flex-wrap items-center justify-end gap-2 px-4">
        <button
          onClick={share}
          className="flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-card px-4 font-body text-sm font-semibold text-foreground hover:bg-muted"
        >
          {copied ? <><Check className="h-4 w-4 text-green-600" /> Link copied</> : <><Share2 className="h-4 w-4" /> Share</>}
        </button>
        <button
          onClick={() => window.print()}
          className="flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-card px-4 font-body text-sm font-semibold text-foreground hover:bg-muted"
        >
          <Download className="h-4 w-4" /> Download PDF
        </button>
        <button
          onClick={() => window.print()}
          className="flex min-h-10 items-center gap-1.5 rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground hover:brightness-110"
        >
          <Printer className="h-4 w-4" /> Print
        </button>
      </div>

      {/* The bill itself. */}
      <div className="mx-auto max-w-[820px] bg-white px-4 print:max-w-none print:px-0">
        <div className="rounded-2xl border border-border/60 p-6 shadow-card print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-9">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 pb-5">
            <div className="min-w-0">
              <h1 className="font-display text-2xl text-foreground">Javani Spiritual Hub</h1>
              <p className="mt-0.5 font-body text-[0.8rem] text-muted-foreground">Fee bill / receipt</p>
            </div>
            <div className="text-right">
              <p className="font-body text-[0.72rem] uppercase tracking-wide text-muted-foreground">Bill No.</p>
              <p className="font-body text-sm font-bold text-foreground">{bill.billNumber}</p>
              <p className="mt-1 font-body text-[0.72rem] text-muted-foreground">Issued {niceDate(bill.issuedOn)}</p>
              <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 font-body text-[0.7rem] font-bold ${paid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                {paid ? "PAID" : "PAYMENT DUE"}
              </span>
            </div>
          </div>

          {/* Who it's for */}
          <div className="grid gap-4 border-b border-border/60 py-5 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="font-body text-[0.72rem] uppercase tracking-wide text-muted-foreground">Billed to</p>
              <p className="mt-1 font-body text-sm font-bold text-foreground">{bill.studentName}</p>
              {bill.studentRollNo && <p className="font-body text-[0.78rem] text-gold">Roll no. {bill.studentRollNo}</p>}
              {bill.parentName && <p className="font-body text-[0.78rem] text-muted-foreground">Parent: {bill.parentName}</p>}
              {bill.parentPhone && <p className="font-body text-[0.78rem] text-muted-foreground">{bill.parentPhone}</p>}
              {bill.address && <p className="mt-0.5 font-body text-[0.75rem] text-muted-foreground">{bill.address}</p>}
            </div>
            <div className="min-w-0 sm:text-right">
              <p className="font-body text-[0.72rem] uppercase tracking-wide text-muted-foreground">For</p>
              <p className="mt-1 font-body text-sm font-bold text-foreground">{bill.className}</p>
              {bill.slotLabel && <p className="font-body text-[0.78rem] text-muted-foreground">{bill.slotLabel}</p>}
              <p className="font-body text-[0.78rem] text-muted-foreground">{bill.periodLabel}</p>
              {paid && bill.paidOn && <p className="mt-1 font-body text-[0.78rem] font-semibold text-green-700">Paid on {niceDate(bill.paidOn)}</p>}
              {paid && bill.paymentMethod && <p className="font-body text-[0.75rem] capitalize text-muted-foreground">via {bill.paymentMethod}</p>}
            </div>
          </div>

          {/* Itemised lines — the same transparency as everywhere else. */}
          <div className="overflow-x-auto py-5">
            <table className="w-full min-w-[380px] border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left font-body text-[0.72rem] uppercase tracking-wide text-muted-foreground">Description</th>
                  <th className="pb-2 text-right font-body text-[0.72rem] uppercase tracking-wide text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bill.lines.map((line, index) => (
                  <tr key={index} className="border-b border-border/40">
                    <td className="py-2 font-body text-sm text-foreground">{line.label}</td>
                    <td className={`py-2 text-right font-body text-sm ${line.amountInPaise < 0 ? "text-green-700" : "text-foreground"}`}>
                      {line.amountInPaise < 0 ? "−" : ""}{formatPaiseAsRupees(Math.abs(line.amountInPaise))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="ml-auto w-full max-w-xs space-y-1.5 border-t border-border pt-3">
            {bill.gstInPaise > 0 && (
              <>
                <div className="flex justify-between gap-3 font-body text-sm text-muted-foreground">
                  <span>Taxable value</span><span className="text-foreground">{formatPaiseAsRupees(bill.taxableInPaise)}</span>
                </div>
                <div className="flex justify-between gap-3 font-body text-sm text-muted-foreground">
                  <span>GST @ {bill.gstPercent}%</span><span className="text-foreground">{formatPaiseAsRupees(bill.gstInPaise)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between gap-3 border-t border-border pt-2 font-display text-lg font-bold text-foreground">
              <span>Total</span><span className="text-primary">{formatPaiseAsRupees(bill.totalInPaise)}</span>
            </div>
          </div>

          <p className="mt-8 border-t border-border/60 pt-4 text-center font-body text-[0.72rem] text-muted-foreground">
            This is a computer-generated bill and does not require a signature.
            {" "}Questions? Contact Javani Spiritual Hub.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Bill;
