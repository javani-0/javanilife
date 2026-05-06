import { getFirebaseAdminAuth, getFirebaseAdminDb, getFirebaseAdminMessaging, FieldValue } from "./firebase-admin.ts";
import { sendWhatsAppTemplate, sendWhatsAppText } from "./whatsapp.ts";

type NotificationChannel = "whatsapp" | "web-push";
type NotificationStatus = "manual-ready" | "pending" | "sent" | "failed" | "skipped";
type UserRole = "admin" | "user";

export interface RequesterContext {
  uid: string;
  role: UserRole;
}

export interface NotificationRecord {
  channel: NotificationChannel;
  audience: "customer" | "admin";
  eventType: "order-placed" | "order-status-updated" | "payment-status-updated";
  status: NotificationStatus;
  title: string;
  message: string;
  whatsappNumber?: string;
  whatsappUrl?: string;
  whatsappTemplateName?: string;
  whatsappTemplateLanguage?: string;
  whatsappTemplateParams?: string[];
  whatsappTemplateUrlSuffix?: string;
  webTitle?: string;
  webBody?: string;
  webLink?: string;
  orderId?: string;
  orderNumber?: string;
  customerId?: string;
  recipientUserId?: string;
  recipientRole?: UserRole;
  customerName?: string;
  customerPhone?: string;
  errorMessage?: string;
}

export interface DispatchResult {
  id: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  errorMessage?: string;
}

const allowedChannels: NotificationChannel[] = ["whatsapp", "web-push"];
const allowedEvents = ["order-placed", "order-status-updated", "payment-status-updated"];

const getString = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const getStringArray = (value: unknown) => Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];

const omitUndefined = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(omitUndefined).filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, omitUndefined(item)] as const)
        .filter(([, item]) => item !== undefined)
    );
  }

  return value === undefined ? undefined : value;
};

const createAbsoluteLink = (link: string) => {
  if (/^https?:\/\//i.test(link)) return link;
  const baseUrl = process.env.PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (!baseUrl) return link;
  const safePath = link.startsWith("/") ? link : `/${link}`;
  return `${baseUrl.replace(/\/$/, "")}${safePath}`;
};

const normalizePayload = (payload: unknown): NotificationRecord => {
  const data = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
  const channel = allowedChannels.includes(data.channel as NotificationChannel) ? data.channel as NotificationChannel : "whatsapp";
  const eventType = allowedEvents.includes(String(data.eventType))
    ? data.eventType as NotificationRecord["eventType"]
    : "order-placed";
  const audience = data.audience === "admin" ? "admin" : "customer";
  const recipientRole = data.recipientRole === "admin" ? "admin" : data.recipientRole === "user" ? "user" : undefined;

  return {
    channel,
    audience,
    eventType,
    status: "pending",
    title: getString(data.title, channel === "web-push" ? "Web notification" : "WhatsApp notification"),
    message: getString(data.message),
    whatsappNumber: getString(data.whatsappNumber),
    whatsappUrl: getString(data.whatsappUrl),
    whatsappTemplateName: getString(data.whatsappTemplateName) || undefined,
    whatsappTemplateLanguage: getString(data.whatsappTemplateLanguage) || undefined,
    whatsappTemplateParams: getStringArray(data.whatsappTemplateParams),
    whatsappTemplateUrlSuffix: getString(data.whatsappTemplateUrlSuffix) || undefined,
    webTitle: getString(data.webTitle) || getString(data.title),
    webBody: getString(data.webBody) || getString(data.message),
    webLink: getString(data.webLink),
    orderId: getString(data.orderId) || undefined,
    orderNumber: getString(data.orderNumber) || undefined,
    customerId: getString(data.customerId) || undefined,
    recipientUserId: getString(data.recipientUserId) || undefined,
    recipientRole,
    customerName: getString(data.customerName) || undefined,
    customerPhone: getString(data.customerPhone) || undefined,
  };
};

export const getRequesterContext = async (idToken: string): Promise<RequesterContext> => {
  const decoded = await getFirebaseAdminAuth().verifyIdToken(idToken);
  const userSnapshot = await getFirebaseAdminDb().doc(`users/${decoded.uid}`).get();
  const role = userSnapshot.data()?.role === "admin" ? "admin" : "user";
  return { uid: decoded.uid, role };
};

const canQueueNotification = (requester: RequesterContext, notification: NotificationRecord) => {
  if (requester.role === "admin") return true;
  return notification.eventType === "order-placed" && notification.customerId === requester.uid;
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

const updateNotificationStatus = async (id: string, status: NotificationStatus, details: Record<string, unknown> = {}) => {
  await getFirebaseAdminDb().doc(`notifications/${id}`).update({
    status,
    lastAttemptAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...details,
  });
};

const dispatchWhatsApp = async (id: string, notification: NotificationRecord): Promise<DispatchResult> => {
  let templateErrorMessage = "";
  let dispatchMode = "text";

  if (notification.whatsappTemplateName) {
    const templateResult = await sendWhatsAppTemplate({
      to: notification.whatsappNumber || "",
      templateName: notification.whatsappTemplateName,
      languageCode: notification.whatsappTemplateLanguage || "en",
      params: notification.whatsappTemplateParams || [],
      urlSuffix: notification.whatsappTemplateUrlSuffix,
    });

    if (templateResult.status === "sent") {
      await updateNotificationStatus(id, "sent", {
        errorMessage: "",
        dispatchMode: "template",
        dispatchProviderMessageId: templateResult.providerMessageId || "",
        sentAt: FieldValue.serverTimestamp(),
      });
      return { id, channel: "whatsapp", status: "sent" };
    }

    templateErrorMessage = templateResult.errorMessage || "WhatsApp template send failed.";
    dispatchMode = "template-fallback-text";
  }

  const result = await sendWhatsAppText(notification.whatsappNumber || "", notification.message || notification.webBody || notification.title);
  const status = result.status;
  await updateNotificationStatus(id, status, {
    errorMessage: result.errorMessage || templateErrorMessage || "",
    dispatchMode,
    ...(templateErrorMessage ? { templateErrorMessage } : {}),
    dispatchProviderMessageId: result.providerMessageId || "",
    ...(status === "sent" ? { sentAt: FieldValue.serverTimestamp() } : {}),
  });
  return { id, channel: "whatsapp", status, errorMessage: result.errorMessage || templateErrorMessage || undefined };
};

const dispatchWebPush = async (id: string, notification: NotificationRecord): Promise<DispatchResult> => {
  const tokens = notification.audience === "admin" || notification.recipientRole === "admin"
    ? await collectAdminTokens()
    : notification.recipientUserId
      ? await collectUserTokens(notification.recipientUserId)
      : [];

  if (tokens.length === 0) {
    const errorMessage = "No web push tokens are registered for this recipient.";
    await updateNotificationStatus(id, "skipped", { errorMessage });
    return { id, channel: "web-push", status: "skipped", errorMessage };
  }

  const link = notification.webLink || (notification.audience === "admin" ? "/admin/orders" : "/account/orders");
  const absoluteLink = createAbsoluteLink(link);
  const response = await getFirebaseAdminMessaging().sendEachForMulticast({
    tokens: tokens.map((entry) => entry.token),
    notification: {
      title: notification.webTitle || notification.title,
      body: notification.webBody || notification.message,
    },
    webpush: {
      fcmOptions: { link: absoluteLink },
      notification: {
        icon: "/favicon.png",
        badge: "/favicon.png",
      },
    },
    data: {
      notificationId: id,
      orderId: notification.orderId || "",
      link: absoluteLink,
      url: absoluteLink,
      title: notification.webTitle || notification.title,
      body: notification.webBody || notification.message,
    },
  });

  await Promise.all(response.responses.map((sendResult, index) => {
    const code = sendResult.error?.code || "";
    if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
      return tokens[index].ref.update({ enabled: false, updatedAt: FieldValue.serverTimestamp(), errorMessage: code });
    }
    return Promise.resolve();
  }));

  const status: NotificationStatus = response.successCount > 0 ? "sent" : "failed";
  const errorMessage = response.successCount > 0
    ? ""
    : response.responses.map((item) => item.error?.message).filter(Boolean).join("; ") || "Firebase Cloud Messaging send failed.";
  await updateNotificationStatus(id, status, {
    errorMessage,
    dispatchProviderMessageId: `fcm:${response.successCount}/${tokens.length}`,
    ...(status === "sent" ? { sentAt: FieldValue.serverTimestamp() } : {}),
  });

  return { id, channel: "web-push", status, errorMessage: errorMessage || undefined };
};

export const dispatchNotification = async (id: string, source?: NotificationRecord): Promise<DispatchResult> => {
  const snapshot = source ? null : await getFirebaseAdminDb().doc(`notifications/${id}`).get();
  if (snapshot && !snapshot.exists) throw new Error("Notification log was not found.");

  const notification = source || normalizePayload(snapshot?.data());

  try {
    if (notification.channel === "web-push") return dispatchWebPush(id, notification);
    return dispatchWhatsApp(id, notification);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Notification dispatch failed.";
    await updateNotificationStatus(id, "failed", { errorMessage });
    return { id, channel: notification.channel, status: "failed", errorMessage };
  }
};

export const queueAndDispatchNotifications = async (requester: RequesterContext, payloads: unknown[]) => {
  const db = getFirebaseAdminDb();
  const notifications = payloads.map(normalizePayload);
  const unauthorized = notifications.find((notification) => !canQueueNotification(requester, notification));
  if (unauthorized) throw new Error("You do not have permission to queue one or more notifications.");

  return Promise.all(notifications.map(async (notification) => {
    const notificationRef = await db.collection("notifications").add(omitUndefined({
      ...notification,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }) as Record<string, unknown>);

    return dispatchNotification(notificationRef.id, notification);
  }));
};