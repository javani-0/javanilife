import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { ArrowLeft, CheckCircle2, ExternalLink, MapPin, PackageCheck, Truck, XCircle } from "lucide-react";
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
import AccountLayout from "@/components/account/AccountLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { DELIVERY_LIFECYCLE_STATUS_LABELS, DELIVERY_PROGRESS_STEPS, formatAccountDate, formatOrderPlacedDate, formatPaiseAsRupees, formatShipmentWeight, getDeliveryLifecycleProgressIndex, getDeliveryLifecycleStatus, normalizeCustomerOrder, ORDER_STATUS_LABELS, requestOrderCancellation, type Order, type OrderCancellationStatus } from "@/lib/ecommerce";

const cancellationStatusLabels: Record<OrderCancellationStatus, string> = {
  none: "No request",
  requested: "Waiting for admin approval",
  approved: "Approved",
  rejected: "Rejected",
};

const finalOrderStatuses = ["delivered", "cancelled", "returned"];

const OrderDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [requestingCancel, setRequestingCancel] = useState(false);

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
  const deliveryLifecycleStatus = getDeliveryLifecycleStatus(order);
  const deliveryProgressIndex = getDeliveryLifecycleProgressIndex(deliveryLifecycleStatus);
  const hasTrackingInfo = Boolean(order?.delivery?.providerOrderId || order?.delivery?.trackingNumber || order?.delivery?.trackingUrl || order?.delivery?.providerStatus);
  const cancellationStatus = (order?.cancellation?.status || "none") as OrderCancellationStatus;
  const canRequestCancellation = Boolean(order && !finalOrderStatuses.includes(order.status) && cancellationStatus !== "requested" && cancellationStatus !== "approved");

  const handleRequestCancellation = async () => {
    if (!order || !user) return;

    const reason = cancelReason.trim();
    if (reason.length < 5) {
      toast({ title: "Reason required", description: "Please enter a short reason before sending the request.", variant: "destructive" });
      return;
    }

    setRequestingCancel(true);
    try {
      const idToken = await user.getIdToken();
      const result = await requestOrderCancellation(idToken, order.id, reason);
      setCancelDialogOpen(false);
      setCancelReason("");
      toast({ title: "Cancellation requested", description: result.message || "Admin will review your request." });
    } catch (error) {
      console.error("Unable to request cancellation", error);
      toast({ title: "Unable to request cancellation", description: error instanceof Error ? error.message : "Try again later.", variant: "destructive" });
    } finally {
      setRequestingCancel(false);
    }
  };

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
                  <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold">{formatOrderPlacedDate(order)}</p>
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
                  <div className="mb-3 flex items-center gap-2">
                    <Truck className="h-5 w-5 text-gold" />
                    <h3 className="font-display text-xl text-foreground">Delivery Tracking</h3>
                  </div>
                  <div className="space-y-3 font-body text-sm text-muted-foreground">
                    <div className="rounded-xl border border-gold/20 bg-gold/10 p-3">
                      <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-gold">Current status</span>
                      <p className="mt-1 font-display text-lg text-foreground">{DELIVERY_LIFECYCLE_STATUS_LABELS[deliveryLifecycleStatus] || deliveryLifecycleStatus}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-[11px] sm:grid-cols-6">
                      {DELIVERY_PROGRESS_STEPS.map((step, index) => {
                        const isActive = index <= deliveryProgressIndex && !["cancelled", "lost", "rto-in-transit", "rto-returned", "ndr"].includes(deliveryLifecycleStatus);
                        const isCurrent = step === deliveryLifecycleStatus;
                        return (
                          <div key={step} className="min-w-0">
                            <div className={`mx-auto mb-1 h-2.5 w-2.5 rounded-full ${isActive || isCurrent ? "bg-gold" : "bg-border"}`} />
                            <span className={`${isCurrent ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{DELIVERY_LIFECYCLE_STATUS_LABELS[step]}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Carrier</span>
                      <span className="font-semibold text-foreground">Delhivery</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Shipment weight</span>
                      <span className="font-semibold text-foreground">{formatShipmentWeight(order.delivery?.shipmentWeightInGrams || 0)}</span>
                    </div>
                    {hasTrackingInfo ? (
                      <>
                        {order.delivery?.providerOrderId && (
                          <div className="flex items-center justify-between gap-4">
                            <span>Provider order</span>
                            <span className="font-semibold text-foreground">{order.delivery.providerOrderId}</span>
                          </div>
                        )}
                        {order.delivery?.trackingNumber && (
                          <div className="flex items-center justify-between gap-4">
                            <span>AWB number</span>
                            <span className="font-semibold text-foreground">{order.delivery.trackingNumber}</span>
                          </div>
                        )}
                        {order.delivery?.pickupDate && (
                          <div className="flex items-center justify-between gap-4">
                            <span>Pickup</span>
                            <span className="font-semibold text-foreground">{order.delivery.pickupDate}{order.delivery.pickupTime ? ` · ${order.delivery.pickupTime}` : ""}</span>
                          </div>
                        )}
                        {order.delivery?.providerStatus && (
                          <div className="flex items-center justify-between gap-4">
                            <span>Provider status</span>
                            <span className="font-semibold text-foreground">{order.delivery.providerStatus}</span>
                          </div>
                        )}
                        {order.delivery?.ndrReason && (
                          <p className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">Delivery attempt failed: {order.delivery.ndrReason}</p>
                        )}
                        {order.delivery?.rtoReason && (
                          <p className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">Return update: {order.delivery.rtoReason}</p>
                        )}
                        {order.delivery?.trackingUrl && (
                          <a href={order.delivery.trackingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-body text-sm font-semibold text-gold hover:text-gold-light">
                            Open tracking link <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </>
                    ) : (
                      <p className="rounded-xl border border-gold/20 bg-gold/10 p-3 text-xs leading-relaxed text-foreground">Tracking details will appear here once your shipment is manifested and the AWB is ready.</p>
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-card">
                  <div className="mb-3 flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-gold" />
                    <h3 className="font-display text-xl text-foreground">Cancellation</h3>
                  </div>
                  <div className="space-y-3 font-body text-sm text-muted-foreground">
                    <div className="flex items-center justify-between gap-4">
                      <span>Request status</span>
                      <span className="font-semibold text-foreground">{cancellationStatusLabels[cancellationStatus] || cancellationStatus}</span>
                    </div>
                    {order.cancellation?.reason && (
                      <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                        <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-gold">Reason</span>
                        <p className="mt-1 text-foreground">{order.cancellation.reason}</p>
                      </div>
                    )}
                    {order.cancellation?.adminNote && (
                      <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                        <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-gold">Admin note</span>
                        <p className="mt-1 text-foreground">{order.cancellation.adminNote}</p>
                      </div>
                    )}
                    {canRequestCancellation ? (
                      <button type="button" onClick={() => setCancelDialogOpen(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-destructive/35 px-4 py-3 font-display text-xs font-semibold tracking-[0.08em] text-destructive transition-colors hover:bg-destructive/10">
                        <XCircle className="h-4 w-4" /> Request cancellation
                      </button>
                    ) : cancellationStatus === "requested" ? (
                      <p className="rounded-xl border border-gold/20 bg-gold/10 p-3 text-xs leading-relaxed text-foreground">Your request is waiting for admin approval.</p>
                    ) : null}
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

      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-lg rounded-2xl border border-border bg-card">
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle className="font-display text-2xl text-foreground">Request order cancellation</AlertDialogTitle>
            <AlertDialogDescription className="font-body text-sm leading-6 text-muted-foreground">
              Admin will review your request. If the shipment is already synced with Delivery One, admin approval will also send the cancellation to Delhivery.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="font-body text-sm font-semibold text-foreground">
            Reason
            <textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-border bg-background px-3 py-3 font-body text-sm outline-none focus:border-gold" placeholder="Tell us why you want to cancel this order" />
          </label>
          <AlertDialogFooter className="gap-3 sm:space-x-0">
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void handleRequestCancellation(); }} disabled={requestingCancel} className="rounded-sm bg-destructive px-5 font-display tracking-[0.08em] text-destructive-foreground hover:bg-destructive/90">
              {requestingCancel ? "Sending..." : "Send request"}
            </AlertDialogAction>
            <AlertDialogCancel className="rounded-sm font-display tracking-[0.08em]">Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AccountLayout>
  );
};

export default OrderDetail;