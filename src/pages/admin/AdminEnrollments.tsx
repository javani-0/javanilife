import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Banknote, PauseCircle, PlayCircle, Search, UserCheck, X, XCircle, Trash2, LayoutGrid, List } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatPaiseAsRupees, parsePriceToPaise } from "@/lib/ecommerce";
import {
  cancelEnrollment,
  collectCashPayment,
  deleteEnrollment,
  ENROLLMENT_STATUS_LABELS,
  MANDATE_STATUS_LABELS,
  pauseEnrollment,
  recordManualPaidFee,
  resumeEnrollment,
  subscribeToEnrollmentsAdmin,
  updateEnrollment,
  type ClassPaymentMethod,
  type EnrollmentDoc,
  type EnrollmentStatus,
} from "@/lib/classes";

const statusStyles: Record<EnrollmentStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-blue-100 text-blue-700",
  cancelled: "bg-muted text-muted-foreground",
};

// Firestore Timestamps expose toMillis(); fall back to 0 when missing so
// enrolments without a createdAt sort to the bottom.
const createdAtMillis = (enrollment: EnrollmentDoc): number => {
  const createdAt = enrollment.createdAt as { toMillis?: () => number } | undefined;
  return typeof createdAt?.toMillis === "function" ? createdAt.toMillis() : 0;
};

interface EditState {
  status: EnrollmentStatus;
  paymentPlan: string;
  feeType: "monthly" | "term";
  monthlyFeeRupees: string;
  termFeeRupees: string;
  nextChargeDate: string;
  termStartDate: string;
  termEndDate: string;
  fullPaidRupees: string;
}

const PAYMENT_PLAN_OPTIONS: { value: ClassPaymentMethod; label: string }[] = [
  { value: "autopay", label: "Autopay" },
  { value: "manual", label: "Pay monthly" },
  { value: "cash", label: "Cash" },
  { value: "full", label: "Pay Full (term)" },
  { value: "emi", label: "EMI (term)" },
];

const AdminEnrollments = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [enrollments, setEnrollments] = useState<EnrollmentDoc[]>([]);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | EnrollmentStatus>("all");
  const [view, setView] = useState<"table" | "grid">("table");
  const [selected, setSelected] = useState<EnrollmentDoc | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    destructive?: boolean;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  useEffect(() => subscribeToEnrollmentsAdmin(setEnrollments, (error) => console.error("Unable to load enrollments", error)), []);

  // Populate the editable form whenever a different enrolment is opened. We keep
  // the live `selected` in sync so the modal reflects updates after a save.
  useEffect(() => {
    if (!selected) { setEdit(null); return; }
    setEdit({
      status: selected.status,
      paymentPlan: selected.paymentPlan || "",
      feeType: selected.feeType === "term" ? "term" : "monthly",
      monthlyFeeRupees: selected.monthlyFeeInPaise > 0 ? String(selected.monthlyFeeInPaise / 100) : "",
      termFeeRupees: (selected.termFeeInPaise || 0) > 0 ? String((selected.termFeeInPaise || 0) / 100) : "",
      nextChargeDate: selected.nextChargeDate || "",
      termStartDate: selected.termStartDate || "",
      termEndDate: selected.termEndDate || "",
      fullPaidRupees: (selected.termFeeInPaise || 0) > 0 ? String((selected.termFeeInPaise || 0) / 100) : "",
    });
  }, [selected]);

  // Keep `selected` pointing at the freshest copy from the live subscription.
  useEffect(() => {
    if (!selected) return;
    const fresh = enrollments.find((item) => item.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [enrollments]); // eslint-disable-line react-hooks/exhaustive-deps

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    enrollments.forEach((enrollment) => { if (enrollment.classId) map.set(enrollment.classId, enrollment.className); });
    return Array.from(map.entries());
  }, [enrollments]);

  const visible = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return enrollments
      .filter((enrollment) => classFilter === "all" || enrollment.classId === classFilter)
      .filter((enrollment) => statusFilter === "all" || enrollment.status === statusFilter)
      .filter((enrollment) => !normalizedSearch || [enrollment.student.name, enrollment.parent.name, enrollment.parent.phone, enrollment.className]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedSearch)))
      // Newest enrolments first so fresh sign-ups surface at the top.
      .sort((a, b) => createdAtMillis(b) - createdAtMillis(a));
  }, [enrollments, classFilter, statusFilter, search]);

  const runAction = async (label: string, action: () => Promise<void>) => {
    try {
      await action();
      toast({ title: label });
    } catch (error) {
      console.error(label, error);
      toast({ title: "Action failed", variant: "destructive" });
    }
  };

  const collectCash = async (enrollment: EnrollmentDoc) => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      await collectCashPayment(idToken, enrollment.id);
      toast({ title: "Cash collected", description: `${enrollment.student.name}'s enrolment is now active. WhatsApp sent to parent.` });
    } catch (error) {
      console.error("Cash collection failed", error);
      toast({ title: "Cash collection failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const askCollectCash = (enrollment: EnrollmentDoc) => setConfirmState({
    title: "Collect cash?",
    description: `Collect cash and activate enrolment for ${enrollment.student.name}. A WhatsApp confirmation will be sent to the parent.`,
    confirmLabel: "Collect & activate",
    onConfirm: () => collectCash(enrollment),
  });

  const askCancel = (enrollment: EnrollmentDoc) => setConfirmState({
    title: "Cancel enrolment?",
    description: `Cancel the enrolment for ${enrollment.student.name}. Autopay, if set up, will stop charging.`,
    confirmLabel: "Cancel enrolment",
    destructive: true,
    onConfirm: () => runAction("Enrollment cancelled", () => cancelEnrollment(enrollment.id)),
  });

  const askDelete = (enrollment: EnrollmentDoc) => setConfirmState({
    title: "Delete enrolment?",
    description: `Permanently delete the enrolment for ${enrollment.student.name}. This cannot be undone.`,
    confirmLabel: "Delete",
    destructive: true,
    onConfirm: () => runAction("Enrollment deleted", () => deleteEnrollment(enrollment.id)),
  });

  const handleSaveEdit = async () => {
    if (!selected || !edit) return;
    setSavingEdit(true);
    try {
      await updateEnrollment(selected.id, {
        status: edit.status,
        paymentPlan: edit.paymentPlan ? (edit.paymentPlan as ClassPaymentMethod) : undefined,
        feeType: edit.feeType,
        monthlyFeeInPaise: parsePriceToPaise(edit.monthlyFeeRupees) || 0,
        termFeeInPaise: parsePriceToPaise(edit.termFeeRupees) || 0,
        nextChargeDate: edit.nextChargeDate,
        termStartDate: edit.termStartDate,
        termEndDate: edit.termEndDate,
      });
      toast({ title: "Enrolment updated", description: `${selected.student.name}'s details were saved.` });
    } catch (error) {
      console.error("Enrolment update failed", error);
      toast({ title: "Update failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  // Records a paid term fee for the amount actually received, marks the term
  // course as Full Paid, and activates the enrolment so the parent sees the
  // correct status immediately. (Item 1/6 — payment-data correction tool.)
  const handleMarkFullPaid = () => {
    if (!selected || !edit) return;
    const amountInPaise = parsePriceToPaise(edit.fullPaidRupees) || 0;
    if (amountInPaise < 100) {
      toast({ title: "Enter a valid amount", description: "Enter the full amount received (e.g. 6000).", variant: "destructive" });
      return;
    }
    setConfirmState({
      title: "Mark Full Paid?",
      description: `Record ${formatPaiseAsRupees(amountInPaise)} as fully paid for ${selected.student.name}, activate the enrolment, and show "Full Paid" in their profile.`,
      confirmLabel: "Mark Full Paid",
      onConfirm: async () => {
        try {
          await recordManualPaidFee(selected, { amountInPaise, suffix: "full", periodLabel: "Full course fee", paymentMethod: "manual" });
          await updateEnrollment(selected.id, { status: "active", feeType: "term", termFeeInPaise: amountInPaise });
          toast({ title: "Marked Full Paid", description: `${selected.student.name} is now active with ${formatPaiseAsRupees(amountInPaise)} recorded.` });
        } catch (error) {
          console.error("Mark Full Paid failed", error);
          toast({ title: "Could not mark paid", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">Classes</p>
        <h1 className="mt-2 font-display text-3xl text-foreground">Sign Up</h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">All student sign-ups, parent contacts, autopay status, and enrolment lifecycle.</p>
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
          {Object.entries(ENROLLMENT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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

      {visible.length === 0 ? (
        <div className="rounded-xl border border-gold/15 bg-card p-10 text-center shadow-card">
          <UserCheck className="mx-auto mb-3 h-10 w-10 text-gold" />
          <h3 className="font-display text-xl text-foreground">No enrollments found</h3>
          <p className="mt-1 font-body text-sm text-muted-foreground">Adjust filters or wait for parents to enrol.</p>
        </div>
      ) : view === "table" ? (
        <div className="overflow-hidden rounded-lg bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-muted/50">
                  {["Student", "Class", "Parent", "Fee", "Autopay", "Status", "Actions"].map((heading) => (
                    <th key={heading} className="px-4 py-3 font-body text-[0.72rem] font-medium uppercase tracking-wider text-muted-foreground">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((enrollment) => (
                  <tr key={enrollment.id} className="cursor-pointer border-b border-border/50 hover:bg-muted/20" onClick={() => setSelected(enrollment)}>
                    <td className="px-4 py-3">
                      <p className="font-body text-sm font-medium text-foreground">{enrollment.student.name}</p>
                      <p className="font-body text-xs text-muted-foreground">{enrollment.student.age} yrs · {enrollment.student.gender}</p>
                    </td>
                    <td className="px-4 py-3 font-body text-sm text-foreground">{enrollment.className}</td>
                    <td className="px-4 py-3">
                      <p className="font-body text-sm text-foreground">{enrollment.parent.name}</p>
                      <p className="font-body text-xs text-muted-foreground">{enrollment.parent.phone}</p>
                    </td>
                    <td className="px-4 py-3 font-display text-sm font-bold text-primary">{formatPaiseAsRupees(enrollment.monthlyFeeInPaise)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 font-body text-[0.7rem] ${enrollment.autopay.enabled ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                        {enrollment.autopay.enabled ? "On" : "Off"}
                      </span>
                      {enrollment.autopay.mandateStatus && <p className="mt-0.5 font-body text-[0.65rem] text-muted-foreground">{MANDATE_STATUS_LABELS[enrollment.autopay.mandateStatus]}</p>}
                    </td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 font-body text-[0.7rem] ${statusStyles[enrollment.status]}`}>{ENROLLMENT_STATUS_LABELS[enrollment.status]}</span></td>
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <div className="flex gap-1">
                        {enrollment.status === "pending" && enrollment.paymentPlan === "cash" && (
                          <button onClick={() => askCollectCash(enrollment)} className="flex items-center gap-1 rounded border border-green-300 px-2 py-1 font-body text-[0.7rem] text-green-700 hover:bg-green-50" title="Collect Cash">
                            <Banknote className="h-3.5 w-3.5" /> Cash
                          </button>
                        )}
                        {enrollment.status === "active" && (
                          <button onClick={() => runAction("Enrollment paused", () => pauseEnrollment(enrollment.id))} className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-blue-600" title="Pause"><PauseCircle className="h-4 w-4" /></button>
                        )}
                        {enrollment.status === "paused" && (
                          <button onClick={() => runAction("Enrollment resumed", () => resumeEnrollment(enrollment.id))} className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-green-600" title="Resume"><PlayCircle className="h-4 w-4" /></button>
                        )}
                        {enrollment.status !== "cancelled" && (
                          <button onClick={() => askCancel(enrollment)} className="p-1.5 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Cancel"><XCircle className="h-4 w-4" /></button>
                        )}
                        <button onClick={() => askDelete(enrollment)} className="p-1.5 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Delete"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((enrollment) => (
            <div key={enrollment.id} className="flex flex-col justify-between rounded-xl border border-border/60 bg-card p-5 shadow-card cursor-pointer hover:border-gold/30 transition-colors" onClick={() => setSelected(enrollment)}>
              <div>
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <h4 className="font-display text-lg font-semibold text-foreground">{enrollment.student.name}</h4>
                    <p className="font-body text-xs text-muted-foreground">{enrollment.student.age} yrs · {enrollment.student.gender}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 font-body text-[0.7rem] ${statusStyles[enrollment.status]}`}>{ENROLLMENT_STATUS_LABELS[enrollment.status]}</span>
                </div>
                <div className="my-4 space-y-1 font-body text-[0.8rem]">
                  <div className="flex justify-between border-b border-border/50 pb-1">
                    <span className="text-muted-foreground">Class</span>
                    <span className="font-medium text-foreground">{enrollment.className}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/50 py-1">
                    <span className="text-muted-foreground">Fee</span>
                    <span className="font-display font-bold text-primary">{formatPaiseAsRupees(enrollment.monthlyFeeInPaise)}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/50 py-1">
                    <span className="text-muted-foreground">Parent</span>
                    <span className="text-foreground text-right">{enrollment.parent.name}<br/><span className="text-[0.7rem] text-muted-foreground">{enrollment.parent.phone}</span></span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="text-muted-foreground">Autopay</span>
                    <span className="text-foreground">
                      {enrollment.autopay.enabled ? "On" : "Off"}
                      {enrollment.autopay.mandateStatus && <span className="ml-1 text-muted-foreground">({MANDATE_STATUS_LABELS[enrollment.autopay.mandateStatus]})</span>}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                {enrollment.status === "pending" && enrollment.paymentPlan === "cash" && (
                  <button onClick={() => askCollectCash(enrollment)} className="flex flex-1 items-center justify-center gap-1 rounded border border-green-300 px-2 py-1.5 font-body text-[0.75rem] font-semibold text-green-700 hover:bg-green-50">
                    <Banknote className="h-3.5 w-3.5" /> Cash
                  </button>
                )}
                {enrollment.status === "active" && (
                  <button onClick={() => runAction("Enrollment paused", () => pauseEnrollment(enrollment.id))} className="flex flex-1 items-center justify-center gap-1 rounded border border-border px-2 py-1.5 font-body text-[0.75rem] font-semibold text-muted-foreground hover:bg-muted hover:text-blue-600">
                    <PauseCircle className="h-3.5 w-3.5" /> Pause
                  </button>
                )}
                {enrollment.status === "paused" && (
                  <button onClick={() => runAction("Enrollment resumed", () => resumeEnrollment(enrollment.id))} className="flex flex-1 items-center justify-center gap-1 rounded border border-border px-2 py-1.5 font-body text-[0.75rem] font-semibold text-muted-foreground hover:bg-muted hover:text-green-600">
                    <PlayCircle className="h-3.5 w-3.5" /> Resume
                  </button>
                )}
                {enrollment.status !== "cancelled" && (
                  <button onClick={() => askCancel(enrollment)} className="flex flex-1 items-center justify-center gap-1 rounded border border-border px-2 py-1.5 font-body text-[0.75rem] font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <XCircle className="h-3.5 w-3.5" /> Cancel
                  </button>
                )}
                <button onClick={() => askDelete(enrollment)} className="flex flex-1 items-center justify-center gap-1 rounded border border-border px-2 py-1.5 font-body text-[0.75rem] font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && edit && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setSelected(null)} />
          <div className="relative mx-4 my-6 w-full max-w-lg rounded-xl bg-card p-6 shadow-hero max-h-[90vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-xl text-foreground">Edit Enrolment</h3>
              <button onClick={() => setSelected(null)} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>

            {/* Read-only summary */}
            <dl className="space-y-1.5 font-body text-sm">
              {[
                ["Student", `${selected.student.name} (${selected.student.age} yrs, ${selected.student.gender})`],
                ["Class", selected.className],
                ["Batch", selected.slotLabel || "—"],
                ["Parent", `${selected.parent.name} · ${selected.parent.phone}`],
                ["Autopay", selected.autopay.enabled ? `On${selected.autopay.mandateStatus ? ` (${MANDATE_STATUS_LABELS[selected.autopay.mandateStatus]})` : ""}` : "Off"],
                ["Started", selected.startMonthKey || "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b border-border/40 pb-1.5">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium text-foreground">{value}</dd>
                </div>
              ))}
            </dl>

            {/* Editable fields */}
            <div className="mt-4 grid grid-cols-2 gap-3 font-body text-sm">
              <label className="block">
                <span className="mb-1 block text-[0.8rem] text-muted-foreground">Status</span>
                <select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as EnrollmentStatus })} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-gold">
                  {Object.entries(ENROLLMENT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.8rem] text-muted-foreground">Payment plan</span>
                <select value={edit.paymentPlan} onChange={(e) => setEdit({ ...edit, paymentPlan: e.target.value })} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-gold">
                  <option value="">—</option>
                  {PAYMENT_PLAN_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.8rem] text-muted-foreground">Fee type</span>
                <select value={edit.feeType} onChange={(e) => setEdit({ ...edit, feeType: e.target.value as "monthly" | "term" })} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-gold">
                  <option value="monthly">Monthly</option>
                  <option value="term">Term course</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.8rem] text-muted-foreground">Next charge date</span>
                <input type="date" value={edit.nextChargeDate} onChange={(e) => setEdit({ ...edit, nextChargeDate: e.target.value })} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-gold" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.8rem] text-muted-foreground">Monthly fee (₹)</span>
                <input inputMode="decimal" value={edit.monthlyFeeRupees} onChange={(e) => setEdit({ ...edit, monthlyFeeRupees: e.target.value })} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-gold" placeholder="2000" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.8rem] text-muted-foreground">Term fee (₹)</span>
                <input inputMode="decimal" value={edit.termFeeRupees} onChange={(e) => setEdit({ ...edit, termFeeRupees: e.target.value })} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-gold" placeholder="6000" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.8rem] text-muted-foreground">Term start</span>
                <input type="date" value={edit.termStartDate} onChange={(e) => setEdit({ ...edit, termStartDate: e.target.value })} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-gold" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.8rem] text-muted-foreground">Term end</span>
                <input type="date" value={edit.termEndDate} onChange={(e) => setEdit({ ...edit, termEndDate: e.target.value })} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-gold" />
              </label>
            </div>

            <button onClick={handleSaveEdit} disabled={savingEdit} className="mt-4 w-full rounded-md bg-gradient-primary px-4 py-2.5 font-body text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
              {savingEdit ? "Saving…" : "Save changes"}
            </button>

            {/* Mark Full Paid — corrects amount + activates */}
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50/60 p-3">
              <p className="font-body text-[0.82rem] font-semibold text-green-800">Record full payment</p>
              <p className="mt-0.5 font-body text-[0.72rem] text-muted-foreground">Enter the amount actually received to mark this as Full Paid and activate the enrolment.</p>
              <div className="mt-2 flex items-center gap-2">
                <input inputMode="decimal" value={edit.fullPaidRupees} onChange={(e) => setEdit({ ...edit, fullPaidRupees: e.target.value })} className="h-9 w-32 rounded-md border border-border bg-background px-2 font-body text-sm outline-none focus:border-gold" placeholder="6000" />
                <button onClick={handleMarkFullPaid} className="flex-1 rounded-md border border-green-400 bg-green-100 px-3 py-2 font-body text-sm font-semibold text-green-800 hover:bg-green-200">
                  Mark Full Paid &amp; Activate
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      <AlertDialog open={!!confirmState} onOpenChange={(open) => { if (!open) setConfirmState(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmState?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { const action = confirmState?.onConfirm; setConfirmState(null); void action?.(); }}
              className={confirmState?.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {confirmState?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminEnrollments;
