import { useCallback, useEffect, useState } from "react";
import { BadgeIndianRupee, CalendarPlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAdminLog } from "@/hooks/useAdminLog";
import { confirmDialog } from "@/components/ConfirmDialogHost";
import { formatPaiseAsRupees, parsePriceToPaise } from "@/lib/ecommerce";
import {
  deriveDisplayFeeStatus,
  FEE_STATUS_LABELS,
  feePaidStatement,
  getEnrollment,
  isPrepaymentEnrollment,
  listFeesForEnrollment,
  markFeePaidWithDate,
  monthKeyFor,
  periodLabel,
  recordFeeForMonth,
  sortFeesByMonthDesc,
  waiveFee,
  deleteFee,
  type EnrollmentDoc,
  type FeePaymentDoc,
  type FeePaymentMethod,
  type FeeStatus,
} from "@/lib/classes";
import type { StudentDoc } from "@/lib/students";

// ---------------------------------------------------------------------------
// Per-student fee collection tab inside the Student Manager (req): the admin
// sees the full ledger and can record payments right here — including ADVANCE
// months — with "fee month | fee ₹ | fee date (default today, editable)".
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

// Firestore Timestamp / Date / string → "YYYY-MM-DD" (for the edit prefill).
const toDateInput = (value: unknown): string => {
  const ts = value as { toDate?: () => Date } | undefined;
  const date = typeof ts?.toDate === "function" ? ts.toDate() : value instanceof Date ? value : null;
  if (!date || Number.isNaN(date.getTime())) return todayIso();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

interface StudentFeePanelProps {
  student: StudentDoc;
  adminUid: string;
}

const StudentFeePanel = ({ student, adminUid }: StudentFeePanelProps) => {
  const { toast } = useToast();
  const logAction = useAdminLog();
  const studentLabel = `${student.name}${student.studentId ? ` (${student.studentId})` : ""}`;
  const [enrollment, setEnrollment] = useState<EnrollmentDoc | null>(null);
  const [fees, setFees] = useState<FeePaymentDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Add-entry form (the "most important thing"): month | ₹ | date | method.
  const [entryMonth, setEntryMonth] = useState(monthKeyFor(new Date()));
  const [entryAmount, setEntryAmount] = useState(student.fees.monthlyFeeInPaise > 0 ? String(student.fees.monthlyFeeInPaise / 100) : "");
  const [entryDate, setEntryDate] = useState(todayIso());
  const [entryMethod, setEntryMethod] = useState<FeePaymentMethod>("cash");
  const [adding, setAdding] = useState(false);

  // Mark-paid mini form state, keyed by fee id.
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayIso());
  const [payMethod, setPayMethod] = useState<FeePaymentMethod>("cash");

  const refresh = useCallback(async () => {
    if (!student.enrollmentId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [enr, feeList] = await Promise.all([
        getEnrollment(student.enrollmentId),
        listFeesForEnrollment(student.enrollmentId),
      ]);
      setEnrollment(enr);
      setFees(sortFeesByMonthDesc(feeList));
    } catch (error) {
      toast({ title: "Could not load the fee history", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [student.enrollmentId, toast]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleAddEntry = async () => {
    if (!enrollment) return;
    const amountInPaise = parsePriceToPaise(entryAmount) || 0;
    if (amountInPaise < 100) { toast({ title: "Enter a valid fee amount", variant: "destructive" }); return; }
    if (!/^\d{4}-\d{2}$/.test(entryMonth)) { toast({ title: "Pick a fee month", variant: "destructive" }); return; }
    setAdding(true);
    try {
      await recordFeeForMonth(enrollment, {
        feeMonthKey: entryMonth,
        amountInPaise,
        paidOn: entryDate || todayIso(),
        method: entryMethod,
        adminUid,
      });
      toast({ title: "Fee entry added", description: `${periodLabel(entryMonth)} · ${formatPaiseAsRupees(amountInPaise)} recorded as paid.` });
      logAction("Recorded fee", `${studentLabel} · ${periodLabel(entryMonth)} · ${formatPaiseAsRupees(amountInPaise)} · ${entryMethod}`);
      await refresh();
    } catch (error) {
      toast({ title: "Could not add the entry", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const openMarkPaid = (fee: FeePaymentDoc) => {
    setPayingId(fee.id);
    setPayAmount(String(fee.amountInPaise / 100));
    // Editing a PAID entry keeps its recorded date/method; new collections default to today/cash.
    setPayDate(fee.status === "paid" ? toDateInput(fee.paidAt) : todayIso());
    setPayMethod(fee.status === "paid" && (fee.paymentMethod === "upi" || fee.paymentMethod === "cash") ? fee.paymentMethod : "cash");
  };

  const handleMarkPaid = async (fee: FeePaymentDoc) => {
    const amountInPaise = parsePriceToPaise(payAmount) || 0;
    if (amountInPaise < 100) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    setBusyId(fee.id);
    try {
      const wasEdit = fee.status === "paid";
      await markFeePaidWithDate(fee.id, { amountInPaise, paidOn: payDate || todayIso(), method: payMethod, adminUid });
      toast({ title: wasEdit ? "Entry updated" : "Marked paid", description: `${fee.periodLabel} · ${formatPaiseAsRupees(amountInPaise)}` });
      logAction(wasEdit ? "Edited fee entry" : "Marked fee paid", `${studentLabel} · ${fee.periodLabel} · ${formatPaiseAsRupees(amountInPaise)} · ${payMethod}`);
      setPayingId(null);
      await refresh();
    } catch (error) {
      toast({ title: "Could not mark paid", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleWaive = async (fee: FeePaymentDoc) => {
    if (!(await confirmDialog({
      title: `Waive ${fee.periodLabel}?`,
      description: "The student won't be asked to pay this month. The record stays in the ledger as waived.",
      confirmText: "Waive month",
    }))) return;
    setBusyId(fee.id);
    try {
      await waiveFee(fee.id, "Waived from Student Manager");
      logAction("Waived fee", `${studentLabel} · ${fee.periodLabel}`);
      await refresh();
    } catch (error) {
      toast({ title: "Could not waive", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (fee: FeePaymentDoc) => {
    if (!(await confirmDialog({
      title: `Delete the ${fee.periodLabel} record?`,
      description: "Prefer Waive — a deleted monthly due can regenerate on the next roll-forward.",
      confirmText: "Delete record",
      destructive: true,
    }))) return;
    setBusyId(fee.id);
    try {
      await deleteFee(fee.id);
      logAction("Deleted fee record", `${studentLabel} · ${fee.periodLabel} · ${formatPaiseAsRupees(fee.amountInPaise)}`);
      await refresh();
    } catch (error) {
      toast({ title: "Could not delete", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  if (!student.enrollmentId) {
    return <p className="mt-2 rounded-lg border border-dashed border-border p-4 font-body text-xs text-muted-foreground">Fees appear here after the student is approved.</p>;
  }

  return (
    <div className="mt-3 rounded-lg border border-border/60 bg-background/60 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-body text-sm font-semibold text-foreground">Fee collections</p>
        <button onClick={refresh} disabled={loading} className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 font-body text-[0.72rem] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Add fee entry: month | ₹ | date (default today, editable) | method */}
      {student.fees.track === "monthly" && (
        <div className="mt-3 rounded-lg border border-gold/25 bg-gold/5 p-3">
          <p className="flex items-center gap-1.5 font-body text-xs font-semibold text-foreground"><CalendarPlus className="h-3.5 w-3.5 text-gold" /> Add fee entry (collected in advance / at the counter)</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
            <div>
              <label className="mb-1 block font-body text-[0.7rem] text-muted-foreground">Fee month</label>
              <input type="month" value={entryMonth} onChange={(e) => setEntryMonth(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block font-body text-[0.7rem] text-muted-foreground">Fee (₹)</label>
              <div className="relative">
                <BadgeIndianRupee className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input value={entryAmount} onChange={(e) => setEntryAmount(e.target.value)} className={`${inputClass} pl-8`} inputMode="decimal" placeholder="0" />
              </div>
            </div>
            <div>
              <label className="mb-1 block font-body text-[0.7rem] text-muted-foreground">Fee date</label>
              <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block font-body text-[0.7rem] text-muted-foreground">Method</label>
              <select value={entryMethod} onChange={(e) => setEntryMethod(e.target.value as FeePaymentMethod)} className={inputClass}>
                <option value="cash">Cash / counter</option>
                <option value="upi">UPI</option>
              </select>
            </div>
          </div>
          <button onClick={handleAddEntry} disabled={adding || !enrollment} className="mt-2 flex items-center gap-1.5 rounded-md bg-gradient-primary px-4 py-1.5 font-body text-xs font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />} Add paid entry
          </button>
          {enrollment && isPrepaymentEnrollment(enrollment) && (
            <p className="mt-1.5 font-body text-[0.68rem] text-muted-foreground">This student bills in arrears — the entry is stored on the correct collection month automatically, so it never double-bills.</p>
          )}
        </div>
      )}

      {/* Ledger */}
      {loading ? (
        <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gold" /></div>
      ) : fees.length === 0 ? (
        <p className="mt-3 font-body text-xs text-muted-foreground">No fee records yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {fees.map((fee) => {
            const displayStatus = deriveDisplayFeeStatus(fee);
            const payable = displayStatus !== "paid" && displayStatus !== "waived";
            const paidLine = feePaidStatement(fee);
            return (
              <div key={fee.id} className="rounded-lg border border-border/60 bg-card px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-body text-sm font-medium text-foreground">{fee.periodLabel}</p>
                    <p className="font-body text-xs text-muted-foreground">
                      {formatPaiseAsRupees(fee.amountInPaise)}{fee.paymentMethod ? ` · ${fee.paymentMethod}` : ""}{fee.dueDate && !paidLine ? ` · due ${fee.dueDate}` : ""}
                    </p>
                    {paidLine && <p className="font-body text-[0.7rem] font-medium text-green-700">{paidLine}</p>}
                    {fee.adminNote && displayStatus !== "paid" && <p className="font-body text-[0.7rem] text-amber-700">{fee.adminNote}</p>}
                    {/* Only itemise a real split — a single row restating the
                        total (a plain monthly fee) adds nothing. */}
                    {(fee.breakdown || []).length > 0
                      && !((fee.breakdown || []).length === 1 && fee.breakdown![0].amountInPaise === fee.amountInPaise) && (
                      <div className="mt-1 rounded-md bg-muted/50 px-2 py-1.5">
                        {(fee.breakdown || []).map((row, i) => (
                          <div key={i} className="flex justify-between gap-3 font-body text-[0.7rem] text-muted-foreground">
                            <span>{row.label}</span>
                            <span className={row.amountInPaise < 0 ? "text-green-700" : ""}>{row.amountInPaise < 0 ? "−" : ""}{formatPaiseAsRupees(Math.abs(row.amountInPaise))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className={`rounded-full px-2.5 py-1 font-body text-[0.7rem] font-semibold ${statusStyles[displayStatus]}`}>{FEE_STATUS_LABELS[displayStatus]}</span>
                    {payable && (
                      <button onClick={() => (payingId === fee.id ? setPayingId(null) : openMarkPaid(fee))} disabled={busyId === fee.id} className="rounded-md border border-gold/40 px-2.5 py-1 font-body text-[0.7rem] font-semibold text-gold hover:bg-gold/10 disabled:opacity-50">
                        Mark paid
                      </button>
                    )}
                    {/* Edit a recorded payment (req): amount, paid date, method */}
                    {displayStatus === "paid" && (
                      <button onClick={() => (payingId === fee.id ? setPayingId(null) : openMarkPaid(fee))} disabled={busyId === fee.id} className="rounded-md border border-gold/40 px-2.5 py-1 font-body text-[0.7rem] font-semibold text-gold hover:bg-gold/10 disabled:opacity-50">
                        Edit
                      </button>
                    )}
                    {payable && (
                      <button onClick={() => handleWaive(fee)} disabled={busyId === fee.id} className="rounded-md border border-border px-2.5 py-1 font-body text-[0.7rem] text-muted-foreground hover:bg-muted disabled:opacity-50">
                        Waive
                      </button>
                    )}
                    <button onClick={() => handleDelete(fee)} disabled={busyId === fee.id} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" title="Delete record">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {payingId === fee.id && (
                  <div className="mt-2 grid grid-cols-1 gap-2 rounded-md border border-gold/25 bg-gold/5 p-2.5 sm:grid-cols-4">
                    <input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className={inputClass} inputMode="decimal" placeholder="Amount ₹" />
                    <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={inputClass} />
                    <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as FeePaymentMethod)} className={inputClass}>
                      <option value="cash">Cash / counter</option>
                      <option value="upi">UPI</option>
                    </select>
                    <button onClick={() => handleMarkPaid(fee)} disabled={busyId === fee.id} className="flex items-center justify-center gap-1.5 rounded-md bg-gradient-primary px-3 py-1.5 font-body text-xs font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
                      {busyId === fee.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentFeePanel;
