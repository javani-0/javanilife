import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { CalendarDays, PackageCheck, AlertCircle, ArrowRight, CheckCircle2, Clock, PlayCircle } from "lucide-react";
import AccountLayout from "@/components/account/AccountLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { formatPaiseAsRupees, type CourseInstallmentPlan, openRazorpayCheckout } from "@/lib/ecommerce";

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
  const [orders, setOrders] = useState<EmiOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingInstallment, setPayingInstallment] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "orders"),
      where("customerId", "==", user.uid),
      where("payment.method", "==", "razorpay"),
      where("payment.plan", "==", "installment"),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOrders(
        snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            orderNumber: data.orderNumber || doc.id,
            totalInPaise: data.totalInPaise || 0,
            paymentPlan: data.payment?.installmentPlan || { status: "unknown", totalInPaise: 0, initialPaymentInPaise: 0, remainingInPaise: 0, reminderDayOfMonth: 5, installments: [] },
            emiSubscription: data.payment?.emiSubscription,
            createdAt: data.createdAt,
          };
        }),
      );
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  const handlePayInstallment = async (orderId: string, installmentNumber: number) => {
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

      // The webhook handles status updates. We just show a success message here.
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
      <AccountLayout title="EMI Payments" description="Manage your installments">
        <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-gold/15 bg-card/50 p-12">
          <p className="font-body text-sm text-muted-foreground animate-pulse">Loading EMI orders...</p>
        </div>
      </AccountLayout>
    );
  }

  if (orders.length === 0) {
    return (
      <AccountLayout title="EMI Payments" description="Manage your installments">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-gold/15 bg-card py-20 text-center shadow-sm">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gold/10 text-gold">
            <CalendarDays className="h-8 w-8" />
          </div>
          <h3 className="font-display text-xl font-medium text-foreground">No EMI Orders Found</h3>
          <p className="mt-2 max-w-sm font-body text-sm text-muted-foreground">You don't have any active or past EMI installment plans.</p>
          <Link to="/courses" className="mt-6 rounded-md bg-gold px-6 py-2.5 font-body text-sm font-semibold text-charcoal hover:bg-gold-light transition-colors">
            Browse Courses
          </Link>
        </div>
      </AccountLayout>
    );
  }

  return (
    <AccountLayout title="EMI Payments" description="Manage your installments">
      <div className="space-y-6">
        {orders.map((order) => {
          const isCompleted = order.paymentPlan.status === "completed";

          return (
            <div key={order.id} className="overflow-hidden rounded-2xl border border-gold/15 bg-card shadow-sm">
              {/* Header */}
              <div className="border-b border-border bg-muted/30 px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-display text-lg font-medium text-foreground">Order {order.orderNumber}</p>
                      {isCompleted ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-body text-[0.65rem] font-bold tracking-wider text-emerald-800 uppercase">
                          <CheckCircle2 className="h-3 w-3" /> Fully Paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-body text-[0.65rem] font-bold tracking-wider text-amber-800 uppercase">
                          <Clock className="h-3 w-3" /> Active EMI
                        </span>
                      )}
                    </div>
                    <p className="font-body text-xs text-muted-foreground mt-1">
                      Total: {formatPaiseAsRupees(order.totalInPaise)} • Ordered on {new Date(order.createdAt?.toDate?.() || order.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Link to={`/account/orders/${order.id}`} className="inline-flex items-center gap-1 font-body text-xs font-semibold text-gold hover:text-gold-light">
                    View Order Details <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>

              {/* Autopay Status removed - EMI is now purely manual */}

              {/* Installments List */}
              <div className="divide-y divide-border">
                {order.paymentPlan.installments?.map((inst: any) => {
                  const isPaid = inst.status === "paid";
                  const isPayingThis = payingInstallment === `${order.id}-${inst.installmentNumber}`;

                  return (
                    <div key={inst.installmentNumber} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4 sm:px-6 hover:bg-muted/10 transition-colors">
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
                            onClick={() => handlePayInstallment(order.id, inst.installmentNumber)}
                            disabled={isPayingThis}
                            className="w-full sm:w-auto inline-flex items-center justify-center rounded-md bg-gold px-4 py-2 font-body text-xs font-semibold text-charcoal hover:bg-gold-light disabled:opacity-50 transition-colors"
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
      </div>
    </AccountLayout>
  );
}
