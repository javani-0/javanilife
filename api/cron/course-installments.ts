import { getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import {
  collectDueCourseInstallmentReminders,
  getCourseInstallmentReminderMonthKey,
  type CourseInstallmentOrderSnapshot,
} from "../_lib/course-installments.js";
import { getWhatsAppConfigStatus, getWhatsAppEnvValue, sanitizeWhatsAppNumber, sendWhatsAppTemplate } from "../_lib/whatsapp.js";

const getString = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;

const getHeader = (request: ApiRequest, name: string) => {
  const value = request.headers[name] || request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const isAuthorizedCron = (request: ApiRequest) => {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return getString(getHeader(request, "authorization")) === `Bearer ${secret}`;
};

const getPollLimit = () => {
  const configured = Number(process.env.COURSE_INSTALLMENT_REMINDER_LIMIT || 50);
  return Number.isFinite(configured) ? Math.min(Math.max(1, Math.floor(configured)), 100) : 50;
};

const templateLanguage = () => getWhatsAppEnvValue("WHATSAPP_TEMPLATE_LANGUAGE", getWhatsAppEnvValue("VITE_WHATSAPP_TEMPLATE_LANGUAGE", "en"));
const installmentReminderTemplate = () => getWhatsAppEnvValue(
  "WHATSAPP_COURSE_INSTALLMENT_REMINDER_TEMPLATE",
  getWhatsAppEnvValue("VITE_WHATSAPP_COURSE_INSTALLMENT_REMINDER_TEMPLATE", "course_installment_reminder"),
);

const firstName = (name?: string) => (name || "there").split(" ").filter(Boolean)[0] || "there";
const shortOrderRef = (orderId: string, orderNumber?: string) => orderNumber || `#${orderId.slice(-6).toUpperCase()}`;
const rupeesFromPaise = (paise?: number) => String(Math.round(Number(paise || 0) / 100));

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader?.("Allow", "GET, POST");
    sendError(response, 405, "Method not allowed");
    return;
  }

  if (!process.env.CRON_SECRET?.trim()) {
    sendError(response, 503, "CRON_SECRET is not configured.");
    return;
  }
  if (!isAuthorizedCron(request)) {
    sendError(response, 401, "Invalid cron secret.");
    return;
  }

  const db = getFirebaseAdminDb();
  const now = new Date();
  const monthKey = getCourseInstallmentReminderMonthKey(now);
  const snapshot = await db.collection("orders").where("payment.status", "==", "partially-paid").limit(getPollLimit()).get();
  const orders = snapshot.docs.map((orderDocument) => ({
    id: orderDocument.id,
    ...(orderDocument.data() as Omit<CourseInstallmentOrderSnapshot, "id">),
  }));
  const candidates = collectDueCourseInstallmentReminders(orders, now);
  const results = [];

  for (const candidate of candidates) {
    const orderDocument = snapshot.docs.find((documentSnapshot) => documentSnapshot.id === candidate.orderId);
    if (!orderDocument) continue;

    const order = orderDocument.data() as CourseInstallmentOrderSnapshot;
    const customerPhone = sanitizeWhatsAppNumber(candidate.customerWhatsAppNumber || candidate.customerPhone || order.address?.phone || "");
    const orderRef = shortOrderRef(candidate.orderId, candidate.orderNumber);

    try {
      const whatsappResult = customerPhone
        ? await sendWhatsAppTemplate({
          to: customerPhone,
          templateName: installmentReminderTemplate(),
          languageCode: templateLanguage(),
          params: [firstName(candidate.customerName), orderRef, candidate.label, rupeesFromPaise(candidate.amountInPaise), candidate.dueDate],
          urlSuffix: candidate.orderId,
        })
        : { status: "failed" as const, errorMessage: "Customer WhatsApp number is missing." };

      const succeeded = whatsappResult.status === "sent";
      if (succeeded) {
        const installments = (order.payment?.installmentPlan?.installments || []).map((installment) => (
          Number(installment.installmentNumber || 0) === candidate.installmentNumber
            ? {
              ...installment,
              lastReminderSentAt: now.toISOString(),
              lastReminderMonthKey: monthKey,
              reminderCount: Number(installment.reminderCount || 0) + 1,
            }
            : installment
        ));

        await orderDocument.ref.update({
          "payment.installmentPlan.installments": installments,
          "notifications.courseInstallmentReminders": FieldValue.arrayUnion({
            installmentNumber: candidate.installmentNumber,
            amountInPaise: candidate.amountInPaise,
            dueDate: candidate.dueDate,
            monthKey,
            status: whatsappResult.status,
            providerMessageId: whatsappResult.providerMessageId || "",
            sentAt: now.toISOString(),
          }),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      results.push({
        orderId: candidate.orderId,
        installmentNumber: candidate.installmentNumber,
        dueDate: candidate.dueDate,
        status: whatsappResult.status,
        errorMessage: whatsappResult.errorMessage,
      });
    } catch (error) {
      console.error("Unable to send course installment reminder", { orderId: candidate.orderId, installmentNumber: candidate.installmentNumber, error });
      results.push({
        orderId: candidate.orderId,
        installmentNumber: candidate.installmentNumber,
        dueDate: candidate.dueDate,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  sendJson(response, 200, {
    ok: true,
    monthKey,
    whatsappConfig: getWhatsAppConfigStatus(),
    scanned: snapshot.docs.length,
    attempted: candidates.length,
    results,
  });
}