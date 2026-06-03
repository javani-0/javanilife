import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BellRing, Banknote, Download, IndianRupee, Search, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useScrollHighlight } from "@/hooks/useScrollHighlight";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import {
  deriveDisplayFeeStatus,
  FEE_STATUS_LABELS,
  markFeeCash,
  monthKeyFor,
  notifyClassFee,
  periodLabel,
  subscribeToFeesAdmin,
  summarizeFees,
  waiveFee,
  type FeePaymentDoc,
  type FeeStatus,
} from "@/lib/classes";

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
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    return subscribeToFeesAdmin(monthKey, (items) => { setFees(items); setLoading(false); }, () => setLoading(false));
  }, [monthKey]);

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
      .filter((fee) => !normalizedSearch || [fee.studentName, fee.parentName, fee.parentPhone, fee.className]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedSearch)))
      .sort((a, b) => a.studentName.localeCompare(b.studentName));
  }, [fees, classFilter, statusFilter, search]);

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
          <option value="all">All statuses</option>
          {Object.entries(FEE_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="font-body text-sm text-muted-foreground">Loading fee records…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-gold/15 bg-card p-10 text-center shadow-card">
          <IndianRupee className="mx-auto mb-3 h-10 w-10 text-gold" />
          <h3 className="font-display text-xl text-foreground">No fee records for {periodLabel(monthKey)}</h3>
          <p className="mt-1 font-body text-sm text-muted-foreground">Fee rows appear once enrolments roll into this month (the daily cron creates them) or after a payment.</p>
        </div>
      ) : (
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
                    <tr key={fee.id} id={`fee-${fee.id}`} className="border-b border-border/50 hover:bg-muted/20 scroll-mt-28">
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
                      <td className="px-4 py-3 font-body text-xs capitalize text-muted-foreground">{fee.paymentMethod || "—"}</td>
                      <td className="px-4 py-3">
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
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminFeeCollections;
