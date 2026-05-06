import { formatPaiseAsRupees } from "./pricing";
import { ORDER_STATUS_LABELS } from "./orders";
import type {
  NotificationAudience,
  NotificationChannel,
  NotificationEventType,
  NotificationLog,
  NotificationStatus,
  Order,
  OrderStatus,
  PaymentStatus,
  UserRole,
} from "./types";

export type NotificationPayload = Omit<NotificationLog, "id" | "createdAt" | "updatedAt">;

const paymentStatusLabels: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  "cod-pending": "COD Pending",
  "cod-collected": "COD Collected",
};

const getString = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const getStringArray = (value: unknown) => Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];

const getPublicEnvValue = (key: string) => {
  const value = import.meta.env[key];
  return typeof value === "string" ? value.trim() : "";
};

const whatsappTemplateLanguage = getPublicEnvValue("VITE_WHATSAPP_TEMPLATE_LANGUAGE") || "en";
const whatsappOrderPlacedCustomerTemplate = getPublicEnvValue("VITE_WHATSAPP_ORDER_PLACED_CUSTOMER_TEMPLATE");
const whatsappOrderPlacedAdminTemplate = getPublicEnvValue("VITE_WHATSAPP_ORDER_PLACED_ADMIN_TEMPLATE");

// Per-status customer WhatsApp templates.
// All take: {{1}}firstName {{2}}orderId {{3}}itemsSummary + a URL button suffix (orderId).
const ORDER_STATUS_TEMPLATES: Partial<Record<OrderStatus, string>> = {
  outForDelivery: "order_out_for_delivery",
  delivered: "order_delivered",
  cancelled: "order_cancelled",
  refunded: "order_refunded",
};

const notificationChannels: NotificationChannel[] = ["whatsapp", "web-push"];
const notificationEvents: NotificationEventType[] = ["order-placed", "order-status-updated", "payment-status-updated"];
const notificationStatuses: NotificationStatus[] = ["manual-ready", "pending", "sent", "failed", "skipped"];

export const sanitizeWhatsAppNumber = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
};

export const createWhatsAppUrl = (phone: string, message: string) => {
  const number = sanitizeWhatsAppNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : "";
};

const getOrderLabel = (order: Pick<Order, "id" | "orderNumber">) => order.orderNumber || order.id;
const firstName = (name?: string) => (name || "there").split(" ").filter(Boolean)[0] || "there";

const getItemsSummary = (order: Pick<Order, "items">) => {
  const summary = (order.items || [])
    .map((item) => `${item.name} x${item.quantity}`)
    .join(", ");

  return summary ? summary.slice(0, 180) : "your items";
};

const createTemplateFields = (templateName: string, params: string[], urlSuffix?: string) => (
  templateName
    ? {
      whatsappTemplateName: templateName,
      whatsappTemplateLanguage,
      whatsappTemplateParams: params,
      ...(urlSuffix ? { whatsappTemplateUrlSuffix: urlSuffix } : {}),
    }
    : {}
);

const getPaymentLabel = (order: Pick<Order, "payment">) => {
  if (order.payment?.method === "razorpay") return "Razorpay Online";
  return "Cash on Delivery";
};

const createBasePayload = ({
  order,
  eventType,
  audience,
  title,
  message,
  whatsappNumber,
  channel = "whatsapp",
  recipientRole,
  webTitle,
  webBody,
  webLink,
  whatsappTemplateName,
  whatsappTemplateLanguage,
  whatsappTemplateParams,
  whatsappTemplateUrlSuffix,
  status = "manual-ready",
}: {
  order: Order;
  eventType: NotificationEventType;
  audience: NotificationAudience;
  title: string;
  message: string;
  whatsappNumber: string;
  channel?: NotificationChannel;
  recipientRole?: UserRole;
  webTitle?: string;
  webBody?: string;
  webLink?: string;
  whatsappTemplateName?: string;
  whatsappTemplateLanguage?: string;
  whatsappTemplateParams?: string[];
  whatsappTemplateUrlSuffix?: string;
  status?: NotificationStatus;
}): NotificationPayload => {
  const safeWhatsAppNumber = sanitizeWhatsAppNumber(whatsappNumber);

  return {
    channel,
    audience,
    eventType,
    status,
    title,
    message,
    whatsappNumber: safeWhatsAppNumber,
    whatsappUrl: createWhatsAppUrl(safeWhatsAppNumber, message),
    whatsappTemplateName,
    whatsappTemplateLanguage,
    whatsappTemplateParams,
    whatsappTemplateUrlSuffix,
    webTitle,
    webBody,
    webLink,
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    ...(audience === "customer" ? { recipientUserId: order.customerId } : {}),
    ...(recipientRole ? { recipientRole } : {}),
    customerName: order.customerName,
    customerPhone: order.customerPhone,
  };
};

const createWebPushPayload = ({
  order,
  eventType,
  audience,
  title,
  body,
  recipientRole,
}: {
  order: Order;
  eventType: NotificationEventType;
  audience: NotificationAudience;
  title: string;
  body: string;
  recipientRole?: UserRole;
}): NotificationPayload => createBasePayload({
  order,
  channel: "web-push",
  eventType,
  audience,
  title,
  message: body,
  whatsappNumber: "",
  recipientRole,
  webTitle: title,
  webBody: body,
  webLink: audience === "admin" ? "/admin/orders" : order.id ? `/account/orders/${order.id}` : "/account/orders",
  status: "pending",
});

export const createOrderPlacedNotificationPayloads = (order: Order, adminWhatsAppNumber: string): NotificationPayload[] => {
  const orderLabel = getOrderLabel(order);
  const total = formatPaiseAsRupees(order.totalInPaise || 0);
  const payment = getPaymentLabel(order);
  const itemsSummary = getItemsSummary(order);
  const customerMessage = [
    `Namaste ${order.customerName}, your Javani Spiritual Hub order ${orderLabel} has been placed.`,
    `Total: ${total}`,
    `Payment: ${payment}`,
    "We will keep you updated as your order moves ahead.",
  ].join("\n");
  const adminMessage = [
    `New Javani order ${orderLabel}`,
    `Customer: ${order.customerName}`,
    `Phone: ${order.customerPhone}`,
    `Total: ${total}`,
    `Payment: ${payment}`,
  ].join("\n");

  return [
    createBasePayload({
      order,
      eventType: "order-placed",
      audience: "customer",
      title: "Order placed",
      message: customerMessage,
      whatsappNumber: order.customerPhone,
      ...createTemplateFields(whatsappOrderPlacedCustomerTemplate, [firstName(order.customerName), orderLabel, itemsSummary, total], order.id),
    }),
    createWebPushPayload({
      order,
      eventType: "order-placed",
      audience: "customer",
      title: "Order placed",
      body: `${orderLabel} has been placed. Total: ${total}.`,
    }),
    createBasePayload({
      order,
      eventType: "order-placed",
      audience: "admin",
      title: "New order received",
      message: adminMessage,
      whatsappNumber: adminWhatsAppNumber,
      ...createTemplateFields(whatsappOrderPlacedAdminTemplate, [orderLabel, itemsSummary, total, order.customerName], order.id),
    }),
    createWebPushPayload({
      order,
      eventType: "order-placed",
      audience: "admin",
      title: "New order received",
      body: `${orderLabel} from ${order.customerName} for ${total}.`,
      recipientRole: "admin",
    }),
  ].filter((payload) => payload.channel === "web-push" || payload.whatsappNumber);
};

export const createOrderStatusNotificationPayload = (order: Order, nextStatus: OrderStatus): NotificationPayload => {
  const orderLabel = getOrderLabel(order);
  const statusLabel = ORDER_STATUS_LABELS[nextStatus] || nextStatus;
  const itemsSummary = getItemsSummary(order);
  const message = [
    `Namaste ${order.customerName}, your Javani order ${orderLabel} is now ${statusLabel}.`,
    "Thank you for shopping with Javani Spiritual Hub.",
  ].join("\n");

  // Pick the status-specific template (params: firstName, orderId, itemsSummary + URL button suffix)
  const templateName = ORDER_STATUS_TEMPLATES[nextStatus] ?? "";

  return createBasePayload({
    order,
    eventType: "order-status-updated",
    audience: "customer",
    title: `Order ${statusLabel}`,
    message,
    whatsappNumber: order.customerPhone,
    ...createTemplateFields(templateName, [firstName(order.customerName), orderLabel, itemsSummary], order.id),
  });
};

export const createOrderStatusNotificationPayloads = (order: Order, nextStatus: OrderStatus): NotificationPayload[] => {
  const orderLabel = getOrderLabel(order);
  const statusLabel = ORDER_STATUS_LABELS[nextStatus] || nextStatus;

  return [
    createOrderStatusNotificationPayload(order, nextStatus),
    createWebPushPayload({
      order,
      eventType: "order-status-updated",
      audience: "customer",
      title: `Order ${statusLabel}`,
      body: `${orderLabel} is now ${statusLabel}.`,
    }),
  ];
};

export const createPaymentStatusNotificationPayload = (order: Order, nextStatus: PaymentStatus): NotificationPayload => {
  const orderLabel = getOrderLabel(order);
  const statusLabel = paymentStatusLabels[nextStatus] || nextStatus;
  const message = [
    `Namaste ${order.customerName}, payment for Javani order ${orderLabel} is marked as ${statusLabel}.`,
    `Order total: ${formatPaiseAsRupees(order.totalInPaise || 0)}`,
  ].join("\n");

  // No dedicated payment-status template — send as free-form text.
  return createBasePayload({
    order,
    eventType: "payment-status-updated",
    audience: "customer",
    title: `Payment ${statusLabel}`,
    message,
    whatsappNumber: order.customerPhone,
  });
};

export const createPaymentStatusNotificationPayloads = (order: Order, nextStatus: PaymentStatus): NotificationPayload[] => {
  const orderLabel = getOrderLabel(order);
  const statusLabel = paymentStatusLabels[nextStatus] || nextStatus;

  return [
    createPaymentStatusNotificationPayload(order, nextStatus),
    createWebPushPayload({
      order,
      eventType: "payment-status-updated",
      audience: "customer",
      title: `Payment ${statusLabel}`,
      body: `${orderLabel} payment is marked as ${statusLabel}.`,
    }),
  ];
};

export const normalizeNotificationLog = (id: string, data: unknown): NotificationLog => {
  const notification = typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
  const channel = notificationChannels.includes(String(notification.channel) as NotificationChannel)
    ? notification.channel as NotificationChannel
    : "whatsapp";
  const audience = notification.audience === "admin" ? "admin" : "customer";
  const eventType = notificationEvents.includes(String(notification.eventType) as NotificationEventType)
    ? notification.eventType as NotificationEventType
    : "order-placed";
  const status = notificationStatuses.includes(String(notification.status) as NotificationStatus)
    ? notification.status as NotificationStatus
    : "manual-ready";

  return {
    id,
    channel,
    audience,
    eventType,
    status,
    title: getString(notification.title, "WhatsApp notification"),
    message: getString(notification.message),
    whatsappNumber: getString(notification.whatsappNumber),
    whatsappUrl: getString(notification.whatsappUrl),
    whatsappTemplateName: getString(notification.whatsappTemplateName) || undefined,
    whatsappTemplateLanguage: getString(notification.whatsappTemplateLanguage) || undefined,
    whatsappTemplateParams: getStringArray(notification.whatsappTemplateParams),
    whatsappTemplateUrlSuffix: getString(notification.whatsappTemplateUrlSuffix) || undefined,
    webTitle: getString(notification.webTitle) || undefined,
    webBody: getString(notification.webBody) || undefined,
    webLink: getString(notification.webLink) || undefined,
    orderId: getString(notification.orderId) || undefined,
    orderNumber: getString(notification.orderNumber) || undefined,
    customerId: getString(notification.customerId) || undefined,
    recipientUserId: getString(notification.recipientUserId) || undefined,
    recipientRole: notification.recipientRole === "admin" ? "admin" : notification.recipientRole === "user" ? "user" : undefined,
    customerName: getString(notification.customerName) || undefined,
    customerPhone: getString(notification.customerPhone) || undefined,
    dispatchProviderMessageId: getString(notification.dispatchProviderMessageId) || undefined,
    errorMessage: getString(notification.errorMessage) || undefined,
    sentAt: notification.sentAt,
    lastAttemptAt: notification.lastAttemptAt,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  };
};