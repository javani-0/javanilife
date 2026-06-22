// ---------------------------------------------------------------------------
// Shared notification engine (WhatsApp + FCM web push) for server-side callers.
// ---------------------------------------------------------------------------
// Webhooks and crons have no user idToken, so the channel helpers live here and
// are called directly. Mirrors the proven helpers in api/orders/notify.ts.
// ---------------------------------------------------------------------------
import { getFirebaseAdminDb, getFirebaseAdminMessaging, FieldValue } from "./firebase-admin.js";
import { getWhatsAppEnvValue, sanitizeWhatsAppNumber, sendWhatsAppTemplate } from "./whatsapp.js";

const getString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

export const createAbsoluteLink = (link: string) => {
  if (/^https?:\/\//i.test(link)) return link;
  const baseUrl = process.env.PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (!baseUrl) return link;
  const safePath = link.startsWith("/") ? link : `/${link}`;
  return `${baseUrl.replace(/\/$/, "")}${safePath}`;
};

export interface PushTokenEntry {
  token: string;
  ref: FirebaseFirestore.DocumentReference;
}

export const collectUserTokens = async (uid: string): Promise<PushTokenEntry[]> => {
  const db = getFirebaseAdminDb();
  const [nestedSnapshot, topLevelSnapshot] = await Promise.all([
    db.collection(`users/${uid}/webPushTokens`).where("enabled", "==", true).get(),
    db.collection("userTokens").where("uid", "==", uid).get(),
  ]);

  const entries: PushTokenEntry[] = [
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

export const collectAdminTokens = async (): Promise<PushTokenEntry[]> => {
  const adminUsers = await getFirebaseAdminDb().collection("users").where("role", "==", "admin").get();
  const tokenGroups = await Promise.all(adminUsers.docs.map((userDoc) => collectUserTokens(userDoc.id)));
  return tokenGroups.flat();
};

export const getAdminWhatsAppNumber = async () => {
  const snapshot = await getFirebaseAdminDb().doc("siteSettings/contactInfo").get();
  const data = snapshot.exists ? snapshot.data() : null;
  return sanitizeWhatsAppNumber(getString(data?.orderNotificationPhone) || getString(data?.whatsappNumber));
};

export const sendWebPush = async ({
  tokens,
  title,
  body,
  link,
  data = {},
}: {
  tokens: PushTokenEntry[];
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
    data: { ...data, title, body, link: absoluteLink, url: absoluteLink },
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

// --- Class fee notifications ------------------------------------------------

const templateLanguage = () => getWhatsAppEnvValue("WHATSAPP_TEMPLATE_LANGUAGE", getWhatsAppEnvValue("VITE_WHATSAPP_TEMPLATE_LANGUAGE", "en"));
const classFeeReminderTemplate = () => getWhatsAppEnvValue("WHATSAPP_CLASS_FEE_REMINDER_TEMPLATE", getWhatsAppEnvValue("VITE_WHATSAPP_CLASS_FEE_REMINDER_TEMPLATE", "class_fee_reminder"));
const classFeePaidParentTemplate = () => getWhatsAppEnvValue("WHATSAPP_CLASS_FEE_PAID_PARENT_TEMPLATE", getWhatsAppEnvValue("VITE_WHATSAPP_CLASS_FEE_PAID_PARENT_TEMPLATE", "class_fee_paid_parent"));
const classFeePaidAdminTemplate = () => getWhatsAppEnvValue("WHATSAPP_CLASS_FEE_PAID_ADMIN_TEMPLATE", getWhatsAppEnvValue("VITE_WHATSAPP_CLASS_FEE_PAID_ADMIN_TEMPLATE", "class_fee_paid_admin"));
const classFeeFailedTemplate = () => getWhatsAppEnvValue("WHATSAPP_CLASS_FEE_FAILED_TEMPLATE", getWhatsAppEnvValue("VITE_WHATSAPP_CLASS_FEE_FAILED_TEMPLATE", "class_fee_failed"));
const autopayCancelledParentTemplate = () => getWhatsAppEnvValue("WHATSAPP_AUTOPAY_CANCELLED_PARENT_TEMPLATE", getWhatsAppEnvValue("VITE_WHATSAPP_AUTOPAY_CANCELLED_PARENT_TEMPLATE", "autopay_cancelled_parent"));
const autopayCancelledAdminTemplate = () => getWhatsAppEnvValue("WHATSAPP_AUTOPAY_CANCELLED_ADMIN_TEMPLATE", getWhatsAppEnvValue("VITE_WHATSAPP_AUTOPAY_CANCELLED_ADMIN_TEMPLATE", "autopay_cancelled_admin"));

const firstName = (name?: string) => (name || "there").split(" ").filter(Boolean)[0] || "there";
const rupeesFromPaise = (paise?: number) => String(Math.round(Number(paise || 0) / 100));

export type ClassFeeNotificationEvent = "paid" | "reminder" | "failed";

export interface ClassFeeNotificationContext {
  feePaymentId: string;
  enrollmentId?: string;
  classId?: string;
  className: string;
  studentName: string;
  parentName: string;
  parentUserId?: string;
  parentPhone?: string;
  parentWhatsApp?: string;
  amountInPaise: number;
  monthLabel: string;
  dueDate?: string;
  // Enriched payment details for parent transparency (batch + billed period +
  // next charge). Filled by notificationContextFromFee; optional for callers.
  slotLabel?: string;
  billingPeriodLabel?: string;
  nextChargeDate?: string;
}

/** "5 Sep 2026" → friendly date for a "YYYY-MM-DD" string (or "" if unparseable). */
const niceDate = (iso?: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!match) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`;
};

/** Build the extra "Batch · Covers · Next charge" suffix for push/in-app bodies. */
const paymentDetailSuffix = (ctx: ClassFeeNotificationContext): string => {
  const parts: string[] = [];
  if (ctx.slotLabel) parts.push(`Batch: ${ctx.slotLabel}`);
  if (ctx.billingPeriodLabel) parts.push(`Covers: ${ctx.billingPeriodLabel}`);
  const next = niceDate(ctx.nextChargeDate);
  if (next) parts.push(`Next charge: ${next}`);
  return parts.length ? ` ${parts.join(" · ")}.` : "";
};

const settle = (result: PromiseSettledResult<unknown>) => (
  result.status === "fulfilled"
    ? { status: "fulfilled", value: result.value }
    : { status: "rejected", reason: result.reason instanceof Error ? result.reason.message : String(result.reason) }
);

/**
 * Send WhatsApp + web push for a class-fee event. Parent always notified; admin
 * also notified on "paid". Never throws — returns a per-channel result summary.
 */
export const sendClassFeeNotifications = async (
  event: ClassFeeNotificationEvent,
  ctx: ClassFeeNotificationContext,
) => {
  const parentNumber = sanitizeWhatsAppNumber(ctx.parentWhatsApp || ctx.parentPhone || "");
  const amount = rupeesFromPaise(ctx.amountInPaise);
  const link = "/account/classes";

  const parentTokensPromise = ctx.parentUserId ? collectUserTokens(ctx.parentUserId) : Promise.resolve([]);

  if (event === "paid") {
    const adminNumber = await getAdminWhatsAppNumber().catch(() => "");
    const [parentWhatsApp, adminWhatsApp, parentPush, adminPush] = await Promise.allSettled([
      parentNumber
        ? sendWhatsAppTemplate({ to: parentNumber, templateName: classFeePaidParentTemplate(), languageCode: templateLanguage(), params: [firstName(ctx.parentName), ctx.studentName, ctx.className, amount, ctx.monthLabel], urlSuffix: ctx.feePaymentId })
        : Promise.resolve({ status: "skipped", errorMessage: "Parent WhatsApp number missing." }),
      adminNumber
        ? sendWhatsAppTemplate({ to: adminNumber, templateName: classFeePaidAdminTemplate(), languageCode: templateLanguage(), params: [ctx.studentName, ctx.className, amount, ctx.monthLabel, ctx.parentName], urlSuffix: ctx.feePaymentId })
        : Promise.resolve({ status: "skipped", errorMessage: "Admin WhatsApp number missing." }),
      (async () => sendWebPush({ tokens: await parentTokensPromise, title: "Fee received", body: `₹${amount} received for ${ctx.studentName}'s ${ctx.className} (${ctx.billingPeriodLabel || ctx.monthLabel}).${paymentDetailSuffix(ctx)}`, link, data: { feePaymentId: ctx.feePaymentId, type: "class-fee-paid", audience: "parent" } }))(),
      (async () => sendWebPush({ tokens: await collectAdminTokens(), title: "Class fee paid", body: `${ctx.studentName} · ${ctx.className} · ₹${amount} · ${ctx.billingPeriodLabel || ctx.monthLabel} · ${ctx.parentName}.${paymentDetailSuffix(ctx)}`, link: "/admin/fee-collections", data: { feePaymentId: ctx.feePaymentId, type: "class-fee-paid", audience: "admin" } }))(),
    ]);
    return { parentWhatsApp: settle(parentWhatsApp), adminWhatsApp: settle(adminWhatsApp), parentPush: settle(parentPush), adminPush: settle(adminPush) };
  }

  if (event === "reminder") {
    const [parentWhatsApp, parentPush] = await Promise.allSettled([
      parentNumber
        ? sendWhatsAppTemplate({ to: parentNumber, templateName: classFeeReminderTemplate(), languageCode: templateLanguage(), params: [firstName(ctx.parentName), ctx.studentName, ctx.className, amount, ctx.dueDate || ""], urlSuffix: ctx.feePaymentId })
        : Promise.resolve({ status: "skipped", errorMessage: "Parent WhatsApp number missing." }),
      (async () => sendWebPush({ tokens: await parentTokensPromise, title: "Upcoming fee", body: `On ${ctx.dueDate}, ₹${amount} is due for ${ctx.studentName}'s ${ctx.className}.`, link, data: { feePaymentId: ctx.feePaymentId, type: "class-fee-reminder", audience: "parent" } }))(),
    ]);
    return { parentWhatsApp: settle(parentWhatsApp), parentPush: settle(parentPush) };
  }

  // failed
  const [parentWhatsApp, parentPush, adminPush] = await Promise.allSettled([
    parentNumber
      ? sendWhatsAppTemplate({ to: parentNumber, templateName: classFeeFailedTemplate(), languageCode: templateLanguage(), params: [firstName(ctx.parentName), ctx.studentName, ctx.className, amount, ctx.dueDate || ""], urlSuffix: ctx.feePaymentId })
      : Promise.resolve({ status: "skipped", errorMessage: "Parent WhatsApp number missing." }),
    (async () => sendWebPush({ tokens: await parentTokensPromise, title: "Fee payment failed", body: `₹${amount} for ${ctx.studentName}'s ${ctx.className} (${ctx.monthLabel}) could not be debited.`, link, data: { feePaymentId: ctx.feePaymentId, type: "class-fee-failed", audience: "parent" } }))(),
    (async () => sendWebPush({ tokens: await collectAdminTokens(), title: "Class fee failed", body: `${ctx.studentName} · ${ctx.className} · ₹${amount} · ${ctx.monthLabel} failed.`, link: "/admin/fee-collections", data: { feePaymentId: ctx.feePaymentId, type: "class-fee-failed", audience: "admin" } }))(),
  ]);
  return { parentWhatsApp: settle(parentWhatsApp), parentPush: settle(parentPush), adminPush: settle(adminPush) };
};

// --- Autopay cancelled notification -----------------------------------------

export interface AutopayCancelledContext {
  enrollmentId: string;
  className: string;
  studentName: string;
  parentName: string;
  parentUserId?: string;
  parentPhone?: string;
  parentWhatsApp?: string;
  cancelledBy?: "parent" | "admin";
}

/**
 * Notify both the parent and the admin that a class autopay mandate has been
 * cancelled. Parent gets WhatsApp + web push; admin gets WhatsApp + web push.
 * Never throws — returns a per-channel result summary.
 */
export const sendAutopayCancelledNotifications = async (ctx: AutopayCancelledContext) => {
  const parentNumber = sanitizeWhatsAppNumber(ctx.parentWhatsApp || ctx.parentPhone || "");
  const parentTokensPromise = ctx.parentUserId ? collectUserTokens(ctx.parentUserId) : Promise.resolve([]);
  const adminNumber = await getAdminWhatsAppNumber().catch(() => "");

  const [parentWhatsApp, adminWhatsApp, parentPush, adminPush] = await Promise.allSettled([
    parentNumber
      ? sendWhatsAppTemplate({ to: parentNumber, templateName: autopayCancelledParentTemplate(), languageCode: templateLanguage(), params: [firstName(ctx.parentName), ctx.studentName, ctx.className] })
      : Promise.resolve({ status: "skipped", errorMessage: "Parent WhatsApp number missing." }),
    adminNumber
      ? sendWhatsAppTemplate({ to: adminNumber, templateName: autopayCancelledAdminTemplate(), languageCode: templateLanguage(), params: [ctx.studentName, ctx.className, ctx.parentName] })
      : Promise.resolve({ status: "skipped", errorMessage: "Admin WhatsApp number missing." }),
    (async () => sendWebPush({ tokens: await parentTokensPromise, title: "Autopay cancelled", body: `Autopay for ${ctx.studentName}'s ${ctx.className} has been turned off. You can pay monthly or re-enable autopay anytime.`, link: "/account/classes", data: { enrollmentId: ctx.enrollmentId, type: "autopay-cancelled", audience: "parent" } }))(),
    (async () => sendWebPush({ tokens: await collectAdminTokens(), title: "Autopay cancelled", body: `${ctx.studentName} · ${ctx.className} · ${ctx.parentName} — autopay cancelled${ctx.cancelledBy ? ` by ${ctx.cancelledBy}` : ""}.`, link: "/admin/enrollments", data: { enrollmentId: ctx.enrollmentId, type: "autopay-cancelled", audience: "admin" } }))(),
  ]);

  return { parentWhatsApp: settle(parentWhatsApp), adminWhatsApp: settle(adminWhatsApp), parentPush: settle(parentPush), adminPush: settle(adminPush) };
};
