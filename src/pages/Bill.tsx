import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, Download, FileText, Loader2, Printer, Share2 } from "lucide-react";
import SEO from "@/components/SEO";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import { rupeesInWords, subscribeToBill, type BillDoc } from "@/lib/students";
import {
  DEFAULT_INVOICE_SETTINGS,
  splitTaxForDisplay,
  subscribeToInvoiceSettings,
  type InvoiceSettings,
} from "@/lib/settings/invoiceSettings";
import { subscribeToPaymentSettings, type PaymentSettings } from "@/lib/settings/paymentSettings";
import logoBrown from "@/assets/logo-brown.png";

// ---------------------------------------------------------------------------
// The printable bill (req: professional, branded, print + PDF + shareable).
//
// Laid out as a real Indian tax invoice: issuer block with GSTIN, bill-to,
// invoice meta, an itemised table with the SAC code, a tax summary that splits
// CGST/SGST, the amount in words, payment details and a signature block.
//
// "Download" is the browser's own Print → Save as PDF: no PDF dependency, and
// the A4 rules below are what make that output look right.
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
  const [invoice, setInvoice] = useState<InvoiceSettings>(DEFAULT_INVOICE_SETTINGS);
  const [payment, setPayment] = useState<PaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    return subscribeToBill(token, (doc) => { setBill(doc); setLoading(false); }, () => setLoading(false));
  }, [token]);
  useEffect(() => subscribeToInvoiceSettings(setInvoice, () => undefined), []);
  useEffect(() => subscribeToPaymentSettings(setPayment, () => undefined), []);

  const taxLines = useMemo(
    () => (bill ? splitTaxForDisplay(bill.gstInPaise, bill.gstPercent, invoice.taxMode) : []),
    [bill, invoice.taxMode],
  );

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: `Bill ${bill?.billNumber || ""}`, url }); return; } catch { /* cancelled */ }
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
  const isTaxInvoice = bill.gstInPaise > 0 && Boolean(invoice.gstin);
  const title = isTaxInvoice ? "TAX INVOICE" : paid ? "RECEIPT" : "INVOICE";
  const logo = invoice.logoUrl || logoBrown;

  return (
    <div className="min-h-screen bg-muted/40 py-6 print:bg-white print:py-0">
      <SEO title={`${title} ${bill.billNumber} | ${invoice.legalName}`} description={`Fee bill for ${bill.studentName}.`} />

      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 12mm; }
          html, body { background: #fff !important; }
          .sheet { box-shadow: none !important; border: 0 !important; }
          .avoid-break { break-inside: avoid; }
        }
      `}</style>

      {/* Toolbar — never printed */}
      <div className="no-print mx-auto mb-4 flex max-w-[860px] flex-wrap items-center justify-end gap-2 px-4">
        <button onClick={share} className="flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-card px-4 font-body text-sm font-semibold text-foreground hover:bg-muted">
          {copied ? <><Check className="h-4 w-4 text-green-600" /> Link copied</> : <><Share2 className="h-4 w-4" /> Share</>}
        </button>
        <button onClick={() => window.print()} className="flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-card px-4 font-body text-sm font-semibold text-foreground hover:bg-muted">
          <Download className="h-4 w-4" /> Download PDF
        </button>
        <button onClick={() => window.print()} className="flex min-h-10 items-center gap-1.5 rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground hover:brightness-110">
          <Printer className="h-4 w-4" /> Print
        </button>
      </div>

      <div className="mx-auto max-w-[860px] px-4 print:max-w-none print:px-0">
        <div className="sheet relative overflow-hidden rounded-xl border border-border/60 bg-white shadow-card">

          {/* Brand bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-gold via-gold/70 to-gold" />

          {/* ── Header: issuer + document type ─────────────────────────── */}
          <div className="flex flex-wrap items-start justify-between gap-6 px-7 pt-6 sm:px-10">
            <div className="flex min-w-0 items-start gap-4">
              <img src={logo} alt="" className="h-16 w-auto shrink-0 object-contain" />
              <div className="min-w-0">
                <h1 className="font-display text-xl leading-tight text-foreground">{invoice.legalName}</h1>
                {invoice.addressLines.map((line, i) => (
                  <p key={i} className="font-body text-[0.72rem] leading-snug text-muted-foreground">{line}</p>
                ))}
                <p className="mt-0.5 font-body text-[0.72rem] leading-snug text-muted-foreground">
                  {[invoice.phone, invoice.email].filter(Boolean).join("  ·  ")}
                </p>
                {invoice.website && <p className="font-body text-[0.72rem] text-muted-foreground">{invoice.website}</p>}
                {invoice.gstin && (
                  <p className="mt-1 font-body text-[0.72rem] font-semibold text-foreground">GSTIN: {invoice.gstin}</p>
                )}
              </div>
            </div>

            <div className="shrink-0 text-right">
              <p className="font-display text-lg font-bold tracking-[0.14em] text-foreground">{title}</p>
              <span className={`mt-1 inline-block rounded-sm px-2.5 py-1 font-body text-[0.68rem] font-bold tracking-wide ${paid ? "bg-green-600 text-white" : "bg-amber-500 text-white"}`}>
                {paid ? "PAID" : "PAYMENT DUE"}
              </span>
            </div>
          </div>

          {/* ── Invoice meta strip ─────────────────────────────────────── */}
          <div className="mx-7 mt-5 grid gap-x-6 gap-y-2 rounded-lg bg-muted/50 px-4 py-3 sm:mx-10 sm:grid-cols-3">
            <Meta label="Bill No." value={bill.billNumber} strong />
            <Meta label="Bill date" value={niceDate(bill.issuedOn)} />
            {paid
              ? <Meta label="Payment date" value={niceDate(bill.paidOn)} />
              : <Meta label="Status" value="Awaiting payment" />}
            {invoice.placeOfSupply && <Meta label="Place of supply" value={invoice.placeOfSupply} />}
            {bill.paymentMethod && <Meta label="Payment mode" value={bill.paymentMethod.toUpperCase()} />}
            <Meta label="Period" value={bill.periodLabel} />
          </div>

          {/* ── Bill to / for ──────────────────────────────────────────── */}
          <div className="avoid-break mt-5 grid gap-6 px-7 sm:grid-cols-2 sm:px-10">
            <div className="min-w-0">
              <p className="font-body text-[0.66rem] font-bold uppercase tracking-[0.14em] text-gold">Billed to</p>
              <p className="mt-1.5 font-body text-sm font-bold text-foreground">{bill.studentName}</p>
              {bill.studentRollNo && <p className="font-body text-[0.76rem] text-muted-foreground">Roll no. {bill.studentRollNo}</p>}
              {bill.parentName && <p className="font-body text-[0.76rem] text-muted-foreground">C/o {bill.parentName}</p>}
              {bill.parentPhone && <p className="font-body text-[0.76rem] text-muted-foreground">{bill.parentPhone}</p>}
              {bill.address && <p className="mt-0.5 font-body text-[0.74rem] leading-snug text-muted-foreground">{bill.address}</p>}
            </div>
            <div className="min-w-0 sm:text-right">
              <p className="font-body text-[0.66rem] font-bold uppercase tracking-[0.14em] text-gold">Course</p>
              <p className="mt-1.5 font-body text-sm font-bold text-foreground">{bill.className}</p>
              {bill.slotLabel && <p className="font-body text-[0.76rem] text-muted-foreground">Batch: {bill.slotLabel}</p>}
              <p className="font-body text-[0.76rem] text-muted-foreground">SAC {invoice.sacCode}</p>
            </div>
          </div>

          {/* ── Line items ─────────────────────────────────────────────── */}
          <div className="avoid-break mt-5 px-7 sm:px-10">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse">
                <thead>
                  <tr className="bg-foreground text-white">
                    <th className="px-3 py-2 text-left font-body text-[0.68rem] font-bold uppercase tracking-wide">#</th>
                    <th className="px-3 py-2 text-left font-body text-[0.68rem] font-bold uppercase tracking-wide">Description</th>
                    <th className="px-3 py-2 text-right font-body text-[0.68rem] font-bold uppercase tracking-wide">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.lines.filter((line) => !/^GST\s*@/i.test(line.label)).map((line, index) => (
                    <tr key={index} className="border-b border-border/50">
                      <td className="px-3 py-2 font-body text-[0.78rem] text-muted-foreground">{index + 1}</td>
                      <td className="px-3 py-2 font-body text-[0.82rem] text-foreground">{line.label}</td>
                      <td className={`px-3 py-2 text-right font-body text-[0.82rem] tabular-nums ${line.amountInPaise < 0 ? "text-green-700" : "text-foreground"}`}>
                        {line.amountInPaise < 0 ? "−" : ""}{formatPaiseAsRupees(Math.abs(line.amountInPaise))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Totals ─────────────────────────────────────────────────── */}
          <div className="avoid-break mt-4 flex justify-end px-7 sm:px-10">
            <div className="w-full max-w-sm">
              <Row label={bill.gstInPaise > 0 ? "Taxable value" : "Subtotal"} value={formatPaiseAsRupees(bill.taxableInPaise)} />
              {taxLines.map((line) => (
                <Row key={line.label} label={line.label} value={formatPaiseAsRupees(line.amountInPaise)} />
              ))}
              <div className="mt-1.5 flex items-center justify-between gap-4 border-t-2 border-foreground/80 bg-muted/40 px-2 py-2.5">
                <span className="font-display text-base font-bold text-foreground">Total</span>
                <span className="font-display text-lg font-bold tabular-nums text-primary">{formatPaiseAsRupees(bill.totalInPaise)}</span>
              </div>
            </div>
          </div>

          {/* ── Amount in words ────────────────────────────────────────── */}
          <div className="avoid-break mx-7 mt-4 rounded-md border border-border/60 bg-muted/30 px-4 py-2.5 sm:mx-10">
            <span className="font-body text-[0.68rem] font-bold uppercase tracking-wide text-muted-foreground">Amount in words: </span>
            <span className="font-body text-[0.8rem] font-semibold text-foreground">{rupeesInWords(bill.totalInPaise)}</span>
          </div>

          {/* ── Payment details + terms + signature ────────────────────── */}
          <div className="avoid-break mt-5 grid gap-6 px-7 pb-6 sm:grid-cols-2 sm:px-10">
            <div className="min-w-0">
              {!paid && (payment?.upiId || payment?.upiNumber) && (
                <>
                  <p className="font-body text-[0.66rem] font-bold uppercase tracking-[0.14em] text-gold">How to pay</p>
                  {payment.upiId && <p className="mt-1 font-body text-[0.76rem] text-foreground">UPI ID: <span className="font-semibold">{payment.upiId}</span></p>}
                  {payment.upiNumber && <p className="font-body text-[0.76rem] text-foreground">Payment number: <span className="font-semibold">{payment.upiNumber}</span></p>}
                </>
              )}
              {invoice.termsLines.length > 0 && (
                <>
                  <p className={`font-body text-[0.66rem] font-bold uppercase tracking-[0.14em] text-gold ${!paid && (payment?.upiId || payment?.upiNumber) ? "mt-3" : ""}`}>
                    Terms
                  </p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    {invoice.termsLines.map((line, i) => (
                      <li key={i} className="font-body text-[0.7rem] leading-snug text-muted-foreground">{line}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="flex flex-col items-start justify-end sm:items-end">
              <p className="font-body text-[0.7rem] text-muted-foreground">For <span className="font-semibold text-foreground">{invoice.legalName}</span></p>
              <div className="mt-10 w-52 border-t border-foreground/60 pt-1 text-center sm:text-right">
                {invoice.signatoryName && <p className="font-body text-[0.76rem] font-semibold text-foreground">{invoice.signatoryName}</p>}
                <p className="font-body text-[0.68rem] text-muted-foreground">{invoice.signatoryTitle}</p>
              </div>
            </div>
          </div>

          <div className="border-t border-border/60 bg-muted/30 px-7 py-2.5 text-center sm:px-10">
            <p className="font-body text-[0.66rem] text-muted-foreground">
              This is a computer-generated {title.toLowerCase()} and does not require a physical signature.
              {invoice.phone ? ` For any query, call ${invoice.phone}.` : ""}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Meta = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className="min-w-0">
    <p className="font-body text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
    <p className={`truncate font-body text-[0.8rem] ${strong ? "font-bold text-foreground" : "text-foreground"}`}>{value || "—"}</p>
  </div>
);

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between gap-4 px-2 py-1">
    <span className="font-body text-[0.78rem] text-muted-foreground">{label}</span>
    <span className="font-body text-[0.8rem] tabular-nums text-foreground">{value}</span>
  </div>
);

export default Bill;
