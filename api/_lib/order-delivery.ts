import { FieldValue, getFirebaseAdminDb } from "./firebase-admin.js";
import type { DeliveryOneLifecycleStatus, DeliveryOneTrackingUpdate } from "./delivery-one.js";

export type OrderStatus = "placed" | "confirmed" | "packed" | "shipped" | "out-for-delivery" | "delivered" | "cancelled" | "returned";
export type CancellationStatus = "none" | "requested" | "approved" | "rejected";

export interface OrderCancellationSnapshot {
  status?: CancellationStatus;
  reason?: string;
  requestedAt?: unknown;
  requestedBy?: string;
  approvedAt?: unknown;
  approvedBy?: string;
  rejectedAt?: unknown;
  rejectedBy?: string;
  adminNote?: string;
  providerStatus?: string;
}

export interface OrderDeliverySnapshot {
  provider?: string;
  syncStatus?: string;
  lifecycleStatus?: DeliveryOneLifecycleStatus;
  providerOrderId?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  providerStatus?: string;
  providerStatusType?: string;
  pickupId?: string;
  pickupRequestStatus?: string;
  pickupCancellationStatus?: string;
}

export interface OrderSnapshot {
  orderNumber?: string;
  customerId?: string;
  status?: OrderStatus;
  delivery?: OrderDeliverySnapshot;
  cancellation?: OrderCancellationSnapshot;
}

export const orderStatusLabels: Record<OrderStatus, string> = {
  placed: "Placed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  "out-for-delivery": "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

export const deliveryLifecycleStatusLabels: Record<DeliveryOneLifecycleStatus, string> = {
  pending: "Pending",
  "ready-to-ship": "Ready to Ship",
  "ready-for-pickup": "Ready for Pickup",
  "in-transit": "In Transit",
  "out-for-delivery": "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  "rto-in-transit": "RTO In Transit",
  "rto-returned": "RTO Returned",
  lost: "Lost",
  ndr: "NDR",
};

const finalStatuses: OrderStatus[] = ["delivered", "cancelled", "returned"];

export const getString = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;

export const getRecord = (value: unknown): Record<string, unknown> => (
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {}
);

export const isFinalOrderStatus = (status?: string) => finalStatuses.includes(status as OrderStatus);

export const normalizeCancellationReason = (reason: unknown) => getString(reason)
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 500);

export const createTimelineEvent = (status: OrderStatus, label: string, note: string, createdBy: string) => ({
  status,
  label,
  note,
  createdAt: new Date().toISOString(),
  createdBy,
});

export const getCancellationStatus = (order: OrderSnapshot): CancellationStatus => {
  const status = getString(order.cancellation?.status) as CancellationStatus;
  return ["requested", "approved", "rejected"].includes(status) ? status : "none";
};

export const requireOpenCancellationRequest = (order: OrderSnapshot) => {
  if (getCancellationStatus(order) !== "requested") {
    throw new Error("This order does not have a pending cancellation request.");
  }
};

export const createTrackingUpdatePayload = ({
  order,
  update,
  createdBy,
}: {
  order: OrderSnapshot;
  update: DeliveryOneTrackingUpdate;
  createdBy: string;
}) => {
  const currentStatus = order.status || "placed";
  const nextStatus = update.orderStatus;
  const statusChanged = Boolean(nextStatus && nextStatus !== currentStatus);
  const nextLifecycleStatus = update.lifecycleStatus;
  const lifecycleChanged = Boolean(nextLifecycleStatus && nextLifecycleStatus !== order.delivery?.lifecycleStatus);
  const payload: Record<string, unknown> = {
    "delivery.provider": "delivery-one",
    "delivery.lastSyncedAt": FieldValue.serverTimestamp(),
    "delivery.lastTrackedAt": FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (update.providerOrderId) payload["delivery.providerOrderId"] = update.providerOrderId;
  if (update.trackingNumber) payload["delivery.trackingNumber"] = update.trackingNumber;
  if (update.trackingUrl) payload["delivery.trackingUrl"] = update.trackingUrl;
  if (update.providerStatus) payload["delivery.providerStatus"] = update.providerStatus;
  if (update.providerStatusType) payload["delivery.providerStatusType"] = update.providerStatusType;
  if (nextLifecycleStatus) payload["delivery.lifecycleStatus"] = nextLifecycleStatus;
  if (update.eventAt) payload["delivery.lastCarrierEventAt"] = update.eventAt;
  if (update.ndrReason) payload["delivery.ndrReason"] = update.ndrReason;
  if (update.rtoReason) payload["delivery.rtoReason"] = update.rtoReason;
  if (createdBy === "delivery-one-webhook") payload["delivery.lastWebhookAt"] = FieldValue.serverTimestamp();

  if (statusChanged && nextStatus) {
    payload.status = nextStatus;
    payload["delivery.status"] = nextStatus;
  }

  if (nextStatus === "delivered" || nextLifecycleStatus === "delivered") payload["delivery.deliveredAt"] = FieldValue.serverTimestamp();
  if (nextStatus === "cancelled" || nextLifecycleStatus === "cancelled") payload["delivery.cancelledAt"] = FieldValue.serverTimestamp();

  if ((statusChanged && nextStatus) || (lifecycleChanged && nextLifecycleStatus)) {
    const timelineStatus = nextStatus || currentStatus;
    const label = nextLifecycleStatus
      ? deliveryLifecycleStatusLabels[nextLifecycleStatus]
      : orderStatusLabels[timelineStatus] || timelineStatus;
    payload.timeline = FieldValue.arrayUnion(createTimelineEvent(
      timelineStatus,
      label,
      update.providerStatus ? `Delhivery marked shipment as ${update.providerStatus}.` : "Delhivery shipment status changed.",
      createdBy,
    ));
  }

  return payload;
};

export const findOrderByDeliveryOneUpdate = async (update: DeliveryOneTrackingUpdate) => {
  const db = getFirebaseAdminDb();
  const trackingNumber = getString(update.trackingNumber);
  const providerOrderId = getString(update.providerOrderId);

  if (trackingNumber) {
    const snapshot = await db.collection("orders").where("delivery.trackingNumber", "==", trackingNumber).limit(1).get();
    if (!snapshot.empty) return snapshot.docs[0];
  }

  if (providerOrderId) {
    const providerSnapshot = await db.collection("orders").where("delivery.providerOrderId", "==", providerOrderId).limit(1).get();
    if (!providerSnapshot.empty) return providerSnapshot.docs[0];

    const orderNumberSnapshot = await db.collection("orders").where("orderNumber", "==", providerOrderId).limit(1).get();
    if (!orderNumberSnapshot.empty) return orderNumberSnapshot.docs[0];
  }

  return null;
};