import { getFirebaseAdminAuth, getFirebaseAdminDb, getFirebaseAdminMessaging, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { getWhatsAppConfigStatus, getWhatsAppEnvValue, sendWhatsAppTemplate, sanitizeWhatsAppNumber } from "../_lib/whatsapp.js";

type OrderAutomationEvent = "order-placed" | "order-status-updated" | "payment-status-updated";
type OrderStatus = "placed" | "confirmed" | "packed" | "shipped" | "out-for-delivery" | "delivered" | "cancelled" | "returned";
type PaymentStatus = "pending" | "paid" | "failed" | "refunded" | "cod-pending" | "cod-collected";

interface NotifyOrderBody {
  orderId?: string;
  event?: OrderAutomationEvent;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
}

interface OrderItemSnapshot {
  name?: string;
  quantity?: number;
}

interface OrderSnapshot {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerWhatsAppNumber?: string;
  customerCallNumber?: string;
  orderNumber?: string;
  totalInPaise?: number;
  items?: OrderItemSnapshot[];
  address?: { phone?: string };
  payment?: { method?: string };
}

const allowedEvents: OrderAutomationEvent[] = ["order-placed", "order-status-updated", "payment-status-updated"];

const templateLanguage = () => getWhatsAppEnvValue("WHATSAPP_TEMPLATE_LANGUAGE", getWhatsAppEnvValue("VITE_WHATSAPP_TEMPLATE_LANGUAGE", "en"));
const customerOrderPlacedTemplate = () => getWhatsAppEnvValue("WHATSAPP_ORDER_PLACED_CUSTOMER_TEMPLATE", getWhatsAppEnvValue("VITE_WHATSAPP_ORDER_PLACED_CUSTOMER_TEMPLATE", "order_confirmed"));
const adminOrderPlacedTemplate = () => getWhatsAppEnvValue("WHATSAPP_ORDER_PLACED_ADMIN_TEMPLATE", getWhatsAppEnvValue("VITE_WHATSAPP_ORDER_PLACED_ADMIN_TEMPLATE", "admin_order_alert"));

const customerStatusTemplates: Partial<Record<OrderStatus, string>> = {
  "out-for-delivery": "order_out_for_delivery",
  delivered: "order_delivered",
  cancelled: "order_cancelled",
};

const statusLabels: Record<OrderStatus, string> = {
  placed: "Placed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  "out-for-delivery": "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  "cod-pending": "COD Pending",
  "cod-collected": "COD Collected",
};

const getString = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const getRecord = (value: unknown): Record<string, unknown> => (
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {}
);

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown automation error.";
};

const summarizeSettledResult = (result: PromiseSettledResult<unknown>) => (
  result.status === "fulfilled"
    ? { status: "fulfilled", value: result.value }
    : { status: "rejected", reason: getErrorMessage(result.reason) }
);

const sanitizeForFirestore = (value: unknown): unknown => {
  if (value === undefined) return undefined;
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.map(sanitizeForFirestore).filter((item) => item !== undefined);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, sanitizeForFirestore(item)] as const)
        .filter(([, item]) => item !== undefined),
    );
  }
  return String(value);
};

const collectAutomationWarnings = (result: Record<string, unknown>) => Object.entries(result).flatMap(([channel, settledResult]) => {
  const settled = getRecord(settledResult);
  if (settled.status === "rejected") return [`${channel}: ${getString(settled.reason, "request rejected")}`];

  const value = getRecord(settled.value);
  const status = getString(value.status);
  const errorMessage = getString(value.errorMessage || value.reason);
  if ((status === "failed" || status === "manual-ready") && errorMessage) return [`${channel}: ${errorMessage}`];
  return [];
});

const notificationEventField = (event: OrderAutomationEvent) => event.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());

const safeResolve = async <T>(label: string, operation: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    console.error(label, error);
    return fallback;
  }
};

const firstName = (name?: string) => (name || "there").split(" ").filter(Boolean)[0] || "there";
const shortOrderRef = (orderId: string) => `#${orderId.slice(-6).toUpperCase()}`;
const rupeesFromPaise = (paise?: number) => String(Math.round(Number(paise || 0) / 100));

const itemsSummary = (items?: OrderItemSnapshot[]) => {
  const safeItems = (items || []).filter((item) => item?.name);
  if (safeItems.length === 0) return "your items";
  if (safeItems.length === 1) return getString(safeItems[0].name, "your item");
  if (safeItems.length === 2) return `${getString(safeItems[0].name)} & ${getString(safeItems[1].name)}`;
  return `${getString(safeItems[0].name)} + ${safeItems.length - 1} more`;
};

const createAbsoluteLink = (link: string) => {
  if (/^https?:\/\//i.test(link)) return link;
  const baseUrl = process.env.PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (!baseUrl) return link;
  const safePath = link.startsWith("/") ? link : `/${link}`;
  return `${baseUrl.replace(/\/$/, "")}${safePath}`;
};

const collectUserTokens = async (uid: string) => {
  const db = getFirebaseAdminDb();
  const [nestedSnapshot, topLevelSnapshot] = await Promise.all([
    db.collection(`users/${uid}/webPushTokens`).where("enabled", "==", true).get(),
    db.collection("userTokens").where("uid", "==", uid).get(),
  ]);

  const entries = [
    ...nestedSnapshot.docs.map((tokenDoc) => ({ token: getString(tokenDoc.data().token), ref: tokenDoc.ref })),
    ...topLevelSnapshot.docs
      .filter((tokenDoc) => tokenDoc.data().enabled !== false)
      .map((tokenDoc) => ({ token: getString(tokenDoc.data().token) || tokenDoc.id, ref: tokenDoc.ref })),
  ].filter((entry) => entry.token);

  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.token)) return false;
    seen.add(entry.token);
    return true;
  });
};

const collectAdminTokens = async () => {
  const adminUsers = await getFirebaseAdminDb().collection("users").where("role", "==", "admin").get();
  const tokenGroups = await Promise.all(adminUsers.docs.map((userDoc) => collectUserTokens(userDoc.id)));
  return tokenGroups.flat();
};

const getAdminWhatsAppNumber = async () => {
  const snapshot = await getFirebaseAdminDb().doc("siteSettings/contactInfo").get();
  const data = snapshot.exists ? snapshot.data() : null;
  return sanitizeWhatsAppNumber(getString(data?.orderNotificationPhone) || getString(data?.whatsappNumber));
};

const getCustomerWhatsAppNumber = async (order: OrderSnapshot) => {
  const orderWhatsAppNumber = sanitizeWhatsAppNumber(order.customerWhatsAppNumber || "");
  if (orderWhatsAppNumber) return orderWhatsAppNumber;

  if (order.customerId) {
    const customerSnapshot = await getFirebaseAdminDb().doc(`users/${order.customerId}`).get();
    const customerData = customerSnapshot.exists ? customerSnapshot.data() : null;
    const profileWhatsAppNumber = sanitizeWhatsAppNumber(getString(customerData?.whatsappNumber) || getString(customerData?.phone));
    if (profileWhatsAppNumber) return profileWhatsAppNumber;
  }

  return sanitizeWhatsAppNumber(order.customerPhone || order.address?.phone || "");
};

const sendWebPush = async ({
  tokens,
  title,
  body,
  link,
  data = {},
}: {
  tokens: Awaited<ReturnType<typeof collectUserTokens>>;
  title: string;
  body: string;
  link: string;
  data?: Record<string, string>;
}) => {
  if (tokens.length === 0) return { status: "skipped", successCount: 0, failureCount: 0, reason: "no_tokens" };

  const absoluteLink = createAbsoluteLink(link);
  const response = await getFirebaseAdminMessaging().sendEachForMulticast({
    tokens: tokens.map((entry) => entry.token),
    webpush: { fcmOptions: { link: absoluteLink } },
    data: {
      ...data,
      title,
      body,
      link: absoluteLink,
      url: absoluteLink,
    },
  });

  await Promise.all(response.responses.map((sendResult, index) => {
    const code = sendResult.error?.code || "";
    if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
      return tokens[index].ref.update({ enabled: false, updatedAt: FieldValue.serverTimestamp(), errorMessage: code });
    }
    return Promise.resolve();
  }));

  return {
    status: response.successCount > 0 ? "sent" : "failed",
    successCount: response.successCount,
    failureCount: response.failureCount,
  };
};

const sendOrderPlacedMessages = async (orderId: string, order: OrderSnapshot) => {
  const orderRef = shortOrderRef(orderId);
  const customerName = order.customerName || "Customer";
  const summary = itemsSummary(order.items);
  const total = rupeesFromPaise(order.totalInPaise);
  const paymentLabel = order.payment?.method === "cod" ? "Cash on Delivery (COD)" : "Paid Online";

  const [customerPhone, adminPhone] = await Promise.all([
    safeResolve("Unable to resolve customer WhatsApp number", () => getCustomerWhatsAppNumber(order), ""),
    safeResolve("Unable to resolve admin WhatsApp number", getAdminWhatsAppNumber, ""),
  ]);

  const [customerWhatsApp, adminWhatsApp, customerPush, adminPush] = await Promise.allSettled([
    customerPhone
      ? sendWhatsAppTemplate({
        to: customerPhone,
        templateName: customerOrderPlacedTemplate(),
        languageCode: templateLanguage(),
        params: [firstName(customerName), orderRef, summary, total, paymentLabel],
        urlSuffix: orderId,
      })
      : Promise.resolve({ status: "skipped", errorMessage: "Customer phone number is missing." }),
    adminPhone
      ? sendWhatsAppTemplate({
        to: adminPhone,
        templateName: adminOrderPlacedTemplate(),
        languageCode: templateLanguage(),
        params: [orderRef, summary, total, customerName],
        urlSuffix: orderId,
      })
      : Promise.resolve({ status: "skipped", errorMessage: "Admin WhatsApp number is missing." }),
    (async () => order.customerId
      ? sendWebPush({
        tokens: await collectUserTokens(order.customerId),
        title: "Order placed successfully",
        body: `Your order ${orderRef} has been placed.`,
        link: `/account/orders/${orderId}`,
        data: { orderId, type: "order-placed", audience: "customer" },
      })
      : { status: "skipped", reason: "missing_customer" })(),
    (async () => sendWebPush({
      tokens: await collectAdminTokens(),
      title: "New order received",
      body: `${orderRef} from ${customerName} for ₹${total}.`,
      link: "/admin/orders",
      data: { orderId, type: "order-placed", audience: "admin" },
    }))(),
  ]);

  return {
    customerWhatsApp: summarizeSettledResult(customerWhatsApp),
    adminWhatsApp: summarizeSettledResult(adminWhatsApp),
    customerPush: summarizeSettledResult(customerPush),
    adminPush: summarizeSettledResult(adminPush),
  };
};

const sendStatusMessages = async (orderId: string, order: OrderSnapshot, status?: OrderStatus) => {
  if (!status) return { status: "skipped", reason: "missing_status" };

  const orderRef = shortOrderRef(orderId);
  const customerName = order.customerName || "Customer";
  const statusLabel = statusLabels[status] || status;
  const summary = itemsSummary(order.items);
  const [customerPhone, adminPhone] = await Promise.all([
    safeResolve("Unable to resolve customer WhatsApp number", () => getCustomerWhatsAppNumber(order), ""),
    status === "delivered" ? safeResolve("Unable to resolve admin WhatsApp number", getAdminWhatsAppNumber, "") : Promise.resolve(""),
  ]);
  const templateName = customerStatusTemplates[status];

  const [customerWhatsApp, adminWhatsApp, customerPush, adminPush] = await Promise.allSettled([
    customerPhone && templateName
      ? sendWhatsAppTemplate({
        to: customerPhone,
        templateName,
        languageCode: templateLanguage(),
        params: [firstName(customerName), orderRef, summary],
        urlSuffix: orderId,
      })
      : Promise.resolve({ status: "skipped", errorMessage: "No WhatsApp template for this status." }),
    adminPhone && status === "delivered"
      ? sendWhatsAppTemplate({
        to: adminPhone,
        templateName: "admin_order_delivered",
        languageCode: templateLanguage(),
        params: [orderRef, customerName, summary],
        urlSuffix: orderId,
      })
      : Promise.resolve({ status: "skipped", errorMessage: "Admin WhatsApp only sent for delivered status." }),
    (async () => order.customerId
      ? sendWebPush({
        tokens: await collectUserTokens(order.customerId),
        title: `Order ${statusLabel}`,
        body: `${orderRef} is now ${statusLabel}.`,
        link: `/account/orders/${orderId}`,
        data: { orderId, type: "order-status-updated", status, audience: "customer" },
      })
      : { status: "skipped", reason: "missing_customer" })(),
    (async () => status === "delivered"
      ? sendWebPush({
        tokens: await collectAdminTokens(),
        title: "Order Delivered",
        body: `${orderRef} from ${customerName} has been delivered.`,
        link: "/admin/orders",
        data: { orderId, type: "order-status-updated", status, audience: "admin" },
      })
      : { status: "skipped", reason: "not_delivered" })(),
  ]);

  return {
    customerWhatsApp: summarizeSettledResult(customerWhatsApp),
    adminWhatsApp: summarizeSettledResult(adminWhatsApp),
    customerPush: summarizeSettledResult(customerPush),
    adminPush: summarizeSettledResult(adminPush),
  };
};

const sendPaymentMessages = async (orderId: string, order: OrderSnapshot, paymentStatus?: PaymentStatus) => {
  if (!paymentStatus) return { status: "skipped", reason: "missing_payment_status" };

  const orderRef = shortOrderRef(orderId);
  const statusLabel = paymentStatusLabels[paymentStatus] || paymentStatus;
  const customerName = order.customerName || "Customer";
  const summary = itemsSummary(order.items);
  const customerPhone = await safeResolve("Unable to resolve customer WhatsApp number", () => getCustomerWhatsAppNumber(order), "");

  const [customerWhatsApp, customerPush] = await Promise.allSettled([
    customerPhone && paymentStatus === "refunded"
      ? sendWhatsAppTemplate({
        to: customerPhone,
        templateName: "order_refunded",
        languageCode: templateLanguage(),
        params: [firstName(customerName), orderRef, summary],
        urlSuffix: orderId,
      })
      : Promise.resolve({ status: "skipped", errorMessage: "No WhatsApp template for this payment status." }),
    (async () => order.customerId
      ? sendWebPush({
        tokens: await collectUserTokens(order.customerId),
        title: `Payment ${statusLabel}`,
        body: `${orderRef} payment is marked as ${statusLabel}.`,
        link: `/account/orders/${orderId}`,
        data: { orderId, type: "payment-status-updated", paymentStatus, audience: "customer" },
      })
      : { status: "skipped", reason: "missing_customer" })(),
  ]);

  return {
    customerWhatsApp: summarizeSettledResult(customerWhatsApp),
    customerPush: summarizeSettledResult(customerPush),
  };
};

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requirePost(request, response)) return;

  const idToken = getBearerToken(request);
  if (!idToken) {
    sendError(response, 401, "Missing Authorization bearer token.");
    return;
  }

  try {
    const body = await readJsonBody<NotifyOrderBody>(request);
    const orderId = getString(body.orderId).trim();
    const event = allowedEvents.includes(body.event as OrderAutomationEvent) ? body.event as OrderAutomationEvent : null;
    if (!orderId || !event) {
      sendError(response, 400, "orderId and event are required.");
      return;
    }

    const decoded = await getFirebaseAdminAuth().verifyIdToken(idToken);
    const db = getFirebaseAdminDb();
    const [orderSnapshot, userSnapshot] = await Promise.all([
      db.doc(`orders/${orderId}`).get(),
      db.doc(`users/${decoded.uid}`).get(),
    ]);

    if (!orderSnapshot.exists) {
      sendError(response, 404, "Order was not found.");
      return;
    }

    const order = orderSnapshot.data() as OrderSnapshot;
    const isAdmin = userSnapshot.data()?.role === "admin";
    const isCustomer = order.customerId === decoded.uid;
    if (!isAdmin && !isCustomer) {
      sendError(response, 403, "You do not have permission to notify this order.");
      return;
    }

    const result = event === "order-placed"
      ? await sendOrderPlacedMessages(orderId, order)
      : event === "order-status-updated"
        ? await sendStatusMessages(orderId, order, body.status)
        : await sendPaymentMessages(orderId, order, body.paymentStatus);

    const warnings = collectAutomationWarnings(result);
    const notificationStatus = warnings.length > 0 ? "attention" : "sent";
    const whatsappConfig = getWhatsAppConfigStatus();

    if (warnings.length > 0) {
      console.warn("[notify] order automation warnings", { orderId, event, warnings, whatsappConfig });
    }

    await orderSnapshot.ref.update({
      [`notifications.${notificationEventField(event)}`]: sanitizeForFirestore({
        event,
        status: notificationStatus,
        warnings,
        whatsappConfig,
        result,
        recordedAt: new Date().toISOString(),
      }),
      "notifications.lastAutomationEvent": event,
      "notifications.lastAutomationStatus": notificationStatus,
      "notifications.lastAutomationWarnings": warnings,
      "notifications.lastAutomationAt": FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    sendJson(response, 200, { ok: true, event, orderId, result, warnings, whatsappConfig });
  } catch (error) {
    console.error("Unable to send order automations", error);
    sendError(response, 500, error instanceof Error ? error.message : "Unable to send order automations.");
  }
}