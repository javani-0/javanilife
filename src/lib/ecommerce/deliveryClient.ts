import type { DeliverySyncStatus, OrderCancellationStatus, OrderStatus } from "./types";

export interface DeliveryOneSyncResponse {
  ok: boolean;
  orderId: string;
  syncStatus: DeliverySyncStatus;
  mode: "manual-ready" | "api-sync";
  providerOrderId?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  providerStatus?: string;
  message?: string;
  payload?: unknown;
}

export const syncDeliveryOneOrder = async (idToken: string, orderId: string): Promise<DeliveryOneSyncResponse> => {
  const response = await fetch("/api/orders/sync-delivery", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orderId }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : "Delivery One sync failed.";
    throw new Error(message);
  }

  return data as DeliveryOneSyncResponse;
};

export interface OrderCancellationResponse {
  ok: boolean;
  orderId: string;
  cancellationStatus: OrderCancellationStatus;
  providerCancelled?: boolean;
  providerStatus?: string;
  message?: string;
}

export interface DeliveryOneTrackingResponse {
  ok: boolean;
  orderId: string;
  trackingNumber?: string;
  providerStatus?: string;
  providerStatusType?: string;
  orderStatus?: OrderStatus;
  message?: string;
}

const postOrderDeliveryAction = async <ResponseBody>(idToken: string, url: string, body: Record<string, unknown>, fallbackError: string): Promise<ResponseBody> => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : fallbackError;
    throw new Error(message);
  }

  return data as ResponseBody;
};

export const requestOrderCancellation = (idToken: string, orderId: string, reason: string): Promise<OrderCancellationResponse> => (
  postOrderDeliveryAction(idToken, "/api/orders/request-cancel", { orderId, reason }, "Unable to request order cancellation.")
);

export const approveOrderCancellation = (idToken: string, orderId: string, adminNote?: string): Promise<OrderCancellationResponse> => (
  postOrderDeliveryAction(idToken, "/api/orders/approve-cancel", { orderId, adminNote }, "Unable to approve order cancellation.")
);

export const rejectOrderCancellation = (idToken: string, orderId: string, adminNote?: string): Promise<OrderCancellationResponse> => (
  postOrderDeliveryAction(idToken, "/api/orders/reject-cancel", { orderId, adminNote }, "Unable to reject order cancellation.")
);

export const refreshDeliveryOneTracking = (idToken: string, orderId: string): Promise<DeliveryOneTrackingResponse> => (
  postOrderDeliveryAction(idToken, "/api/orders/track-delivery", { orderId }, "Unable to refresh Delivery One tracking.")
);

export interface DeliveryOneLabelResponse {
  ok: boolean;
  orderId: string;
  labelUrl: string;
  waybill: string;
}

export interface DeliveryOnePickupResponse {
  ok: boolean;
  orderId: string;
  pickupId?: string;
  pickupDate?: string;
  message?: string;
}

/** Fetches the packing-slip S3 URL from Delhivery and opens the PDF in a new browser tab. */
export const printDeliveryOneLabel = async (idToken: string, orderId: string): Promise<void> => {
  const data = await postOrderDeliveryAction<DeliveryOneLabelResponse>(
    idToken,
    "/api/orders/sync-delivery",
    { orderId, action: "label" },
    "Unable to fetch Delivery One label.",
  );
  window.open(data.labelUrl, "_blank", "noopener");
};

export const scheduleDeliveryOnePickup = (idToken: string, orderId: string): Promise<DeliveryOnePickupResponse> => (
  postOrderDeliveryAction(idToken, "/api/orders/sync-delivery", { orderId, action: "pickup" }, "Unable to schedule Delivery One pickup.")
);