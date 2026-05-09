import type { OrderStatus, PaymentStatus } from "./types";

export type OrderAutomationEvent = "order-placed" | "order-status-updated" | "payment-status-updated";

export interface OrderAutomationRequest {
  orderId: string;
  event: OrderAutomationEvent;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
}

export interface OrderAutomationResponse {
  ok: boolean;
  event: OrderAutomationEvent;
  orderId: string;
  result: unknown;
  warnings?: string[];
  whatsappConfig?: {
    hasToken: boolean;
    hasPhoneId: boolean;
    graphApiVersion: string;
  };
}

const postAutomationJson = async <T>(url: string, idToken: string, payload: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : "Notification request failed.";
    throw new Error(message);
  }

  return data as T;
};

export const sendOrderAutomation = (idToken: string, payload: OrderAutomationRequest) => (
  postAutomationJson<OrderAutomationResponse>("/api/orders/notify", idToken, payload)
);