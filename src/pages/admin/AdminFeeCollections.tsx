import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BellRing, Banknote, Download, IndianRupee, Search, XCircle, Trash2, LayoutGrid, List, X, Check, ExternalLink, Loader2, History, Undo2, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useScrollHighlight } from "@/hooks/useScrollHighlight";
import { createPortal } from "react-dom";
import { formatPaiseAsRupees } from "@/lib/ecommerce";
import {
  deriveDisplayFeeStatus,
  FEE_PAYMENT_METHOD_LABELS,
  FEE_STATUS_LABELS,
  collectFeeCash,
  deleteFee,
  formatMonthRange,
  formatNiceDate,
  approveUpiPayment,
  ensureMonthlyDueFee,
  listFeesForEnrollment,
  monthKeyFor,
  notifyClassFee,
  periodLabel,
  subscribeToEnrollmentsAdmin,
  subscribeToFeesAdmin,
  subscribeToPendingUpiApprovals,
  summarizeFees,
  undoFeeCollection,
  uploadPaymentProof,
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

const Tile = ({ label, value, sub, accent, onClick, active }: { label: string; value: string; sub: string; accent: string; onClick?: () => void; active?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className={`rounded-xl border bg-card p-4 text-left shadow-card transition-all ${active ? "border-gold ring-2 ring-gold/40" : "border-border/60"} ${onClick ? "cursor-pointer hover:border-gold/50 hover:shadow-md" : "cursor-default"}`}
  >
    <p className="font-body text-xs uppercase tracking-wider text-muted-foreground">{label}{active ? " · filtering" : ""}</p>
    <p className={`mt-1 font-display text-2xl font-bold ${accent}`}>{value}</p>
    <p className="font-body text-xs text-muted-foreground">{sub}</p>
  </button>
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
  // Per-student full payment history dialog.
  const [historyFee, setHistoryFee] = useState<FeePaymentDoc | null>(null);
  const [historyRows, setHistoryRows] = useState<FeePaymentDoc[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // Cash-collection dialog (req): editable amount + REQUIRED proof screenshot.
  const [cashFee, setCashFee] = useState<FeePaymentDoc | null>(null);
  const [cashAmount, setCashAmount] = useState("");
  const [cashProofFile, setCashProofFile] = useState<File | null>(null);
  const [cashProofPreview, setCashProofPreview] = useState("");
  const [collecting, setCollecting] = useState(false);
  // Months this session already ran the dues generator for (avoid re-running
  // and fighting an intentional admin Delete during the same visit).
  const generatedMonthsRef = useRef<Set<string>>(new Set());
  const [generatingDues, setGeneratingDues] = useState(false);

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

  // Active enrolments split by track — drives the Total Students tile and the
  // dues generator ("students pay every month until they quit").
  const activeEnrollments = useMemo(
    () => Array.from(enrollmentsById.values()).filter((enrollment) => enrollment.status === "active"),
    [enrollmentsById],
  );
  const activeMonthly = useMemo(
    () => activeEnrollments.filter((enrollment) => enrollment.feeType !== "term" && (enrollment.monthlyFeeInPaise || 0) > 0),
    [activeEnrollments],
  );

  // Self-heal the month's ledger: every ACTIVE monthly enrolment must have a fee
  // row for the viewed month (the server cron does this too, but if it hasn't
  // run the month shows almost empty — the "34 paid in June, 5 in July" gap).
  // Creating the pending rows is also what makes the daily WhatsApp reminders
  // fire, since the cron scans pending fee docs. Never runs for future months,
  // and only once per month per visit (so an intentional Delete isn't fought;
  // use Waive for a student who shouldn't pay a month).
  useEffect(() => {
    if (loading || generatingDues) return;
    if (monthKey > monthKeyFor(new Date())) return;
    if (generatedMonthsRef.current.has(monthKey)) return;
    if (activeMonthly.length === 0) return;

    const existingIds = new Set(fees.map((fee) => fee.id));
    const missing = activeMonthly.filter((enrollment) => {
      if ((enrollment.startMonthKey || "") > monthKey) return false;
      return !existingIds.has(`${enrollment.id}_${monthKey}`);
    });
    generatedMonthsRef.current.add(monthKey);
    if (missing.length === 0) return;

    setGeneratingDues(true);
    (async () => {
      let created = 0;
      for (const enrollment of missing) {
        try {
          if (await ensureMonthlyDueFee(enrollment, monthKey)) created += 1;
        } catch (error) {
          console.error("Unable to create monthly due", { enrollmentId: enrollment.id, monthKey, error });
        }
      }
      if (created > 0) {
        toast({ title: `Generated ${created} pending due${created === 1 ? "" : "s"}`, description: `Every active monthly student now has a ${periodLabel(monthKey)} fee row.` });
      }
    })().finally(() => setGeneratingDues(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, monthKey, activeMonthly, fees]);

  const openHistory = async (fee: FeePaymentDoc) => {
    setHistoryFee(fee);
    setHistoryLoading(true);
    try {
      setHistoryRows(await listFeesForEnrollment(fee.enrollmentId));
    } catch (error) {
      console.error("Unable to load payment history", error);
      toast({ title: "Could not load history", variant: "destructive" });
    } finally {
      setHistoryLoading(false);
    }
  };

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

  // --- Cash collection with proof + undo (req) ------------------------------
  const openCashDialog = (fee: FeePaymentDoc) => {
    setCashFee(fee);
    // Prefill with the fee's current amount — the admin can update it.
    setCashAmount(String((fee.amountInPaise || 0) / 100));
    setCashProofFile(null);
    setCashProofPreview("");
  };

  const closeCashDialog = () => {
    if (collecting) return;
    setCashFee(null);
    setCashProofFile(null);
    setCashProofPreview("");
  };

  const handleCashProofSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image", description: "Upload a screenshot/photo as collection proof.", variant: "destructive" });
      return;
    }
    setCashProofFile(file);
    setCashProofPreview(URL.createObjectURL(file));
  };

  const handleCollectCash = async () => {
    if (!user || !cashFee) return;
    const rupees = Number(cashAmount);
    if (!Number.isFinite(rupees) || rupees < 1) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    if (!cashProofFile) {
      toast({ title: "Proof screenshot required", description: "Upload a screenshot/photo before marking as collected.", variant: "destructive" });
      return;
    }
    setCollecting(true);
    try {
      const proofUrl = await uploadPaymentProof(cashProofFile);
      await collectFeeCash(cashFee.id, { amountInPaise: Math.round(rupees * 100), proofUrl, adminUid: user.uid });
      toast({ title: "Cash collected", description: `${cashFee.studentName} · ${cashFee.periodLabel} · ₹${rupees.toLocaleString("en-IN")}` });
      // Notify parent + admin (WhatsApp + push) — best-effort.
      try {
        const idToken = await user.getIdToken();
        await notifyClassFee(idToken, cashFee.id, "fee-paid");
      } catch (notifyError) {
        console.error("Collected but the confirmation message failed", notifyError);
        toast({ title: "Collected, but the confirmation message failed", description: "You can re-send it from the fee row.", variant: "destructive" });
      }
      setCashFee(null);
      setCashProofFile(null);
      setCashProofPreview("");
    } catch (error) {
      toast({ title: "Could not record the collection", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setCollecting(false);
    }
  };

  const handleUndoCollection = async (fee: FeePaymentDoc) => {
    if (!user) return;
    if (!confirm(`Undo the ${formatPaiseAsRupees(fee.amountInPaise)} cash collection for ${fee.studentName} (${fee.periodLabel})? The fee goes back to pending and both actions stay in the history.`)) return;
    setBusyId(fee.id);
    try {
      await undoFeeCollection(fee.id, { adminUid: user.uid, amountInPaise: fee.amountInPaise });
      toast({ title: "Collection undone", description: `${fee.studentName} · ${fee.periodLabel} is pending again.` });
      try {
        const idToken = await user.getIdToken();
        await notifyClassFee(idToken, fee.id, "fee-collection-undone");
      } catch (notifyError) {
        console.error("Undone but the reversal message failed", notifyError);
        toast({ title: "Undone, but the reversal message failed", description: "The parent may not have been notified.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Could not undo", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  /** Undo shows for settled CASH fees (mistaken "Collected" clicks). */
  const canUndoCollection = (fee: FeePaymentDoc): boolean =>
    fee.status === "paid" && fee.paymentMethod === "cash";

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

      {/* Tiles double as filters — click one to filter the list below, click again to clear. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Total Students"
          value={String(activeEnrollments.length)}
          sub={`${activeMonthly.length} monthly · ${activeEnrollments.length - activeMonthly.length} term${generatingDues ? " · generating dues…" : " · show all"}`}
          accent="text-foreground"
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        />
        <Tile
          label="Paid This Month"
          value={formatPaiseAsRupees(totals.collectedInPaise)}
          sub={`${totals.paidCount} of ${activeMonthly.length || totals.total} students paid`}
          accent="text-green-600"
          active={statusFilter === "paid"}
          onClick={() => setStatusFilter((current) => (current === "paid" ? "all" : "paid"))}
        />
        <Tile
          label="Pending"
          value={formatPaiseAsRupees(totals.pendingInPaise)}
          sub={`${totals.pendingCount} pending`}
          accent="text-amber-600"
          active={statusFilter === "pending"}
          onClick={() => setStatusFilter((current) => (current === "pending" ? "all" : "pending"))}
        />
        <Tile
          label="Overdue"
          value={formatPaiseAsRupees(totals.overdueInPaise)}
          sub={`${totals.overdueCount} overdue · ${totals.failedCount} failed`}
          accent="text-red-600"
          active={statusFilter === "overdue"}
          onClick={() => setStatusFilter((current) => (current === "overdue" ? "all" : "overdue"))}
        />
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
                          <button onClick={() => openHistory(fee)} className="flex items-center gap-1 rounded border border-border px-2 py-1 font-body text-[0.7rem] text-muted-foreground hover:bg-muted" title="Full payment history">
                            <History className="h-3.5 w-3.5" /> History
                          </button>
                          {!settled && (
                            <button onClick={() => openCashDialog(fee)} disabled={busyId === fee.id} className="flex items-center gap-1 rounded border border-green-300 px-2 py-1 font-body text-[0.7rem] text-green-700 hover:bg-green-50 disabled:opacity-50" title="Collect cash (amount + proof)">
                              <Banknote className="h-3.5 w-3.5" /> Cash
                            </button>
                          )}
                          {canUndoCollection(fee) && (
                            <button onClick={() => handleUndoCollection(fee)} disabled={busyId === fee.id} className="flex items-center gap-1 rounded border border-amber-300 px-2 py-1 font-body text-[0.7rem] text-amber-700 hover:bg-amber-50 disabled:opacity-50" title="Undo this cash collection">
                              <Undo2 className="h-3.5 w-3.5" /> Undo
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
                  <button onClick={() => openHistory(fee)} className="flex flex-1 items-center justify-center gap-1 rounded border border-border px-2 py-1.5 font-body text-[0.75rem] font-semibold text-muted-foreground hover:bg-muted" title="Full payment history">
                    <History className="h-3.5 w-3.5" /> History
                  </button>
                  {!settled && (
                    <button onClick={() => openCashDialog(fee)} disabled={busyId === fee.id} className="flex flex-1 items-center justify-center gap-1 rounded border border-green-300 px-2 py-1.5 font-body text-[0.75rem] font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50">
                      <Banknote className="h-3.5 w-3.5" /> Cash
                    </button>
                  )}
                  {canUndoCollection(fee) && (
                    <button onClick={() => handleUndoCollection(fee)} disabled={busyId === fee.id} className="flex flex-1 items-center justify-center gap-1 rounded border border-amber-300 px-2 py-1.5 font-body text-[0.75rem] font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50">
                      <Undo2 className="h-3.5 w-3.5" /> Undo
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
                {fee.cashProofUrl && (
                  <a href={fee.cashProofUrl} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1.5 font-body text-xs font-semibold text-gold hover:underline">
                    <ExternalLink className="h-3.5 w-3.5" /> View cash-collection proof
                  </a>
                )}
                {(fee.collectionHistory?.length || 0) > 0 && (
                  <div className="mt-3 rounded-lg border border-border/60 bg-background/70 p-3">
                    <p className="mb-1.5 font-body text-xs font-semibold uppercase tracking-wide text-muted-foreground">Collection record</p>
                    <div className="space-y-1.5">
                      {fee.collectionHistory!.map((event, index) => (
                        <p key={index} className="flex items-center justify-between gap-2 font-body text-xs">
                          <span className={event.action === "cash-collected" ? "text-green-700" : "text-amber-700"}>
                            {event.action === "cash-collected" ? "✓ Cash collected" : "↩ Collection undone"}
                            {event.proofUrl && <a href={event.proofUrl} target="_blank" rel="noreferrer" className="ml-1.5 text-gold hover:underline">(proof)</a>}
                          </span>
                          <span className="shrink-0 text-muted-foreground">{formatPaiseAsRupees(event.amountInPaise)} · {new Date(event.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  onClick={() => { setSelectedFee(null); openHistory(fee); }}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-md border border-gold/40 px-3 py-2 font-body text-sm font-semibold text-gold hover:bg-gold/10"
                >
                  <History className="h-4 w-4" /> Full payment history
                </button>
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {/* Full payment history for one student's enrolment */}
      {historyFee && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setHistoryFee(null)} />
          <div className="relative mx-4 flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-card p-6 shadow-hero">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-xl text-foreground"><History className="h-5 w-5 text-gold" /> Payment history</h3>
              <button onClick={() => setHistoryFee(null)} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <p className="font-body text-sm text-muted-foreground">{historyFee.studentName} · {historyFee.className}</p>
            <div className="mt-4 flex-1 overflow-y-auto">
              {historyLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
              ) : historyRows.length === 0 ? (
                <p className="py-6 text-center font-body text-sm text-muted-foreground">No fee records found for this enrolment.</p>
              ) : (
                <div className="space-y-2">
                  {historyRows.map((row) => {
                    const rowStatus = deriveDisplayFeeStatus(row);
                    return (
                      <div key={row.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-background/70 px-3 py-2">
                        <div>
                          <p className="font-body text-sm font-medium text-foreground">{row.periodLabel}</p>
                          <p className="font-body text-xs text-muted-foreground">
                            {formatPaiseAsRupees(row.amountInPaise)}
                            {row.paymentMethod ? ` · ${feeMethodLabel(row)}` : ""}
                            {formatTimestamp(row.paidAt) ? ` · paid ${formatTimestamp(row.paidAt)}` : row.dueDate ? ` · due ${formatNiceDate(row.dueDate)}` : ""}
                          </p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 font-body text-xs font-semibold ${statusStyles[rowStatus]}`}>{FEE_STATUS_LABELS[rowStatus]}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {historyRows.length > 0 && (
              <p className="mt-3 border-t border-border/50 pt-2 text-right font-body text-sm text-muted-foreground">
                Total collected: <span className="font-semibold text-green-700">{formatPaiseAsRupees(historyRows.filter((row) => row.status === "paid").reduce((sum, row) => sum + row.amountInPaise, 0))}</span>
              </p>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Cash collection — editable amount + REQUIRED proof, then Collect (req) */}
      {cashFee && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto p-4">
          <div className="fixed inset-0 bg-black/40" onClick={closeCashDialog} />
          <div className="relative mx-4 w-full max-w-md rounded-xl bg-card p-6 shadow-hero">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-xl text-foreground"><Banknote className="h-5 w-5 text-green-600" /> Collect cash</h3>
              <button onClick={closeCashDialog} disabled={collecting} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <p className="font-body text-sm text-muted-foreground">{cashFee.studentName} · {cashFee.className} · {cashFee.periodLabel}</p>

            <div className="mt-4">
              <label className="mb-1 block font-body text-xs font-semibold text-foreground">Amount (₹) — previous amount shown, edit if needed</label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={cashAmount}
                  onChange={(event) => setCashAmount(event.target.value.replace(/[^0-9.]/g, ""))}
                  inputMode="decimal"
                  className="h-11 w-full rounded-md border border-border bg-background pl-10 pr-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
                  disabled={collecting}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1 block font-body text-xs font-semibold text-foreground">Proof screenshot <span className="text-destructive">*</span> — required to collect</label>
              {cashProofPreview ? (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-background/70 p-2">
                  <img src={cashProofPreview} alt="Proof preview" className="h-16 w-16 rounded object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-body text-xs text-muted-foreground">{cashProofFile?.name}</p>
                    <button onClick={() => { setCashProofFile(null); setCashProofPreview(""); }} disabled={collecting} className="mt-1 font-body text-xs font-semibold text-destructive hover:underline">Remove</button>
                  </div>
                </div>
              ) : (
                <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-4 font-body text-sm text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold ${collecting ? "pointer-events-none opacity-50" : ""}`}>
                  <Upload className="h-4 w-4" /> Upload screenshot / photo
                  <input type="file" accept="image/*" hidden onChange={handleCashProofSelect} disabled={collecting} />
                </label>
              )}
            </div>

            <button
              onClick={handleCollectCash}
              disabled={collecting || !cashProofFile || !Number(cashAmount)}
              className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-2.5 font-body text-sm font-semibold text-white transition-all hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {collecting ? <><Loader2 className="h-4 w-4 animate-spin" /> Recording…</> : <><Check className="h-4 w-4" /> Collected</>}
            </button>
            <p className="mt-2 text-center font-body text-[0.72rem] text-muted-foreground">
              Marks the fee paid in cash and notifies the parent &amp; admin. Mistake? Use <span className="font-semibold">Undo</span> on the fee — every action stays in the record.
            </p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AdminFeeCollections;
