import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BadgeIndianRupee, CalendarPlus, Loader2, Users, Wallet, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAdminLog } from "@/hooks/useAdminLog";
import { formatPaiseAsRupees, parsePriceToPaise } from "@/lib/ecommerce";
import {
  deriveDisplayFeeStatus,
  FEE_STATUS_LABELS,
  feeDocMonthKeyFor,
  feePaidStatement,
  getEnrollment,
  listFeesForEnrollment,
  monthKeyFor,
  periodLabel,
  recordFeeForMonth,
  sortFeesByMonthDesc,
  subscribeToFeesAdmin,
  type EnrollmentDoc,
  type FeePaymentDoc,
  type FeePaymentMethod,
  type FeeStatus,
} from "@/lib/classes";
import type { StudentDoc } from "@/lib/students";

// ---------------------------------------------------------------------------
// The "Fee Collections" view of the Student Manager (req): month summary cards
// (Total Students / Paid This Month / Pending / Overdue), status + method
// filters, and a per-student "Record fee" dialog — entry form on top, that
// student's full history below, and a guard against double-collecting a month.
// ---------------------------------------------------------------------------

const inputClass = "w-full px-3 py-2 rounded-md border border-border font-body text-[0.85rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 bg-background";

const statusStyles: Record<FeeStatus, string> = {
  paid: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  overdue: "bg-red-100 text-red-700",
  failed: "bg-red-100 text-red-700",
  waived: "bg-muted text-muted-foreground",
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const toMillis = (value: unknown): number => {
  const ts = value as { toMillis?: () => number } | undefined;
  return typeof ts?.toMillis === "function" ? ts.toMillis() : 0;
};
const feeActivityMillis = (fee: FeePaymentDoc): number =>
  Math.max(toMillis(fee.paidAt), toMillis(fee.upiSubmittedAt), toMillis(fee.updatedAt), toMillis(fee.createdAt));

interface EntryState {
  student: StudentDoc;
  month: string;
  amount: string;
  date: string;
  method: FeePaymentMethod;
  enrollment: EnrollmentDoc | null;
  history: FeePaymentDoc[] | null; // null = still loading
}

interface StudentFeeCollectionsProps {
  students: StudentDoc[];
  adminUid: string;
}

const StudentFeeCollections = ({ students, adminUid }: StudentFeeCollectionsProps) => {
  const { toast } = useToast();
  const logAction = useAdminLog();
  const [monthKey, setMonthKey] = useState(monthKeyFor(new Date()));
  const [fees, setFees] = useState<FeePaymentDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | FeeStatus | "none">("all");
  const [methodFilter, setMethodFilter] = useState<"all" | FeePaymentMethod>("all");
  const [entry, setEntry] = useState<EntryState | null>(null);
  const [savingEntry, setSavingEntry] = useState(false);

  useEffect(() => {
    setLoading(true);
    return subscribeToFeesAdmin(monthKey, (items) => { setFees(items); setLoading(false); }, () => setLoading(false));
  }, [monthKey]);

  const approvedStudents = useMemo(
    () => students.filter((student) => student.onboardingStatus === "approved" && student.enrollmentId),
    [students],
  );

  // ALL of this month's fee docs per enrollment (an enrolment can have several
  // in one month, e.g. the admission payment + a monthly due).
  const feesByEnrollment = useMemo(() => {
    const ids = new Set(approvedStudents.map((student) => student.enrollmentId));
    const map = new Map<string, FeePaymentDoc[]>();
    for (const fee of fees) {
      if (!ids.has(fee.enrollmentId)) continue;
      const list = map.get(fee.enrollmentId) || [];
      list.push(fee);
      map.set(fee.enrollmentId, list);
    }
    for (const list of map.values()) list.sort((a, b) => feeActivityMillis(b) - feeActivityMillis(a));
    return map;
  }, [fees, approvedStudents]);

  const summary = useMemo(() => {
    let paid = 0; let paidInPaise = 0; let pending = 0; let pendingInPaise = 0; let overdue = 0; let overdueInPaise = 0;
    for (const student of approvedStudents) {
      const docs = (student.enrollmentId && feesByEnrollment.get(student.enrollmentId)) || [];
      let hasPaid = false; let hasPending = false; let hasOverdue = false;
      for (const fee of docs) {
        const status = deriveDisplayFeeStatus(fee);
        if (status === "paid") { hasPaid = true; paidInPaise += fee.amountInPaise; }
        else if (status === "overdue") { hasOverdue = true; overdueInPaise += fee.amountInPaise; }
        else if (status === "pending" || status === "processing") { hasPending = true; pendingInPaise += fee.amountInPaise; }
      }
      if (hasPaid) paid += 1;
      if (hasPending) pending += 1;
      if (hasOverdue) overdue += 1;
    }
    return { paid, paidInPaise, pending, pendingInPaise, overdue, overdueInPaise };
  }, [approvedStudents, feesByEnrollment]);

  const rows = useMemo(() => approvedStudents.filter((student) => {
    const docs = (student.enrollmentId && feesByEnrollment.get(student.enrollmentId)) || [];
    if (statusFilter !== "all") {
      if (statusFilter === "none") { if (docs.length > 0) return false; }
      else if (!docs.some((fee) => deriveDisplayFeeStatus(fee) === statusFilter)) return false;
    }
    if (methodFilter !== "all" && !docs.some((fee) => fee.paymentMethod === methodFilter)) return false;
    return true;
  }), [approvedStudents, feesByEnrollment, statusFilter, methodFilter]);

  const openEntry = async (student: StudentDoc) => {
    const base: EntryState = {
      student,
      month: monthKey,
      amount: student.fees.monthlyFeeInPaise > 0 ? String(student.fees.monthlyFeeInPaise / 100) : "",
      date: todayIso(),
      method: "cash",
      enrollment: null,
      history: null,
    };
    setEntry(base);
    if (!student.enrollmentId) return;
    try {
      const [enrollment, history] = await Promise.all([
        getEnrollment(student.enrollmentId),
        listFeesForEnrollment(student.enrollmentId),
      ]);
      setEntry((current) => (current && current.student.id === student.id
        ? { ...current, enrollment, history: sortFeesByMonthDesc(history) }
        : current));
    } catch {
      setEntry((current) => (current && current.student.id === student.id ? { ...current, history: [] } : current));
    }
  };

  // The already-settled record for the picked month (drives the live guard).
  const monthConflict = useMemo(() => {
    if (!entry?.enrollment || !entry.history || !/^\d{4}-\d{2}$/.test(entry.month)) return null;
    const docMonth = feeDocMonthKeyFor(entry.enrollment, entry.month);
    const existing = entry.history.find((fee) => fee.id === `${entry.enrollment!.id}_${docMonth}`);
    if (!existing) return null;
    if (existing.status === "paid") return { fee: existing, kind: "paid" as const };
    if (existing.status === "waived") return { fee: existing, kind: "waived" as const };
    return null;
  }, [entry]);

  const saveEntry = async () => {
    if (!entry?.enrollment) return;
    const amountInPaise = parsePriceToPaise(entry.amount) || 0;
    if (amountInPaise < 100) { toast({ title: "Enter a valid fee amount", variant: "destructive" }); return; }
    if (!/^\d{4}-\d{2}$/.test(entry.month)) { toast({ title: "Pick a fee month", variant: "destructive" }); return; }
    if (monthConflict?.kind === "paid") { toast({ title: `${periodLabel(entry.month)} fee is already paid`, description: "Use the Fees panel's Edit to change that entry instead.", variant: "destructive" }); return; }
    setSavingEntry(true);
    try {
      await recordFeeForMonth(entry.enrollment, {
        feeMonthKey: entry.month,
        amountInPaise,
        paidOn: entry.date || todayIso(),
        method: entry.method,
        adminUid,
      });
      toast({ title: "Fee recorded", description: `${entry.student.name} · ${periodLabel(entry.month)} · ${formatPaiseAsRupees(amountInPaise)}` });
      logAction("Recorded fee", `${entry.student.name}${entry.student.studentId ? ` (${entry.student.studentId})` : ""} · ${periodLabel(entry.month)} · ${formatPaiseAsRupees(amountInPaise)} · ${entry.method}`);
      setEntry(null);
    } catch (error) {
      toast({ title: "Could not record the fee", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSavingEntry(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Month + filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input type="month" value={monthKey} onChange={(e) => setMonthKey(e.target.value || monthKeyFor(new Date()))} className={`${inputClass} sm:max-w-[180px]`} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className={`${inputClass} sm:max-w-[190px]`}>
          <option value="all">Payment status: all</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="overdue">Overdue</option>
          <option value="waived">Waived</option>
          <option value="none">No record this month</option>
        </select>
        <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value as typeof methodFilter)} className={`${inputClass} sm:max-w-[190px]`}>
          <option value="all">Payment method: all</option>
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
          <option value="manual">Manual / online</option>
          <option value="autopay">Autopay</option>
        </select>
      </div>

      {/* Summary cards (req) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
          <p className="flex items-center gap-1.5 font-body text-xs text-muted-foreground"><Users className="h-3.5 w-3.5 text-gold" /> Total students</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">{approvedStudents.length}</p>
          <p className="font-body text-[0.7rem] text-muted-foreground">{approvedStudents.filter((s) => s.active).length} active</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
          <p className="font-body text-xs text-muted-foreground">Paid this month</p>
          <p className="mt-1 font-display text-2xl font-bold text-green-700">{summary.paid}</p>
          <p className="font-body text-[0.7rem] text-muted-foreground">{formatPaiseAsRupees(summary.paidInPaise)}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
          <p className="font-body text-xs text-muted-foreground">Pending</p>
          <p className="mt-1 font-display text-2xl font-bold text-amber-700">{summary.pending}</p>
          <p className="font-body text-[0.7rem] text-muted-foreground">{formatPaiseAsRupees(summary.pendingInPaise)}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
          <p className="font-body text-xs text-muted-foreground">Overdue</p>
          <p className="mt-1 font-display text-2xl font-bold text-red-700">{summary.overdue}</p>
          <p className="font-body text-[0.7rem] text-muted-foreground">{formatPaiseAsRupees(summary.overdueInPaise)}</p>
        </div>
      </div>

      {/* Student rows — caption shows the LATEST entry of the month (req) */}
      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border/60 bg-card p-10"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/60 bg-card p-8 text-center font-body text-sm text-muted-foreground">No students match these filters.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((student) => {
            const docs = (student.enrollmentId && feesByEnrollment.get(student.enrollmentId)) || [];
            const latest = docs[0];
            const status = latest ? deriveDisplayFeeStatus(latest) : null;
            const paidLine = latest ? feePaidStatement(latest) : "";
            return (
              <div key={student.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-card">
                <div className="flex min-w-0 items-center gap-3">
                  {student.photoUrl ? (
                    <img src={student.photoUrl} alt={student.name} className="h-10 w-10 shrink-0 rounded-full border border-border object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/15 font-display text-base text-gold">{(student.name || "?").charAt(0).toUpperCase()}</div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-body text-sm font-semibold text-foreground">
                      {student.name}{student.studentId ? <span className="ml-1.5 font-normal text-gold">{student.studentId}</span> : null}
                    </p>
                    <p className="truncate font-body text-xs text-muted-foreground">{student.className}</p>
                    {latest ? (
                      <p className="font-body text-[0.7rem] text-muted-foreground">
                        Latest: {latest.periodLabel} · {formatPaiseAsRupees(latest.amountInPaise)}{latest.paymentMethod ? ` · ${latest.paymentMethod}` : ""}
                        {paidLine ? <span className="text-green-700"> — {paidLine}</span> : ""}
                        {docs.length > 1 ? <span className="text-gold"> · +{docs.length - 1} more this month</span> : ""}
                      </p>
                    ) : (
                      <p className="font-body text-[0.7rem] text-muted-foreground">No fee record for {periodLabel(monthKey)} yet.</p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {status && <span className={`rounded-full px-2.5 py-1 font-body text-[0.7rem] font-semibold ${statusStyles[status]}`}>{FEE_STATUS_LABELS[status]}</span>}
                  <button onClick={() => openEntry(student)} className="flex items-center gap-1.5 rounded-md bg-gradient-primary px-3 py-1.5 font-body text-[0.72rem] font-semibold text-primary-foreground hover:brightness-110">
                    <CalendarPlus className="h-3.5 w-3.5" /> Record fee
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Record-fee dialog: entry ON TOP, the student's history BELOW (req) */}
      {entry && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setEntry(null)} />
          <div className="relative flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl bg-card shadow-hero">
            <div className="flex items-start justify-between gap-2 border-b border-border/60 p-5 pb-4">
              <div>
                <p className="flex items-center gap-1.5 font-body text-xs font-semibold uppercase tracking-wider text-gold"><Wallet className="h-3.5 w-3.5" /> Record fee</p>
                <h3 className="mt-1 font-display text-lg text-foreground">{entry.student.name}{entry.student.studentId ? <span className="ml-2 font-body text-sm text-gold">{entry.student.studentId}</span> : null}</h3>
                <p className="font-body text-xs text-muted-foreground">{entry.student.className}</p>
              </div>
              <button onClick={() => setEntry(null)} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>

            <div className="overflow-y-auto p-5 pt-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-body text-xs text-muted-foreground">Fee month</label>
                  <input type="month" value={entry.month} onChange={(e) => setEntry({ ...entry, month: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block font-body text-xs text-muted-foreground">Fee (₹)</label>
                  <div className="relative">
                    <BadgeIndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} className={`${inputClass} pl-10`} inputMode="decimal" placeholder="0" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block font-body text-xs text-muted-foreground">Fee date</label>
                  <input type="date" value={entry.date} onChange={(e) => setEntry({ ...entry, date: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block font-body text-xs text-muted-foreground">Method</label>
                  <select value={entry.method} onChange={(e) => setEntry({ ...entry, method: e.target.value as FeePaymentMethod })} className={inputClass}>
                    <option value="cash">Cash / counter</option>
                    <option value="upi">UPI</option>
                  </select>
                </div>
              </div>

              {/* Duplicate-month guard (req): warn before the admin even saves. */}
              {monthConflict && (
                <p className={`mt-3 flex items-start gap-2 rounded-md border p-2.5 font-body text-[0.78rem] ${monthConflict.kind === "paid" ? "border-red-300 bg-red-50 text-red-700" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>
                    {monthConflict.kind === "paid"
                      ? `${periodLabel(entry.month)} fee is ALREADY PAID (${formatPaiseAsRupees(monthConflict.fee.amountInPaise)}${monthConflict.fee.paymentMethod ? ` · ${monthConflict.fee.paymentMethod}` : ""}). Edit that entry from the Fees panel instead.`
                      : `${periodLabel(entry.month)} was waived earlier — saving will not overwrite it.`}
                  </span>
                </p>
              )}

              <button
                onClick={saveEntry}
                disabled={savingEntry || !entry.enrollment || monthConflict?.kind === "paid"}
                className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingEntry ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} Save paid entry
              </button>

              {/* History below the entry (req) */}
              <p className="mt-5 mb-2 font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment history</p>
              {entry.history === null ? (
                <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-gold" /></div>
              ) : entry.history.length === 0 ? (
                <p className="font-body text-xs text-muted-foreground">No fee records yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {entry.history.map((fee) => {
                    const displayStatus = deriveDisplayFeeStatus(fee);
                    const paidLine = feePaidStatement(fee);
                    return (
                      <div key={fee.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/70 px-2.5 py-2">
                        <div className="min-w-0">
                          <p className="truncate font-body text-xs font-medium text-foreground">{fee.periodLabel}</p>
                          <p className="font-body text-[0.68rem] text-muted-foreground">{formatPaiseAsRupees(fee.amountInPaise)}{fee.paymentMethod ? ` · ${fee.paymentMethod}` : ""}{paidLine ? ` — ${paidLine}` : ""}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 font-body text-[0.65rem] font-semibold ${statusStyles[displayStatus]}`}>{FEE_STATUS_LABELS[displayStatus]}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentFeeCollections;
