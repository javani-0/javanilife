import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Clock, DoorOpen, GraduationCap, Loader2, Repeat, Wallet, XCircle, Zap } from "lucide-react";
import AccountLayout from "@/components/account/AccountLayout";
import UpiPaymentDialog from "@/components/classes/UpiPaymentDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useScrollHighlight } from "@/hooks/useScrollHighlight";
import {
  addMonths,
  cancelSubscription,
  confirmSubscription,
  createSubscription,
  deriveDisplayFeeStatus,
  describeFeeEditChanges,
  ENROLLMENT_STATUS_LABELS,
  FEE_STATUS_LABELS,
  feePaidStatement,
  formatFeeAmount,
  formatFeeDate,
  formatMonthRange,
  formatNiceDate,
  getClassFeeLabel,
  isFeePayable,
  isPrepaymentEnrollment,
  monthKeyFor,
  openSubscriptionCheckout,
  payFeeNow,
  periodLabel,
  subscribeToMyEnrollments,
  subscribeToMyFees,
  type EnrollmentDoc,
  type FeePaymentDoc,
  type FeeStatus,
  type UpiPaymentTarget,
} from "@/lib/classes";

const feeStatusStyles: Record<FeeStatus, string> = {
  paid: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  overdue: "bg-red-100 text-red-700",
  failed: "bg-red-100 text-red-700",
  waived: "bg-muted text-muted-foreground",
};

const Classes = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [enrollments, setEnrollments] = useState<EnrollmentDoc[]>([]);
  const [fees, setFees] = useState<FeePaymentDoc[]>([]);
  const [loadingEnrollments, setLoadingEnrollments] = useState(true);
  const [loadingFees, setLoadingFees] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [upiDialog, setUpiDialog] = useState<{ target: UpiPaymentTarget; amount: number; title: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubEnrollments = subscribeToMyEnrollments(user.uid, (items) => { setEnrollments(items); setLoadingEnrollments(false); }, () => setLoadingEnrollments(false));
    const unsubFees = subscribeToMyFees(user.uid, (items) => { setFees(items); setLoadingFees(false); }, () => setLoadingFees(false));
    return () => { unsubEnrollments(); unsubFees(); };
  }, [user]);

  const feesByEnrollment = useMemo(() => {
    const map = new Map<string, FeePaymentDoc[]>();
    for (const fee of fees) {
      const list = map.get(fee.enrollmentId) || [];
      list.push(fee);
      map.set(fee.enrollmentId, list);
    }
    return map;
  }, [fees]);

  // EMI installments stay on Razorpay (auto-pay); everything else (monthly
  // pre-payment, term "pay full") uses the low-commission manual UPI flow.
  const isEmiFee = (fee: FeePaymentDoc): boolean => fee.paymentPlan === "emi" || /_emi-\d+$/.test(fee.id);

  const handlePayNow = async (fee: FeePaymentDoc) => {
    if (!user) return;
    if (!isEmiFee(fee)) { setUpiDialog({ target: { feePaymentId: fee.id }, amount: fee.amountInPaise, title: `${fee.className} — ${fee.periodLabel}` }); return; }
    setBusyId(fee.id);
    try {
      const idToken = await user.getIdToken();
      await payFeeNow({
        idToken,
        feePaymentIdOrEnrollment: { feePaymentId: fee.id },
        description: `${fee.className} — ${fee.periodLabel}`,
        prefill: { name: fee.parentName, email: user.email || "", contact: fee.parentPhone },
      });
      toast({ title: "Payment received", description: `${fee.periodLabel} fee is being confirmed.` });
    } catch (error) {
      toast({ title: "Payment not completed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  // Onboarded students whose admin enabled the autopay option complete the
  // recurring mandate here (a mandate can only be authorized by the payer).
  const handleEnableAutopay = async (enrollment: EnrollmentDoc) => {
    if (!user) return;
    setBusyId(enrollment.id);
    try {
      const idToken = await user.getIdToken();
      const subscription = await createSubscription(idToken, enrollment.id);
      const mandate = await openSubscriptionCheckout({
        subscriptionId: subscription.subscriptionId,
        keyId: subscription.keyId,
        name: "Javani Spiritual Hub",
        description: `${enrollment.className} — monthly autopay`,
        prefill: { name: enrollment.parent.name, email: user.email || "", contact: enrollment.parent.phone },
      });
      try {
        await confirmSubscription(idToken, {
          enrollmentId: enrollment.id,
          razorpay_payment_id: mandate.razorpay_payment_id,
          razorpay_subscription_id: mandate.razorpay_subscription_id,
          razorpay_signature: mandate.razorpay_signature,
        });
      } catch (confirmError) {
        console.error("Autopay confirmation sync failed (webhook will reconcile)", confirmError);
      }
      toast({ title: "Autopay set up", description: "We'll auto-debit the monthly fee and notify you each time." });
    } catch (error) {
      toast({ title: "Could not set up autopay", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleCancelAutopay = async (enrollment: EnrollmentDoc) => {
    if (!user) return;
    if (!confirm(`Cancel autopay for ${enrollment.student.name}'s ${enrollment.className}? You can still pay manually each month.`)) return;
    setBusyId(enrollment.id);
    try {
      const idToken = await user.getIdToken();
      await cancelSubscription(idToken, enrollment.id);
      toast({ title: "Autopay cancelled", description: "You'll need to pay manually going forward." });
    } catch (error) {
      toast({ title: "Could not cancel autopay", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  // The next uncovered month for a monthly enrolment — pay it early ("advance").
  const nextAdvanceMonthKey = (enrollment: EnrollmentDoc): string => {
    const list = feesByEnrollment.get(enrollment.id) || [];
    const highest = list
      .filter((fee) => fee.monthKey && !/_(full|advance|emi-\d+)$/.test(fee.id))
      .reduce((max, fee) => (fee.monthKey > max ? fee.monthKey : max), "");
    const base = highest || addMonths(monthKeyFor(new Date()), -1);
    return addMonths(base, 1);
  };

  // Prepayment (new-student) enrolments bill in arrears: the doc collected in
  // month M is the fee OF month M-1 — label the advance button accordingly.
  const advanceFeeLabel = (enrollment: EnrollmentDoc, monthKey: string): string =>
    isPrepaymentEnrollment(enrollment) ? periodLabel(addMonths(monthKey, -1)) : periodLabel(monthKey);

  const handlePayAdvance = (enrollment: EnrollmentDoc) => {
    const monthKey = nextAdvanceMonthKey(enrollment);
    setUpiDialog({
      target: { enrollmentId: enrollment.id, kind: "monthly", monthKey },
      amount: enrollment.monthlyFeeInPaise,
      title: `${enrollment.className} — ${advanceFeeLabel(enrollment, monthKey)} (advance)`,
    });
  };

  const loading = loadingEnrollments || loadingFees;

  // Deep link from WhatsApp fee notifications: /account/classes?fee=<feePaymentId>
  useScrollHighlight("fee", !loading);

  return (
    <AccountLayout title="My Classes" description="Manage enrolments, autopay, and monthly fee payments.">
      <div className="space-y-4">
        <div className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-card p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2 className="font-display text-2xl text-foreground">Enrolled Classes</h2>
            <p className="font-body text-sm text-muted-foreground">Track autopay, upcoming dues, and payment history.</p>
          </div>
          <Link to="/classes" className="font-body text-sm font-semibold text-gold hover:text-gold-light">Browse more classes</Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border border-border/60 bg-card p-10">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        ) : enrollments.length === 0 ? (
          <div className="rounded-2xl border border-gold/15 bg-card p-10 text-center shadow-card">
            <GraduationCap className="mx-auto mb-3 h-10 w-10 text-gold" />
            <h3 className="font-display text-xl text-foreground">No enrolments yet</h3>
            <p className="mt-1 font-body text-sm text-muted-foreground">Enrol your child in a monthly class to see it here.</p>
            <Link to="/classes" className="mt-4 inline-block rounded-sm bg-gradient-primary px-5 py-2.5 font-body text-sm font-semibold text-primary-foreground hover:brightness-110">Browse classes</Link>
          </div>
        ) : (
          enrollments.map((enrollment) => {
            const enrollmentFees = feesByEnrollment.get(enrollment.id) || [];
            const upcoming = enrollmentFees.find((fee) => isFeePayable({ status: deriveDisplayFeeStatus(fee) }));
            const autopayOn = enrollment.autopay.enabled;
            return (
              <div key={enrollment.id} className="rounded-2xl border border-border/60 bg-card p-5 shadow-card sm:p-6">
                <div className="flex flex-col gap-3 border-b border-border/50 pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-xl text-foreground">{enrollment.student.name}</h3>
                      <span className="rounded-full bg-gold/10 px-2.5 py-1 font-body text-xs font-semibold text-gold">{enrollment.className}</span>
                      <span className="rounded-full bg-muted px-2.5 py-1 font-body text-xs text-muted-foreground">{ENROLLMENT_STATUS_LABELS[enrollment.status]}</span>
                    </div>
                    <p className="mt-1 font-body text-sm text-muted-foreground">{getClassFeeLabel({ monthlyFeeInPaise: enrollment.monthlyFeeInPaise, feeType: enrollment.feeType, termFeeInPaise: enrollment.termFeeInPaise })}</p>
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    {enrollment.feeType === "term" ? (
                      <span className="flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 font-body text-xs font-semibold text-gold">
                        <Repeat className="h-3.5 w-3.5" /> {enrollment.paymentPlan === "emi" ? "EMI plan" : "Course"}
                      </span>
                    ) : (
                      <>
                        <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-body text-xs font-semibold ${autopayOn ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                          <Repeat className="h-3.5 w-3.5" /> Autopay {autopayOn ? "On" : "Off"}
                        </span>
                        {autopayOn && (
                          <button onClick={() => handleCancelAutopay(enrollment)} disabled={busyId === enrollment.id} className="flex items-center gap-1 font-body text-xs font-semibold text-destructive hover:underline disabled:opacity-50">
                            <XCircle className="h-3.5 w-3.5" /> Cancel autopay
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Batch (class timing) + billed period + next charge date */}
                {(() => {
                  const batch = enrollment.slotLabel || "";
                  // Show the fixed course range only for terms; monthly cycles
                  // change each month, so those are read from the history below.
                  const billingPeriod = enrollment.feeType === "term"
                    ? (enrollment.billingPeriodLabel || formatMonthRange(enrollment.billingStartMonth || enrollment.termStartDate, enrollment.billingEndMonth || enrollment.termEndDate))
                    : "";
                  const nextCharge = enrollment.nextChargeDate ? formatNiceDate(enrollment.nextChargeDate) : "";
                  if (!batch && !billingPeriod && !nextCharge) return null;
                  return (
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 font-body text-xs text-muted-foreground">
                      {batch && <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-gold" /> Class timing: <span className="font-semibold text-foreground">{batch}</span></span>}
                      {billingPeriod && <span className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-gold" /> Billing period: <span className="font-semibold text-foreground">{billingPeriod}</span></span>}
                      {nextCharge && <span className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-gold" /> Next charge: <span className="font-semibold text-foreground">{nextCharge}</span></span>}
                    </div>
                  );
                })()}

                {/* Upcoming / payable */}
                {upcoming && (
                  <div className="mt-4 flex flex-col gap-3 rounded-xl border border-gold/20 bg-gold/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="h-5 w-5 text-gold" />
                      <div>
                        <p className="font-body text-sm font-semibold text-foreground">{upcoming.periodLabel} — {formatFeeAmount(upcoming)}</p>
                        <p className="font-body text-xs text-muted-foreground">Due {upcoming.dueDate || "soon"}</p>
                      </div>
                    </div>
                    {!autopayOn && (
                      <button onClick={() => handlePayNow(upcoming)} disabled={busyId === upcoming.id} className="flex min-h-10 items-center justify-center gap-1.5 rounded-sm bg-gradient-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60">
                        {busyId === upcoming.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />} Pay Now
                      </button>
                    )}
                  </div>
                )}

                {/* Actions: open class room, enable autopay, pay in advance, switch class */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link
                    to={`/account/classes/${enrollment.id}`}
                    className="flex items-center gap-1.5 rounded-md bg-gold/10 px-3 py-1.5 font-body text-xs font-semibold text-gold transition-colors hover:bg-gold/20"
                  >
                    <DoorOpen className="h-3.5 w-3.5" /> Open class
                  </Link>
                  {enrollment.feeType !== "term" && enrollment.status === "active" && !autopayOn && enrollment.autopayInvited && (
                    <button
                      onClick={() => handleEnableAutopay(enrollment)}
                      disabled={busyId === enrollment.id}
                      className="flex items-center gap-1.5 rounded-md border border-gold/40 px-3 py-1.5 font-body text-xs font-semibold text-gold transition-colors hover:bg-gold/10 disabled:opacity-50"
                    >
                      <Zap className="h-3.5 w-3.5" /> Enable autopay
                    </button>
                  )}
                  {enrollment.feeType !== "term" && enrollment.status === "active" && !autopayOn && (
                    <button
                      onClick={() => handlePayAdvance(enrollment)}
                      className="flex items-center gap-1.5 rounded-md border border-gold/40 px-3 py-1.5 font-body text-xs font-semibold text-gold transition-colors hover:bg-gold/10"
                    >
                      <CalendarClock className="h-3.5 w-3.5" /> Pay {advanceFeeLabel(enrollment, nextAdvanceMonthKey(enrollment))} in advance
                    </button>
                  )}
                  {enrollment.status !== "cancelled" && (
                    <Link
                      to="/classes"
                      className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-body text-xs font-semibold text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold"
                    >
                      <Repeat className="h-3.5 w-3.5" /> Switch to another class
                    </Link>
                  )}
                </div>

                {/* History */}
                <div className="mt-4">
                  <p className="mb-2 font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment history</p>
                  {enrollmentFees.length === 0 ? (
                    <p className="font-body text-sm text-muted-foreground">No fee records yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {enrollmentFees.map((fee) => {
                        const displayStatus = deriveDisplayFeeStatus(fee);
                        const paidStatement = feePaidStatement(fee);
                        const adminEdits = (fee.collectionHistory || []).filter((event) => event.action === "fee-edited");
                        return (
                          <div key={fee.id} id={`fee-${fee.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/70 px-3 py-2 scroll-mt-28">
                            <div className="min-w-0">
                              <p className="font-body text-sm font-medium text-foreground">{fee.periodLabel}</p>
                              <p className="font-body text-xs text-muted-foreground">{formatFeeAmount(fee)}{fee.paymentMethod ? ` · ${fee.paymentMethod}` : ""}</p>
                              {/* Req: say exactly which month's fee was paid on which date —
                                  arrears billing makes "June 2026 fee paid on 11 July 2026" the
                                  clear version of an otherwise confusing pair of dates. */}
                              {paidStatement && (
                                <p className="mt-0.5 font-body text-[0.7rem] font-medium text-green-700">{paidStatement}</p>
                              )}
                              {/* Req: the parent can see exactly what the admin changed. */}
                              {adminEdits.map((event, index) => (
                                <p key={index} className="mt-0.5 font-body text-[0.7rem] text-amber-700">
                                  Updated by admin on {formatFeeDate(event.at)}{event.changes?.length ? ` — ${describeFeeEditChanges(event.changes)}` : ""}
                                </p>
                              ))}
                              {displayStatus === "processing" && fee.paymentMethod === "upi" && (
                                <p className="mt-0.5 font-body text-[0.7rem] text-blue-600">⏳ Awaiting admin approval</p>
                              )}
                              {fee.upiRejectedReason && isFeePayable({ status: displayStatus }) && (
                                <p className="mt-0.5 font-body text-[0.7rem] text-destructive">Rejected: {fee.upiRejectedReason}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full px-2.5 py-1 font-body text-xs font-semibold ${feeStatusStyles[displayStatus]}`}>{FEE_STATUS_LABELS[displayStatus]}</span>
                              {!autopayOn && isFeePayable({ status: displayStatus }) && fee.id !== upcoming?.id && (
                                <button onClick={() => handlePayNow(fee)} disabled={busyId === fee.id} className="rounded-sm border border-gold/40 px-3 py-1 font-body text-xs font-semibold text-gold hover:bg-gold/10 disabled:opacity-50">
                                  Pay
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      <UpiPaymentDialog
        open={Boolean(upiDialog)}
        target={upiDialog?.target || null}
        amountInPaise={upiDialog?.amount || 0}
        title={upiDialog?.title || ""}
        onClose={() => setUpiDialog(null)}
        onSuccess={() => setUpiDialog(null)}
      />
    </AccountLayout>
  );
};

export default Classes;
