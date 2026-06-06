import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, GraduationCap, Loader2, Repeat, Wallet, XCircle } from "lucide-react";
import AccountLayout from "@/components/account/AccountLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useScrollHighlight } from "@/hooks/useScrollHighlight";
import {
  cancelSubscription,
  deriveDisplayFeeStatus,
  ENROLLMENT_STATUS_LABELS,
  FEE_STATUS_LABELS,
  formatFeeAmount,
  formatMonthRange,
  formatNiceDate,
  getClassFeeLabel,
  isFeePayable,
  payFeeNow,
  subscribeToMyEnrollments,
  subscribeToMyFees,
  type EnrollmentDoc,
  type FeePaymentDoc,
  type FeeStatus,
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

  const handlePayNow = async (fee: FeePaymentDoc) => {
    if (!user) return;
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

                {/* Term span + next charge date */}
                {(() => {
                  const range = enrollment.feeType === "term" ? formatMonthRange(enrollment.termStartDate, enrollment.termEndDate) : "";
                  const nextCharge = enrollment.nextChargeDate ? formatNiceDate(enrollment.nextChargeDate) : "";
                  if (!range && !nextCharge) return null;
                  return (
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 font-body text-xs text-muted-foreground">
                      {range && <span className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-gold" /> Course months: <span className="font-semibold text-foreground">{range}</span></span>}
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

                {/* History */}
                <div className="mt-4">
                  <p className="mb-2 font-body text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment history</p>
                  {enrollmentFees.length === 0 ? (
                    <p className="font-body text-sm text-muted-foreground">No fee records yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {enrollmentFees.map((fee) => {
                        const displayStatus = deriveDisplayFeeStatus(fee);
                        return (
                          <div key={fee.id} id={`fee-${fee.id}`} className="flex items-center justify-between rounded-lg border border-border/60 bg-background/70 px-3 py-2 scroll-mt-28">
                            <div>
                              <p className="font-body text-sm font-medium text-foreground">{fee.periodLabel}</p>
                              <p className="font-body text-xs text-muted-foreground">{formatFeeAmount(fee)}{fee.paymentMethod ? ` · ${fee.paymentMethod}` : ""}</p>
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
    </AccountLayout>
  );
};

export default Classes;
