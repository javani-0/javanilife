import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { ChevronRight, PackageCheck } from "lucide-react";
import AccountLayout from "@/components/account/AccountLayout";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { DELIVERY_LIFECYCLE_STATUS_LABELS, formatOrderPlacedDate, formatPaiseAsRupees, getDeliveryLifecycleStatus, normalizeCustomerOrder, ORDER_STATUS_LABELS, sortOrdersNewestFirst, type Order } from "@/lib/ecommerce";

const Orders = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(
      query(collection(db, "orders"), where("customerId", "==", user.uid)),
      (snapshot) => {
        setOrders(sortOrdersNewestFirst(snapshot.docs.map((orderDoc) => normalizeCustomerOrder(orderDoc.id, orderDoc.data()))));
        setLoading(false);
      },
      (error) => {
        console.error("Unable to load customer orders", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  return (
    <AccountLayout title="My Orders" description="Track your Javani product orders and payment status.">
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-card sm:p-6">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl text-foreground">Order History</h2>
            <p className="font-body text-sm text-muted-foreground">Only orders connected to your account are shown here.</p>
          </div>
          <Link to="/products" className="font-body text-sm font-semibold text-gold hover:text-gold-light">Continue shopping</Link>
        </div>

        {loading ? (
          <p className="font-body text-sm text-muted-foreground">Loading orders...</p>
        ) : orders.length === 0 ? (
          <div className="rounded-xl border border-gold/15 bg-background/70 p-8 text-center">
            <PackageCheck className="mx-auto mb-4 h-10 w-10 text-gold" />
            <h3 className="font-display text-xl text-foreground">No orders yet</h3>
            <p className="mt-2 font-body text-sm text-muted-foreground">Your COD and Razorpay orders will appear here after checkout.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <Link key={order.id} to={`/account/orders/${order.id}`} className="grid gap-3 rounded-xl border border-border/70 bg-background/70 p-4 transition-colors hover:border-gold/40 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-lg text-foreground">{order.orderNumber || order.id}</p>
                    <span className="rounded-full bg-gold/10 px-2.5 py-1 font-body text-xs font-semibold text-gold">{ORDER_STATUS_LABELS[order.status] || order.status}</span>
                  </div>
                  <p className="mt-1 font-body text-sm text-muted-foreground">{formatOrderPlacedDate(order)} · {order.items?.length || 0} items · {order.payment?.method?.toUpperCase()} / {order.payment?.status}</p>
                  <p className="mt-1 font-body text-xs text-muted-foreground">
                    Delivery: {DELIVERY_LIFECYCLE_STATUS_LABELS[getDeliveryLifecycleStatus(order)]}
                    {order.delivery?.trackingNumber ? ` · AWB ${order.delivery.trackingNumber}` : ""}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <span className="font-body font-semibold text-gold">{formatPaiseAsRupees(order.totalInPaise || 0)}</span>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AccountLayout>
  );
};

export default Orders;