import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { ArrowLeft, CheckCircle2, MapPin, PackageCheck } from "lucide-react";
import AccountLayout from "@/components/account/AccountLayout";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { formatAccountDate, formatPaiseAsRupees, normalizeCustomerOrder, ORDER_STATUS_LABELS, type Order } from "@/lib/ecommerce";

const OrderDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;

    const unsubscribe = onSnapshot(doc(db, "orders", id), (snapshot) => {
      if (!snapshot.exists()) {
        setOrder(null);
        setNotFound(true);
      } else {
        setOrder(normalizeCustomerOrder(snapshot.id, snapshot.data()));
        setNotFound(false);
      }
      setLoading(false);
    }, (error) => {
      console.error("Unable to load order detail", error);
      setLoading(false);
      setNotFound(true);
    });

    return unsubscribe;
  }, [id]);

  const ownsOrder = order && user && order.customerId === user.uid;

  return (
    <AccountLayout title="Order Detail" description="Review your order items, payment, delivery address, and status timeline.">
      <div className="space-y-6">
        <Link to="/account/orders" className="inline-flex items-center gap-2 font-body text-sm font-semibold text-gold hover:text-gold-light">
          <ArrowLeft className="h-4 w-4" /> Back to orders
        </Link>

        {loading ? (
          <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-card font-body text-muted-foreground">Loading order...</div>
        ) : notFound || !order ? (
          <div className="rounded-2xl border border-border/60 bg-card p-8 text-center shadow-card">
            <PackageCheck className="mx-auto mb-4 h-10 w-10 text-gold" />
            <h2 className="font-display text-2xl text-foreground">Order not found</h2>
            <p className="mt-2 font-body text-sm text-muted-foreground">This order may have been removed or is not available.</p>
          </div>
        ) : !ownsOrder ? (
          <div className="rounded-2xl border border-destructive/20 bg-card p-8 text-center shadow-card">
            <h2 className="font-display text-2xl text-destructive">Access denied</h2>
            <p className="mt-2 font-body text-sm text-muted-foreground">This order belongs to another account.</p>
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-card sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold">{formatAccountDate(order.createdAt)}</p>
                  <h2 className="mt-2 font-display text-3xl text-foreground">{order.orderNumber || order.id}</h2>
                  <p className="mt-2 font-body text-sm text-muted-foreground">{ORDER_STATUS_LABELS[order.status] || order.status} · {order.payment?.method?.toUpperCase()} / {order.payment?.status}</p>
                </div>
                <p className="font-display text-3xl text-gold">{formatPaiseAsRupees(order.totalInPaise || 0)}</p>
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
              <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-card sm:p-6">
                <h3 className="font-display text-2xl text-foreground">Items</h3>
                <div className="mt-5 space-y-4">
                  {order.items?.map((item) => (
                    <div key={item.productId} className="grid grid-cols-[64px_1fr] gap-3 rounded-xl border border-border/60 bg-background/70 p-3">
                      <div className="h-16 w-16 overflow-hidden rounded-md bg-muted">
                        {item.image ? <img src={item.image} alt={item.name} className="h-full w-full object-cover" /> : <PackageCheck className="m-5 h-6 w-6 text-gold" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-display text-base text-foreground">{item.name}</p>
                        <p className="mt-1 font-body text-xs text-muted-foreground">Qty {item.quantity} · {item.categoryLabel}</p>
                        <p className="mt-1 font-body text-sm font-semibold text-gold">{formatPaiseAsRupees(item.lineTotalInPaise || 0)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <aside className="space-y-6">
                <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-card">
                  <div className="mb-3 flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-gold" />
                    <h3 className="font-display text-xl text-foreground">Delivery Address</h3>
                  </div>
                  <div className="font-body text-sm leading-relaxed text-muted-foreground">
                    <p className="font-semibold text-foreground">{order.address?.fullName}</p>
                    <p>{order.address?.line1}</p>
                    {order.address?.line2 && <p>{order.address.line2}</p>}
                    <p>{order.address?.city}, {order.address?.state} {order.address?.pincode}</p>
                    <p>{order.customerPhone}</p>
                  </div>
                </section>

                <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-card">
                  <div className="mb-4 flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-gold" />
                    <h3 className="font-display text-xl text-foreground">Timeline</h3>
                  </div>
                  <div className="space-y-4">
                    {order.timeline?.map((event, index) => (
                      <div key={`${event.status}-${index}`} className="border-l-2 border-gold/30 pl-4">
                        <p className="font-body text-sm font-semibold text-foreground">{event.label}</p>
                        <p className="font-body text-xs text-muted-foreground">{formatAccountDate(event.createdAt)}</p>
                        {event.note && <p className="mt-1 font-body text-xs text-muted-foreground">{event.note}</p>}
                      </div>
                    ))}
                  </div>
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </AccountLayout>
  );
};

export default OrderDetail;