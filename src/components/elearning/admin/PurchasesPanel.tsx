// Purchases tab: QR approvals (approve / reject with reason), active access
// (revoke), rejected / revoked history, totals, and "Grant access".
import { useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertTriangle, Ban, Check, Copy, ExternalLink, Gift, Loader2, QrCode, RotateCcw, Search, Smartphone, X, ZoomIn,
  TicketPercent,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatPaiseAsRupees } from "@/lib/ecommerce/pricing";
import {
  reviewElearnEnrollment,
  toMillis,
  type ElearnCourse,
  type ElearnEnrollment,
  type ElearnEnrollmentStatus,
} from "@/lib/elearning";
import { matchesPurchaseSearch, purchaseTotals } from "@/lib/elearning/adminHelpers";
import { inputClass, labelClass, primaryButton, secondaryButton } from "./ui";
import GrantAccessDialog from "./GrantAccessDialog";
import { cn } from "@/lib/utils";

type Filter = "processing" | "active" | "rejected" | "revoked" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "processing", label: "Pending approval" },
  { value: "active", label: "Active" },
  { value: "rejected", label: "Rejected" },
  { value: "revoked", label: "Revoked" },
  { value: "all", label: "All" },
];

const STATUS_LABEL: Record<ElearnEnrollmentStatus, string> = {
  "awaiting-payment": "Payment not finished",
  processing: "Pending approval",
  active: "Active",
  rejected: "Rejected",
  revoked: "Revoked",
};

const STATUS_STYLE: Record<ElearnEnrollmentStatus, string> = {
  "awaiting-payment": "bg-muted text-muted-foreground ring-border",
  processing: "bg-amber-50 text-amber-900 ring-amber-200",
  active: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  rejected: "bg-red-50 text-red-800 ring-red-200",
  revoked: "bg-muted text-foreground ring-border",
};

const METHOD_LABEL = { razorpay: "Razorpay", upi: "QR scan", grant: "Granted", coupon: "Free coupon", "": "Not paid" } as const;

const dateText = (value: unknown, pattern = "d MMM yyyy") => {
  const ms = toMillis(value as never);
  return ms ? format(new Date(ms), pattern) : "";
};
const agoText = (value: unknown) => {
  const ms = toMillis(value as never);
  return ms ? formatDistanceToNow(new Date(ms), { addSuffix: true }) : "";
};
const extraPayments = (item: ElearnEnrollment) =>
  (item.extraPaymentIds || []).filter((id) => id && id !== item.razorpayPaymentId);

const Badge = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-body text-[0.72rem] font-semibold ring-1", className)}>{children}</span>
);

const Flags = ({ item }: { item: ElearnEnrollment }) => {
  const extras = extraPayments(item);
  return (
    <>
      {item.previousStatus === "rejected" && (
        <Badge className="bg-sky-50 text-sky-900 ring-sky-200"><RotateCcw className="h-3 w-3" aria-hidden="true" /> Resubmitted after rejection</Badge>
      )}
      {extras.length > 0 && (
        <Badge className="bg-amber-50 text-amber-900 ring-amber-300">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Extra payment — refund needed
        </Badge>
      )}
      {item.refundedAt && <Badge className="bg-muted text-foreground ring-border">Refunded {dateText(item.refundedAt)}</Badge>}
    </>
  );
};

const CopyButton = ({ value, label }: { value: string; label: string }) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Could not copy", description: "Select the number and copy it by hand.", variant: "destructive" });
    }
  };
  return (
    <button type="button" onClick={() => void copy()} aria-label={label}
      className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2 font-body text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
};

const ReasonField = ({ id, value, onChange, hint }: { id: string; value: string; onChange: (value: string) => void; hint: string }) => (
  <div>
    <label htmlFor={id} className={labelClass}>Reason (the student sees this)</label>
    <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} rows={3} maxLength={300} className={cn(inputClass, "resize-y")} aria-describedby={`${id}-hint`} />
    <p id={`${id}-hint`} className="mt-1 font-body text-[0.75rem] text-muted-foreground">{hint}</p>
  </div>
);

const PurchasesPanel = ({
  enrollments,
  state,
  courses,
}: {
  enrollments: ElearnEnrollment[];
  state: "loading" | "ready" | "error";
  courses: ElearnCourse[];
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>("processing");
  const [courseFilter, setCourseFilter] = useState("");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ElearnEnrollment | null>(null);
  const [rejecting, setRejecting] = useState<ElearnEnrollment | null>(null);
  const [revoking, setRevoking] = useState<ElearnEnrollment | null>(null);
  const [reopening, setReopening] = useState<ElearnEnrollment | null>(null);
  const [reason, setReason] = useState("");
  const [granting, setGranting] = useState(false);

  const totals = useMemo(() => purchaseTotals(enrollments), [enrollments]);
  const scoped = useMemo(
    () => enrollments.filter((item) => (!courseFilter || item.courseId === courseFilter) && matchesPurchaseSearch(item, search)),
    [enrollments, courseFilter, search],
  );
  const counts = useMemo(() => {
    const result: Record<Filter, number> = { processing: 0, active: 0, rejected: 0, revoked: 0, all: scoped.length };
    for (const item of scoped) if (item.status in result) result[item.status as Filter] += 1;
    return result;
  }, [scoped]);
  const visible = useMemo(() => {
    const list = filter === "all" ? scoped : scoped.filter((item) => item.status === filter);
    // Oldest first for approvals (first come, first served); newest first otherwise.
    return filter === "processing"
      ? [...list].sort((a, b) => (toMillis(a.submittedAt) || toMillis(a.updatedAt) || 0) - (toMillis(b.submittedAt) || toMillis(b.updatedAt) || 0))
      : list;
  }, [scoped, filter]);
  const courseTitle = (item: ElearnEnrollment) => courses.find((course) => course.id === item.courseId)?.title || item.courseTitle || item.courseId;

  const run = async (item: ElearnEnrollment, op: "approve" | "reject" | "revoke" | "reopen", why?: string) => {
    if (!user) {
      toast({ title: "You are signed out", description: "Sign in again and retry.", variant: "destructive" });
      return false;
    }
    setBusyId(item.id);
    try {
      const token = await user.getIdToken();
      await reviewElearnEnrollment(token, op === "approve" || op === "reopen" ? { op, enrollmentId: item.id } : { op, enrollmentId: item.id, reason: why });
      toast({
        title: op === "approve" ? "Approved: access unlocked" : op === "reject" ? "Payment rejected" : op === "reopen" ? "Cleared: they can buy again" : "Access revoked",
        description: `${item.userName || item.userEmail} · ${courseTitle(item)}`,
      });
      return true;
    } catch (error) {
      toast({ title: "That didn't work", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const submitReject = async () => {
    if (!rejecting || !reason.trim()) return;
    if (await run(rejecting, "reject", reason.trim())) setRejecting(null);
  };
  const submitRevoke = async () => {
    if (!revoking || !reason.trim()) return;
    if (await run(revoking, "revoke", reason.trim())) setRevoking(null);
  };

  const submitReopen = async () => {
    if (!reopening) return;
    if (await run(reopening, "reopen")) setReopening(null);
  };

  if (state === "error") {
    return (
      <div role="alert" className="rounded-xl border border-destructive/30 bg-card p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-destructive" aria-hidden="true" />
        <p className="mt-2 font-body text-sm font-semibold text-foreground">Couldn't load the purchases.</p>
        <p className="mt-1 font-body text-sm text-muted-foreground">Check your connection and reload the page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Totals */}
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Paid revenue (active)", value: state === "loading" ? null : formatPaiseAsRupees(totals.revenueInPaise), note: "Razorpay + approved QR; free grants not counted" },
          { label: "Active students", value: state === "loading" ? null : String(totals.activeStudents), note: "With access right now" },
          { label: "Pending approval", value: state === "loading" ? null : String(totals.pending), note: "QR screenshots to check" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
            <dt className="font-body text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{stat.label}</dt>
            <dd className="mt-1 font-display text-3xl font-semibold tabular-nums text-foreground">{stat.value ?? <Skeleton className="h-8 w-24" />}</dd>
            <dd className="font-body text-xs text-muted-foreground">{stat.note}</dd>
          </div>
        ))}
      </dl>

      {/* Filters */}
      <div className="space-y-3 rounded-xl border border-border/70 bg-card p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="group" aria-label="Show purchases" className="flex flex-wrap gap-1.5">
            {FILTERS.map((item) => (
              <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-body text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
                  filter === item.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted",
                )}>
                {item.label}
                <span className={cn("rounded-full px-1.5 text-xs tabular-nums", filter === item.value ? "bg-primary-foreground/20" : "bg-muted")}>{counts[item.value]}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setGranting(true)} disabled={courses.length === 0} className={cn(secondaryButton, "py-2")}>
            <Gift className="h-4 w-4" aria-hidden="true" /> Grant access
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <div>
            <label htmlFor="pp-course" className="sr-only">Course</label>
            <select id="pp-course" value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)} className={cn(inputClass, "h-[2.4rem]")}>
              <option value="">All courses</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.title || course.id}</option>)}
            </select>
          </div>
          <div className="relative">
            <label htmlFor="pp-search" className="sr-only">Search by name, email, phone or UTR</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input id="pp-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, phone or UTR" className={cn(inputClass, "pl-9")} />
          </div>
        </div>
      </div>

      {/* List */}
      {state === "loading" ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading purchases">
          {[0, 1, 2].map((key) => <Skeleton key={key} className="h-28 w-full rounded-xl" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/60 px-4 py-10 text-center">
          <p className="font-body text-sm font-semibold text-foreground">
            {filter === "processing" ? "No QR payments or free coupon requests waiting. You're all caught up." : "Nothing here yet."}
          </p>
          {(search || courseFilter) && <p className="mt-1 font-body text-sm text-muted-foreground">Try clearing the search or course filter.</p>}
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((item) => {
            const busy = busyId === item.id;
            const extras = extraPayments(item);
            if (item.status === "processing") {
              return (
                <li key={item.id} className="rounded-xl border border-amber-200 bg-card p-4 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row">
                    {item.upiProofUrl ? (
                      <button type="button" onClick={() => setZoom(item)} className="group relative h-40 w-full shrink-0 overflow-hidden rounded-lg border border-border bg-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold sm:h-36 sm:w-28" aria-label={`Zoom payment screenshot from ${item.userName || item.userEmail}`}>
                        <img src={item.upiProofUrl} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
                        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-charcoal/70 py-1 font-body text-xs font-semibold text-white"><ZoomIn className="h-3.5 w-3.5" aria-hidden="true" /> Zoom</span>
                      </button>
                    ) : item.method === "coupon" ? (
                      <span className="flex h-24 w-full shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-emerald-600/30 bg-emerald-50 font-body text-xs font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 sm:h-36 sm:w-28"><TicketPercent className="h-6 w-6" aria-hidden="true" /> Free coupon</span>
                    ) : (
                      <span className="flex h-24 w-full shrink-0 items-center justify-center rounded-lg border border-dashed border-border font-body text-xs text-muted-foreground sm:h-36 sm:w-28">No screenshot</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-body text-base font-semibold text-foreground">{item.userName || "Name not given"}</p>
                        <Flags item={item} />
                      </div>
                      <p className="font-body text-sm text-muted-foreground break-all">{item.userEmail}{item.userPhone ? ` · ${item.userPhone}` : ""}</p>
                      <p className="mt-1 font-body text-sm text-foreground">
                        {courseTitle(item)} · <span className="font-semibold">{item.method === "coupon" ? "Free" : formatPaiseAsRupees(item.amountInPaise)}</span>
                        {agoText(item.submittedAt) && <span className="text-muted-foreground"> · sent {agoText(item.submittedAt)}</span>}
                      </p>
                      {(item.bundleCourseTitles?.length ?? 0) > 1 && (
                        <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 font-body text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                          {item.method === "coupon" ? "Asked together for" : "Paid together for"} {item.bundleCourseTitles!.length} master classes: {item.bundleCourseTitles!.join(", ")}
                          {typeof item.bundleTotalInPaise === "number" && <> · total <span className="font-semibold">{formatPaiseAsRupees(item.bundleTotalInPaise)}</span></>}
                          . Approve or reject applies to all of them.
                        </p>
                      )}
                      {item.method === "coupon" ? (
                        <>
                          <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 font-body text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                            Free with coupon <span className="font-mono font-semibold">{item.couponCode}</span>{typeof item.listPriceInPaise === "number" && item.listPriceInPaise > 0 ? <> (price {formatPaiseAsRupees(item.listPriceInPaise)})</> : null}. No payment to check.
                          </p>
                          <p className="mt-1 font-body text-xs text-muted-foreground">Check that this student should get it free, then approve. It unlocks only after you approve.</p>
                        </>
                      ) : (
                        <>
                          {item.couponCode && <p className="mt-1 font-body text-xs text-muted-foreground">Coupon <span className="font-mono font-semibold text-foreground">{item.couponCode}</span> used</p>}
                          <div className="mt-2 inline-flex flex-wrap items-center gap-2 rounded-lg bg-ivory px-3 py-2">
                            <span className="font-body text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">UTR</span>
                            <span className="font-mono text-base font-semibold tracking-wider text-foreground">{item.upiRef || "not given"}</span>
                            {item.upiRef && <CopyButton value={item.upiRef} label={`Copy UTR ${item.upiRef}`} />}
                          </div>
                          <p className="mt-1 font-body text-xs text-muted-foreground">Match this UTR and the amount in your bank or UPI app before approving.</p>
                        </>
                      )}
                      {item.previousStatus === "rejected" && item.previousRejectReason && (
                        <p className="mt-1 font-body text-xs text-muted-foreground">Earlier rejected: "{item.previousRejectReason}"</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2 sm:flex-col">
                      <button type="button" onClick={() => void run(item, "approve")} disabled={busy} className={cn(primaryButton, "flex-1 sm:flex-none")}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />} Approve
                      </button>
                      <button type="button" onClick={() => { setReason(""); setRejecting(item); }} disabled={busy} className={cn(secondaryButton, "flex-1 hover:border-destructive/40 hover:text-destructive sm:flex-none")}>
                        <X className="h-4 w-4" aria-hidden="true" /> Reject
                      </button>
                    </div>
                  </div>
                </li>
              );
            }

            const expiresMs = toMillis(item.expiresAt);
            const expired = item.status === "active" && expiresMs !== null && expiresMs > 0 && expiresMs < Date.now();
            return (
              <li key={item.id} className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-body text-base font-semibold text-foreground">{item.userName || item.userEmail || "Unknown student"}</p>
                      <Badge className={STATUS_STYLE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                      {expired && <Badge className="bg-red-50 text-red-800 ring-red-200">Expired</Badge>}
                      <Flags item={item} />
                    </div>
                    <p className="font-body text-sm text-muted-foreground break-all">{item.userEmail}{item.userPhone ? ` · ${item.userPhone}` : ""}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 font-body text-sm text-foreground">
                      <span>{courseTitle(item)}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="inline-flex items-center gap-1">
                        {item.method === "razorpay" ? <Smartphone className="h-3.5 w-3.5" aria-hidden="true" /> : item.method === "upi" ? <QrCode className="h-3.5 w-3.5" aria-hidden="true" /> : item.method === "grant" ? <Gift className="h-3.5 w-3.5" aria-hidden="true" /> : item.method === "coupon" ? <TicketPercent className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                        {METHOD_LABEL[item.method]}
                      </span>
                      {item.method !== "grant" && item.amountInPaise > 0 && <span className="font-semibold">{formatPaiseAsRupees(item.amountInPaise)}</span>}
                    </p>
                    {(item.couponCode || (item.bundleCourseTitles?.length ?? 0) > 1) && (
                      <p className="mt-0.5 font-body text-xs text-muted-foreground">
                        {item.couponCode && <>Coupon <span className="font-mono font-semibold text-foreground">{item.couponCode}</span></>}
                        {item.couponCode && (item.bundleCourseTitles?.length ?? 0) > 1 && " · "}
                        {(item.bundleCourseTitles?.length ?? 0) > 1 && (
                          <>
                            Paid together: {item.bundleCourseTitles!.length} master classes
                            {typeof item.bundleTotalInPaise === "number" && item.bundleTotalInPaise > 0 && <> · total {formatPaiseAsRupees(item.bundleTotalInPaise)}</>}
                          </>
                        )}
                      </p>
                    )}
                    <p className="mt-0.5 font-body text-xs text-muted-foreground">
                      {item.status === "active" && (
                        <>
                          {dateText(item.activatedAt) ? `Unlocked ${dateText(item.activatedAt)}` : "Unlocked"}
                          {" · "}
                          {expiresMs ? `${expired ? "Ended" : "Ends"} ${dateText(item.expiresAt)}` : "Lifetime"}
                        </>
                      )}
                      {item.status !== "active" && item.status !== "awaiting-payment" && item.rejectReason && `Reason: ${item.rejectReason}`}
                      {item.status === "awaiting-payment" && `Started checkout ${agoText(item.createdAt || item.updatedAt) || ""}; no payment received.`}
                      {item.upiRef && <> · UTR <span className="font-mono">{item.upiRef}</span></>}
                      {item.razorpayPaymentId && <> · Payment <span className="font-mono">{item.razorpayPaymentId}</span></>}
                    </p>
                    {extras.length > 0 && (
                      <p className="mt-1 font-body text-xs font-medium text-amber-900">
                        Refund in Razorpay: <span className="font-mono">{extras.join(", ")}</span>
                      </p>
                    )}
                  </div>
                  {item.status === "active" && (
                    <button type="button" onClick={() => { setReason(""); setRevoking(item); }} disabled={busy} className={cn(secondaryButton, "shrink-0 py-2 hover:border-destructive/40 hover:text-destructive")}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Ban className="h-4 w-4" aria-hidden="true" />} Revoke
                    </button>
                  )}
                  {(item.status === "revoked" || item.status === "rejected") && (
                    <button type="button" onClick={() => setReopening(item)} disabled={busy} className={cn(secondaryButton, "shrink-0 py-2")}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />} Allow to buy again
                    </button>
                  )}
                  {item.upiProofUrl && item.status !== "active" && (
                    <button type="button" onClick={() => setZoom(item)} className={cn(secondaryButton, "shrink-0 py-2")}>
                      <ZoomIn className="h-4 w-4" aria-hidden="true" /> Screenshot
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Screenshot zoom */}
      <Dialog open={zoom !== null} onOpenChange={(open) => { if (!open) setZoom(null); }}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Payment screenshot</DialogTitle>
            <DialogDescription className="font-body">
              {zoom ? `${zoom.userName || zoom.userEmail} · ${courseTitle(zoom)} · ${formatPaiseAsRupees(zoom.amountInPaise)}` : ""}
            </DialogDescription>
          </DialogHeader>
          {zoom?.upiRef && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-ivory px-3 py-2">
              <span className="font-body text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">UTR</span>
              <span className="font-mono text-base font-semibold tracking-wider">{zoom.upiRef}</span>
              <CopyButton value={zoom.upiRef} label={`Copy UTR ${zoom.upiRef}`} />
            </div>
          )}
          {zoom?.upiProofUrl && <img src={zoom.upiProofUrl} alt={`Payment screenshot sent by ${zoom.userName || zoom.userEmail}`} className="mx-auto max-h-[65vh] w-auto rounded-lg border border-border" />}
          <DialogFooter className="gap-2 sm:gap-0">
            {zoom?.upiProofUrl && (
              <a href={zoom.upiProofUrl} target="_blank" rel="noreferrer" className={secondaryButton}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open in new tab
              </a>
            )}
            {zoom?.status === "processing" && (
              <button type="button" disabled={busyId === zoom.id} onClick={() => { const item = zoom; void run(item, "approve").then((ok) => { if (ok) setZoom(null); }); }} className={primaryButton}>
                {busyId === zoom.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />} Approve
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject */}
      <Dialog open={rejecting !== null} onOpenChange={(open) => { if (!open && busyId === null) setRejecting(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Reject this payment?</DialogTitle>
            <DialogDescription className="font-body">
              {rejecting ? `${rejecting.userName || rejecting.userEmail} · ${courseTitle(rejecting)}. They can send a new screenshot after this.` : ""}
            </DialogDescription>
          </DialogHeader>
          <ReasonField id="pp-reject-reason" value={reason} onChange={setReason} hint='For example: "Amount does not match" or "UTR not found in our account".' />
          <DialogFooter className="gap-2 sm:gap-0">
            <button type="button" onClick={() => setRejecting(null)} disabled={busyId !== null} className={secondaryButton}>Cancel</button>
            <button type="button" onClick={() => void submitReject()} disabled={busyId !== null || !reason.trim()} className={cn(primaryButton, "bg-none bg-destructive")}>
              {busyId !== null ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />} Reject payment
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke */}
      <AlertDialog open={revoking !== null} onOpenChange={(open) => { if (!open && busyId === null) setRevoking(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl">Revoke access?</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              {revoking ? `${revoking.userName || revoking.userEmail} loses access to "${courseTitle(revoking)}" at once. This does not refund money: refund in Razorpay or by UPI yourself if needed.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ReasonField id="pp-revoke-reason" value={reason} onChange={setReason} hint='For example: "Refunded on request" or "Account shared with others".' />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>Keep access</AlertDialogCancel>
            <AlertDialogAction
              disabled={busyId !== null || !reason.trim()}
              onClick={(event) => { event.preventDefault(); void submitRevoke(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busyId !== null && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />} Revoke access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Allow to buy again */}
      <AlertDialog open={reopening !== null} onOpenChange={(open) => { if (!open && busyId === null) setReopening(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl">Allow to buy again?</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              {reopening ? `This clears the ${reopening.status} record of ${reopening.userName || reopening.userEmail} for "${courseTitle(reopening)}", so they see "Buy now" again. Their old UTR and screenshot stay blocked. Settle any refund first.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busyId !== null} onClick={(event) => { event.preventDefault(); void submitReopen(); }}>
              {busyId !== null && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />} Allow to buy again
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GrantAccessDialog open={granting} onOpenChange={setGranting} courses={courses} defaultCourseId={courseFilter || undefined} />
    </div>
  );
};

export default PurchasesPanel;
