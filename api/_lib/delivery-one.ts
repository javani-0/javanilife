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

interface DelhiveryShipmentPayload {
  name: string;
  order: string;
  phone: string;
  add: string;
  pin: string;
  city: string;
  state: string;
  country: string;
  payment_mode: "COD" | "Prepaid";
  cod_amount: string;
  total_amount: string;
  products_desc: string;
  weight: string;
  shipment_length: string;
  shipment_width: string;
  shipment_height: string;
  shipping_mode: string;
  address_type: string;
  return_name: string;
  return_address: string;
  return_city: string;
  return_phone: string;
  return_state: string;
  return_country: string;
  return_pin: string;
  seller_name: string;
  seller_add: string;
  seller_inv: string;
  quantity: string;
  waybill: string;
  hsn_code: string;
  fragile_shipment: boolean;
  dangerous_good: boolean;
  plastic_packaging: boolean;
  order_date: null;
}

export interface DeliveryOneShipmentPayload {
  pickup_location: { name: string };
  shipments: DelhiveryShipmentPayload[];
}

export interface DeliveryOneProviderResult {
  providerOrderId?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  providerStatus?: string;
  rawResponse?: unknown;
}

export type DeliveryOneMappedOrderStatus = "placed" | "confirmed" | "packed" | "shipped" | "out-for-delivery" | "delivered" | "cancelled" | "returned";

export interface DeliveryOneTrackingUpdate extends DeliveryOneProviderResult {
  providerStatusType?: string;
  orderStatus?: DeliveryOneMappedOrderStatus;
  eventAt?: string;
}

interface DeliveryOneRequest {
  url: string;
  init: {
    method: "GET" | "POST";
    headers: Record<string, string>;
    body?: string;
  };
}

const PRODUCTION_BASE_URL = "https://track.delhivery.com";
const STAGING_BASE_URL = "https://staging-express.delhivery.com";
const DEFAULT_COUNTRY = "India";

const getEnvValue = (key: string) => process.env[key]?.trim() || "";
const getFirstEnvValue = (keys: string[]) => keys.map(getEnvValue).find(Boolean) || "";

const getString = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const getNumber = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const getRecord = (value: unknown): Record<string, unknown> => (
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {}
);
const getArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const pickString = (records: Record<string, unknown>[], keys: string[]) => {
  for (const record of records) {
    for (const key of keys) {
      const value = getString(record[key]);
      if (value) return value;
    }
  }
  return "";
};

const getDeliveryOneBaseUrl = () => {
  const configuredBaseUrl = getFirstEnvValue(["DELIVERY_ONE_BASE_URL", "DELHIVERY_BASE_URL"]);
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/$/, "");

  const environment = getFirstEnvValue(["DELIVERY_ONE_ENVIRONMENT", "DELHIVERY_ENVIRONMENT"]).toLowerCase();
  return ["staging", "stage", "test", "sandbox"].includes(environment) ? STAGING_BASE_URL : PRODUCTION_BASE_URL;
};

const getDeliveryOneApiToken = () => getFirstEnvValue([
  "DELIVERY_ONE_API_TOKEN",
  "DELIVERY_ONE_API_KEY",
  "DELHIVERY_API_TOKEN",
  "DELHIVERY_API_KEY",
]);

const getDeliveryOnePickupLocation = () => getFirstEnvValue([
  "DELIVERY_ONE_PICKUP_LOCATION",
  "DELHIVERY_PICKUP_LOCATION",
  "DELIVERY_ONE_WAREHOUSE_NAME",
  "DELHIVERY_WAREHOUSE_NAME",
]);

const getDeliveryOneCreateOrderUrl = () => getFirstEnvValue([
  "DELIVERY_ONE_CREATE_ORDER_URL",
  "DELHIVERY_CREATE_ORDER_URL",
  "DELIVERY_ONE_API_URL",
]) || `${getDeliveryOneBaseUrl()}/api/cmu/create.json`;

const getDeliveryOneEditOrderUrl = () => getFirstEnvValue([
  "DELIVERY_ONE_EDIT_ORDER_URL",
  "DELHIVERY_EDIT_ORDER_URL",
]) || `${getDeliveryOneBaseUrl()}/api/p/edit`;

const getDeliveryOneTrackingApiUrl = (waybill: string, orderReference = "") => {
  const configuredUrl = getFirstEnvValue(["DELIVERY_ONE_TRACKING_API_URL", "DELHIVERY_TRACKING_API_URL"])
    || `${getDeliveryOneBaseUrl()}/api/v1/packages/json/`;
  const url = new URL(configuredUrl);
  url.searchParams.set("waybill", waybill);
  url.searchParams.set("ref_ids", orderReference);
  return url.toString();
};

const getDeliveryOneServiceabilityUrl = (pincode: string) => {
  const configuredUrl = getFirstEnvValue(["DELIVERY_ONE_SERVICEABILITY_URL", "DELHIVERY_SERVICEABILITY_URL"])
    || `${getDeliveryOneBaseUrl()}/c/api/pin-codes/json/`;
  const url = new URL(configuredUrl);
  url.searchParams.set("filter_codes", pincode);
  return url.toString();
};

const getDeliveryOneTrackingUrl = (waybill: string) => {
  const template = getFirstEnvValue(["DELIVERY_ONE_TRACKING_URL_TEMPLATE", "DELHIVERY_TRACKING_URL_TEMPLATE"]);
  if (template) return template.replace("{waybill}", encodeURIComponent(waybill));
  return `https://www.delhivery.com/track/package/${encodeURIComponent(waybill)}`;
};

const sanitizeDelhiveryText = (value: unknown, fallback = "") => {
  const text = getString(value, fallback)
    .replace(/[&#%;\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || fallback;
};

const sanitizeDigits = (value: unknown) => getString(value).replace(/\D/g, "");

const sanitizePhone = (value: unknown) => {
  const digits = sanitizeDigits(value);
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const formatPaiseAsRupees = (paise: number) => {
  const rupees = Math.max(0, paise) / 100;
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
};

const joinAddress = (address: Record<string, unknown>) => [
  sanitizeDelhiveryText(address.line1),
  sanitizeDelhiveryText(address.line2),
  sanitizeDelhiveryText(address.landmark),
].filter(Boolean).join(", ");

const getItemDescription = (item: DeliveryOneOrderItemSnapshot) => {
  const quantity = Math.max(1, getNumber(item.quantity, 1));
  return `${sanitizeDelhiveryText(item.name, "Product")} x${quantity}`;
};

const getProductsDescription = (items: DeliveryOneOrderItemSnapshot[] = []) => (
  items.length ? items.map(getItemDescription).join(", ") : "Javani order"
);

const getTotalQuantity = (items: DeliveryOneOrderItemSnapshot[] = []) => (
  String(items.reduce((total, item) => total + Math.max(1, getNumber(item.quantity, 1)), 0) || 1)
);

const getShipmentWeight = (order: DeliveryOneOrderSnapshot) => {
  const orderWeight = getNumber(order.delivery?.shipmentWeightInGrams);
  if (orderWeight > 0) return orderWeight;

  const itemWeight = (order.items || []).reduce((total, item) => total + getNumber(item.shipmentWeightInGrams), 0);
  return itemWeight > 0 ? itemWeight : 500;
};

const getMaxDimension = (items: DeliveryOneOrderItemSnapshot[] = [], key: "lengthInCm" | "widthInCm" | "heightInCm") => {
  const max = items.reduce((currentMax, item) => Math.max(currentMax, getNumber(getRecord(item.delivery)[key])), 0);
  return max > 0 ? String(Math.ceil(max)) : "";
};

export const hasDeliveryOneApiConfig = () => Boolean(getDeliveryOneApiToken() && getDeliveryOnePickupLocation());

const requireDeliveryOneApiToken = () => {
  const token = getDeliveryOneApiToken();
  if (!token) {
    throw new Error("Delhivery API token is not configured. Set DELIVERY_ONE_API_TOKEN in Vercel environment variables.");
  }
  return token;
};

const requireDeliveryOneApiConfig = () => {
  const token = requireDeliveryOneApiToken();
  const pickupLocation = getDeliveryOnePickupLocation();

  if (!pickupLocation) {
    throw new Error("Delhivery credentials are not configured. Set DELIVERY_ONE_API_TOKEN and DELIVERY_ONE_PICKUP_LOCATION in Vercel environment variables.");
  }

  return { token, pickupLocation };
};

export const createDeliveryOneShipmentPayload = (orderDocumentId: string, order: DeliveryOneOrderSnapshot): DeliveryOneShipmentPayload => {
  const address = getRecord(order.address);
  const paymentMethod = getString(order.payment?.method, "cod");
  const isCod = paymentMethod === "cod";
  const totalInPaise = getNumber(order.totalInPaise);
  const pickupLocation = getDeliveryOnePickupLocation();
  const phone = sanitizePhone(address.phone) || sanitizePhone(order.customerPhone);

  return {
    pickup_location: { name: pickupLocation },
    shipments: [
      {
        name: sanitizeDelhiveryText(address.fullName, sanitizeDelhiveryText(order.customerName, "Customer")),
        order: sanitizeDelhiveryText(order.orderNumber, orderDocumentId),
        phone,
        add: joinAddress(address),
        pin: sanitizeDigits(address.pincode),
        city: sanitizeDelhiveryText(address.city),
        state: sanitizeDelhiveryText(address.state),
        country: sanitizeDelhiveryText(address.country, DEFAULT_COUNTRY),
        payment_mode: isCod ? "COD" : "Prepaid",
        cod_amount: isCod ? formatPaiseAsRupees(totalInPaise) : "0",
        total_amount: formatPaiseAsRupees(totalInPaise),
        products_desc: getProductsDescription(order.items),
        weight: String(Math.ceil(getShipmentWeight(order))),
        shipment_length: getMaxDimension(order.items, "lengthInCm"),
        shipment_width: getMaxDimension(order.items, "widthInCm"),
        shipment_height: getMaxDimension(order.items, "heightInCm"),
        shipping_mode: getFirstEnvValue(["DELIVERY_ONE_SHIPPING_MODE", "DELHIVERY_SHIPPING_MODE"]) || "Surface",
        address_type: getFirstEnvValue(["DELIVERY_ONE_ADDRESS_TYPE", "DELHIVERY_ADDRESS_TYPE"]),

        return_city: getFirstEnvValue(["DELIVERY_ONE_RETURN_CITY", "DELHIVERY_RETURN_CITY"]),
        return_phone: sanitizePhone(getFirstEnvValue(["DELIVERY_ONE_RETURN_PHONE", "DELHIVERY_RETURN_PHONE"])),
        return_state: getFirstEnvValue(["DELIVERY_ONE_RETURN_STATE", "DELHIVERY_RETURN_STATE"]),
        return_country: getFirstEnvValue(["DELIVERY_ONE_RETURN_COUNTRY", "DELHIVERY_RETURN_COUNTRY"]) || DEFAULT_COUNTRY,
        return_pin: sanitizeDigits(getFirstEnvValue(["DELIVERY_ONE_RETURN_PIN", "DELHIVERY_RETURN_PIN"])),
        seller_name: sanitizeDelhiveryText(getFirstEnvValue(["DELIVERY_ONE_SELLER_NAME", "DELHIVERY_SELLER_NAME"])),
        seller_add: sanitizeDelhiveryText(getFirstEnvValue(["DELIVERY_ONE_SELLER_ADDRESS", "DELHIVERY_SELLER_ADDRESS"])),
        return_name: sanitizeDelhiveryText(getFirstEnvValue(["DELIVERY_ONE_RETURN_NAME", "DELHIVERY_RETURN_NAME", "DELIVERY_ONE_SELLER_NAME", "DELHIVERY_SELLER_NAME"])),
        return_address: sanitizeDelhiveryText(getFirstEnvValue(["DELIVERY_ONE_RETURN_ADDRESS", "DELHIVERY_RETURN_ADDRESS"])),
        seller_inv: sanitizeDelhiveryText(order.orderNumber, orderDocumentId),
        quantity: getTotalQuantity(order.items),
        waybill: "",
        hsn_code: getFirstEnvValue(["DELIVERY_ONE_HSN_CODE", "DELHIVERY_HSN_CODE"]),
        fragile_shipment: getFirstEnvValue(["DELIVERY_ONE_FRAGILE_SHIPMENT", "DELHIVERY_FRAGILE_SHIPMENT"]).toLowerCase() === "true",
        dangerous_good: false,
        plastic_packaging: false,
        order_date: null,
      },
    ],
  };
};

export const assertDeliveryOneEligible = (order: DeliveryOneOrderSnapshot) => {
  if (["delivered", "cancelled", "returned"].includes(getString(order.status))) {
    throw new Error("Completed, cancelled, or returned orders are not eligible for Delivery One sync.");
  }
  if (!order.items?.length) throw new Error("Order item snapshots are required for Delivery One sync.");
  if (!getString(order.address?.line1) || !sanitizeDigits(order.address?.pincode) || !(sanitizePhone(order.address?.phone) || sanitizePhone(order.customerPhone))) {
    throw new Error("Delivery address, pincode, and phone are required for Delivery One sync.");
  }
  if (order.payment?.method === "razorpay" && order.payment.status !== "paid") {
    throw new Error("Razorpay orders must be paid before Delivery One sync.");
  }
};

export const createDeliveryOneCreateShipmentRequest = (payload: DeliveryOneShipmentPayload): DeliveryOneRequest => {
  const { token } = requireDeliveryOneApiConfig();
  const body = new URLSearchParams({
    format: "json",
    data: JSON.stringify(payload),
  }).toString();

  return {
    url: getDeliveryOneCreateOrderUrl(),
    init: {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Token ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  };
};

export const createDeliveryOneCancelShipmentRequest = (waybill: string): DeliveryOneRequest => {
  const token = requireDeliveryOneApiToken();
  const cleanWaybill = sanitizeDigits(waybill);
  if (!cleanWaybill) throw new Error("A Delivery One tracking number is required to cancel a shipment.");

  return {
    url: getDeliveryOneEditOrderUrl(),
    init: {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ waybill: cleanWaybill, cancellation: "true" }),
    },
  };
};

export const createDeliveryOneTrackingRequest = (waybill: string, orderReference = ""): DeliveryOneRequest => {
  const token = requireDeliveryOneApiToken();
  const cleanWaybill = sanitizeDigits(waybill);
  if (!cleanWaybill) throw new Error("A Delivery One tracking number is required to refresh shipment status.");

  return {
    url: getDeliveryOneTrackingApiUrl(cleanWaybill, orderReference),
    init: {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
      },
    },
  };
};

export const isDeliveryOnePincodeServiceable = (data: unknown) => {
  const root = getRecord(data);
  const deliveryCodes = getArray(root.delivery_codes).length
    ? getArray(root.delivery_codes)
    : getArray(getRecord(root.data).delivery_codes);

  if (!deliveryCodes.length) return false;

  return deliveryCodes.some((entry) => {
    const entryRecord = getRecord(entry);
    const postalCode = getRecord(entryRecord.postal_code);
    const candidate = Object.keys(postalCode).length ? postalCode : entryRecord;
    const remark = (getString(candidate.remark) || getString(candidate.remarks)).trim().toLowerCase();
    return remark !== "embargo";
  });
};

const getDeliveryOneErrorMessage = (data: unknown) => {
  const root = getRecord(data);
  const packages = getArray(root.packages).map(getRecord);
  const firstPackage = packages[0] || {};

  const message = pickString([firstPackage, root, getRecord(root.data), getRecord(root.error)], [
    "error_message",
    "remarks",
    "remark",
    "rmk",
    "message",
    "error",
    "status",
  ]);

  // Delhivery sometimes returns only a bare "Fail"/"Failed" status with no
  // further detail. Replace it with a more actionable message.
  const lc = message.toLowerCase();
  if (lc === "fail" || lc === "failed") {
    return "Delhivery rejected the request — verify the pickup location name, address fields, and API token.";
  }

  return message;
};

const checkDeliveryOnePincodeServiceability = async (pincode: string) => {
  const { token } = requireDeliveryOneApiConfig();
  const response = await fetch(getDeliveryOneServiceabilityUrl(pincode), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Token ${token}`,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(getDeliveryOneErrorMessage(data) || "Unable to check Delhivery pincode serviceability.");
  }

  if (!isDeliveryOnePincodeServiceable(data)) {
    throw new Error(`Pincode ${pincode} is not serviceable by Delhivery right now.`);
  }
};

export const extractDeliveryOneProviderResult = (data: unknown): DeliveryOneProviderResult => {
  const root = getRecord(data);
  const packages = getArray(root.packages).map(getRecord);
  const firstPackage = packages[0] || {};
  const nestedRecords = [
    firstPackage,
    root,
    getRecord(root.data),
    getRecord(root.order),
    getRecord(root.shipment),
    getRecord(getRecord(root.data).order),
    getRecord(getRecord(root.data).shipment),
  ];
  const trackingNumber = pickString(nestedRecords, ["waybill", "waybill_number", "awb", "awbNumber", "trackingNumber", "trackingId"]);
  const providerOrderId = pickString(nestedRecords, ["refnum", "order", "orderId", "providerOrderId", "id", "shipmentId"]) || trackingNumber;

  return {
    providerOrderId,
    trackingNumber,
    trackingUrl: pickString(nestedRecords, ["trackingUrl", "trackingLink", "tracking_url"]) || (trackingNumber ? getDeliveryOneTrackingUrl(trackingNumber) : ""),
    providerStatus: pickString(nestedRecords, ["status", "providerStatus", "shipmentStatus"]),
    rawResponse: data,
  };
};

export const mapDeliveryOneStatusToOrderStatus = (status: unknown, statusType?: unknown): DeliveryOneMappedOrderStatus | undefined => {
  const cleanStatus = getString(status).trim().toLowerCase();
  const cleanStatusType = getString(statusType).trim().toUpperCase();

  if (cleanStatusType === "CN" || ["canceled", "cancelled", "closed"].includes(cleanStatus)) return "cancelled";
  if (cleanStatusType === "DL" && ["rto", "dto"].includes(cleanStatus)) return "returned";
  if (cleanStatus === "rto" || cleanStatus === "dto" || cleanStatus.includes("return")) return "returned";
  if (cleanStatusType === "DL" || cleanStatus === "delivered") return "delivered";
  if (cleanStatus === "dispatched" || cleanStatus.includes("out for delivery")) return "out-for-delivery";
  if (cleanStatus === "in transit" || cleanStatus === "pending") return "shipped";
  if (cleanStatus === "manifested" || cleanStatus === "not picked") return "packed";

  return undefined;
};

const getFirstRecord = (records: unknown[]) => records.map(getRecord).find((record) => Object.keys(record).length > 0) || {};

const getShipmentRecordFromTrackingData = (data: unknown) => {
  const root = getRecord(data);
  const shipmentData = getArray(root.ShipmentData).length ? getArray(root.ShipmentData) : getArray(root.shipmentData);
  const firstShipmentData = getFirstRecord(shipmentData);
  return getRecord(firstShipmentData.Shipment || firstShipmentData.shipment || firstShipmentData);
};

const getStatusRecordFromShipment = (shipment: Record<string, unknown>) => {
  const status = getRecord(shipment.Status || shipment.status);
  if (Object.keys(status).length) return status;

  const scans = getArray(shipment.Scans || shipment.scans).map(getRecord);
  const firstScan = scans[0] || {};
  return getRecord(firstScan.ScanDetail || firstScan.scanDetail || firstScan);
};

export const extractDeliveryOneTrackingUpdate = (data: unknown): DeliveryOneTrackingUpdate => {
  const root = getRecord(data);
  const shipment = getShipmentRecordFromTrackingData(data);
  const statusRecord = getStatusRecordFromShipment(shipment);
  const records = [statusRecord, shipment, root, getRecord(root.data), getRecord(root.shipment)];
  const trackingNumber = pickString(records, ["AWB", "awb", "waybill", "wbn", "trackingNumber", "tracking_number"]);
  const providerOrderId = pickString(records, ["ReferenceNo", "reference_no", "refnum", "order", "orderId", "order_id", "providerOrderId"]);
  const providerStatus = pickString(records, ["Status", "status", "Scan", "scan", "shipment_status", "providerStatus"]);
  const providerStatusType = pickString(records, ["StatusType", "status_type", "statusType"]);
  const eventAt = pickString(records, ["StatusDateTime", "status_date_time", "ScanDateTime", "scan_date_time", "event_time", "eventAt"]);

  return {
    providerOrderId,
    trackingNumber,
    trackingUrl: trackingNumber ? getDeliveryOneTrackingUrl(trackingNumber) : "",
    providerStatus,
    providerStatusType,
    orderStatus: mapDeliveryOneStatusToOrderStatus(providerStatus, providerStatusType),
    eventAt,
    rawResponse: data,
  };
};

export const extractDeliveryOneWebhookUpdate = (data: unknown): DeliveryOneTrackingUpdate => {
  const trackingUpdate = extractDeliveryOneTrackingUpdate(data);
  if (trackingUpdate.trackingNumber || trackingUpdate.providerStatus) return trackingUpdate;

  const root = getRecord(data);
  const nested = getRecord(root.data || root.payload || root.shipment || root.Shipment);
  const records = [root, nested];
  const trackingNumber = pickString(records, ["waybill", "wbn", "awb", "AWB", "trackingNumber", "tracking_number"]);
  const providerOrderId = pickString(records, ["order", "order_id", "orderId", "refnum", "ReferenceNo", "reference_no"]);
  const providerStatus = pickString(records, ["status", "Status", "scan", "Scan", "shipment_status", "providerStatus"]);
  const providerStatusType = pickString(records, ["status_type", "StatusType", "statusType"]);
  const eventAt = pickString(records, ["event_time", "eventAt", "StatusDateTime", "status_date_time", "ScanDateTime", "scan_date_time"]);

  return {
    providerOrderId,
    trackingNumber,
    trackingUrl: trackingNumber ? getDeliveryOneTrackingUrl(trackingNumber) : "",
    providerStatus,
    providerStatusType,
    orderStatus: mapDeliveryOneStatusToOrderStatus(providerStatus, providerStatusType),
    eventAt,
    rawResponse: data,
  };
};

const isDeliveryOneCreateResponseFailed = (data: unknown) => {
  const root = getRecord(data);
  const packages = getArray(root.packages).map(getRecord);
  const success = root.success;
  const packageStatus = getString(packages[0]?.status).toLowerCase();

  return success === false || packageStatus === "fail" || packageStatus === "failed" || packageStatus.includes("error");
};

export const pushDeliveryOneOrder = async (payload: DeliveryOneShipmentPayload): Promise<DeliveryOneProviderResult> => {
  const pincode = payload.shipments[0]?.pin || "";
  if (!pincode) throw new Error("Delivery pincode is required for Delhivery sync.");

  await checkDeliveryOnePincodeServiceability(pincode);

  const request = createDeliveryOneCreateShipmentRequest(payload);
  const response = await fetch(request.url, request.init);
  const data = await response.json().catch(() => ({}));

  if (!response.ok || isDeliveryOneCreateResponseFailed(data)) {
    const rawBody = JSON.stringify(data);
    console.error("[Delhivery] shipment creation failed. HTTP status:", response.status, "Response body:", rawBody);
    const reason = getDeliveryOneErrorMessage(data);
    const snippet = rawBody.length > 400 ? rawBody.slice(0, 400) + "\u2026" : rawBody;
    throw new Error(`${reason || "Delhivery shipment creation failed"} | Raw: ${snippet}`);
  }

  const result = extractDeliveryOneProviderResult(data);
  if (!result.trackingNumber) {
    throw new Error(getDeliveryOneErrorMessage(data) || "Delhivery did not return a waybill for this shipment.");
  }

  return result;
};

const isDeliveryOneOperationFailed = (data: unknown) => {
  const root = getRecord(data);
  const success = root.success;
  const status = getString(root.status).toLowerCase();
  const message = getDeliveryOneErrorMessage(data).toLowerCase();

  return success === false || status === "fail" || status === "failed" || message.includes("error") || message.includes("invalid");
};

export const cancelDeliveryOneShipment = async (waybill: string): Promise<DeliveryOneTrackingUpdate> => {
  const request = createDeliveryOneCancelShipmentRequest(waybill);
  const response = await fetch(request.url, request.init);
  const data = await response.json().catch(() => ({}));

  if (!response.ok || isDeliveryOneOperationFailed(data)) {
    throw new Error(getDeliveryOneErrorMessage(data) || "Delhivery shipment cancellation failed.");
  }

  const update = extractDeliveryOneWebhookUpdate(data);

  return {
    ...update,
    trackingNumber: update.trackingNumber || sanitizeDigits(waybill),
    orderStatus: update.orderStatus || "cancelled",
    providerStatus: update.providerStatus || "Cancellation requested",
    rawResponse: data,
  };
};

export const trackDeliveryOneShipment = async (waybill: string, orderReference = ""): Promise<DeliveryOneTrackingUpdate> => {
  const request = createDeliveryOneTrackingRequest(waybill, orderReference);
  const response = await fetch(request.url, request.init);
  const data = await response.json().catch(() => ({}));

  if (!response.ok || isDeliveryOneOperationFailed(data)) {
    throw new Error(getDeliveryOneErrorMessage(data) || "Unable to refresh Delhivery tracking status.");
  }

  const update = extractDeliveryOneTrackingUpdate(data);
  if (!update.trackingNumber && !update.providerStatus) {
    throw new Error(getDeliveryOneErrorMessage(data) || "Delhivery did not return tracking details for this shipment.");
  }

  return update;
};
