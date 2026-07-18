import { useEffect, useMemo, useState } from "react";
import { BadgeIndianRupee, CalendarPlus, Loader2, Users, Wallet, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatPaiseAsRupees, parsePriceToPaise } from "@/lib/ecommerce";
import {
  deriveDisplayFeeStatus,
  FEE_STATUS_LABELS,
  feePaidStatement,
  getEnrollment,
  monthKeyFor,
  periodLabel,
  recordFeeForMonth,
  subscribeToFeesAdmin,
  type FeePaymentDoc,
  type FeePaymentMethod,
  type FeeStatus,
} from "@/lib/classes";
import type { StudentDoc } from "@/lib/students";

// ---------------------------------------------------------------------------
// The "Fee Collections" view of the Student Manager (req): month summary cards
// (Total Students / Paid This Month / Pending / Overdue), status + method
// filters, and a one-click "Record fee" per student — kept deliberately simple.
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

interface EntryState {
  student: StudentDoc;
  month: string;
  amount: string;
  date: string;
  method: FeePaymentMethod;
}

interface StudentFeeCollectionsProps {
  students: StudentDoc[];
  adminUid: string;
}

const StudentFeeCollections = ({ students, adminUid }: StudentFeeCollectionsProps) => {
  const { toast } = useToast();
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

  // This month's fee docs, keyed by enrollment (only our Student Manager students).
  const feeByEnrollment = useMemo(() => {
    const ids = new Set(approvedStudents.map((student) => student.enrollmentId));
    const map = new Map<string, FeePaymentDoc>();
    for (const fee of fees) {
      if (!ids.has(fee.enrollmentId)) continue;
      const existing = map.get(fee.enrollmentId);
      // Prefer the paid doc when a month somehow has several records.
      if (!existing || (existing.status !== "paid" && fee.status === "paid")) map.set(fee.enrollmentId, fee);
    }
    return map;
  }, [fees, approvedStudents]);

  const summary = useMemo(() => {
    let paid = 0; let paidInPaise = 0; let pending = 0; let pendingInPaise = 0; let overdue = 0; let overdueInPaise = 0;
    for (const student of approvedStudents) {
      const fee = student.enrollmentId ? feeByEnrollment.get(student.enrollmentId) : undefined;
      if (!fee) continue;
      const status = deriveDisplayFeeStatus(fee);
      if (status === "paid") { paid += 1; paidInPaise += fee.amountInPaise; }
      else if (status === "overdue") { overdue += 1; overdueInPaise += fee.amountInPaise; }
      else if (status === "pending" || status === "processing") { pending += 1; pendingInPaise += fee.amountInPaise; }
    }
    return { paid, paidInPaise, pending, pendingInPaise, overdue, overdueInPaise };
  }, [approvedStudents, feeByEnrollment]);

  const rows = useMemo(() => approvedStudents.filter((student) => {
    const fee = student.enrollmentId ? feeByEnrollment.get(student.enrollmentId) : undefined;
    if (statusFilter !== "all") {
      if (statusFilter === "none") { if (fee) return false; }
      else if (!fee || deriveDisplayFeeStatus(fee) !== statusFilter) return false;
    }
    if (methodFilter !== "all" && (!fee || fee.paymentMethod !== methodFilter)) return false;
    return true;
  }), [approvedStudents, feeByEnrollment, statusFilter, methodFilter]);

  const openEntry = (student: StudentDoc) => setEntry({
    student,
    month: monthKey,
    amount: student.fees.monthlyFeeInPaise > 0 ? String(student.fees.monthlyFeeInPaise / 100) : "",
    date: todayIso(),
    method: "cash",
  });

  const saveEntry = async () => {
    if (!entry?.student.enrollmentId) return;
    const amountInPaise = parsePriceToPaise(entry.amount) || 0;
    if (amountInPaise < 100) { toast({ title: "Enter a valid fee amount", variant: "destructive" }); return; }
    if (!/^\d{4}-\d{2}$/.test(entry.month)) { toast({ title: "Pick a fee month", variant: "destructive" }); return; }
    setSavingEntry(true);
    try {
      const enrollment = await getEnrollment(entry.student.enrollmentId);
      if (!enrollment) throw new Error("The student's enrollment could not be loaded.");
      await recordFeeForMonth(enrollment, {
        feeMonthKey: entry.month,
        amountInPaise,
        paidOn: entry.date || todayIso(),
        method: entry.method,
        adminUid,
      });
      toast({ title: "Fee recorded", description: `${entry.student.name} · ${periodLabel(entry.month)} · ${formatPaiseAsRupees(amountInPaise)}` });
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

      {/* Student rows */}
      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border/60 bg-card p-10"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/60 bg-card p-8 text-center font-body text-sm text-muted-foreground">No students match these filters.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((student) => {
            const fee = student.enrollmentId ? feeByEnrollment.get(student.enrollmentId) : undefined;
            const status = fee ? deriveDisplayFeeStatus(fee) : null;
            const paidLine = fee ? feePaidStatement(fee) : "";
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
                    {fee ? (
                      <p className="font-body text-[0.7rem] text-muted-foreground">
                        {fee.periodLabel} · {formatPaiseAsRupees(fee.amountInPaise)}{fee.paymentMethod ? ` · ${fee.paymentMethod}` : ""}
                        {paidLine ? <span className="text-green-700"> — {paidLine}</span> : ""}
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

      {/* Record-fee dialog: fee month | fee ₹ | fee date (default today) */}
      {entry && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setEntry(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-card p-5 shadow-hero">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-1.5 font-body text-xs font-semibold uppercase tracking-wider text-gold"><Wallet className="h-3.5 w-3.5" /> Record fee</p>
                <h3 className="mt-1 font-display text-lg text-foreground">{entry.student.name}</h3>
                <p className="font-body text-xs text-muted-foreground">{entry.student.className}</p>
              </div>
              <button onClick={() => setEntry(null)} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-4 space-y-3">
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
            <button onClick={saveEntry} disabled={savingEntry} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
              {savingEntry ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} Save paid entry
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentFeeCollections;
