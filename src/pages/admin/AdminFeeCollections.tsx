import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BellRing, Banknote, Download, IndianRupee, Search, XCircle, Trash2, LayoutGrid, List, X, Check, ExternalLink, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useScrollHighlight } from "@/hooks/useScrollHighlight";
import { createPortal } from "react-dom";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import {
  deriveDisplayFeeStatus,
  FEE_PAYMENT_METHOD_LABELS,
  FEE_STATUS_LABELS,
  deleteFee,
  formatMonthRange,
  formatNiceDate,
  approveUpiPayment,
  markFeeCash,
  monthKeyFor,
  notifyClassFee,
  periodLabel,
  subscribeToEnrollmentsAdmin,
  subscribeToFeesAdmin,
  subscribeToPendingUpiApprovals,
  summarizeFees,
  waiveFee,
  type EnrollmentDoc,
  type FeePaymentDoc,
  type FeePaymentMethod,
  type FeeStatus,
} from "@/lib/classes";

// A "Term Fee" is a one-off full-course payment — its fee-doc id ends with
// "_full" (or "_advance" for a pre-paid first cycle).
const isTermFee = (fee: FeePaymentDoc): boolean => /_(full|advance)$/.test(fee.id);

// What to show in the Method column / filter — surfaces "Term Fee" for full
// course payments, otherwise the stored method.
const feeMethodLabel = (fee: FeePaymentDoc): string => {
  if (isTermFee(fee)) return "Term Fee";
  return fee.paymentMethod ? FEE_PAYMENT_METHOD_LABELS[fee.paymentMethod] : "—";
};

const statusStyles: Record<FeeStatus, string> = {
  paid: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  overdue: "bg-red-100 text-red-700",
  failed: "bg-red-100 text-red-700",
  waived: "bg-muted text-muted-foreground",
};

const formatTimestamp = (value: unknown): string => {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toLocaleDateString("en-IN");
  }
  return "";
};

const Tile = ({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) => (
  <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
    <p className="font-body text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`mt-1 font-display text-2xl font-bold ${accent}`}>{value}</p>
    <p className="font-body text-xs text-muted-foreground">{sub}</p>
  </div>
);

const AdminFeeCollections = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  // A deep-linked fee id (`<enrollmentId>_<YYYY-MM>`) carries its month — open it.
  const [monthKey, setMonthKey] = useState(() => {
    const monthMatch = searchParams.get("fee")?.match(/_(\d{4}-\d{2})$/);
    return monthMatch ? monthMatch[1] : monthKeyFor(new Date());
  });
  const [fees, setFees] = useState<FeePaymentDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | FeeStatus>("all");
  const [methodFilter, setMethodFilter] = useState<"all" | FeePaymentMethod | "term">("all");
  const [view, setView] = useState<"table" | "grid">("grid");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [enrollmentsById, setEnrollmentsById] = useState<Map<string, EnrollmentDoc>>(new Map());
  const [selectedFee, setSelectedFee] = useState<FeePaymentDoc | null>(null);
  const [approvals, setApprovals] = useState<FeePaymentDoc[]>([]);
  const [busyApprovalId, setBusyApprovalId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    return subscribeToFeesAdmin(monthKey, (items) => { setFees(items); setLoading(false); }, () => setLoading(false));
  }, [monthKey]);

  // Manual-UPI payments awaiting approval (across all months).
  useEffect(() => subscribeToPendingUpiApprovals(
    (items) => setApprovals(items),
    (error) => console.error("Unable to load UPI approvals", error),
  ), []);

  const handleApproval = async (fee: FeePaymentDoc, approve: boolean) => {
    if (!user) return;
    if (!approve && !confirm(`Reject ${fee.studentName}'s payment for ${fee.periodLabel}? They'll be asked to pay again.`)) return;
    setBusyApprovalId(fee.id);
    try {
      const idToken = await user.getIdToken();
      const note = approve ? undefined : (prompt("Reason for rejection (optional):") || undefined);
      await approveUpiPayment(idToken, fee.id, approve, note);
      toast({ title: approve ? "Payment approved" : "Payment rejected", description: `${fee.studentName} · ${fee.periodLabel}` });
    } catch (error) {
      toast({ title: "Action failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyApprovalId(null);
    }
  };

  // Enrolments carry the batch time + next charge date + term span the fee
  // detail popup shows; keep a live id→enrolment map.
  useEffect(() => subscribeToEnrollmentsAdmin(
    (items) => setEnrollmentsById(new Map(items.map((item) => [item.id, item]))),
    (error) => console.error("Unable to load enrollments", error),
  ), []);

  // Deep link from WhatsApp admin fee notifications: /admin/fee-collections?fee=<feePaymentId>
  useScrollHighlight("fee", !loading);

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    fees.forEach((fee) => { if (fee.classId) map.set(fee.classId, fee.className); });
    return Array.from(map.entries());
  }, [fees]);

  const totals = useMemo(() => summarizeFees(fees), [fees]);

  const visible = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return fees
      .filter((fee) => classFilter === "all" || fee.classId === classFilter)
      .filter((fee) => statusFilter === "all" || deriveDisplayFeeStatus(fee) === statusFilter)
      .filter((fee) => methodFilter === "all" || (methodFilter === "term" ? isTermFee(fee) : (!isTermFee(fee) && fee.paymentMethod === methodFilter)))
      .filter((fee) => !normalizedSearch || [fee.studentName, fee.parentName, fee.parentPhone, fee.className]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedSearch)))
      .sort((a, b) => a.studentName.localeCompare(b.studentName));
  }, [fees, classFilter, statusFilter, methodFilter, search]);

  const runAction = async (label: string, feeId: string, action: () => Promise<void>) => {
    setBusyId(feeId);
    try {
      await action();
      toast({ title: label });
    } catch (error) {
      console.error(label, error);
      toast({ title: "Action failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const resendReminder = async (fee: FeePaymentDoc) => {
    if (!user) return;
    setBusyId(fee.id);
    try {
      const idToken = await user.getIdToken();
      await notifyClassFee(idToken, fee.id, "fee-reminder");
      toast({ title: "Reminder sent", description: `${fee.studentName} · ${fee.periodLabel}` });
    } catch (error) {
      toast({ title: "Could not send reminder", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    const header = ["Student", "Class", "Parent", "Phone", "Period", "Amount (₹)", "Status", "Method", "Paid On", "Due Date"];
    const rows = visible.map((fee) => [
      fee.studentName,
      fee.className,
      fee.parentName,
      fee.parentPhone,
      fee.periodLabel,
      String(Math.round(fee.amountInPaise / 100)),
      FEE_STATUS_LABELS[deriveDisplayFeeStatus(fee)],
      fee.paymentMethod || "",
      formatTimestamp(fee.paidAt),
      fee.dueDate,
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fee-collections-${monthKey}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">Classes</p>
          <h1 className="mt-2 font-display text-3xl text-foreground">Fee Collections</h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">Who paid, who's pending or overdue — for {periodLabel(monthKey)}.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={monthKey} onChange={(event) => setMonthKey(event.target.value || monthKey)} className="h-10 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold" />
          <button onClick={exportCsv} disabled={visible.length === 0} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 font-body text-sm hover:bg-muted disabled:opacity-50">
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Collected" value={formatPaiseAsRupees(totals.collectedInPaise)} sub={`${totals.paidCount} paid`} accent="text-green-600" />
        <Tile label="Pending" value={formatPaiseAsRupees(totals.pendingInPaise)} sub={`${totals.pendingCount} pending`} accent="text-amber-600" />
        <Tile label="Overdue" value={formatPaiseAsRupees(totals.overdueInPaise)} sub={`${totals.overdueCount} overdue · ${totals.failedCount} failed`} accent="text-red-600" />
      </div>

      {/* Manual-UPI payments awaiting approval (across all months) */}
      {approvals.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 shadow-card">
          <h2 className="flex items-center gap-2 font-display text-lg text-foreground">
            <Banknote className="h-5 w-5 text-blue-600" /> UPI payments to approve
            <span className="rounded-full bg-blue-600 px-2 py-0.5 font-body text-xs font-bold text-white">{approvals.length}</span>
          </h2>
          <p className="mt-1 font-body text-sm text-muted-foreground">Students paid by UPI and uploaded a receipt. Verify the screenshot, then approve to mark it paid and confirm the enrolment.</p>
          <div className="mt-3 space-y-2">
            {approvals.map((fee) => (
              <div key={fee.id} className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  {fee.upiProofUrl && (
                    <a href={fee.upiProofUrl} target="_blank" rel="noreferrer" className="group relative shrink-0">
                      <img src={fee.upiProofUrl} alt="Receipt" className="h-14 w-14 rounded object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center rounded bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"><ExternalLink className="h-4 w-4 text-white" /></span>
                    </a>
                  )}
                  <div>
                    <p className="font-body text-sm font-semibold text-foreground">{fee.studentName} <span className="font-normal text-muted-foreground">· {fee.className}</span></p>
                    <p className="font-body text-xs text-muted-foreground">{fee.periodLabel} · <span className="font-semibold text-foreground">{formatPaiseAsRupees(fee.amountInPaise)}</span>{fee.upiRef ? ` · Ref ${fee.upiRef}` : ""}</p>
                    <p className="font-body text-[0.7rem] text-muted-foreground">{fee.parentName} · {fee.parentPhone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleApproval(fee, true)} disabled={busyApprovalId === fee.id} className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 font-body text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                    {busyApprovalId === fee.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
                  </button>
                  <button onClick={() => handleApproval(fee, false)} disabled={busyApprovalId === fee.id} className="flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 font-body text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50">
                    <XCircle className="h-4 w-4" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-card sm:flex-row sm:items-center">
        <label className="relative block flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, parent, phone…" className="h-10 w-full rounded-md border border-border bg-background pl-10 pr-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20" />
        </label>
        <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)} className="h-10 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold">
          <option value="all">All classes</option>
          {classOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="h-10 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold">
          <option value="all">Payment Status</option>
          {Object.entries(FEE_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value as typeof methodFilter)} className="h-10 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold">
          <option value="all">Payment Method</option>
          {Object.entries(FEE_PAYMENT_METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          <option value="term">Term Fee</option>
        </select>
        <div className="flex h-10 items-center rounded-md border border-border bg-background p-1">
          <button onClick={() => setView("table")} className={`rounded p-1.5 ${view === "table" ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`} title="Table View">
            <List className="h-4 w-4" />
          </button>
          <button onClick={() => setView("grid")} className={`rounded p-1.5 ${view === "grid" ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`} title="Grid View">
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="font-body text-sm text-muted-foreground">Loading fee records…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-gold/15 bg-card p-10 text-center shadow-card">
          <IndianRupee className="mx-auto mb-3 h-10 w-10 text-gold" />
          <h3 className="font-display text-xl text-foreground">No fee records for {periodLabel(monthKey)}</h3>
          <p className="mt-1 font-body text-sm text-muted-foreground">Fee rows appear once enrolments roll into this month (the daily cron creates them) or after a payment.</p>
        </div>
      ) : view === "table" ? (
        <div className="overflow-hidden rounded-lg bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-muted/50">
                  {["Student", "Class", "Parent", "Amount", "Status", "Method", "Actions"].map((heading) => (
                    <th key={heading} className="px-4 py-3 font-body text-[0.72rem] font-medium uppercase tracking-wider text-muted-foreground">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((fee) => {
                  const displayStatus = deriveDisplayFeeStatus(fee);
                  const settled = displayStatus === "paid" || displayStatus === "waived";
                  return (
                    <tr key={fee.id} id={`fee-${fee.id}`} onClick={() => setSelectedFee(fee)} className="cursor-pointer border-b border-border/50 hover:bg-muted/20 scroll-mt-28">
                      <td className="px-4 py-3 font-body text-sm font-medium text-foreground">{fee.studentName}</td>
                      <td className="px-4 py-3 font-body text-sm text-foreground">{fee.className}</td>
                      <td className="px-4 py-3">
                        <p className="font-body text-sm text-foreground">{fee.parentName}</p>
                        <p className="font-body text-xs text-muted-foreground">{fee.parentPhone}</p>
                      </td>
                      <td className="px-4 py-3 font-display text-sm font-bold text-primary">{formatPaiseAsRupees(fee.amountInPaise)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 font-body text-[0.7rem] ${statusStyles[displayStatus]}`}>{FEE_STATUS_LABELS[displayStatus]}</span>
                        {fee.paidAt && <p className="mt-0.5 font-body text-[0.65rem] text-muted-foreground">{formatTimestamp(fee.paidAt)}</p>}
                      </td>
                      <td className="px-4 py-3 font-body text-xs text-muted-foreground">{feeMethodLabel(fee)}</td>
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                        <div className="flex flex-wrap gap-1">
                          {!settled && (
                            <button onClick={() => runAction("Marked as cash paid", fee.id, () => markFeeCash(fee.id))} disabled={busyId === fee.id} className="flex items-center gap-1 rounded border border-green-300 px-2 py-1 font-body text-[0.7rem] text-green-700 hover:bg-green-50 disabled:opacity-50" title="Mark cash paid">
                              <Banknote className="h-3.5 w-3.5" /> Cash
                            </button>
                          )}
                          {!settled && (
                            <button onClick={() => { if (confirm(`Waive ${fee.periodLabel} for ${fee.studentName}?`)) runAction("Month waived", fee.id, () => waiveFee(fee.id)); }} disabled={busyId === fee.id} className="flex items-center gap-1 rounded border border-border px-2 py-1 font-body text-[0.7rem] text-muted-foreground hover:bg-muted disabled:opacity-50" title="Waive month">
                              <XCircle className="h-3.5 w-3.5" /> Waive
                            </button>
                          )}
                          {!settled && (
                            <button onClick={() => resendReminder(fee)} disabled={busyId === fee.id} className="flex items-center gap-1 rounded border border-gold/40 px-2 py-1 font-body text-[0.7rem] text-gold hover:bg-gold/10 disabled:opacity-50" title="Re-send reminder">
                              <BellRing className="h-3.5 w-3.5" /> Remind
                            </button>
                          )}
                          <button onClick={() => { if (confirm(`Are you sure you want to completely delete the fee record for ${fee.studentName}? This cannot be undone.`)) runAction("Fee record deleted", fee.id, () => deleteFee(fee.id)); }} disabled={busyId === fee.id} className="flex items-center gap-1 rounded border border-border px-2 py-1 font-body text-[0.7rem] text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((fee) => {
            const displayStatus = deriveDisplayFeeStatus(fee);
            const settled = displayStatus === "paid" || displayStatus === "waived";
            return (
              <div key={fee.id} id={`fee-${fee.id}`} onClick={() => setSelectedFee(fee)} className="flex cursor-pointer flex-col justify-between rounded-xl border border-border/60 bg-card p-5 shadow-card transition-colors hover:border-gold/30 scroll-mt-28">
                <div>
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <h4 className="font-display text-lg font-semibold text-foreground">{fee.studentName}</h4>
                      <p className="font-body text-xs text-muted-foreground">{fee.className}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 font-body text-[0.7rem] ${statusStyles[displayStatus]}`}>{FEE_STATUS_LABELS[displayStatus]}</span>
                  </div>
                  <div className="my-4 space-y-1 font-body text-[0.8rem]">
                    <div className="flex justify-between border-b border-border/50 pb-1">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-display font-bold text-primary">{formatPaiseAsRupees(fee.amountInPaise)}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/50 py-1">
                      <span className="text-muted-foreground">Parent</span>
                      <span className="text-foreground text-right">{fee.parentName}<br/><span className="text-[0.7rem] text-muted-foreground">{fee.parentPhone}</span></span>
                    </div>
                    <div className="flex justify-between border-b border-border/50 py-1">
                      <span className="text-muted-foreground">Method</span>
                      <span className="text-foreground">{feeMethodLabel(fee)}</span>
                    </div>
                    {(fee.slotLabel || enrollmentsById.get(fee.enrollmentId)?.slotLabel) && (
                      <div className="flex justify-between border-b border-border/50 py-1">
                        <span className="text-muted-foreground">Class Timing</span>
                        <span className="text-foreground text-right">{fee.slotLabel || enrollmentsById.get(fee.enrollmentId)?.slotLabel}</span>
                      </div>
                    )}
                    {fee.paidAt && (
                      <div className="flex justify-between pt-1">
                        <span className="text-muted-foreground">Paid On</span>
                        <span className="text-foreground">{formatTimestamp(fee.paidAt)}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                  {!settled && (
                    <button onClick={() => runAction("Marked as cash paid", fee.id, () => markFeeCash(fee.id))} disabled={busyId === fee.id} className="flex flex-1 items-center justify-center gap-1 rounded border border-green-300 px-2 py-1.5 font-body text-[0.75rem] font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50">
                      <Banknote className="h-3.5 w-3.5" /> Cash
                    </button>
                  )}
                  {!settled && (
                    <button onClick={() => { if (confirm(`Waive ${fee.periodLabel} for ${fee.studentName}?`)) runAction("Month waived", fee.id, () => waiveFee(fee.id)); }} disabled={busyId === fee.id} className="flex flex-1 items-center justify-center gap-1 rounded border border-border px-2 py-1.5 font-body text-[0.75rem] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50">
                      <XCircle className="h-3.5 w-3.5" /> Waive
                    </button>
                  )}
                  {!settled && (
                    <button onClick={() => resendReminder(fee)} disabled={busyId === fee.id} className="flex flex-1 items-center justify-center gap-1 rounded border border-gold/40 px-2 py-1.5 font-body text-[0.75rem] font-semibold text-gold hover:bg-gold/10 disabled:opacity-50">
                      <BellRing className="h-3.5 w-3.5" /> Remind
                    </button>
                  )}
                  <button onClick={() => { if (confirm(`Are you sure you want to completely delete the fee record for ${fee.studentName}? This cannot be undone.`)) runAction("Fee record deleted", fee.id, () => deleteFee(fee.id)); }} disabled={busyId === fee.id} className="flex flex-1 items-center justify-center gap-1 rounded border border-border px-2 py-1.5 font-body text-[0.75rem] font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedFee && createPortal(
        (() => {
          const fee = selectedFee;
          const enrollment = enrollmentsById.get(fee.enrollmentId);
          const displayStatus = deriveDisplayFeeStatus(fee);
          const termFee = isTermFee(fee);
          // Prefer the values denormalized onto the fee doc itself (always present,
          // even for today's payments), falling back to the live enrolment.
          const batch = fee.slotLabel || enrollment?.slotLabel || "—";
          const billingPeriod = fee.billingPeriodLabel
            || (enrollment ? formatMonthRange(enrollment.billingStartMonth || enrollment.termStartDate, enrollment.billingEndMonth || enrollment.termEndDate) : "")
            || fee.periodLabel
            || "—";
          const nextCharge = fee.nextChargeDate || enrollment?.nextChargeDate || "";
          const rows: [string, string][] = [
            ["Student", fee.studentName],
            ["Class", fee.className],
            ["Class Timing", batch],
            ["Amount", formatPaiseAsRupees(fee.amountInPaise)],
            ["Status", FEE_STATUS_LABELS[displayStatus]],
            ["Payment method", feeMethodLabel(fee)],
            ["Billing Period", `${billingPeriod}${termFee && displayStatus === "paid" ? " · Paid" : ""}`],
            ["Next Charge Date", nextCharge ? formatNiceDate(nextCharge) : "—"],
            ["Paid On", formatTimestamp(fee.paidAt) || "—"],
            ["Parent", `${fee.parentName} · ${fee.parentPhone}`],
          ];
          return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto p-4">
              <div className="fixed inset-0 bg-black/40" onClick={() => setSelectedFee(null)} />
              <div className="relative mx-4 w-full max-w-md rounded-xl bg-card p-6 shadow-hero">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-display text-xl text-foreground">{termFee ? "Term Fee" : "Fee"} details</h3>
                  <button onClick={() => setSelectedFee(null)} aria-label="Close"><X className="h-5 w-5" /></button>
                </div>
                <dl className="space-y-2 font-body text-sm">
                  {rows.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 border-b border-border/40 pb-2">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="text-right font-medium text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          );
        })(),
        document.body
      )}
    </div>
  );
};

export default AdminFeeCollections;
