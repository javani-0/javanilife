interface DeliveryOneOrderItemSnapshot {
  productId?: string;
  name?: string;
  quantity?: number;
  shipmentWeightInGrams?: number;
  delivery?: Record<string, unknown>;
}

interface DeliveryOneOrderSnapshot {
  orderNumber?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  address?: Record<string, unknown>;
  payment?: { method?: string; status?: string };
  delivery?: {
    chargeInPaise?: number;
    shipmentWeightInGrams?: number;
    usesFallbackWeight?: boolean;
  };
  items?: DeliveryOneOrderItemSnapshot[];
  status?: string;
  totalInPaise?: number;
}

export interface DeliveryOneProviderResult {
  providerOrderId?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  providerStatus?: string;
  rawResponse?: unknown;
}

const getEnvValue = (key: string) => process.env[key]?.trim() || "";

const getString = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const getNumber = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const getBoolean = (value: unknown, fallback = false) => typeof value === "boolean" ? value : fallback;
const getRecord = (value: unknown): Record<string, unknown> => (
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {}
);

const pickString = (records: Record<string, unknown>[], keys: string[]) => {
  for (const record of records) {
    for (const key of keys) {
      const value = getString(record[key]);
      if (value) return value;
    }
  }
  return "";
};

export const hasDeliveryOneApiConfig = () => Boolean(
  getEnvValue("DELIVERY_ONE_CREATE_ORDER_URL") || getEnvValue("DELIVERY_ONE_API_URL")
);

export const createDeliveryOneShipmentPayload = (orderDocumentId: string, order: DeliveryOneOrderSnapshot) => ({
  provider: "delivery-one" as const,
  mode: "manual-ready" as const,
  orderDocumentId,
  orderNumber: getString(order.orderNumber, orderDocumentId),
  customer: {
    name: getString(order.customerName, "Customer"),
    phone: getString(order.customerPhone, getString(order.address?.phone)),
    email: getString(order.customerEmail) || undefined,
  },
  destination: getRecord(order.address),
  payment: {
    method: getString(order.payment?.method, "cod"),
    status: getString(order.payment?.status, "pending"),
    codAmountInPaise: order.payment?.method === "cod" ? getNumber(order.totalInPaise) : 0,
  },
  package: {
    weightInGrams: getNumber(order.delivery?.shipmentWeightInGrams),
    usesFallbackWeight: getBoolean(order.delivery?.usesFallbackWeight),
    deliveryChargeInPaise: getNumber(order.delivery?.chargeInPaise),
  },
  items: (order.items || []).map((item) => ({
    productId: getString(item.productId),
    name: getString(item.name),
    quantity: getNumber(item.quantity, 1),
    shipmentWeightInGrams: getNumber(item.shipmentWeightInGrams),
    delivery: getRecord(item.delivery),
  })),
});

export const assertDeliveryOneEligible = (order: DeliveryOneOrderSnapshot) => {
  if (["delivered", "cancelled", "returned"].includes(getString(order.status))) {
    throw new Error("Completed, cancelled, or returned orders are not eligible for Delivery One sync.");
  }
  if (!order.items?.length) throw new Error("Order item snapshots are required for Delivery One sync.");
  if (!getString(order.address?.line1) || !getString(order.address?.pincode) || !(getString(order.address?.phone) || getString(order.customerPhone))) {
    throw new Error("Delivery address and phone are required for Delivery One sync.");
  }
  if (order.payment?.method === "razorpay" && order.payment.status !== "paid") {
    throw new Error("Razorpay orders must be paid before Delivery One sync.");
  }
};

export const pushDeliveryOneOrder = async (payload: unknown): Promise<DeliveryOneProviderResult> => {
  const endpoint = getEnvValue("DELIVERY_ONE_CREATE_ORDER_URL") || getEnvValue("DELIVERY_ONE_API_URL");
  if (!endpoint) throw new Error("Delivery One API URL is not configured.");

  const token = getEnvValue("DELIVERY_ONE_API_TOKEN") || getEnvValue("DELIVERY_ONE_API_KEY");
  const authHeaderName = getEnvValue("DELIVERY_ONE_AUTH_HEADER") || "Authorization";
  const authHeaderValue = getEnvValue("DELIVERY_ONE_AUTH_HEADER_VALUE") || (token ? `Bearer ${token}` : "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authHeaderValue) headers[authHeaderName] = authHeaderValue;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = getString(getRecord(data).message) || getString(getRecord(data).error) || "Delivery One API request failed.";
    throw new Error(message);
  }

  const root = getRecord(data);
  const nestedRecords = [
    root,
    getRecord(root.data),
    getRecord(root.order),
    getRecord(root.shipment),
    getRecord(getRecord(root.data).order),
    getRecord(getRecord(root.data).shipment),
  ];

  return {
    providerOrderId: pickString(nestedRecords, ["providerOrderId", "orderId", "id", "awb", "awbNumber", "shipmentId"]),
    trackingNumber: pickString(nestedRecords, ["trackingNumber", "trackingId", "awb", "awbNumber", "waybill"]),
    trackingUrl: pickString(nestedRecords, ["trackingUrl", "trackingLink", "tracking_url"]),
    providerStatus: pickString(nestedRecords, ["providerStatus", "status", "shipmentStatus"]),
    rawResponse: data,
  };
};