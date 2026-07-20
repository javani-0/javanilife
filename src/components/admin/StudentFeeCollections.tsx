import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BadgeIndianRupee, CalendarPlus, ImageIcon, LayoutGrid, List, Loader2, MessageCircle, RefreshCw, Upload, Users, Wallet, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAdminLog } from "@/hooks/useAdminLog";
import { useAuth } from "@/contexts/AuthContext";
import { formatPaiseAsRupees, parsePriceToPaise } from "@/lib/ecommerce";
import {
  collectDueReminders,
  DEFAULT_REMINDER_DAYS,
  deriveDisplayFeeStatus,
  FEE_STATUS_LABELS,
  feeDocMonthKeyFor,
  feePaidStatement,
  getEnrollment,
  isFeePayable,
  listFeesForEnrollment,
  monthKeyFor,
  notifyClassFee,
  periodLabel,
  recordFeeForMonth,
  sortFeesByMonthDesc,
  uploadPaymentProof,
  type EnrollmentDoc,
  type FeePaymentDoc,
  type FeePaymentMethod,
  type FeeStatus,
} from "@/lib/classes";

// Read the true WhatsApp outcome out of the /api/classes/notify response so the
// admin sees WHY a reminder didn't go (env missing / template error) instead of
// a blanket "sent" (req 8 — WhatsApp not going).
const interpretWhatsApp = (result: unknown): { status: string; message: string } => {
  const parent = (result as { parentWhatsApp?: { value?: { status?: string; errorMessage?: string }; reason?: string } })?.parentWhatsApp;
  const value = parent?.value;
  if (value?.status === "sent") return { status: "sent", message: "" };
  if (value?.status === "manual-ready") return { status: "manual-ready", message: value.errorMessage || "WhatsApp API isn't configured." };
  if (value?.status === "failed") return { status: "failed", message: value.errorMessage || "WhatsApp send failed." };
  return { status: "unknown", message: parent?.reason || "Could not read the WhatsApp result." };
};
import type { StudentDoc } from "@/lib/students";

// ---------------------------------------------------------------------------
// The "Fee Collections" view of the Student Manager (req): month summary cards,
// search + class + sort filters, grid/list views, and a per-student Record-fee
// dialog. Each row shows the student's LATEST fee entry (across all months) and
// the list can be sorted by that entry. Loads every student's fees once so the
// caption/sort stay correct regardless of the month picker (which only drives
// the summary cards).
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

const niceDate = (iso?: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!match) return iso || "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`;
};

const toMillis = (value: unknown): number => {
  const ts = value as { toMillis?: () => number } | undefined;
  return typeof ts?.toMillis === "function" ? ts.toMillis() : 0;
};
// "Most recent activity" on a fee: paid date wins, else created/updated.
const feeActivityMillis = (fee: FeePaymentDoc): number =>
  Math.max(toMillis(fee.paidAt), toMillis(fee.upiSubmittedAt), toMillis(fee.updatedAt), toMillis(fee.createdAt));
const latestOf = (fees: FeePaymentDoc[]): FeePaymentDoc | undefined =>
  fees.length === 0 ? undefined : fees.reduce((a, b) => (feeActivityMillis(b) >= feeActivityMillis(a) ? b : a));

type SortMode = "latest" | "new" | "old" | "az";

interface EntryState {
  student: StudentDoc;
  month: string;
  amount: string;
  date: string;
  method: FeePaymentMethod;
  enrollment: EnrollmentDoc | null;
  loadingEnrollment: boolean;
}

interface StudentFeeCollectionsProps {
  students: StudentDoc[];
  adminUid: string;
}

const defaultView = (): "list" | "grid" => (typeof window !== "undefined" && window.innerWidth < 768 ? "grid" : "list");

const StudentFeeCollections = ({ students, adminUid }: StudentFeeCollectionsProps) => {
  const { toast } = useToast();
  const logAction = useAdminLog();
  const { user } = useAuth();
  const [reminding, setReminding] = useState(false);
  const [bulkReminding, setBulkReminding] = useState(false);
  const [monthKey, setMonthKey] = useState(monthKeyFor(new Date()));
  const [feesByEnrollment, setFeesByEnrollment] = useState<Map<string, FeePaymentDoc[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | FeeStatus | "none">("all");
  const [methodFilter, setMethodFilter] = useState<"all" | FeePaymentMethod>("all");
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [view, setView] = useState<"list" | "grid">(defaultView);
  const [entry, setEntry] = useState<EntryState | null>(null);
  const [savingEntry, setSavingEntry] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState("");
  const proofRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (proofPreview) URL.revokeObjectURL(proofPreview); }, [proofPreview]);

  const approvedStudents = useMemo(
    () => students.filter((student) => student.onboardingStatus === "approved" && student.enrollmentId),
    [students],
  );
  // Stable key so the loader only refires when the actual set of students changes.
  const enrollmentKey = useMemo(
    () => approvedStudents.map((s) => s.enrollmentId).sort().join(","),
    [approvedStudents],
  );

  const loadFees = useCallback(async () => {
    setLoading(true);
    const map = new Map<string, FeePaymentDoc[]>();
    await Promise.all(approvedStudents.map(async (student) => {
      if (!student.enrollmentId) return;
      try {
        const fees = await listFeesForEnrollment(student.enrollmentId);
        map.set(student.enrollmentId, fees);
      } catch {
        map.set(student.enrollmentId, []);
      }
    }));
    setFeesByEnrollment(map);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrollmentKey]);

  useEffect(() => { loadFees(); }, [loadFees]);

  const classOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const student of approvedStudents) {
      if (student.classId && !seen.has(student.classId)) seen.set(student.classId, student.className || student.classId);
    }
    return Array.from(seen.entries());
  }, [approvedStudents]);

  const latestByEnrollment = useMemo(() => {
    const map = new Map<string, FeePaymentDoc | undefined>();
    for (const [id, fees] of feesByEnrollment) map.set(id, latestOf(fees));
    return map;
  }, [feesByEnrollment]);

  // Summary cards are month-scoped: a student counts in a bucket if any of
  // their fee docs for the picked month is in that state.
  const summary = useMemo(() => {
    let paid = 0; let paidInPaise = 0; let pending = 0; let pendingInPaise = 0; let overdue = 0; let overdueInPaise = 0;
    for (const student of approvedStudents) {
      const monthDocs = ((student.enrollmentId && feesByEnrollment.get(student.enrollmentId)) || []).filter((fee) => fee.monthKey === monthKey);
      let hasPaid = false; let hasPending = false; let hasOverdue = false;
      for (const fee of monthDocs) {
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
  }, [approvedStudents, feesByEnrollment, monthKey]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = approvedStudents.filter((student) => {
      if (classFilter !== "all" && student.classId !== classFilter) return false;
      if (q && ![student.name, student.studentId, student.className, student.parentName, student.email].some((v) => (v || "").toLowerCase().includes(q))) return false;
      const latest = student.enrollmentId ? latestByEnrollment.get(student.enrollmentId) : undefined;
      if (statusFilter !== "all") {
        if (statusFilter === "none") { if (latest) return false; }
        else if (!latest || deriveDisplayFeeStatus(latest) !== statusFilter) return false;
      }
      if (methodFilter !== "all" && (!latest || latest.paymentMethod !== methodFilter)) return false;
      return true;
    });
    const nameOf = (s: StudentDoc) => (s.name || "").toLowerCase();
    const latestMillis = (s: StudentDoc) => {
      const latest = s.enrollmentId ? latestByEnrollment.get(s.enrollmentId) : undefined;
      return latest ? feeActivityMillis(latest) : 0;
    };
    const createdMillis = (s: StudentDoc) => toMillis(s.createdAt);
    return [...filtered].sort((a, b) => {
      if (sortMode === "az") return nameOf(a).localeCompare(nameOf(b));
      if (sortMode === "new") return createdMillis(b) - createdMillis(a) || nameOf(a).localeCompare(nameOf(b));
      if (sortMode === "old") return createdMillis(a) - createdMillis(b) || nameOf(a).localeCompare(nameOf(b));
      return latestMillis(b) - latestMillis(a) || nameOf(a).localeCompare(nameOf(b)); // latest (default)
    });
  }, [approvedStudents, latestByEnrollment, search, classFilter, statusFilter, methodFilter, sortMode]);

  const openEntry = async (student: StudentDoc) => {
    setProofFile(null);
    setProofPreview("");
    setEntry({
      student,
      month: monthKey,
      amount: student.fees.monthlyFeeInPaise > 0 ? String(student.fees.monthlyFeeInPaise / 100) : "",
      date: todayIso(),
      method: "cash",
      enrollment: null,
      loadingEnrollment: true,
    });
    if (!student.enrollmentId) { setEntry((c) => (c ? { ...c, loadingEnrollment: false } : c)); return; }
    try {
      const enrollment = await getEnrollment(student.enrollmentId);
      setEntry((c) => (c && c.student.id === student.id ? { ...c, enrollment, loadingEnrollment: false } : c));
    } catch {
      setEntry((c) => (c && c.student.id === student.id ? { ...c, loadingEnrollment: false } : c));
    }
  };

  const entryHistory = entry?.student.enrollmentId ? sortFeesByMonthDesc(feesByEnrollment.get(entry.student.enrollmentId) || []) : [];

  // Already-settled record for the picked month → drives the live guard.
  const monthConflict = useMemo(() => {
    if (!entry?.enrollment || !/^\d{4}-\d{2}$/.test(entry.month)) return null;
    const docMonth = feeDocMonthKeyFor(entry.enrollment, entry.month);
    const existing = entryHistory.find((fee) => fee.id === `${entry.enrollment!.id}_${docMonth}`);
    if (!existing) return null;
    if (existing.status === "paid") return { fee: existing, kind: "paid" as const };
    if (existing.status === "waived") return { fee: existing, kind: "waived" as const };
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, feesByEnrollment]);

  const saveEntry = async () => {
    if (!entry?.enrollment) return;
    const amountInPaise = parsePriceToPaise(entry.amount) || 0;
    if (amountInPaise < 100) { toast({ title: "Enter a valid fee amount", variant: "destructive" }); return; }
    if (!/^\d{4}-\d{2}$/.test(entry.month)) { toast({ title: "Pick a fee month", variant: "destructive" }); return; }
    if (monthConflict?.kind === "paid") { toast({ title: `${periodLabel(entry.month)} fee is already paid`, description: "Edit that entry from the Fees panel instead.", variant: "destructive" }); return; }
    setSavingEntry(true);
    try {
      const proofUrl = proofFile ? await uploadPaymentProof(proofFile) : undefined;
      await recordFeeForMonth(entry.enrollment, { feeMonthKey: entry.month, amountInPaise, paidOn: entry.date || todayIso(), method: entry.method, adminUid, proofUrl });
      toast({ title: "Fee recorded", description: `${entry.student.name} · ${periodLabel(entry.month)} · ${formatPaiseAsRupees(amountInPaise)}` });
      logAction("Recorded fee", `${entry.student.name}${entry.student.studentId ? ` (${entry.student.studentId})` : ""} · ${periodLabel(entry.month)} · ${formatPaiseAsRupees(amountInPaise)} · ${entry.method}`);
      setEntry(null);
      await loadFees();
    } catch (error) {
      toast({ title: "Could not record the fee", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSavingEntry(false);
    }
  };

  // Manual WhatsApp reminder (req 8): remind the parent about the soonest
  // payable fee and REPORT the real outcome so the admin can see if WhatsApp
  // needs configuring.
  const sendReminder = async () => {
    if (!user) return;
    const payables = entryHistory.filter((fee) => isFeePayable({ status: deriveDisplayFeeStatus(fee) }));
    const target = payables.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""))[0];
    if (!target) { toast({ title: "Nothing due to remind about", description: "This student has no pending fee." }); return; }
    setReminding(true);
    try {
      const idToken = await user.getIdToken();
      const res = await notifyClassFee(idToken, target.id, "fee-reminder");
      const wa = interpretWhatsApp(res.result);
      if (wa.status === "sent") {
        toast({ title: "Reminder sent on WhatsApp", description: `${entry?.student.name} · ${target.periodLabel}` });
      } else if (wa.status === "manual-ready") {
        toast({ title: "WhatsApp isn't set up", description: `${wa.message} The web push (if enabled) was still sent.`, variant: "destructive" });
      } else {
        toast({ title: "WhatsApp reminder failed", description: wa.message, variant: "destructive" });
      }
      logAction("Sent fee reminder", `${entry?.student.name}${entry?.student.studentId ? ` (${entry.student.studentId})` : ""} · ${target.periodLabel} · WhatsApp ${wa.status}`);
    } catch (error) {
      toast({ title: "Could not send the reminder", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setReminding(false);
    }
  };

  // Fees due within the reminder window (5 days before the due date → 5 after),
  // across every loaded student, not yet reminded today. Same selection the
  // cron uses — this button is a reliable manual trigger (req: reminders for
  // every student based on the admin's due date, from 5 days before).
  const dueForReminder = useMemo(() => {
    const all: FeePaymentDoc[] = [];
    for (const fees of feesByEnrollment.values()) all.push(...fees);
    return collectDueReminders(all, new Date(), DEFAULT_REMINDER_DAYS);
  }, [feesByEnrollment]);

  const sendDueReminders = async () => {
    if (!user) return;
    if (dueForReminder.length === 0) { toast({ title: "No reminders due right now", description: "No student has a fee due within the next 5 days that hasn't already been reminded today." }); return; }
    setBulkReminding(true);
    let sent = 0; let failed = 0; let firstError = "";
    try {
      const idToken = await user.getIdToken();
      for (const fee of dueForReminder) {
        try {
          const res = await notifyClassFee(idToken, fee.id, "fee-reminder");
          const wa = interpretWhatsApp(res.result);
          if (wa.status === "sent") sent += 1;
          else { failed += 1; if (!firstError) firstError = wa.message; }
        } catch (error) {
          failed += 1; if (!firstError) firstError = error instanceof Error ? error.message : "send failed";
        }
      }
      if (failed === 0) {
        toast({ title: `Sent ${sent} reminder${sent === 1 ? "" : "s"} on WhatsApp` });
      } else {
        toast({ title: `${sent} sent · ${failed} failed`, description: firstError || "Some reminders could not be sent.", variant: "destructive" });
      }
      logAction("Sent due reminders (batch)", `${sent} sent, ${failed} failed`);
    } finally {
      setBulkReminding(false);
    }
  };

  const captionFor = (student: StudentDoc) => {
    const latest = student.enrollmentId ? latestByEnrollment.get(student.enrollmentId) : undefined;
    if (!latest) return null;
    return { latest, status: deriveDisplayFeeStatus(latest), paidLine: feePaidStatement(latest), count: (student.enrollmentId && feesByEnrollment.get(student.enrollmentId)?.length) || 0 };
  };

  return (
    <div className="space-y-4">
      {/* Filters: month · search · class · status · method · sort · view */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input type="month" value={monthKey} onChange={(e) => setMonthKey(e.target.value || monthKeyFor(new Date()))} className={`${inputClass} w-auto`} title="Month for the summary cards" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, STU id, parent…" className={`${inputClass} min-w-0 flex-1 sm:max-w-xs`} />
          <button onClick={sendDueReminders} disabled={bulkReminding || loading} className="flex shrink-0 items-center gap-1.5 rounded-md bg-[#25D366] px-3 py-2 font-body text-[0.72rem] font-semibold text-white hover:brightness-110 disabled:opacity-60" title="Send WhatsApp reminders to everyone due within 5 days">
            {bulkReminding ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
            <span className="hidden sm:inline">Send due reminders</span>{dueForReminder.length > 0 && <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[0.62rem] font-bold">{dueForReminder.length}</span>}
          </button>
          <button onClick={loadFees} disabled={loading} className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-2 font-body text-[0.72rem] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50" title="Refresh"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
          <div className="flex shrink-0 overflow-hidden rounded-md border border-border">
            <button onClick={() => setView("list")} className={`flex items-center gap-1 px-2.5 py-2 font-body text-[0.72rem] font-semibold ${view === "list" ? "bg-gold/10 text-gold" : "text-muted-foreground hover:bg-muted"}`} title="List view"><List className="h-4 w-4" /></button>
            <button onClick={() => setView("grid")} className={`flex items-center gap-1 px-2.5 py-2 font-body text-[0.72rem] font-semibold ${view === "grid" ? "bg-gold/10 text-gold" : "text-muted-foreground hover:bg-muted"}`} title="Grid view"><LayoutGrid className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className={`${inputClass} w-auto max-w-[46%] sm:max-w-[220px]`}>
            <option value="all">All classes</option>
            {classOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className={`${inputClass} w-auto max-w-[46%] sm:max-w-[180px]`}>
            <option value="all">Payment status: all</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="overdue">Overdue</option>
            <option value="waived">Waived</option>
            <option value="none">No fee record</option>
          </select>
          <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value as typeof methodFilter)} className={`${inputClass} w-auto max-w-[46%] sm:max-w-[180px]`}>
            <option value="all">Payment method: all</option>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="manual">Manual / online</option>
            <option value="autopay">Autopay</option>
          </select>
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} className={`${inputClass} w-auto max-w-[46%] sm:max-w-[170px]`}>
            <option value="latest">Sort: Latest entry</option>
            <option value="new">New to old</option>
            <option value="old">Old to new</option>
            <option value="az">Name A–Z</option>
          </select>
        </div>
      </div>

      {/* Summary cards (req) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
          <p className="flex items-center gap-1.5 font-body text-xs text-muted-foreground"><Users className="h-3.5 w-3.5 text-gold" /> Total students</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">{approvedStudents.length}</p>
          <p className="font-body text-[0.7rem] text-muted-foreground">{approvedStudents.filter((s) => s.active).length} active</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
          <p className="font-body text-xs text-muted-foreground">Paid ({periodLabel(monthKey)})</p>
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

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border/60 bg-card p-10"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/60 bg-card p-8 text-center font-body text-sm text-muted-foreground">No students match these filters.</p>
      ) : view === "grid" ? (
        /* GRID VIEW — cards */
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((student) => {
            const cap = captionFor(student);
            return (
              <div key={student.id} className="flex flex-col rounded-xl border border-border/60 bg-card p-4 shadow-card">
                <button type="button" onClick={() => openEntry(student)} className="flex items-center gap-3 text-left" title="View details & record fee">
                  {student.photoUrl ? (
                    <img src={student.photoUrl} alt={student.name} className="h-12 w-12 shrink-0 rounded-full border border-border object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold/15 font-display text-lg text-gold">{(student.name || "?").charAt(0).toUpperCase()}</div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-body text-sm font-semibold text-foreground">{student.name}</p>
                    {student.studentId && <p className="font-body text-[0.72rem] text-gold">{student.studentId}</p>}
                  </div>
                </button>
                <p className="mt-2 truncate font-body text-xs text-muted-foreground">{student.className}</p>
                <div className="mt-2 min-h-[2.5rem] flex-1">
                  {cap ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 font-body text-[0.65rem] font-semibold ${statusStyles[cap.status]}`}>{FEE_STATUS_LABELS[cap.status]}</span>
                        <span className="truncate font-body text-[0.7rem] text-muted-foreground">{cap.latest.periodLabel} · {formatPaiseAsRupees(cap.latest.amountInPaise)}</span>
                      </div>
                      {cap.paidLine && <p className="mt-0.5 truncate font-body text-[0.68rem] text-green-700">{cap.paidLine}</p>}
                    </>
                  ) : (
                    <p className="font-body text-[0.7rem] text-muted-foreground">No fee records yet.</p>
                  )}
                </div>
                <button onClick={() => openEntry(student)} className="mt-3 flex items-center justify-center gap-1.5 rounded-md bg-gradient-primary px-3 py-2 font-body text-[0.72rem] font-semibold text-primary-foreground hover:brightness-110">
                  <CalendarPlus className="h-3.5 w-3.5" /> Record fee
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW — rows */
        <div className="space-y-2">
          {rows.map((student) => {
            const cap = captionFor(student);
            return (
              <div key={student.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-card">
                <button type="button" onClick={() => openEntry(student)} className="flex min-w-0 items-center gap-3 text-left" title="View details & record fee">
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
                    {cap ? (
                      <p className="truncate font-body text-[0.7rem] text-muted-foreground">
                        Latest: {cap.latest.periodLabel} · {formatPaiseAsRupees(cap.latest.amountInPaise)}{cap.latest.paymentMethod ? ` · ${cap.latest.paymentMethod}` : ""}
                        {cap.paidLine ? <span className="text-green-700"> — {cap.paidLine}</span> : ""}
                        {cap.count > 1 ? <span className="text-gold"> · {cap.count} entries</span> : ""}
                      </p>
                    ) : (
                      <p className="font-body text-[0.7rem] text-muted-foreground">No fee records yet.</p>
                    )}
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  {cap && <span className={`rounded-full px-2.5 py-1 font-body text-[0.7rem] font-semibold ${statusStyles[cap.status]}`}>{FEE_STATUS_LABELS[cap.status]}</span>}
                  <button onClick={() => openEntry(student)} className="flex items-center gap-1.5 rounded-md bg-gradient-primary px-3 py-1.5 font-body text-[0.72rem] font-semibold text-primary-foreground hover:brightness-110">
                    <CalendarPlus className="h-3.5 w-3.5" /> Record fee
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Record-fee dialog — full-height-safe: fixed header + scrollable body */}
      {entry && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setEntry(null)} />
          <div className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-card shadow-hero">
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border/60 p-5 pb-4">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-body text-xs font-semibold uppercase tracking-wider text-gold"><Wallet className="h-3.5 w-3.5" /> Record fee</p>
                <h3 className="mt-1 truncate font-display text-lg text-foreground">{entry.student.name}{entry.student.studentId ? <span className="ml-2 font-body text-sm text-gold">{entry.student.studentId}</span> : null}</h3>
                <p className="truncate font-body text-xs text-muted-foreground">{entry.student.className}</p>
              </div>
              <button onClick={() => setEntry(null)} className="shrink-0" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5 pt-4">
              {/* Student detail (req 7): Class · Timing · Joining · Parent · Next charge */}
              <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-border/60 bg-background/60 p-3 font-body text-xs">
                <div><span className="text-muted-foreground">Class</span><p className="font-semibold text-foreground">{entry.student.className || "—"}</p></div>
                <div><span className="text-muted-foreground">Class timing</span><p className="font-semibold text-foreground">{entry.student.slotLabel || "—"}</p></div>
                <div><span className="text-muted-foreground">Date of joining</span><p className="font-semibold text-foreground">{niceDate(entry.student.joiningDate)}</p></div>
                <div><span className="text-muted-foreground">Next charge date</span><p className="font-semibold text-foreground">{niceDate(entry.student.nextChargeDate)}</p></div>
                <div className="col-span-2"><span className="text-muted-foreground">Parent / Guardian</span><p className="font-semibold text-foreground">{entry.student.parentName || "—"}{entry.student.phone ? ` · ${entry.student.phone}` : ""}</p></div>
                <div className="col-span-2 mt-1">
                  <button type="button" onClick={sendReminder} disabled={reminding} className="flex items-center gap-1.5 rounded-md bg-[#25D366] px-3 py-1.5 font-body text-[0.72rem] font-semibold text-white hover:brightness-110 disabled:opacity-60">
                    {reminding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />} Send WhatsApp reminder
                  </button>
                </div>
              </div>

              <p className="mb-2 font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">Record a fee</p>
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

              {/* Optional payment screenshot (req 5) — stored + shown in history */}
              <div className="mt-3">
                <label className="mb-1 block font-body text-xs text-muted-foreground">Payment screenshot <span className="text-muted-foreground">(optional)</span></label>
                <input ref={proofRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0]; e.target.value = "";
                  if (!file) return;
                  if (!file.type.startsWith("image/")) { toast({ title: "Please pick an image", variant: "destructive" }); return; }
                  if (proofPreview) URL.revokeObjectURL(proofPreview);
                  setProofFile(file); setProofPreview(URL.createObjectURL(file));
                }} />
                {proofPreview ? (
                  <div className="flex items-center gap-3 rounded-md border border-border p-2">
                    <img src={proofPreview} alt="Receipt" className="h-14 w-14 rounded object-cover" />
                    <button type="button" onClick={() => proofRef.current?.click()} className="font-body text-xs font-semibold text-gold hover:underline">Change</button>
                    <button type="button" onClick={() => { setProofFile(null); if (proofPreview) URL.revokeObjectURL(proofPreview); setProofPreview(""); }} className="font-body text-xs text-destructive hover:underline">Remove</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => proofRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border py-2.5 font-body text-xs text-muted-foreground hover:border-gold/50 hover:text-gold"><Upload className="h-3.5 w-3.5" /> Attach screenshot</button>
                )}
              </div>

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
                disabled={savingEntry || entry.loadingEnrollment || !entry.enrollment || monthConflict?.kind === "paid"}
                className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-gradient-primary px-4 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingEntry || entry.loadingEnrollment ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} Save paid entry
              </button>

              <p className="mt-5 mb-2 font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment history</p>
              {entryHistory.length === 0 ? (
                <p className="font-body text-xs text-muted-foreground">No fee records yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {entryHistory.map((fee) => {
                    const displayStatus = deriveDisplayFeeStatus(fee);
                    const paidLine = feePaidStatement(fee);
                    return (
                      <div key={fee.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/70 px-2.5 py-2">
                        <div className="min-w-0">
                          <p className="truncate font-body text-xs font-medium text-foreground">{fee.periodLabel}</p>
                          <p className="font-body text-[0.68rem] text-muted-foreground">{formatPaiseAsRupees(fee.amountInPaise)}{fee.paymentMethod ? ` · ${fee.paymentMethod}` : ""}{paidLine ? ` — ${paidLine}` : ""}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {(fee.cashProofUrl || fee.upiProofUrl) && (
                            <a href={fee.cashProofUrl || fee.upiProofUrl} target="_blank" rel="noreferrer" title="View payment screenshot" className="rounded-md border border-gold/40 p-1 text-gold hover:bg-gold/10"><ImageIcon className="h-3.5 w-3.5" /></a>
                          )}
                          <span className={`rounded-full px-2 py-0.5 font-body text-[0.65rem] font-semibold ${statusStyles[displayStatus]}`}>{FEE_STATUS_LABELS[displayStatus]}</span>
                        </div>
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
