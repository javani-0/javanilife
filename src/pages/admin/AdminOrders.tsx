import { useEffect, useMemo, useRef, useState } from "react";
import { arrayUnion, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { AlertTriangle, CalendarDays, ChevronRight, Clock, CreditCard, ExternalLink, Filter, Mail, MapPin, MessageCircle, PackageCheck, PackagePlus, Phone, Printer, RefreshCw, Save, Search, Truck, UserRound, Trash2 } from "lucide-react";
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
import { ToastAction } from "@/components/ui/toast";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import {
  ADMIN_ORDER_STATUS_OPTIONS,
  ADMIN_PAYMENT_STATUS_OPTIONS,
  DELIVERY_LIFECYCLE_STATUS_LABELS,
  DELIVERY_SYNC_STATUS_LABELS,
  approveOrderCancellation,
  cancelDeliveryOnePickup,
  filterAdminOrders,
  formatAccountDate,
  formatAccountDateTime,
  formatShipmentWeight,
  formatOrderPlacedDateTime,
  formatOrderUpdatedDateTime,
  formatPaiseAsRupees,
  getAdminOrderMetrics,
  getDeliveryLifecycleStatus,
  getDeliveryOneSyncEligibility,
  normalizeCustomerOrder,
  ORDER_STATUS_LABELS,
  printDeliveryOneLabel,
  refreshDeliveryOneTracking,
  rejectOrderCancellation,
  scheduleDeliveryOnePickup,
  sendOrderAutomation,
  syncDeliveryOneOrder,
  sortOrdersNewestFirst,
  type AdminOrderDateFilter,
  type AdminOrderFilters,
  type DeliverySyncStatus,
  type Order,
  type OrderCancellationStatus,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from "@/lib/ecommerce";

const cancellationStatusLabels: Record<OrderCancellationStatus, string> = {
  none: "No request",
  requested: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
};

const emptyFilters: AdminOrderFilters = {
  search: "",
  status: "all",
  paymentMethod: "all",
  paymentStatus: "all",
  dateRange: "all",
  specificDate: "",
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  cod: "COD",
  razorpay: "Razorpay",
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  "cod-pending": "COD Pending",
  "cod-collected": "COD Collected",
};

const getDefaultPickupDateInput = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

type DeleteToastHandle = {
  dismiss: () => void;
  update: (props: {
    title?: React.ReactNode;
    description?: React.ReactNode;
    action?: React.ReactNode;
    duration?: number;
  }) => void;
};

type UndoSource = "toast" | "inline";

const isPlaceholderPickupId = (pickupId?: string) => (pickupId || "").trim().toLowerCase().startsWith("requested-");
const isRealPickupId = (pickupId?: string) => Boolean((pickupId || "").trim()) && !isPlaceholderPickupId(pickupId);

const AdminOrders = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<AdminOrderFilters>(emptyFilters);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus>("placed");
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<PaymentStatus>("pending");
  const [adminNotes, setAdminNotes] = useState("");
  const [providerOrderId, setProviderOrderId] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncingDelivery, setSyncingDelivery] = useState(false);
  const [refreshingTracking, setRefreshingTracking] = useState(false);
  const [printingLabel, setPrintingLabel] = useState(false);
  const [schedulingPickup, setSchedulingPickup] = useState(false);
  const [cancellingPickup, setCancellingPickup] = useState(false);
  const [labelPdfSize, setLabelPdfSize] = useState<"A4" | "4R">("A4");
  const [pickupDate, setPickupDate] = useState(getDefaultPickupDateInput());
  const [pickupTime, setPickupTime] = useState("10:00:00");
  const [pickupLocation, setPickupLocation] = useState("");
  const [expectedPackageCount, setExpectedPackageCount] = useState("1");
  const [processingCancellation, setProcessingCancellation] = useState(false);
  const [cancellationAdminNote, setCancellationAdminNote] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteOrderId, setPendingDeleteOrderId] = useState<string | null>(null);
  const [deleteCountdown, setDeleteCountdown] = useState<number | null>(null);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deleteOperationRef = useRef(0);
  const deleteToastRef = useRef<DeleteToastHandle | null>(null);

  const clearPendingDelete = ({ dismissToast = true }: { dismissToast?: boolean } = {}) => {
    deleteOperationRef.current += 1;

    if (deleteTimeoutRef.current) {
      clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = null;
    }
    if (deleteIntervalRef.current) {
      clearInterval(deleteIntervalRef.current);
      deleteIntervalRef.current = null;
    }
    if (dismissToast) {
      deleteToastRef.current?.dismiss();
    }
    deleteToastRef.current = null;
    setPendingDeleteOrderId(null);
    setDeleteCountdown(null);
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "orders"), (snapshot) => {
      const nextOrders = sortOrdersNewestFirst(snapshot.docs.map((orderDoc) => normalizeCustomerOrder(orderDoc.id, orderDoc.data())));
      setOrders(nextOrders);
      setSelectedOrderId((currentId) => {
        if (currentId && nextOrders.some((order) => order.id === currentId)) return currentId;
        return nextOrders[0]?.id || null;
      });
      setLoading(false);
    }, (error) => {
      console.error("Unable to load admin orders", error);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => () => {
    clearPendingDelete();
  }, []);

  const filteredOrders = useMemo(() => filterAdminOrders(orders, filters), [filters, orders]);
  const metrics = useMemo(() => getAdminOrderMetrics(orders), [orders]);
  const selectedOrder = useMemo(() => orders.find((order) => order.id === selectedOrderId) || null, [orders, selectedOrderId]);
  const deliveryEligibility = useMemo(() => getDeliveryOneSyncEligibility(selectedOrder), [selectedOrder]);
  const selectedDeliverySyncStatus = (selectedOrder?.delivery?.syncStatus || "manual-ready") as DeliverySyncStatus;
  const selectedDeliveryLifecycleStatus = getDeliveryLifecycleStatus(selectedOrder);
  const selectedCancellationStatus = (selectedOrder?.cancellation?.status || "none") as OrderCancellationStatus;
  const hasDeliveryWaybill = Boolean(selectedOrder?.delivery?.trackingNumber);
  const isTerminalOrder = Boolean(selectedOrder && ["delivered", "cancelled", "returned"].includes(selectedOrder.status));
  const canUseDeliveryOneFulfillment = hasDeliveryWaybill && !isTerminalOrder;
  const selectedPickupId = selectedOrder?.delivery?.pickupId || "";
  const hasRealPickupId = isRealPickupId(selectedPickupId);
  const hasPlaceholderPickupId = isPlaceholderPickupId(selectedPickupId);
  const hasPickupRequestMissingId = selectedOrder?.delivery?.pickupRequestStatus === "id-missing" || hasPlaceholderPickupId;
  const pickupCancellationStatus = selectedOrder?.delivery?.pickupCancellationStatus || "";
  const pickupCancellationNeedsConfig = pickupCancellationStatus === "manual-required";
  const needsPickupCancellationAttention = Boolean(
    hasRealPickupId
    && selectedOrder?.status === "cancelled"
    && pickupCancellationStatus !== "cancelled"
    && pickupCancellationStatus !== "not-required"
    && !pickupCancellationNeedsConfig,
  );
  const canAdminCancelSyncedOrder = Boolean(selectedOrder?.delivery?.trackingNumber && !["delivered", "cancelled", "returned"].includes(selectedOrder.status));

  useEffect(() => {
    if (!selectedOrder) setDeleteDialogOpen(false);
  }, [selectedOrder]);

  useEffect(() => {
    if (!selectedOrder) return;
    setSelectedStatus(selectedOrder.status || "placed");
    setSelectedPaymentStatus(selectedOrder.payment?.status || "pending");
    setAdminNotes(selectedOrder.adminNotes || "");
    setProviderOrderId(selectedOrder.delivery?.providerOrderId || "");
    setTrackingNumber(selectedOrder.delivery?.trackingNumber || "");
    setTrackingUrl(selectedOrder.delivery?.trackingUrl || "");
    setLabelPdfSize(selectedOrder.delivery?.labelPdfSize || "A4");
    setPickupDate(selectedOrder.delivery?.pickupDate || getDefaultPickupDateInput());
    setPickupTime(selectedOrder.delivery?.pickupTime || "10:00:00");
    setPickupLocation(selectedOrder.delivery?.pickupLocation || "");
    setExpectedPackageCount(String(selectedOrder.delivery?.expectedPackageCount || 1));
    setCancellationAdminNote("");
  }, [selectedOrder]);

  const updateFilter = <Key extends keyof AdminOrderFilters>(key: Key, value: AdminOrderFilters[Key]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const saveOrder = async () => {
    if (!selectedOrder) return;

    const statusChanged = selectedStatus !== selectedOrder.status;
    const paymentChanged = selectedPaymentStatus !== selectedOrder.payment?.status;
    const notesChanged = adminNotes.trim() !== (selectedOrder.adminNotes || "");
    const cleanProviderOrderId = providerOrderId.trim();
    const cleanTrackingNumber = trackingNumber.trim();
    const cleanTrackingUrl = trackingUrl.trim();
    const deliveryTrackingChanged = cleanProviderOrderId !== (selectedOrder.delivery?.providerOrderId || "")
      || cleanTrackingNumber !== (selectedOrder.delivery?.trackingNumber || "")
      || cleanTrackingUrl !== (selectedOrder.delivery?.trackingUrl || "");

    if (!statusChanged && !paymentChanged && !notesChanged && !deliveryTrackingChanged) {
      toast({ title: "No changes to save" });
      return;
    }

    if (statusChanged && selectedStatus === "cancelled" && (selectedOrder.delivery?.trackingNumber || selectedCancellationStatus === "requested")) {
      toast({
        title: "Use cancellation approval",
        description: "Approve the cancellation request from the cancellation panel so Delhivery is notified when a waybill exists.",
        variant: "destructive",
      });
      return;
    }

    const timelineEvents = [];
    if (statusChanged) {
      timelineEvents.push({
        status: selectedStatus,
        label: ORDER_STATUS_LABELS[selectedStatus] || selectedStatus,
        note: `Admin updated order status to ${ORDER_STATUS_LABELS[selectedStatus] || selectedStatus}.`,
        createdAt: new Date().toISOString(),
        createdBy: user?.uid || "admin",
      });
    }
    if (paymentChanged) {
      timelineEvents.push({
        status: selectedOrder.status,
        label: "Payment status updated",
        note: `Admin marked payment as ${paymentStatusLabels[selectedPaymentStatus] || selectedPaymentStatus}.`,
        createdAt: new Date().toISOString(),
        createdBy: user?.uid || "admin",
      });
    }
    if (deliveryTrackingChanged) {
      timelineEvents.push({
        status: selectedStatus,
        label: "Delivery tracking updated",
        note: "Admin updated Delivery One provider or tracking references.",
        createdAt: new Date().toISOString(),
        createdBy: user?.uid || "admin",
      });
    }

    const payload: Record<string, unknown> = {
      adminNotes: adminNotes.trim(),
      updatedAt: serverTimestamp(),
    };

    if (statusChanged) {
      payload.status = selectedStatus;
      payload["delivery.status"] = selectedStatus;
    }
    if (paymentChanged) {
      payload["payment.status"] = selectedPaymentStatus;
      if (["paid", "cod-collected"].includes(selectedPaymentStatus)) payload["payment.paidAt"] = serverTimestamp();
    }
    if (deliveryTrackingChanged) {
      const nextDeliverySyncStatus: DeliverySyncStatus = cleanProviderOrderId || cleanTrackingNumber || cleanTrackingUrl ? "synced" : "manual-ready";
      payload["delivery.provider"] = nextDeliverySyncStatus === "synced" ? "delivery-one" : "manual";
      payload["delivery.providerOrderId"] = cleanProviderOrderId;
      payload["delivery.trackingNumber"] = cleanTrackingNumber;
      payload["delivery.trackingUrl"] = cleanTrackingUrl;
      payload["delivery.syncStatus"] = nextDeliverySyncStatus;
    }
    if (timelineEvents.length > 0) payload.timeline = arrayUnion(...timelineEvents);

    setSaving(true);
    try {
      await updateDoc(doc(db, "orders", selectedOrder.id), payload);
      const notificationIdToken = await user?.getIdToken();
      if (notificationIdToken && statusChanged) {
        void sendOrderAutomation(notificationIdToken, { orderId: selectedOrder.id, event: "order-status-updated", status: selectedStatus })
          .then((automationResult) => {
            if (automationResult.warnings?.length) {
              console.warn("Order was updated but some status automations need attention", automationResult.warnings);
            }
          })
          .catch((notificationError) => {
            console.error("Order was updated but status automations could not be sent", notificationError);
          });
      }
      if (notificationIdToken && paymentChanged) {
        void sendOrderAutomation(notificationIdToken, { orderId: selectedOrder.id, event: "payment-status-updated", paymentStatus: selectedPaymentStatus })
          .then((automationResult) => {
            if (automationResult.warnings?.length) {
              console.warn("Order was updated but some payment automations need attention", automationResult.warnings);
            }
          })
          .catch((notificationError) => {
            console.error("Order was updated but payment automations could not be sent", notificationError);
          });
      }
      toast({ title: "Order updated", description: selectedOrder.orderNumber || selectedOrder.id });
    } catch (error) {
      console.error("Unable to update order", error);
      toast({ title: "Unable to update order", description: "Check admin permissions and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSyncDelivery = async () => {
    if (!selectedOrder || !user) return;

    if (!deliveryEligibility.eligible) {
      toast({ title: "Delivery One sync unavailable", description: deliveryEligibility.reason, variant: "destructive" });
      return;
    }

    setSyncingDelivery(true);
    try {
      const idToken = await user.getIdToken();
      const result = await syncDeliveryOneOrder(idToken, selectedOrder.id);
      toast({
        title: result.syncStatus === "synced" ? "Delivery One synced" : "Delivery One payload ready",
        description: result.message || (result.providerOrderId ? `Provider order ${result.providerOrderId}` : selectedOrder.orderNumber || selectedOrder.id),
      });
    } catch (error) {
      console.error("Unable to sync Delivery One order", error);
      toast({ title: "Delivery One sync failed", description: error instanceof Error ? error.message : "Try again after checking credentials.", variant: "destructive" });
    } finally {
      setSyncingDelivery(false);
    }
  };

  const handleRefreshTracking = async () => {
    if (!selectedOrder || !user) return;

    if (!selectedOrder.delivery?.trackingNumber) {
      toast({ title: "Tracking unavailable", description: "This order does not have a Delivery One tracking number yet.", variant: "destructive" });
      return;
    }

    setRefreshingTracking(true);
    try {
      const idToken = await user.getIdToken();
      const result = await refreshDeliveryOneTracking(idToken, selectedOrder.id);
      toast({ title: "Tracking refreshed", description: result.providerStatus ? `Delhivery: ${result.providerStatus}` : result.message || selectedOrder.orderNumber || selectedOrder.id });
    } catch (error) {
      console.error("Unable to refresh Delivery One tracking", error);
      toast({ title: "Tracking refresh failed", description: error instanceof Error ? error.message : "Try again after checking credentials.", variant: "destructive" });
    } finally {
      setRefreshingTracking(false);
    }
  };

  const handlePrintLabel = async () => {
    if (!selectedOrder || !user) return;
    if (!selectedOrder.delivery?.trackingNumber) {
      toast({ title: "No waybill", description: "Sync the shipment with Delhivery first to get a waybill.", variant: "destructive" });
      return;
    }
    if (["delivered", "cancelled", "returned"].includes(selectedOrder.status)) {
      toast({ title: "Order closed", description: "Shipping label actions are locked for completed, cancelled, or returned orders.", variant: "destructive" });
      return;
    }
    setPrintingLabel(true);
    try {
      const idToken = await user.getIdToken();
      const result = await printDeliveryOneLabel(idToken, selectedOrder.id, labelPdfSize);
      toast({ title: "Shipping label ready", description: `${result.pdfSize || labelPdfSize} label opened in a new tab.` });
    } catch (error) {
      console.error("Unable to print Delivery One label", error);
      toast({ title: "Label fetch failed", description: error instanceof Error ? error.message : "Try again or download from Delhivery dashboard.", variant: "destructive" });
    } finally {
      setPrintingLabel(false);
    }
  };

  const handleSchedulePickup = async () => {
    if (!selectedOrder || !user) return;
    if (!selectedOrder.delivery?.trackingNumber) {
      toast({ title: "No waybill", description: "Sync the shipment with Delhivery first to get a waybill.", variant: "destructive" });
      return;
    }
    if (["delivered", "cancelled", "returned"].includes(selectedOrder.status)) {
      toast({ title: "Order closed", description: "Pickup cannot be scheduled for completed, cancelled, or returned orders.", variant: "destructive" });
      return;
    }
    setSchedulingPickup(true);
    try {
      const idToken = await user.getIdToken();
      const result = await scheduleDeliveryOnePickup(idToken, selectedOrder.id, {
        pickupDate,
        pickupTime,
        pickupLocation: pickupLocation.trim() || undefined,
        expectedPackageCount: Number(expectedPackageCount) || 1,
      });
      toast({
        title: result.pickupRequestStatus === "id-missing" ? "Pickup ID missing" : "Pickup scheduled",
        description: result.message || `Pickup date: ${result.pickupDate || "pending"}`,
        variant: result.pickupRequestStatus === "id-missing" ? "destructive" : undefined,
      });
    } catch (error) {
      console.error("Unable to schedule Delivery One pickup", error);
      toast({ title: "Pickup scheduling failed", description: error instanceof Error ? error.message : "Try again or schedule from Delhivery dashboard.", variant: "destructive" });
    } finally {
      setSchedulingPickup(false);
    }
  };

  const handleCancelPickup = async () => {
    if (!selectedOrder || !user) return;
    if (!hasRealPickupId) {
      toast({ title: "No real pickup ID", description: "Javani does not have a real Delhivery pickup ID for this order, so it will not send a fake cancellation request.", variant: "destructive" });
      return;
    }
    setCancellingPickup(true);
    try {
      const idToken = await user.getIdToken();
      const result = await cancelDeliveryOnePickup(idToken, selectedOrder.id);
      toast({
        title: result.pickupCancellationStatus === "cancelled" ? "Pickup cancelled" : "Pickup cancellation updated",
        description: result.pickupCancellationMessage || result.message || selectedOrder.delivery.pickupId,
        variant: ["failed", "manual-required"].includes(result.pickupCancellationStatus || "") ? "destructive" : undefined,
      });
    } catch (error) {
      console.error("Unable to cancel Delivery One pickup", error);
      toast({ title: "Pickup cancellation failed", description: error instanceof Error ? error.message : "Try again after checking the order status.", variant: "destructive" });
    } finally {
      setCancellingPickup(false);
    }
  };

  const handleApproveCancellation = async () => {
    if (!selectedOrder || !user) return;

    setProcessingCancellation(true);
    try {
      const idToken = await user.getIdToken();
      const result = await approveOrderCancellation(idToken, selectedOrder.id, cancellationAdminNote.trim());
      void sendOrderAutomation(idToken, { orderId: selectedOrder.id, event: "order-status-updated", status: "cancelled" })
        .then((automationResult) => {
          if (automationResult.warnings?.length) {
            console.warn("Cancellation was approved but some status automations need attention", automationResult.warnings);
          }
        })
        .catch((notificationError) => {
          console.error("Cancellation was approved but status automations could not be sent", notificationError);
        });
      toast({
        title: result.pickupCancellationStatus === "manual-required"
          ? "Cancellation approved, pickup endpoint needed"
          : result.pickupCancellationStatus === "failed"
            ? "Cancellation approved, pickup retry needed"
            : "Cancellation approved",
        description: result.pickupCancellationMessage || result.message || selectedOrder.orderNumber || selectedOrder.id,
        variant: ["failed", "manual-required"].includes(result.pickupCancellationStatus || "") ? "destructive" : undefined,
      });
    } catch (error) {
      console.error("Unable to approve cancellation", error);
      toast({ title: "Cancellation approval failed", description: error instanceof Error ? error.message : "Try again after checking Delivery One status.", variant: "destructive" });
    } finally {
      setProcessingCancellation(false);
    }
  };

  const handleRejectCancellation = async () => {
    if (!selectedOrder || !user) return;

    setProcessingCancellation(true);
    try {
      const idToken = await user.getIdToken();
      const result = await rejectOrderCancellation(idToken, selectedOrder.id, cancellationAdminNote.trim());
      toast({ title: "Cancellation rejected", description: result.message || selectedOrder.orderNumber || selectedOrder.id });
    } catch (error) {
      console.error("Unable to reject cancellation", error);
      toast({ title: "Cancellation rejection failed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setProcessingCancellation(false);
    }
  };

  const undoDeleteOrder = (source: UndoSource = "inline") => {
    clearPendingDelete({ dismissToast: source !== "toast" });
    setTimeout(() => {
      toast({ title: "Order deletion canceled" });
    }, 0);
  };

  const handleDeleteOrder = () => {
    if (!selectedOrder) return;

    clearPendingDelete();

    const operationId = deleteOperationRef.current + 1;
    deleteOperationRef.current = operationId;
    setPendingDeleteOrderId(selectedOrder.id);
    setDeleteCountdown(5);
    setDeleteDialogOpen(false);

    const orderId = selectedOrder.id;
    const orderLabel = selectedOrder.orderNumber || selectedOrder.id;
    const getDeleteAction = () => <ToastAction altText="Undo order deletion" onClick={() => undoDeleteOrder("toast")}>Undo</ToastAction>;

    deleteToastRef.current = toast({
      title: "Order scheduled for deletion",
      description: `${orderLabel} will be deleted in 5 seconds unless you undo it.`,
      duration: 5500,
      action: getDeleteAction(),
    });

    deleteIntervalRef.current = setInterval(() => {
      setDeleteCountdown((current) => {
        if (current === null || current <= 1) {
          if (deleteIntervalRef.current) {
            clearInterval(deleteIntervalRef.current);
            deleteIntervalRef.current = null;
          }
          return null;
        }

        const nextCountdown = current - 1;
        if (deleteOperationRef.current === operationId) {
          deleteToastRef.current?.update({
            title: "Order scheduled for deletion",
            description: `${orderLabel} will be deleted in ${nextCountdown} seconds unless you undo it.`,
            duration: nextCountdown * 1000 + 500,
            action: getDeleteAction(),
          });
        }

        return nextCountdown;
      });
    }, 1000);

    deleteTimeoutRef.current = setTimeout(async () => {
      if (deleteOperationRef.current !== operationId) return;

      try {
        await deleteDoc(doc(db, "orders", orderId));
        setSelectedOrderId((currentId) => currentId === orderId ? null : currentId);
        toast({ title: "Order deleted", description: `${orderLabel} was removed completely.` });
      } catch (error) {
        console.error("Unable to delete order", error);
        toast({ title: "Unable to delete order", description: "Check admin permissions and try again.", variant: "destructive" });
      } finally {
        deleteTimeoutRef.current = null;
        if (deleteIntervalRef.current) {
          clearInterval(deleteIntervalRef.current);
          deleteIntervalRef.current = null;
        }
        deleteToastRef.current = null;
        setDeleteCountdown(null);
        setPendingDeleteOrderId((currentId) => currentId === orderId ? null : currentId);
      }
    }, 5000);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">E-Commerce</p>
        <h1 className="mt-2 font-display text-3xl text-foreground">Order Management</h1>
        <p className="mt-1 font-body text-sm text-muted-foreground">Review orders, update fulfilment, collect COD status, and add internal notes.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: "Total Orders", value: metrics.total, Icon: PackageCheck },
          { label: "Active Orders", value: metrics.active, Icon: Truck },
          { label: "COD Pending", value: metrics.codPending, Icon: Clock },
          { label: "Paid / Collected", value: metrics.paid, Icon: CreditCard },
        ].map(({ label, value, Icon }) => (
          <div key={label} className="rounded-xl border border-gold/15 bg-card p-4 shadow-card sm:p-5">
            <Icon className="mb-3 h-5 w-5 text-gold" />
            <p className="font-display text-3xl text-foreground">{value}</p>
            <p className="font-body text-xs font-medium text-muted-foreground sm:text-sm">{label}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-card sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Filter className="h-4 w-4 text-gold" />
          <h2 className="font-display text-xl text-foreground">Filters</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr]">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} className="h-11 w-full rounded-md border border-border bg-background pl-10 pr-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="Search orders or customers" />
          </label>
          <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value as AdminOrderFilters["status"])} className="h-11 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold">
            <option value="all">All statuses</option>
            {ADMIN_ORDER_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{ORDER_STATUS_LABELS[status]}</option>)}
          </select>
          <select value={filters.paymentMethod} onChange={(event) => updateFilter("paymentMethod", event.target.value as "all" | PaymentMethod)} className="h-11 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold">
            <option value="all">All methods</option>
            <option value="cod">COD</option>
            <option value="razorpay">Razorpay</option>
          </select>
          <select value={filters.paymentStatus} onChange={(event) => updateFilter("paymentStatus", event.target.value as "all" | PaymentStatus)} className="h-11 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold">
            <option value="all">All payments</option>
            {ADMIN_PAYMENT_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{paymentStatusLabels[status]}</option>)}
          </select>
          <select value={filters.dateRange} onChange={(event) => updateFilter("dateRange", event.target.value as AdminOrderDateFilter)} className="h-11 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold">
            <option value="all">All dates</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
          <input
            type="date"
            value={filters.specificDate}
            onChange={(event) => updateFilter("specificDate", event.target.value)}
            className="h-11 rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
            title="Filter by exact date"
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-card sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-xl text-foreground">Orders</h2>
            <span className="font-body text-sm text-muted-foreground">{filteredOrders.length} shown</span>
          </div>

          {loading ? (
            <p className="font-body text-sm text-muted-foreground">Loading orders...</p>
          ) : filteredOrders.length === 0 ? (
            <div className="rounded-xl border border-gold/15 bg-background/70 p-8 text-center">
              <PackageCheck className="mx-auto mb-3 h-9 w-9 text-gold" />
              <p className="font-display text-xl text-foreground">No matching orders</p>
              <p className="mt-1 font-body text-sm text-muted-foreground">Try clearing filters or placing a test COD order.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((order) => (
                <button key={order.id} type="button" onClick={() => setSelectedOrderId(order.id)} className={`w-full rounded-xl border p-4 text-left transition-colors ${selectedOrderId === order.id ? "border-gold bg-gold/10" : "border-border/70 bg-background/70 hover:border-gold/40"}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display text-lg text-foreground">{order.orderNumber || order.id}</p>
                        <span className="rounded-full bg-gold/10 px-2.5 py-1 font-body text-xs font-semibold text-gold">{ORDER_STATUS_LABELS[order.status] || order.status}</span>
                        {order.cancellation?.status === "requested" && <span className="rounded-full bg-destructive/10 px-2.5 py-1 font-body text-xs font-semibold text-destructive">Cancel requested</span>}
                      </div>
                      <p className="mt-1 font-body text-sm text-muted-foreground">{order.customerName}</p>
                      <div className="mt-3 flex flex-wrap gap-2 font-body text-xs">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-gold/10 px-2.5 py-1 font-semibold text-gold">
                          <CalendarDays className="h-3.5 w-3.5" /> Placed: {formatOrderPlacedDateTime(order)}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-border/70 bg-card px-2.5 py-1 text-muted-foreground">
                          {paymentMethodLabels[order.payment?.method] || order.payment?.method} / {paymentStatusLabels[order.payment?.status] || order.payment?.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <span className="font-body font-semibold text-gold">{formatPaiseAsRupees(order.totalInPaise || 0)}</span>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="rounded-2xl border border-border/60 bg-card p-4 shadow-card sm:p-5 xl:sticky xl:top-24 xl:h-fit">
          {!selectedOrder ? (
            <div className="py-10 text-center">
              <PackageCheck className="mx-auto mb-3 h-9 w-9 text-gold" />
              <p className="font-display text-xl text-foreground">Select an order</p>
              <p className="mt-1 font-body text-sm text-muted-foreground">Order details and admin controls appear here.</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold">Order Detail</p>
                <h2 className="mt-1 font-display text-2xl text-foreground">{selectedOrder.orderNumber || selectedOrder.id}</h2>
                <div className="mt-3 grid gap-2 rounded-xl border border-gold/20 bg-gold/10 p-3 font-body text-sm">
                  <div className="flex items-center gap-2 text-foreground"><CalendarDays className="h-4 w-4 text-gold" /><span className="font-semibold">Placed:</span> {formatOrderPlacedDateTime(selectedOrder)}</div>
                  <div className="flex items-center gap-2 text-muted-foreground"><Clock className="h-4 w-4 text-gold" /><span className="font-semibold text-foreground">Updated:</span> {formatOrderUpdatedDateTime(selectedOrder)}</div>
                  {selectedOrder.payment?.paidAt && <div className="flex items-center gap-2 text-muted-foreground"><CreditCard className="h-4 w-4 text-gold" /><span className="font-semibold text-foreground">Paid:</span> {formatAccountDateTime(selectedOrder.payment.paidAt)}</div>}
                </div>
              </div>

              <div className="grid gap-3 rounded-xl border border-border/70 bg-background/70 p-4 font-body text-sm">
                <div className="flex items-start gap-2"><UserRound className="mt-0.5 h-4 w-4 text-gold" /><span><strong className="text-foreground">{selectedOrder.customerName}</strong><br />{selectedOrder.customerId}</span></div>
                {selectedOrder.customerEmail && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-gold" />{selectedOrder.customerEmail}</div>}
                <div className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-gold" />WhatsApp: {selectedOrder.customerWhatsAppNumber || selectedOrder.customerPhone || "Not saved"}</div>
                <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-gold" />Call: {selectedOrder.customerCallNumber || selectedOrder.customerPhone || "Not saved"}</div>
                <div className="flex items-center gap-2"><Truck className="h-4 w-4 text-gold" />Delivery phone: {selectedOrder.address?.phone || selectedOrder.customerPhone || "Not saved"}</div>
                <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-gold" /><span>{selectedOrder.address?.line1}{selectedOrder.address?.line2 ? `, ${selectedOrder.address.line2}` : ""}<br />{selectedOrder.address?.city}, {selectedOrder.address?.state} {selectedOrder.address?.pincode}</span></div>
              </div>

              <div className="rounded-xl border border-gold/20 bg-gold/10 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <Truck className="h-4 w-4 text-gold" />
                      <h3 className="font-display text-lg text-foreground">Delivery One</h3>
                    </div>
                    <p className="font-body text-xs leading-relaxed text-muted-foreground">Manifest the order, print the shipping label, schedule pickup, and refresh Delhivery status.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleSyncDelivery}
                      disabled={syncingDelivery || !deliveryEligibility.eligible}
                      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-sm bg-gold px-4 font-display text-xs font-semibold tracking-[0.08em] text-charcoal transition-colors hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RefreshCw className={`h-4 w-4 ${syncingDelivery ? "animate-spin" : ""}`} /> {syncingDelivery ? "Manifesting" : "Manifest Order"}
                    </button>
                    <button
                      type="button"
                      onClick={handleRefreshTracking}
                      disabled={refreshingTracking || !hasDeliveryWaybill}
                      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-sm border border-gold/35 px-4 font-display text-xs font-semibold tracking-[0.08em] text-gold transition-colors hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RefreshCw className={`h-4 w-4 ${refreshingTracking ? "animate-spin" : ""}`} /> {refreshingTracking ? "Refreshing" : "Refresh Tracking"}
                    </button>
                    <button
                      type="button"
                      onClick={handlePrintLabel}
                      disabled={printingLabel || !canUseDeliveryOneFulfillment}
                      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-sm border border-gold/35 px-4 font-display text-xs font-semibold tracking-[0.08em] text-gold transition-colors hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Printer className={`h-4 w-4 ${printingLabel ? "animate-pulse" : ""}`} /> {printingLabel ? "Fetching" : "Print Label"}
                    </button>
                    <button
                      type="button"
                      onClick={handleSchedulePickup}
                      disabled={schedulingPickup || !canUseDeliveryOneFulfillment || hasRealPickupId || hasPickupRequestMissingId}
                      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-sm border border-gold/35 px-4 font-display text-xs font-semibold tracking-[0.08em] text-gold transition-colors hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <PackagePlus className={`h-4 w-4 ${schedulingPickup ? "animate-pulse" : ""}`} /> {schedulingPickup ? "Scheduling" : hasRealPickupId ? "Pickup Booked" : hasPickupRequestMissingId ? "Pickup ID Missing" : "Create Pickup"}
                    </button>
                  </div>
                </div>

                {!deliveryEligibility.eligible && <p className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 font-body text-xs text-destructive">{deliveryEligibility.reason}</p>}

                <div className="mt-4 grid gap-3 font-body text-xs sm:grid-cols-2">
                  <div className="rounded-lg border border-gold/20 bg-card p-3">
                    <span className="block text-muted-foreground">Delivery status</span>
                    <span className="mt-1 block font-semibold text-foreground">{DELIVERY_LIFECYCLE_STATUS_LABELS[selectedDeliveryLifecycleStatus] || selectedDeliveryLifecycleStatus}</span>
                  </div>
                  <div className="rounded-lg border border-gold/20 bg-card p-3">
                    <span className="block text-muted-foreground">Manifest status</span>
                    <span className="mt-1 block font-semibold text-foreground">{DELIVERY_SYNC_STATUS_LABELS[selectedDeliverySyncStatus] || selectedDeliverySyncStatus}</span>
                  </div>
                  <div className="rounded-lg border border-gold/20 bg-card p-3">
                    <span className="block text-muted-foreground">Package weight</span>
                    <span className="mt-1 block font-semibold text-foreground">{formatShipmentWeight(selectedOrder.delivery?.shipmentWeightInGrams || 0)}</span>
                  </div>
                  <div className="rounded-lg border border-gold/20 bg-card p-3">
                    <span className="block text-muted-foreground">Delivery charge</span>
                    <span className="mt-1 block font-semibold text-foreground">{formatPaiseAsRupees(selectedOrder.delivery?.chargeInPaise || 0)}</span>
                  </div>
                </div>

                {canUseDeliveryOneFulfillment ? (
                  <div className="mt-4 grid gap-3 font-body text-sm sm:grid-cols-2">
                    <label className="font-semibold text-foreground">
                      Label size
                      <select value={labelPdfSize} onChange={(event) => setLabelPdfSize(event.target.value as "A4" | "4R")} className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold">
                        <option value="A4">A4</option>
                        <option value="4R">4R</option>
                      </select>
                    </label>
                    <label className="font-semibold text-foreground">
                      Pickup packages
                      <input type="number" min="1" value={expectedPackageCount} onChange={(event) => setExpectedPackageCount(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold" />
                    </label>
                    <label className="font-semibold text-foreground">
                      Pickup date
                      <input type="date" value={pickupDate} onChange={(event) => setPickupDate(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold" />
                    </label>
                    <label className="font-semibold text-foreground">
                      Pickup time
                      <input type="time" value={pickupTime.slice(0, 5)} onChange={(event) => setPickupTime(`${event.target.value}:00`)} className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold" />
                    </label>
                    <label className="font-semibold text-foreground sm:col-span-2">
                      Pickup warehouse
                      <input value={pickupLocation} onChange={(event) => setPickupLocation(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold" placeholder="Leave blank to use DELIVERY_ONE_PICKUP_LOCATION" />
                    </label>
                  </div>
                ) : hasDeliveryWaybill ? (
                  <p className="mt-4 rounded-lg border border-gold/20 bg-gold/10 p-3 font-body text-xs leading-relaxed text-foreground">
                    Label and pickup controls are locked because this order is {ORDER_STATUS_LABELS[selectedOrder.status] || selectedOrder.status}.
                  </p>
                ) : (
                  <p className="mt-4 rounded-lg border border-gold/20 bg-gold/10 p-3 font-body text-xs leading-relaxed text-foreground">
                    Manifest this order first. Label printing, pickup scheduling, and tracking unlock after the AWB is saved.
                  </p>
                )}

                {selectedOrder.delivery?.providerStatus && (
                  <p className="mt-3 rounded-lg border border-gold/20 bg-card p-3 font-body text-xs text-muted-foreground">
                    Delhivery status: <span className="font-semibold text-foreground">{selectedOrder.delivery.providerStatus}</span>
                    {selectedOrder.delivery.providerStatusType ? ` (${selectedOrder.delivery.providerStatusType})` : ""}
                  </p>
                )}

                {hasRealPickupId && (
                  <p className="mt-3 rounded-lg border border-gold/20 bg-card p-3 font-body text-xs text-muted-foreground">
                    Pickup booked: <span className="font-semibold text-foreground">{selectedPickupId}</span>
                    {selectedOrder.delivery.pickupDate ? ` · ${selectedOrder.delivery.pickupDate}` : ""}
                    {selectedOrder.delivery.pickupTime ? ` · ${selectedOrder.delivery.pickupTime}` : ""}
                    {selectedOrder.delivery.expectedPackageCount ? ` · ${selectedOrder.delivery.expectedPackageCount} package(s)` : ""}
                  </p>
                )}

                {hasPickupRequestMissingId && (
                  <p data-testid="pickup-id-missing-warning" className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 font-body text-xs leading-relaxed text-destructive">
                    Pickup request was sent, but Javani does not have a real Delhivery pickup ID. The order is not marked Pickup Booked, and cancellation will not use the old placeholder ID.
                  </p>
                )}

                {hasRealPickupId && pickupCancellationStatus === "cancelled" && (
                  <p data-testid="pickup-cancelled-status" className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 font-body text-xs leading-relaxed text-emerald-700">
                    Pickup request {selectedPickupId} was cancelled from the Javani dashboard.
                  </p>
                )}

                {hasRealPickupId && selectedOrder.status === "cancelled" && pickupCancellationNeedsConfig && (
                  <div data-testid="pickup-cancellation-config-warning" className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 font-body text-xs leading-relaxed text-destructive">
                    <p>
                      Pickup request {selectedPickupId} could not be cancelled because Delhivery has not provided a working pickup-cancellation API endpoint for this dashboard.
                    </p>
                    {selectedOrder.delivery?.pickupCancellationReason && <p className="mt-2">{selectedOrder.delivery.pickupCancellationReason}</p>}
                  </div>
                )}

                {needsPickupCancellationAttention && (
                  <div data-testid="pickup-cancellation-warning" className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 font-body text-xs leading-relaxed text-destructive">
                    <p>
                      Pickup request {selectedPickupId} still needs cancellation. Retry it from this dashboard so the admin does not need to open Delhivery One.
                    </p>
                    <button type="button" onClick={handleCancelPickup} disabled={cancellingPickup} className="mt-3 inline-flex items-center justify-center gap-2 rounded-sm bg-destructive px-3 py-2 font-display text-[11px] font-semibold tracking-[0.08em] text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-60">
                      <RefreshCw className={`h-3.5 w-3.5 ${cancellingPickup ? "animate-spin" : ""}`} /> {cancellingPickup ? "Cancelling..." : "Cancel Pickup"}
                    </button>
                  </div>
                )}

                {selectedOrder.delivery?.labelUrl && (
                  <a href={selectedOrder.delivery.labelUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 font-body text-xs font-semibold text-gold hover:text-gold-light">
                    Open saved shipping label <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}

                {selectedOrder.delivery?.lastSyncError && <p className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 font-body text-xs text-destructive">{selectedOrder.delivery.lastSyncError.split(" | Raw:")[0]}</p>}

                <div className="mt-4 grid gap-3">
                  <label className="font-body text-sm font-semibold text-foreground">
                    Provider order ID
                    <input value={providerOrderId} onChange={(event) => setProviderOrderId(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold" placeholder="Delivery One order/reference ID" />
                  </label>
                  <label className="font-body text-sm font-semibold text-foreground">
                    Tracking number
                    <input value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold" placeholder="AWB or tracking number" />
                  </label>
                  <label className="font-body text-sm font-semibold text-foreground">
                    Tracking URL
                    <input value={trackingUrl} onChange={(event) => setTrackingUrl(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold" placeholder="https://..." />
                  </label>
                </div>

                {selectedOrder.delivery?.trackingUrl && (
                  <a href={selectedOrder.delivery.trackingUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 font-body text-xs font-semibold text-gold hover:text-gold-light">
                    Open saved tracking link <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>

              {(selectedCancellationStatus !== "none" || canAdminCancelSyncedOrder) && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        <h3 className="font-display text-lg text-foreground">Cancellation Request</h3>
                      </div>
                      <p className="font-body text-xs text-muted-foreground">Status: <span className="font-semibold text-foreground">{cancellationStatusLabels[selectedCancellationStatus] || selectedCancellationStatus}</span></p>
                      {selectedCancellationStatus === "none" && <p className="mt-1 font-body text-xs text-muted-foreground">This synced shipment can be cancelled with Delhivery from here.</p>}
                    </div>
                  </div>

                  {selectedOrder.cancellation?.reason && (
                    <div className="mt-3 rounded-lg border border-destructive/20 bg-card p-3 font-body text-sm">
                      <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-destructive">Customer reason</span>
                      <p className="mt-1 text-foreground">{selectedOrder.cancellation.reason}</p>
                    </div>
                  )}

                  {selectedOrder.cancellation?.adminNote && selectedCancellationStatus !== "requested" && (
                    <div className="mt-3 rounded-lg border border-border/70 bg-card p-3 font-body text-sm">
                      <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-gold">Admin note</span>
                      <p className="mt-1 text-foreground">{selectedOrder.cancellation.adminNote}</p>
                    </div>
                  )}

                  {(selectedCancellationStatus === "requested" || (selectedCancellationStatus === "none" && canAdminCancelSyncedOrder)) && (
                    <div className="mt-4 grid gap-3">
                      <label className="font-body text-sm font-semibold text-foreground">
                        Admin note
                        <textarea value={cancellationAdminNote} onChange={(event) => setCancellationAdminNote(event.target.value)} rows={3} className="mt-2 w-full rounded-md border border-border bg-background px-3 py-3 font-body text-sm outline-none focus:border-gold" placeholder="Optional note for approval or rejection" />
                      </label>
                      <div className={`grid gap-2 ${selectedCancellationStatus === "requested" ? "sm:grid-cols-2" : ""}`}>
                        <button type="button" onClick={handleApproveCancellation} disabled={processingCancellation} className="inline-flex items-center justify-center gap-2 rounded-sm bg-destructive px-4 py-3 font-display text-xs font-semibold tracking-[0.08em] text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-60">
                          <AlertTriangle className="h-4 w-4" /> {processingCancellation ? "Processing..." : "Approve Cancel"}
                        </button>
                        {selectedCancellationStatus === "requested" && (
                          <button type="button" onClick={handleRejectCancellation} disabled={processingCancellation} className="inline-flex items-center justify-center gap-2 rounded-sm border border-border px-4 py-3 font-display text-xs font-semibold tracking-[0.08em] text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60">
                            Keep Order
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <h3 className="font-display text-lg text-foreground">Items</h3>
                {selectedOrder.items?.map((item) => (
                  <div key={item.productId} className="flex justify-between gap-3 rounded-lg border border-border/60 bg-background/70 p-3 font-body text-sm">
                    <span className="min-w-0"><span className="line-clamp-1 font-semibold text-foreground">{item.name}</span><span className="text-muted-foreground">Qty {item.quantity}</span></span>
                    <span className="font-semibold text-gold">{formatPaiseAsRupees(item.lineTotalInPaise || 0)}</span>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 border-t border-border pt-5">
                {pendingDeleteOrderId === selectedOrder.id && (
                  <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 font-body text-sm text-destructive">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p>
                        Order deletion is pending.
                        {deleteCountdown ? ` Removing in ${deleteCountdown}...` : ""} Use Undo to keep this order.
                      </p>
                      <button type="button" onClick={() => undoDeleteOrder("inline")} className="inline-flex h-9 items-center justify-center rounded-md border border-destructive/35 px-3 font-display text-xs font-semibold tracking-[0.08em] text-destructive transition-colors hover:bg-destructive/10">
                        Undo
                      </button>
                    </div>
                  </div>
                )}
                <label className="font-body text-sm font-semibold text-foreground">
                  Order status
                  <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value as OrderStatus)} className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold">
                    {ADMIN_ORDER_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{ORDER_STATUS_LABELS[status]}</option>)}
                  </select>
                </label>
                <label className="font-body text-sm font-semibold text-foreground">
                  Payment status
                  <select value={selectedPaymentStatus} onChange={(event) => setSelectedPaymentStatus(event.target.value as PaymentStatus)} className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold">
                    {ADMIN_PAYMENT_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{paymentStatusLabels[status]}</option>)}
                  </select>
                </label>
                <label className="font-body text-sm font-semibold text-foreground">
                  Internal notes
                  <textarea value={adminNotes} onChange={(event) => setAdminNotes(event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-border bg-background px-3 py-3 font-body text-sm outline-none focus:border-gold" placeholder="Private admin note for this order" />
                </label>
                <button type="button" onClick={saveOrder} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-sm bg-gradient-primary px-5 py-3 font-display text-sm font-semibold tracking-[0.08em] text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60">
                  <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save Order"}
                </button>
                <button type="button" onClick={() => setDeleteDialogOpen(true)} disabled={saving || pendingDeleteOrderId === selectedOrder.id} className="inline-flex items-center justify-center gap-2 rounded-sm border border-destructive/35 px-5 py-3 font-display text-sm font-semibold tracking-[0.08em] text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60">
                  <Trash2 className="h-4 w-4" /> {pendingDeleteOrderId === selectedOrder.id && deleteCountdown ? `Deleting in ${deleteCountdown}...` : "Delete Order"}
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-[1.75rem] border border-gold/20 bg-[linear-gradient(180deg,rgba(36,24,18,0.98),rgba(17,10,8,0.98))] p-0 text-primary-foreground shadow-[0_30px_80px_rgba(0,0,0,0.45)] sm:max-w-xl sm:rounded-3xl">
          <div className="border-b border-gold/10 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.24),transparent_60%)] px-4 py-4 sm:px-8 sm:py-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-destructive/35 bg-destructive/15 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <AlertDialogHeader className="space-y-2 text-left">
                <p className="font-body text-xs font-semibold uppercase tracking-[0.24em] text-gold/80">Permanent action</p>
                <AlertDialogTitle className="font-display text-xl leading-tight text-primary-foreground sm:text-2xl">Delete this order completely?</AlertDialogTitle>
                <AlertDialogDescription className="font-body text-sm leading-6 text-primary-foreground/75">
                  {selectedOrder?.orderNumber || selectedOrder?.id} will be removed from admin records and customer history after the 5 second undo window starts.
                </AlertDialogDescription>
              </AlertDialogHeader>
            </div>
          </div>

          <div className="space-y-4 px-4 py-4 sm:px-8 sm:py-6">
            <div className="rounded-2xl border border-gold/15 bg-white/5 p-4 font-body text-sm text-primary-foreground/80">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-semibold text-primary-foreground">{selectedOrder?.customerName}</span>
                <span className="text-gold">{selectedOrder ? formatPaiseAsRupees(selectedOrder.totalInPaise || 0) : null}</span>
              </div>
              <p className="mt-2 text-primary-foreground/65">This action cannot be recovered after the undo timer ends.</p>
            </div>

            <AlertDialogFooter className="flex-col gap-3 sm:flex-row sm:justify-start sm:space-x-0">
              <AlertDialogAction onClick={handleDeleteOrder} className="w-full rounded-sm border border-destructive/40 bg-destructive px-5 font-display tracking-[0.08em] text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive/30 sm:w-auto">
                Confirm delete
              </AlertDialogAction>
              <AlertDialogCancel className="mt-0 w-full rounded-sm border-border/40 bg-transparent font-display tracking-[0.08em] text-primary-foreground hover:bg-white/10 hover:text-primary-foreground sm:w-auto">
                Cancel
              </AlertDialogCancel>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminOrders;