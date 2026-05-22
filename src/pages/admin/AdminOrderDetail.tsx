import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { arrayUnion, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  AlertTriangle, ArrowLeft, CalendarDays, Clock, CreditCard, ExternalLink,
  Mail, MapPin, MessageCircle, PackageCheck, PackagePlus, Phone, Printer,
  RefreshCw, Save, Trash2, Truck, UserRound,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
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
  markDeliveryOnePickupManuallyCancelled,
  formatAccountDateTime,
  formatShipmentWeight,
  formatOrderPlacedDateTime,
  formatOrderUpdatedDateTime,
  formatPaiseAsRupees,
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
  type DeliverySyncStatus,
  type Order,
  type OrderCancellationStatus,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from "@/lib/ecommerce";

// ─── Constants & helpers ────────────────────────────────────────────────────

const cancellationStatusLabels: Record<OrderCancellationStatus, string> = {
  none: "No request",
  requested: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  cod: "COD",
  razorpay: "Razorpay",
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  "partially-paid": "Partially Paid",
  failed: "Failed",
  refunded: "Refunded",
  "cod-pending": "COD Pending",
  "cod-collected": "COD Collected",
};

const getDefaultPickupDateInput = () =>
  new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

const isPlaceholderPickupId = (id?: string) =>
  (id || "").trim().toLowerCase().startsWith("requested-");

const isRealPickupId = (id?: string) =>
  Boolean((id || "").trim()) && !isPlaceholderPickupId(id);

const formatShipmentDimensions = (delivery?: Order["items"][number]["delivery"]) => {
  const { lengthInCm, widthInCm, heightInCm } = delivery ?? {};
  if (!lengthInCm && !widthInCm && !heightInCm) return "Not saved";
  return `${lengthInCm || "-"} × ${widthInCm || "-"} × ${heightInCm || "-"} cm`;
};

const getStatusBadgeClass = (status: OrderStatus) => {
  switch (status) {
    case "delivered":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/25";
    case "cancelled":
      return "bg-destructive/10 text-destructive border-destructive/25";
    case "returned":
      return "bg-muted text-muted-foreground border-border";
    case "shipped":
    case "out-for-delivery":
      return "bg-blue-500/10 text-blue-700 border-blue-500/20";
    default:
      return "bg-gold/10 text-gold border-gold/25";
  }
};

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

// ─── Component ──────────────────────────────────────────────────────────────

const AdminOrderDetail = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  // Order data
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus>("placed");
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<PaymentStatus>("pending");
  const [adminNotes, setAdminNotes] = useState("");
  const [providerOrderId, setProviderOrderId] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [labelPdfSize, setLabelPdfSize] = useState<"A4" | "4R">("A4");
  const [pickupDate, setPickupDate] = useState(getDefaultPickupDateInput());
  const [pickupTime, setPickupTime] = useState("10:00:00");
  const [pickupLocation, setPickupLocation] = useState("");
  const [expectedPackageCount, setExpectedPackageCount] = useState("1");
  const [cancellationAdminNote, setCancellationAdminNote] = useState("");

  // Loading states
  const [saving, setSaving] = useState(false);
  const [syncingDelivery, setSyncingDelivery] = useState(false);
  const [refreshingTracking, setRefreshingTracking] = useState(false);
  const [printingLabel, setPrintingLabel] = useState(false);
  const [schedulingPickup, setSchedulingPickup] = useState(false);
  const [cancellingPickup, setCancellingPickup] = useState(false);
  const [markingPickupCancelled, setMarkingPickupCancelled] = useState(false);
  const [processingCancellation, setProcessingCancellation] = useState(false);

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteOrderId, setPendingDeleteOrderId] = useState<string | null>(null);
  const [deleteCountdown, setDeleteCountdown] = useState<number | null>(null);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deleteOperationRef = useRef(0);
  const deleteToastRef = useRef<DeleteToastHandle | null>(null);

  // ─── Load order from Firestore ──────────────────────────────────────────

  useEffect(() => {
    if (!orderId) {
      navigate("/admin/orders");
      return;
    }
    const unsubscribe = onSnapshot(
      doc(db, "orders", orderId),
      (snap) => {
        setOrder(snap.exists() ? normalizeCustomerOrder(snap.id, snap.data()) : null);
        setLoading(false);
      },
      (error) => {
        console.error("Unable to load order", error);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [orderId, navigate]);

  // Sync form fields whenever order updates from Firestore
  useEffect(() => {
    if (!order) return;
    setSelectedStatus(order.status || "placed");
    setSelectedPaymentStatus(order.payment?.status || "pending");
    setAdminNotes(order.adminNotes || "");
    setProviderOrderId(order.delivery?.providerOrderId || "");
    setTrackingNumber(order.delivery?.trackingNumber || "");
    setTrackingUrl(order.delivery?.trackingUrl || "");
    setLabelPdfSize(order.delivery?.labelPdfSize || "A4");
    setPickupDate(order.delivery?.pickupDate || getDefaultPickupDateInput());
    setPickupTime(order.delivery?.pickupTime || "10:00:00");
    setPickupLocation(order.delivery?.pickupLocation || "");
    setExpectedPackageCount(String(order.delivery?.expectedPackageCount || 1));
    setCancellationAdminNote("");
  }, [order]);

  useEffect(() => () => { clearPendingDelete(); }, []);

  // ─── Derived state ──────────────────────────────────────────────────────

  const deliveryEligibility = getDeliveryOneSyncEligibility(order);
  const deliverySyncStatus = (order?.delivery?.syncStatus || "manual-ready") as DeliverySyncStatus;
  const deliveryLifecycleStatus = getDeliveryLifecycleStatus(order);
  const cancellationStatus = (order?.cancellation?.status || "none") as OrderCancellationStatus;
  const hasDeliveryWaybill = Boolean(order?.delivery?.trackingNumber);
  const isTerminalOrder = Boolean(order && ["delivered", "cancelled", "returned"].includes(order.status));
  const canUseDeliveryOneFulfillment = hasDeliveryWaybill && !isTerminalOrder;
  const selectedPickupId = order?.delivery?.pickupId || "";
  const hasRealPickupId = isRealPickupId(selectedPickupId);
  const hasPlaceholderPickupId = isPlaceholderPickupId(selectedPickupId);
  const hasPickupRequestMissingId =
    order?.delivery?.pickupRequestStatus === "id-missing" || hasPlaceholderPickupId;
  const pickupCancellationStatus = order?.delivery?.pickupCancellationStatus || "";
  const pickupCancellationNeedsConfig = pickupCancellationStatus === "manual-required";
  const needsPickupCancellationAttention = Boolean(
    hasRealPickupId
    && order?.status === "cancelled"
    && pickupCancellationStatus !== "cancelled"
    && pickupCancellationStatus !== "not-required"
    && !pickupCancellationNeedsConfig,
  );
  const canAdminCancelSyncedOrder = Boolean(
    order?.delivery?.trackingNumber
    && !["delivered", "cancelled", "returned"].includes(order?.status || ""),
  );

  // ─── Handlers ───────────────────────────────────────────────────────────

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
    if (dismissToast) deleteToastRef.current?.dismiss();
    deleteToastRef.current = null;
    setPendingDeleteOrderId(null);
    setDeleteCountdown(null);
  };

  const saveOrder = async () => {
    if (!order) return;

    const statusChanged = selectedStatus !== order.status;
    const paymentChanged = selectedPaymentStatus !== order.payment?.status;
    const notesChanged = adminNotes.trim() !== (order.adminNotes || "");
    const cleanProviderOrderId = providerOrderId.trim();
    const cleanTrackingNumber = trackingNumber.trim();
    const cleanTrackingUrl = trackingUrl.trim();
    const deliveryTrackingChanged =
      cleanProviderOrderId !== (order.delivery?.providerOrderId || "")
      || cleanTrackingNumber !== (order.delivery?.trackingNumber || "")
      || cleanTrackingUrl !== (order.delivery?.trackingUrl || "");

    if (!statusChanged && !paymentChanged && !notesChanged && !deliveryTrackingChanged) {
      toast({ title: "No changes to save" });
      return;
    }
    if (
      statusChanged
      && selectedStatus === "cancelled"
      && (order.delivery?.trackingNumber || cancellationStatus === "requested")
    ) {
      toast({
        title: "Use cancellation approval",
        description:
          "Approve the cancellation request from the cancellation panel so Delhivery is notified when a waybill exists.",
        variant: "destructive",
      });
      return;
    }

    const timelineEvents: {
      status: OrderStatus;
      label: string;
      note: string;
      createdAt: string;
      createdBy: string;
    }[] = [];
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
        status: order.status,
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
      if (["paid", "cod-collected"].includes(selectedPaymentStatus))
        payload["payment.paidAt"] = serverTimestamp();
    }
    if (deliveryTrackingChanged) {
      const nextSyncStatus: DeliverySyncStatus =
        cleanProviderOrderId || cleanTrackingNumber || cleanTrackingUrl ? "synced" : "manual-ready";
      payload["delivery.provider"] = nextSyncStatus === "synced" ? "delivery-one" : "manual";
      payload["delivery.providerOrderId"] = cleanProviderOrderId;
      payload["delivery.trackingNumber"] = cleanTrackingNumber;
      payload["delivery.trackingUrl"] = cleanTrackingUrl;
      payload["delivery.syncStatus"] = nextSyncStatus;
    }
    if (timelineEvents.length > 0) payload.timeline = arrayUnion(...timelineEvents);

    setSaving(true);
    try {
      await updateDoc(doc(db, "orders", order.id), payload);
      const idToken = await user?.getIdToken();
      if (idToken && statusChanged) {
        void sendOrderAutomation(idToken, {
          orderId: order.id,
          event: "order-status-updated",
          status: selectedStatus,
        }).catch((err) => console.error("Status automation failed", err));
      }
      if (idToken && paymentChanged) {
        void sendOrderAutomation(idToken, {
          orderId: order.id,
          event: "payment-status-updated",
          paymentStatus: selectedPaymentStatus,
        }).catch((err) => console.error("Payment automation failed", err));
      }
      toast({ title: "Order updated", description: order.orderNumber || order.id });
    } catch (error) {
      console.error("Unable to update order", error);
      toast({
        title: "Unable to update order",
        description: "Check admin permissions and try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSyncDelivery = async () => {
    if (!order || !user) return;
    if (!deliveryEligibility.eligible) {
      toast({
        title: "Delivery One sync unavailable",
        description: deliveryEligibility.reason,
        variant: "destructive",
      });
      return;
    }
    setSyncingDelivery(true);
    try {
      const idToken = await user.getIdToken();
      const result = await syncDeliveryOneOrder(idToken, order.id);
      toast({
        title: result.syncStatus === "synced" ? "Delivery One synced" : "Delivery One payload ready",
        description:
          result.message
          || (result.providerOrderId ? `Provider order ${result.providerOrderId}` : order.orderNumber || order.id),
      });
    } catch (error) {
      console.error("Unable to sync Delivery One order", error);
      toast({
        title: "Delivery One sync failed",
        description:
          error instanceof Error
            ? error.message
            : "Try again after checking credentials.",
        variant: "destructive",
      });
    } finally {
      setSyncingDelivery(false);
    }
  };

  const handleRefreshTracking = async () => {
    if (!order || !user) return;
    if (!order.delivery?.trackingNumber) {
      toast({
        title: "Tracking unavailable",
        description: "This order does not have a Delivery One tracking number yet.",
        variant: "destructive",
      });
      return;
    }
    setRefreshingTracking(true);
    try {
      const idToken = await user.getIdToken();
      const result = await refreshDeliveryOneTracking(idToken, order.id);
      toast({
        title: "Tracking refreshed",
        description: result.providerStatus
          ? `Delhivery: ${result.providerStatus}`
          : result.message || order.orderNumber || order.id,
      });
    } catch (error) {
      console.error("Unable to refresh Delivery One tracking", error);
      toast({
        title: "Tracking refresh failed",
        description:
          error instanceof Error ? error.message : "Try again after checking credentials.",
        variant: "destructive",
      });
    } finally {
      setRefreshingTracking(false);
    }
  };

  const handlePrintLabel = async () => {
    if (!order || !user) return;
    if (!order.delivery?.trackingNumber) {
      toast({
        title: "No waybill",
        description: "Sync the shipment with Delhivery first to get a waybill.",
        variant: "destructive",
      });
      return;
    }
    if (["delivered", "cancelled", "returned"].includes(order.status)) {
      toast({
        title: "Order closed",
        description: "Shipping label actions are locked for completed, cancelled, or returned orders.",
        variant: "destructive",
      });
      return;
    }
    setPrintingLabel(true);
    try {
      const idToken = await user.getIdToken();
      const result = await printDeliveryOneLabel(idToken, order.id, labelPdfSize);
      toast({
        title: "Shipping label ready",
        description: `${result.pdfSize || labelPdfSize} label opened in a new tab.`,
      });
    } catch (error) {
      console.error("Unable to print Delivery One label", error);
      toast({
        title: "Label fetch failed",
        description:
          error instanceof Error
            ? error.message
            : "Try again or download from Delhivery dashboard.",
        variant: "destructive",
      });
    } finally {
      setPrintingLabel(false);
    }
  };

  const handleSchedulePickup = async () => {
    if (!order || !user) return;
    if (!order.delivery?.trackingNumber) {
      toast({
        title: "No waybill",
        description: "Sync the shipment with Delhivery first to get a waybill.",
        variant: "destructive",
      });
      return;
    }
    if (["delivered", "cancelled", "returned"].includes(order.status)) {
      toast({
        title: "Order closed",
        description: "Pickup cannot be scheduled for completed, cancelled, or returned orders.",
        variant: "destructive",
      });
      return;
    }
    setSchedulingPickup(true);
    try {
      const idToken = await user.getIdToken();
      const result = await scheduleDeliveryOnePickup(idToken, order.id, {
        pickupDate,
        pickupTime,
        pickupLocation: pickupLocation.trim() || undefined,
        expectedPackageCount: Number(expectedPackageCount) || 1,
      });
      toast({
        title:
          result.pickupRequestStatus === "id-missing" ? "Pickup ID missing" : "Pickup scheduled",
        description: result.message || `Pickup date: ${result.pickupDate || "pending"}`,
        variant: result.pickupRequestStatus === "id-missing" ? "destructive" : undefined,
      });
    } catch (error) {
      console.error("Unable to schedule Delivery One pickup", error);
      toast({
        title: "Pickup scheduling failed",
        description:
          error instanceof Error
            ? error.message
            : "Try again or schedule from Delhivery dashboard.",
        variant: "destructive",
      });
    } finally {
      setSchedulingPickup(false);
    }
  };

  const handleMarkPickupManuallyCancelled = async () => {
    if (!order || !user) return;
    setMarkingPickupCancelled(true);
    try {
      const idToken = await user.getIdToken();
      const result = await markDeliveryOnePickupManuallyCancelled(idToken, order.id);
      toast({
        title: "Pickup marked as cancelled",
        description: result.message || order.delivery?.pickupId,
      });
    } catch (error) {
      console.error("Unable to mark pickup as manually cancelled", error);
      toast({
        title: "Failed",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setMarkingPickupCancelled(false);
    }
  };

  const handleCancelPickup = async () => {
    if (!order || !user) return;
    if (!hasRealPickupId) {
      toast({
        title: "No real pickup ID",
        description:
          "Javani does not have a real Delhivery pickup ID for this order.",
        variant: "destructive",
      });
      return;
    }
    setCancellingPickup(true);
    try {
      const idToken = await user.getIdToken();
      const result = await cancelDeliveryOnePickup(idToken, order.id);
      toast({
        title:
          result.pickupCancellationStatus === "cancelled"
            ? "Pickup cancelled"
            : "Pickup cancellation updated",
        description:
          result.pickupCancellationMessage
          || result.message
          || order.delivery.pickupId,
        variant: ["failed", "manual-required"].includes(
          result.pickupCancellationStatus || "",
        )
          ? "destructive"
          : undefined,
      });
    } catch (error) {
      console.error("Unable to cancel Delivery One pickup", error);
      toast({
        title: "Pickup cancellation failed",
        description:
          error instanceof Error
            ? error.message
            : "Try again after checking the order status.",
        variant: "destructive",
      });
    } finally {
      setCancellingPickup(false);
    }
  };

  const handleApproveCancellation = async () => {
    if (!order || !user) return;
    setProcessingCancellation(true);
    try {
      const idToken = await user.getIdToken();
      const result = await approveOrderCancellation(
        idToken,
        order.id,
        cancellationAdminNote.trim(),
      );
      toast({
        title:
          result.pickupCancellationStatus === "manual-required"
            ? "Cancellation approved, pickup endpoint needed"
            : result.pickupCancellationStatus === "failed"
              ? "Cancellation approved, pickup retry needed"
              : "Cancellation approved",
        description:
          result.pickupCancellationMessage
          || result.message
          || order.orderNumber
          || order.id,
        variant: ["failed", "manual-required"].includes(
          result.pickupCancellationStatus || "",
        )
          ? "destructive"
          : undefined,
      });
    } catch (error) {
      console.error("Unable to approve cancellation", error);
      toast({
        title: "Cancellation approval failed",
        description:
          error instanceof Error
            ? error.message
            : "Try again after checking Delivery One status.",
        variant: "destructive",
      });
    } finally {
      setProcessingCancellation(false);
    }
  };

  const handleRejectCancellation = async () => {
    if (!order || !user) return;
    setProcessingCancellation(true);
    try {
      const idToken = await user.getIdToken();
      const result = await rejectOrderCancellation(
        idToken,
        order.id,
        cancellationAdminNote.trim(),
      );
      toast({
        title: "Cancellation rejected",
        description: result.message || order.orderNumber || order.id,
      });
    } catch (error) {
      console.error("Unable to reject cancellation", error);
      toast({
        title: "Cancellation rejection failed",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
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
    if (!order) return;
    clearPendingDelete();

    const operationId = deleteOperationRef.current + 1;
    deleteOperationRef.current = operationId;
    setPendingDeleteOrderId(order.id);
    setDeleteCountdown(5);
    setDeleteDialogOpen(false);

    const currentOrderId = order.id;
    const orderLabel = order.orderNumber || order.id;
    const getDeleteAction = () => (
      <ToastAction altText="Undo order deletion" onClick={() => undoDeleteOrder("toast")}>
        Undo
      </ToastAction>
    );

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
        const next = current - 1;
        if (deleteOperationRef.current === operationId) {
          deleteToastRef.current?.update({
            title: "Order scheduled for deletion",
            description: `${orderLabel} will be deleted in ${next} seconds unless you undo it.`,
            duration: next * 1000 + 500,
            action: getDeleteAction(),
          });
        }
        return next;
      });
    }, 1000);

    deleteTimeoutRef.current = setTimeout(async () => {
      if (deleteOperationRef.current !== operationId) return;
      try {
        await deleteDoc(doc(db, "orders", currentOrderId));
        toast({ title: "Order deleted", description: `${orderLabel} was removed completely.` });
        navigate("/admin/orders");
      } catch (error) {
        console.error("Unable to delete order", error);
        toast({
          title: "Unable to delete order",
          description: "Check admin permissions and try again.",
          variant: "destructive",
        });
      } finally {
        deleteTimeoutRef.current = null;
        if (deleteIntervalRef.current) {
          clearInterval(deleteIntervalRef.current);
          deleteIntervalRef.current = null;
        }
        deleteToastRef.current = null;
        setDeleteCountdown(null);
        setPendingDeleteOrderId(null);
      }
    }, 5000);
  };

  // ─── Loading / Not Found ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto mb-4 h-8 w-8 animate-spin text-gold" />
          <p className="font-body text-muted-foreground">Loading order…</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <PackageCheck className="mx-auto mb-4 h-10 w-10 text-gold/40" />
          <p className="font-display text-xl text-foreground">Order not found</p>
          <p className="mt-1 font-body text-sm text-muted-foreground mb-5">
            This order may have been deleted or the ID is invalid.
          </p>
          <button
            type="button"
            onClick={() => navigate("/admin/orders")}
            className="inline-flex items-center gap-2 rounded-sm bg-gold px-5 py-2.5 font-display text-sm font-semibold tracking-[0.08em] text-charcoal"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Orders
          </button>
        </div>
      </div>
    );
  }

  // ─── Full-page render ────────────────────────────────────────────────────

  return (
    <div className="min-w-0 space-y-4 sm:space-y-6">
      {/* Page header */}
      <div>
        <button
          type="button"
          onClick={() => navigate("/admin/orders")}
          className="mb-4 inline-flex items-center gap-2 font-body text-sm font-medium text-muted-foreground transition-colors hover:text-gold"
        >
          <ArrowLeft className="h-4 w-4" /> Orders
        </button>
        <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-gold">
          E-Commerce
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="break-all font-display text-2xl text-foreground sm:text-3xl">
            {order.orderNumber || order.id}
          </h1>
          <span
            className={`rounded-full border px-3 py-1 font-body text-sm font-semibold ${getStatusBadgeClass(order.status)}`}
          >
            {ORDER_STATUS_LABELS[order.status] || order.status}
          </span>
          {order.cancellation?.status === "requested" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/25 bg-destructive/10 px-3 py-1 font-body text-sm font-semibold text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> Cancel Requested
            </span>
          )}
        </div>

        {/* Date summary strip */}
        <div className="mt-3 flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-gold/10 px-3 py-1.5 font-body text-xs font-semibold text-gold">
            <CalendarDays className="h-3.5 w-3.5" /> Placed: {formatOrderPlacedDateTime(order)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 font-body text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-gold" /> Updated: {formatOrderUpdatedDateTime(order)}
          </span>
          {order.payment?.paidAt && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 font-body text-xs text-muted-foreground">
              <CreditCard className="h-3.5 w-3.5 text-gold" /> Paid:{" "}
              {formatAccountDateTime(order.payment.paidAt)}
            </span>
          )}
        </div>
      </div>

      {/* Pending delete banner */}
      {pendingDeleteOrderId === order.id && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-4 font-body text-sm text-destructive">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Order deletion is pending.
              {deleteCountdown ? ` Removing in ${deleteCountdown}…` : ""} Use Undo to keep this
              order.
            </p>
            <button
              type="button"
              onClick={() => undoDeleteOrder("inline")}
              className="inline-flex h-9 items-center justify-center rounded-md border border-destructive/35 px-4 font-display text-xs font-semibold tracking-[0.08em] text-destructive transition-colors hover:bg-destructive/10"
            >
              Undo
            </button>
          </div>
        </div>
      )}

      {/* Main content grid */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Left column */}
        <div className="space-y-6">
          {/* Customer & Address */}
          <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-card sm:p-5">
            <h2 className="mb-4 font-display text-xl text-foreground">Customer &amp; Address</h2>
            <div className="grid gap-3 font-body text-sm sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="truncate font-semibold text-foreground">{order.customerName}</p>
                  <p className="truncate text-muted-foreground">{order.customerId}</p>
                </div>
              </div>
              {order.customerEmail && (
                <div className="flex items-center gap-3 overflow-hidden">
                  <Mail className="h-4 w-4 shrink-0 text-gold" />
                  <a
                    href={`mailto:${order.customerEmail}`}
                    className="truncate text-foreground hover:text-gold"
                  >
                    {order.customerEmail}
                  </a>
                </div>
              )}
              <div className="flex items-center gap-3 overflow-hidden">
                <MessageCircle className="h-4 w-4 shrink-0 text-gold" />
                <span className="truncate text-muted-foreground">
                  WhatsApp:{" "}
                  <span className="text-foreground">
                    {order.customerWhatsAppNumber || order.customerPhone || "Not saved"}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-3 overflow-hidden">
                <Phone className="h-4 w-4 shrink-0 text-gold" />
                <span className="truncate text-muted-foreground">
                  Call:{" "}
                  <span className="text-foreground">
                    {order.customerCallNumber || order.customerPhone || "Not saved"}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-3 overflow-hidden">
                <Truck className="h-4 w-4 shrink-0 text-gold" />
                <span className="truncate text-muted-foreground">
                  Delivery phone:{" "}
                  <span className="text-foreground">
                    {order.address?.phone || order.customerPhone || "Not saved"}
                  </span>
                </span>
              </div>
              <div className="flex items-start gap-3 overflow-hidden">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                <address className="not-italic text-foreground">
                  <div className="break-all">{order.address?.line1}</div>
                  <div className="break-all">{order.address?.line2 ? `${order.address.line2}` : ""}</div>
                  <div className="break-words">{order.address?.city}, {order.address?.state} {order.address?.pincode}</div>
                </address>
              </div>
            </div>
          </section>

          {/* Items */}
          <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-card sm:p-5">
            <h2 className="mb-4 font-display text-xl text-foreground">Items</h2>
            <div className="space-y-2">
              {order.items?.map((item) => (
                <div
                  key={`${item.productId}-${item.sourceId || item.name}`}
                  className="flex items-center justify-between gap-3 overflow-hidden rounded-lg border border-border/60 bg-background/70 p-3 font-body text-sm"
                >
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Qty {item.quantity}
                      {item.categoryLabel ? ` · ${item.categoryLabel}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold text-gold">
                    {formatPaiseAsRupees(item.lineTotalInPaise || 0)}
                  </span>
                </div>
              ))}
            </div>

            {/* Order totals */}
            <div className="mt-4 space-y-1.5 border-t border-border/60 pt-4 font-body text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatPaiseAsRupees(order.subtotalInPaise || 0)}</span>
              </div>
              {(order.deliveryChargeInPaise || 0) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Delivery</span>
                  <span>{formatPaiseAsRupees(order.deliveryChargeInPaise || 0)}</span>
                </div>
              )}
              {(order.discountInPaise || 0) > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount{order.coupon ? ` (${order.coupon.code})` : ""}</span>
                  <span>−{formatPaiseAsRupees(order.discountInPaise || 0)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border/60 pt-2 font-display text-base text-foreground">
                <span>Total</span>
                <span className="text-gold">{formatPaiseAsRupees(order.totalInPaise || 0)}</span>
              </div>
              <div className="flex justify-between font-body text-xs text-muted-foreground">
                <span>
                  Payment: {paymentMethodLabels[order.payment?.method] || order.payment?.method}
                </span>
                <span>
                  {paymentStatusLabels[order.payment?.status] || order.payment?.status}
                </span>
              </div>
            </div>
          </section>

          {/* Delivery One */}
          <section className="rounded-2xl border border-gold/20 bg-card p-4 shadow-card sm:p-5">
            <div className="mb-1 flex items-center gap-2">
              <Truck className="h-5 w-5 text-gold" />
              <h2 className="font-display text-xl text-foreground">Delivery One</h2>
            </div>
            <p className="mb-5 font-body text-sm text-muted-foreground">
              Manifest the order, print the shipping label, schedule pickup, and refresh Delhivery
              status.
            </p>

            {/* Action buttons */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:flex-wrap">
              <button
                type="button"
                onClick={handleSyncDelivery}
                disabled={syncingDelivery || !deliveryEligibility.eligible}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm bg-gold px-4 font-display text-xs font-semibold tracking-[0.08em] text-charcoal transition-colors hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-60 xl:w-auto"
              >
                <RefreshCw className={`h-4 w-4 ${syncingDelivery ? "animate-spin" : ""}`} />
                {syncingDelivery ? "Manifesting…" : "Manifest Order"}
              </button>
              <button
                type="button"
                onClick={handleRefreshTracking}
                disabled={refreshingTracking || !hasDeliveryWaybill}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm border border-gold/35 px-4 font-display text-xs font-semibold tracking-[0.08em] text-gold transition-colors hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-60 xl:w-auto"
              >
                <RefreshCw className={`h-4 w-4 ${refreshingTracking ? "animate-spin" : ""}`} />
                {refreshingTracking ? "Refreshing…" : "Refresh Tracking"}
              </button>
              <button
                type="button"
                onClick={handlePrintLabel}
                disabled={printingLabel || !canUseDeliveryOneFulfillment}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm border border-gold/35 px-4 font-display text-xs font-semibold tracking-[0.08em] text-gold transition-colors hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-60 xl:w-auto"
              >
                <Printer className={`h-4 w-4 ${printingLabel ? "animate-pulse" : ""}`} />
                {printingLabel ? "Fetching…" : "Print Label"}
              </button>
              <button
                type="button"
                onClick={handleSchedulePickup}
                disabled={
                  schedulingPickup
                  || !canUseDeliveryOneFulfillment
                  || hasRealPickupId
                  || hasPickupRequestMissingId
                }
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm border border-gold/35 px-4 font-display text-xs font-semibold tracking-[0.08em] text-gold transition-colors hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-60 xl:w-auto"
              >
                <PackagePlus className={`h-4 w-4 ${schedulingPickup ? "animate-pulse" : ""}`} />
                {schedulingPickup
                  ? "Scheduling…"
                  : hasRealPickupId
                    ? "Pickup Booked"
                    : hasPickupRequestMissingId
                      ? "Pickup ID Missing"
                      : "Create Pickup"}
              </button>
            </div>

            {!deliveryEligibility.eligible && (
              <p className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 font-body text-xs text-destructive">
                {deliveryEligibility.reason}
              </p>
            )}

            {/* Status grid */}
            <div className="mt-5 grid grid-cols-2 gap-3 font-body text-xs xl:grid-cols-4">
              {[
                {
                  label: "Delivery status",
                  value:
                    DELIVERY_LIFECYCLE_STATUS_LABELS[deliveryLifecycleStatus]
                    || deliveryLifecycleStatus,
                },
                {
                  label: "Manifest status",
                  value: DELIVERY_SYNC_STATUS_LABELS[deliverySyncStatus] || deliverySyncStatus,
                },
                {
                  label: "Package weight",
                  value: formatShipmentWeight(order.delivery?.shipmentWeightInGrams || 0),
                },
                {
                  label: "Delivery charge",
                  value: formatPaiseAsRupees(order.delivery?.chargeInPaise || 0),
                },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-gold/20 bg-background p-3">
                  <span className="block text-muted-foreground">{label}</span>
                  <span className="mt-1 block break-all font-semibold text-foreground">{value}</span>
                </div>
              ))}
            </div>

            {/* Manifest package data */}
            <div className="mt-4 rounded-lg border border-gold/20 bg-background p-3 sm:p-4">
              <p className="font-body text-xs font-semibold uppercase tracking-[0.14em] text-gold">
                Manifest package data
              </p>
              <p className="mt-1 font-body text-xs leading-relaxed text-muted-foreground">
                These order-time snapshots are sent to Delhivery when you click Manifest Order.
              </p>
              <div className="mt-3 space-y-2">
                {order.items
                  .filter((item) => item.itemType !== "course")
                  .map((item) => (
                    <div
                      key={`${item.productId}-${item.sourceId || item.name}`}
                      className="min-w-0 rounded-md border border-border bg-card/70 p-2.5 font-body text-xs"
                    >
                      <p className="break-words font-semibold text-foreground">{item.name}</p>
                      <div className="mt-1 grid grid-cols-3 gap-1 text-muted-foreground">
                        <span>
                          Qty: <strong className="text-foreground">{item.quantity}</strong>
                        </span>
                        <span>
                          Weight:{" "}
                          <strong className="text-foreground">
                            {formatShipmentWeight(item.shipmentWeightInGrams || 0)}
                          </strong>
                        </span>
                        <span>
                          Size:{" "}
                          <strong className="text-foreground">
                            {formatShipmentDimensions(item.delivery)}
                          </strong>
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Pickup controls */}
            {canUseDeliveryOneFulfillment ? (
              <div className="mt-5 grid gap-3 font-body text-sm sm:grid-cols-2">
                <label className="font-semibold text-foreground">
                  Label size
                  <select
                    value={labelPdfSize}
                    onChange={(e) => setLabelPdfSize(e.target.value as "A4" | "4R")}
                    className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold"
                  >
                    <option value="A4">A4</option>
                    <option value="4R">4R</option>
                  </select>
                </label>
                <label className="font-semibold text-foreground">
                  Pickup packages
                  <input
                    type="number"
                    min="1"
                    value={expectedPackageCount}
                    onChange={(e) => setExpectedPackageCount(e.target.value)}
                    className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold"
                  />
                </label>
                <label className="font-semibold text-foreground">
                  Pickup date
                  <input
                    type="date"
                    value={pickupDate}
                    onChange={(e) => setPickupDate(e.target.value)}
                    className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold"
                  />
                </label>
                <label className="font-semibold text-foreground">
                  Pickup time
                  <input
                    type="time"
                    value={pickupTime.slice(0, 5)}
                    onChange={(e) => setPickupTime(`${e.target.value}:00`)}
                    className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold"
                  />
                </label>
                <label className="font-semibold text-foreground sm:col-span-2">
                  Pickup warehouse
                  <input
                    value={pickupLocation}
                    onChange={(e) => setPickupLocation(e.target.value)}
                    className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm outline-none focus:border-gold"
                    placeholder="Leave blank to use DELIVERY_ONE_PICKUP_LOCATION"
                  />
                </label>
              </div>
            ) : hasDeliveryWaybill ? (
              <p className="mt-4 rounded-lg border border-gold/20 bg-gold/10 p-3 font-body text-xs leading-relaxed text-foreground">
                Label and pickup controls are locked because this order is{" "}
                {ORDER_STATUS_LABELS[order.status] || order.status}.
              </p>
            ) : (
              <p className="mt-4 rounded-lg border border-gold/20 bg-gold/10 p-3 font-body text-xs leading-relaxed text-foreground">
                Manifest this order first. Label printing, pickup scheduling, and tracking unlock
                after the AWB is saved.
              </p>
            )}

            {order.delivery?.providerStatus && (
              <p className="mt-3 rounded-lg border border-gold/20 bg-card p-3 font-body text-xs text-muted-foreground">
                Delhivery status:{" "}
                <span className="font-semibold text-foreground">
                  {order.delivery.providerStatus}
                </span>
                {order.delivery.providerStatusType
                  ? ` (${order.delivery.providerStatusType})`
                  : ""}
              </p>
            )}

            {hasRealPickupId && (
              <p className="mt-3 rounded-lg border border-gold/20 bg-card p-3 font-body text-xs text-muted-foreground">
                Pickup booked:{" "}
                <span className="break-all font-semibold text-foreground">{selectedPickupId}</span>
                {order.delivery.pickupDate ? ` · ${order.delivery.pickupDate}` : ""}
                {order.delivery.pickupTime ? ` · ${order.delivery.pickupTime}` : ""}
                {order.delivery.expectedPackageCount
                  ? ` · ${order.delivery.expectedPackageCount} package(s)`
                  : ""}
              </p>
            )}

            {hasPickupRequestMissingId && (
              <p
                data-testid="pickup-id-missing-warning"
                className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 font-body text-xs leading-relaxed text-destructive"
              >
                Pickup request was sent, but Javani does not have a real Delhivery pickup ID. The
                order is not marked Pickup Booked, and cancellation will not use the old placeholder
                ID.
              </p>
            )}

            {hasRealPickupId && pickupCancellationStatus === "cancelled" && (
              <p
                data-testid="pickup-cancelled-status"
                className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 font-body text-xs leading-relaxed text-emerald-700"
              >
                Pickup request {selectedPickupId} was cancelled from the Javani dashboard.
              </p>
            )}

            {hasRealPickupId && order.status === "cancelled" && pickupCancellationNeedsConfig && (
              <div
                data-testid="pickup-cancellation-config-warning"
                className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 font-body text-xs leading-relaxed text-destructive"
              >
                <p>
                  Pickup request{" "}
                  <strong className="break-all">{selectedPickupId}</strong> must be cancelled manually on the Delhivery
                  One dashboard — Delhivery&apos;s public cancel API is unavailable.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`https://one.delhivery.com/pickup-requests/${selectedPickupId}?international=false`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-sm bg-destructive px-3 py-2 font-display text-[11px] font-semibold tracking-[0.08em] text-destructive-foreground transition-colors hover:bg-destructive/90 xl:w-auto"
                  >
                    Open in Delhivery One <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={handleMarkPickupManuallyCancelled}
                    disabled={markingPickupCancelled}
                    className="inline-flex items-center justify-center gap-2 rounded-sm border border-destructive px-3 py-2 font-display text-[11px] font-semibold tracking-[0.08em] text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {markingPickupCancelled ? "Saving…" : "Mark as manually cancelled"}
                  </button>
                </div>
              </div>
            )}

            {needsPickupCancellationAttention && (
              <div
                data-testid="pickup-cancellation-warning"
                className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 font-body text-xs leading-relaxed text-destructive"
              >
                <p>
                  Pickup request {selectedPickupId} still needs cancellation. Retry it from this
                  dashboard so the admin does not need to open Delhivery One.
                </p>
                <button
                  type="button"
                  onClick={handleCancelPickup}
                  disabled={cancellingPickup}
                  className="mt-3 inline-flex items-center justify-center gap-2 rounded-sm bg-destructive px-3 py-2 font-display text-[11px] font-semibold tracking-[0.08em] text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${cancellingPickup ? "animate-spin" : ""}`} />
                  {cancellingPickup ? "Cancelling…" : "Cancel Pickup"}
                </button>
              </div>
            )}

            {order.delivery?.labelUrl && (
              <a
                href={order.delivery.labelUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex flex-wrap items-center gap-2 font-body text-xs font-semibold text-gold hover:text-gold-light"
              >
                Open saved shipping label <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}

            {order.delivery?.lastSyncError && (
              <p className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 font-body text-xs text-destructive">
                {order.delivery.lastSyncError.split(" | Raw:")[0]}
              </p>
            )}

            {/* Manual tracking fields */}
            <div className="mt-5 grid gap-3">
              <label className="font-body text-sm font-semibold text-foreground">
                Provider order ID
                <input
                  value={providerOrderId}
                  onChange={(e) => setProviderOrderId(e.target.value)}
                  className="mt-2 h-10 w-full min-w-0 rounded-md border border-border bg-background px-3 font-body text-base sm:text-sm outline-none focus:border-gold"
                  placeholder="Delivery One order/reference ID"
                />
              </label>
              <label className="font-body text-sm font-semibold text-foreground">
                Tracking number
                <input
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className="mt-2 h-10 w-full min-w-0 rounded-md border border-border bg-background px-3 font-body text-base sm:text-sm outline-none focus:border-gold"
                  placeholder="AWB or tracking number"
                />
              </label>
              <label className="font-body text-sm font-semibold text-foreground">
                Tracking URL
                <input
                  value={trackingUrl}
                  onChange={(e) => setTrackingUrl(e.target.value)}
                  className="mt-2 h-10 w-full min-w-0 rounded-md border border-border bg-background px-3 font-body text-base sm:text-sm outline-none focus:border-gold"
                  placeholder="https://…"
                />
              </label>
            </div>

            {order.delivery?.trackingUrl && (
              <a
                href={order.delivery.trackingUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex flex-wrap items-center gap-2 font-body text-xs font-semibold text-gold hover:text-gold-light"
              >
                Open saved tracking link <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </section>

          {/* Cancellation section */}
          {(cancellationStatus !== "none" || canAdminCancelSyncedOrder) && (
            <section className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 shadow-card sm:p-5">
              <div className="mb-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <h2 className="font-display text-xl text-foreground">Cancellation Request</h2>
              </div>

              <p className="font-body text-sm text-muted-foreground">
                Status:{" "}
                <span className="font-semibold text-foreground">
                  {cancellationStatusLabels[cancellationStatus] || cancellationStatus}
                </span>
              </p>
              {cancellationStatus === "none" && (
                <p className="mt-1 font-body text-sm text-muted-foreground">
                  This synced shipment can be cancelled with Delhivery from here.
                </p>
              )}

              {order.cancellation?.reason && (
                <div className="mt-4 rounded-lg border border-destructive/20 bg-card p-3 font-body text-sm">
                  <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-destructive">
                    Customer reason
                  </span>
                  <p className="mt-1 text-foreground">{order.cancellation.reason}</p>
                </div>
              )}

              {order.cancellation?.adminNote && cancellationStatus !== "requested" && (
                <div className="mt-3 rounded-lg border border-border/70 bg-card p-3 font-body text-sm">
                  <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-gold">
                    Admin note
                  </span>
                  <p className="mt-1 text-foreground">{order.cancellation.adminNote}</p>
                </div>
              )}

              {(cancellationStatus === "requested"
                || (cancellationStatus === "none" && canAdminCancelSyncedOrder)) && (
                <div className="mt-4 grid gap-3">
                  <label className="font-body text-sm font-semibold text-foreground">
                    Admin note
                    <textarea
                      value={cancellationAdminNote}
                      onChange={(e) => setCancellationAdminNote(e.target.value)}
                      rows={3}
                      className="mt-2 w-full rounded-md border border-border bg-background px-3 py-3 font-body text-sm outline-none focus:border-gold"
                      placeholder="Optional note for approval or rejection"
                    />
                  </label>
                  <div
                    className={`grid gap-2 ${cancellationStatus === "requested" ? "sm:grid-cols-2" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={handleApproveCancellation}
                      disabled={processingCancellation}
                      className="inline-flex items-center justify-center gap-2 rounded-sm bg-destructive px-4 py-3 font-display text-xs font-semibold tracking-[0.08em] text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <AlertTriangle className="h-4 w-4" />
                      {processingCancellation ? "Processing…" : "Approve Cancel"}
                    </button>
                    {cancellationStatus === "requested" && (
                      <button
                        type="button"
                        onClick={handleRejectCancellation}
                        disabled={processingCancellation}
                        className="inline-flex items-center justify-center gap-2 rounded-sm border border-border px-4 py-3 font-display text-xs font-semibold tracking-[0.08em] text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Keep Order
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Timeline */}
          {order.timeline?.length > 0 && (
            <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-card sm:p-5">
              <h2 className="mb-4 font-display text-xl text-foreground">Timeline</h2>
              <ol className="relative space-y-4 border-l border-gold/25 pl-5">
                {[...order.timeline].reverse().map((event, index) => (
                  <li key={index} className="relative">
                    <div className="absolute -left-[1.375rem] top-1 h-3 w-3 rounded-full border-2 border-gold bg-card" />
                    <p className="font-body text-sm font-semibold text-foreground">
                      {event.label}
                    </p>
                    {event.note && (
                      <p className="break-words font-body text-xs text-muted-foreground">{event.note}</p>
                    )}
                    {event.createdAt && (
                      <p className="mt-0.5 font-body text-xs text-muted-foreground/70">
                        {typeof event.createdAt === "string"
                          ? new Date(event.createdAt).toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Customer notes */}
          {order.customerNotes && (
            <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-card sm:p-5">
              <h2 className="mb-2 font-display text-xl text-foreground">Customer Notes</h2>
              <p className="font-body text-sm text-muted-foreground">{order.customerNotes}</p>
            </section>
          )}
        </div>

        {/* Right column — admin controls */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-card sm:p-5">
            <h2 className="mb-4 font-display text-xl text-foreground">Admin Controls</h2>
            <div className="space-y-4">
              <label className="block font-body text-sm font-semibold text-foreground">
                Order status
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value as OrderStatus)}
                  className="mt-2 h-11 w-full min-w-0 rounded-md border border-border bg-background px-3 font-body text-base sm:text-sm outline-none focus:border-gold"
                >
                  {ADMIN_ORDER_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {ORDER_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block font-body text-sm font-semibold text-foreground">
                Payment status
                <select
                  value={selectedPaymentStatus}
                  onChange={(e) => setSelectedPaymentStatus(e.target.value as PaymentStatus)}
                  className="mt-2 h-11 w-full min-w-0 rounded-md border border-border bg-background px-3 font-body text-base sm:text-sm outline-none focus:border-gold"
                >
                  {ADMIN_PAYMENT_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {paymentStatusLabels[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block font-body text-sm font-semibold text-foreground">
                Internal notes
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={5}
                  className="mt-2 w-full min-w-0 rounded-md border border-border bg-background px-3 py-3 font-body text-base sm:text-sm outline-none focus:border-gold"
                  placeholder="Private admin note for this order"
                />
              </label>
              <button
                type="button"
                onClick={saveOrder}
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-gradient-primary px-5 py-3 font-display text-sm font-semibold tracking-[0.08em] text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60"
              >
                <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Order"}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-destructive/20 bg-card p-4 shadow-card sm:p-5">
            <h2 className="mb-2 font-display text-lg text-foreground">Danger Zone</h2>
            <p className="mb-4 font-body text-xs text-muted-foreground">
              Deletion cannot be recovered after the undo timer ends.
            </p>
            <button
              type="button"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={saving || pendingDeleteOrderId === order.id}
              className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-destructive/35 px-5 py-3 font-display text-sm font-semibold tracking-[0.08em] text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              {pendingDeleteOrderId === order.id && deleteCountdown
                ? `Deleting in ${deleteCountdown}…`
                : "Delete Order"}
            </button>
          </section>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-[1.75rem] border border-gold/20 bg-[linear-gradient(180deg,rgba(36,24,18,0.98),rgba(17,10,8,0.98))] p-0 text-primary-foreground shadow-[0_30px_80px_rgba(0,0,0,0.45)] sm:max-w-xl sm:rounded-3xl">
          <div className="border-b border-gold/10 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.24),transparent_60%)] px-4 py-4 sm:px-8 sm:py-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-destructive/35 bg-destructive/15 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <AlertDialogHeader className="space-y-2 text-left">
                <p className="font-body text-xs font-semibold uppercase tracking-[0.24em] text-gold/80">
                  Permanent action
                </p>
                <AlertDialogTitle className="font-display text-xl leading-tight text-primary-foreground sm:text-2xl">
                  Delete this order completely?
                </AlertDialogTitle>
                <AlertDialogDescription className="font-body text-sm leading-6 text-primary-foreground/75">
                  {order.orderNumber || order.id} will be removed from admin records and customer
                  history after the 5 second undo window starts.
                </AlertDialogDescription>
              </AlertDialogHeader>
            </div>
          </div>
          <div className="space-y-4 px-4 py-4 sm:px-8 sm:py-6">
            <div className="rounded-2xl border border-gold/15 bg-white/5 p-4 font-body text-sm text-primary-foreground/80">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-semibold text-primary-foreground">{order.customerName}</span>
                <span className="text-gold">{formatPaiseAsRupees(order.totalInPaise || 0)}</span>
              </div>
              <p className="mt-2 text-primary-foreground/65">
                This action cannot be recovered after the undo timer ends.
              </p>
            </div>
            <AlertDialogFooter className="flex-col gap-3 sm:flex-row sm:justify-start sm:space-x-0">
              <AlertDialogAction
                onClick={handleDeleteOrder}
                className="w-full rounded-sm border border-destructive/40 bg-destructive px-5 font-display tracking-[0.08em] text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive/30 sm:w-auto"
              >
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

export default AdminOrderDetail;
