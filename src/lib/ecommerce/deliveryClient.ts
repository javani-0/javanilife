import type { DeliverySyncStatus } from "./types";

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