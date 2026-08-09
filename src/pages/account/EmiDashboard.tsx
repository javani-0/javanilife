import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { ArrowRight, CalendarDays, CheckCircle2, Clock, GraduationCap, PackageCheck } from "lucide-react";
import AccountLayout from "@/components/account/AccountLayout";
import ClassEmiCard from "@/components/account/ClassEmiCard";
import UpiPaymentDialog from "@/components/classes/UpiPaymentDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useStudentPortal } from "@/contexts/StudentPortalContext";
import { useToast } from "@/hooks/use-toast";
import { useScrollHighlight } from "@/hooks/useScrollHighlight";
import { db } from "@/lib/firebase";
import { formatPaiseAsRupees, type CourseInstallmentPlan, openRazorpayCheckout } from "@/lib/ecommerce";
import { payFeeNow, type FeePaymentDoc, type UpiPaymentTarget } from "@/lib/classes";
import { emiUsesRazorpay, hasEmiPlan } from "@/lib/portal/emi";
import { scheduleLabelFor } from "@/lib/portal/schedule";

// ---------------------------------------------------------------------------
// EMI Payments (req 5).
//
// There are two unrelated installment systems and this page used to show only
// the second one, so every CLASS EMI student saw "No EMI Orders Found" while
// their installments rendered on the Classes tab instead:
//
//   1. Class fee EMI  — feePayments/${enrollmentId}_emi-N   (see lib/portal/emi)
//   2. Course order EMI — orders/{id}.payment.installmentPlan
//
// Both live here now. Section 1 is first because it is what the school's
// students actually have.
// ---------------------------------------------------------------------------

interface EmiOrder {
  id: string;
  orderNumber: string;
  totalInPaise: number;
  paymentPlan: CourseInstallmentPlan;
  emiSubscription?: {
    razorpaySubscriptionId?: string;
    mandateStatus?: string;
    shortUrl?: string;
  };
  createdAt: any;
}

export default function EmiDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { enrollments, classes, feesByEnrollment, loading: portalLoading } = useStudentPortal();

  const [orders, setOrders] = useState<EmiOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [payingInstallment, setPayingInstallment] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [upiDialog, setUpiDialog] = useState<{ target: UpiPaymentTarget; amount: number; title: string } | null>(null);

  // Deep link from WhatsApp reminders: /account/emi?order=<orderId> or ?fee=<feeId>
  const loading = portalLoading || loadingOrders;
  useScrollHighlight("order", !loading);
  useScrollHighlight("fee", !loading);

  // ── 1. Class fee EMI ─────────────────────────────────────────────────────
  const emiEnrollments = useMemo(
    () => enrollments.filter((enrollment) => hasEmiPlan(feesByEnrollment[enrollment.id] || [])),
    [enrollments, feesByEnrollment],
  );

  const handlePayClassInstallment = async (enrollmentId: string, fee: FeePaymentDoc) => {
    const enrollment = enrollments.find((item) => item.id === enrollmentId);
    if (!user || !enrollment) return;

    // Razorpay only when the admin offered it; otherwise the manual UPI rail,
    // the same way the first installment was paid on the admission link.
    if (!emiUsesRazorpay(enrollment)) {
      setUpiDialog({
        target: { feePaymentId: fee.id },
        amount: fee.amountInPaise,
        title: `${fee.className} — ${fee.periodLabel}`,
      });
      return;
    }

    setBusyId(fee.id);
    try {
      const idToken = await user.getIdToken();
      await payFeeNow({
        idToken,
        feePaymentIdOrEnrollment: { feePaymentId: fee.id },
        description: `${fee.className} — ${fee.periodLabel}`,
        prefill: { name: fee.parentName, email: user.email || "", contact: fee.parentPhone },
      });
      toast({ title: "Payment received", description: `${fee.periodLabel} is being confirmed.` });
    } catch (error) {
      toast({
        title: "Payment not completed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  // ── 2. Course order EMI (unchanged) ──────────────────────────────────────
  useEffect(() => {
    if (!user) { setLoadingOrders(false); return; }
    const q = query(
      collection(db, "orders"),
      where("customerId", "==", user.uid),
      where("payment.method", "==", "razorpay"),
      where("payment.plan", "==", "installment"),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setOrders(
          snapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              orderNumber: data.orderNumber || docSnap.id,
              totalInPaise: data.totalInPaise || 0,
              paymentPlan: data.payment?.installmentPlan || { status: "unknown", totalInPaise: 0, initialPaymentInPaise: 0, remainingInPaise: 0, reminderDayOfMonth: 5, installments: [] },
              emiSubscription: data.payment?.emiSubscription,
              createdAt: data.createdAt,
            };
          }),
        );
        setLoadingOrders(false);
      },
      () => setLoadingOrders(false),
    );

    return unsubscribe;
  }, [user]);

  const handlePayOrderInstallment = async (orderId: string, installmentNumber: number) => {
    if (!user) return;
    setPayingInstallment(`${orderId}-${installmentNumber}`);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/razorpay/pay-emi-installment", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ orderDocumentId: orderId, installmentNumber }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to initiate payment");
      }

      const { keyId, orderId: rzpOrderId, amount, currency } = await response.json();

      await openRazorpayCheckout({
        key: keyId,
        amount,
        currency,
        order_id: rzpOrderId,
        name: "Javani Spiritual Hub",
        description: `EMI Installment ${installmentNumber}`,
        theme: { color: "#8B1A1A" },
        prefill: { email: user.email || "" },
      });

      toast({ title: "Payment Successful", description: "Your installment payment has been received. Status will update shortly." });
    } catch (error) {
      console.error(error);
      toast({
        title: "Payment Failed",
        description: error instanceof Error ? error.message : "Unable to process payment right now. Please try again.",
        variant: "destructive",
      });
    } finally {
      setPayingInstallment(null);
    }
  };

  if (loading) {
    return (
      <AccountLayout title="EMI Payments" description="Your class fee installments and course EMIs.">
        <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-gold/15 bg-card/50 p-12">
          <p className="animate-pulse font-body text-sm text-muted-foreground">Loading your installments…</p>
        </div>
      </AccountLayout>
    );
  }

  const nothingAtAll = emiEnrollments.length === 0 && orders.length === 0;

  return (
    <AccountLayout title="EMI Payments" description="Your class fee installments and course EMIs.">
      <div className="space-y-6">
        {nothingAtAll && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-gold/15 bg-card py-20 text-center shadow-sm">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gold/10 text-gold">
              <CalendarDays className="h-8 w-8" />
            </div>
            <h3 className="font-display text-xl font-medium text-foreground">No EMI plans yet</h3>
            <p className="mt-2 max-w-sm font-body text-sm text-muted-foreground">
              When a class fee or a course order is split into installments, every payment shows up here.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link to="/account/classes" className="rounded-md border border-gold/40 px-6 py-2.5 font-body text-sm font-semibold text-gold transition-colors hover:bg-gold/10">
                My Classes
              </Link>
              <Link to="/courses" className="rounded-md bg-gold px-6 py-2.5 font-body text-sm font-semibold text-charcoal transition-colors hover:bg-gold-light">
                Browse Courses
              </Link>
            </div>
          </div>
        )}

        {/* ── Class fee installments ── */}
        {emiEnrollments.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-gold" />
              <h2 className="font-display text-xl text-foreground">Class fee installments</h2>
            </div>
            {emiEnrollments.map((enrollment) => (
              <ClassEmiCard
                key={enrollment.id}
                enrollment={enrollment}
                fees={feesByEnrollment[enrollment.id] || []}
                scheduleLabel={scheduleLabelFor(classes[enrollment.classId], enrollment.slotId)}
                busyId={busyId}
                onPay={(fee) => handlePayClassInstallment(enrollment.id, fee)}
              />
            ))}
          </section>
        )}

        {/* ── Course order installments ── */}
        {orders.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-gold" />
              <h2 className="font-display text-xl text-foreground">Course order installments</h2>
            </div>
            {orders.map((order) => {
              const isCompleted = order.paymentPlan.status === "completed";
              return (
                <div key={order.id} id={`order-${order.id}`} className="overflow-hidden rounded-2xl border border-gold/15 bg-card shadow-sm scroll-mt-28">
                  <div className="border-b border-border bg-muted/30 px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-display text-lg font-medium text-foreground">Order {order.orderNumber}</p>
                          {isCompleted ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-body text-[0.65rem] font-bold uppercase tracking-wider text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" /> Fully Paid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-body text-[0.65rem] font-bold uppercase tracking-wider text-amber-800">
                              <Clock className="h-3 w-3" /> Active EMI
                            </span>
                          )}
                        </div>
                        <p className="mt-1 font-body text-xs text-muted-foreground">
                          Total: {formatPaiseAsRupees(order.totalInPaise)} • Ordered on {new Date(order.createdAt?.toDate?.() || order.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Link to={`/account/orders/${order.id}`} className="inline-flex items-center gap-1 font-body text-xs font-semibold text-gold hover:text-gold-light">
                        View Order Details <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>

                  <div className="divide-y divide-border">
                    {order.paymentPlan.installments?.map((inst: any) => {
                      const isPaid = inst.status === "paid";
                      const isPayingThis = payingInstallment === `${order.id}-${inst.installmentNumber}`;
                      return (
                        <div key={inst.installmentNumber} className="flex flex-col justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/10 sm:flex-row sm:items-center sm:px-6">
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${isPaid ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                              {inst.installmentNumber}
                            </div>
                            <div>
                              <p className="font-body text-sm font-semibold text-foreground">{inst.label}</p>
                              <div className="mt-1 flex items-center gap-3 font-body text-xs text-muted-foreground">
                                <span>Amount: <strong className="text-foreground">{formatPaiseAsRupees(inst.amountInPaise)}</strong> ({inst.percentage}%)</span>
                                <span>•</span>
                                <span>Due: {inst.dueDate}</span>
                              </div>
                              {isPaid && inst.paidAt && (
                                <p className="mt-1 font-body text-xs text-emerald-600">
                                  Paid on {new Date(inst.paidAt).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </div>

                          {!isPaid && (
                            <div className="shrink-0 sm:self-center">
                              <button
                                onClick={() => handlePayOrderInstallment(order.id, inst.installmentNumber)}
                                disabled={isPayingThis}
                                className="inline-flex w-full items-center justify-center rounded-md bg-gold px-4 py-2 font-body text-xs font-semibold text-charcoal transition-colors hover:bg-gold-light disabled:opacity-50 sm:w-auto"
                              >
                                {isPayingThis ? "Processing..." : "Pay Now"}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>
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
}
