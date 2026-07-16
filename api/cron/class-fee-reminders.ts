import { getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { collectDueReminders, daysUntil, isOverdue, monthKeyFor } from "../_lib/class-fees.js";
import {
  ensureFeePayment,
  ENROLLMENTS_COLLECTION,
  FEE_PAYMENTS_COLLECTION,
  isPrepaymentEnrollment,
  isTermEnrollment,
  notificationContextFromFee,
  type EnrollmentRecord,
} from "../_lib/fee-store.js";
import { sendClassFeeNotifications } from "../_lib/notify.js";
import { getWhatsAppConfigStatus } from "../_lib/whatsapp.js";

const getString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

const getHeader = (request: ApiRequest, name: string) => {
  const value = request.headers[name] || request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const isAuthorizedCron = (request: ApiRequest) => {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return getString(getHeader(request, "authorization")) === `Bearer ${secret}`;
};

const getReminderDays = () => {
  const configured = Number(process.env.CLASS_FEE_REMINDER_DAYS || 5);
  return Number.isFinite(configured) ? Math.min(Math.max(1, Math.floor(configured)), 30) : 5;
};

const getPollLimit = () => {
  const configured = Number(process.env.CLASS_FEE_REMINDER_LIMIT || 100);
  return Number.isFinite(configured) ? Math.min(Math.max(1, Math.floor(configured)), 300) : 100;
};

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
  const monthKey = monthKeyFor(now);
  const reminderDays = getReminderDays();
  const limit = getPollLimit();

  // --- Step A: roll the schedule forward for active enrollments -------------
  let rolledForward = 0;
  try {
    const activeEnrollments = await db.collection(ENROLLMENTS_COLLECTION).where("status", "==", "active").limit(limit).get();
    for (const enrollmentDoc of activeEnrollments.docs) {
      const enrollment = { id: enrollmentDoc.id, ...(enrollmentDoc.data() as Omit<EnrollmentRecord, "id">) };
      if (!enrollment.classId || !enrollment.parentUserId) continue;
      // Term courses have a fixed installment/full schedule — never roll a monthly fee.
      if (isTermEnrollment(enrollment)) continue;
      // Prepayment (new-student) enrolments bill in arrears: the first monthly
      // due is collected the month AFTER joining (June joiner → July doc =
      // "June 2026"). Never create a due for the joining month or earlier.
      if (isPrepaymentEnrollment(enrollment) && monthKey <= String(enrollment.startMonthKey || "")) continue;
      await ensureFeePayment(db, enrollment, monthKey);
      rolledForward += 1;
    }
  } catch (error) {
    console.error("Class fee cron: roll-forward failed", error);
  }

  // --- Steps B & C: scan pending + overdue fees for reminders ---------------
  // Overdue fees keep getting the daily nudge for OVERDUE_REMINDER_GRACE_DAYS
  // after the due date (collectDueReminders enforces the window). Two queries
  // share the existing (status, dueDate) composite index.
  const [pendingSnapshot, overdueSnapshot] = await Promise.all([
    db.collection(FEE_PAYMENTS_COLLECTION).where("status", "==", "pending").orderBy("dueDate", "asc").limit(limit).get(),
    db.collection(FEE_PAYMENTS_COLLECTION).where("status", "==", "overdue").orderBy("dueDate", "desc").limit(limit).get(),
  ]);
  const scannedFeeDocs = [...pendingSnapshot.docs, ...overdueSnapshot.docs];

  const docById = new Map(scannedFeeDocs.map((feeDoc) => [feeDoc.id, feeDoc] as const));
  const pendingDocs = scannedFeeDocs.map((feeDoc) => {
    const data = feeDoc.data() || {};
    return {
      id: feeDoc.id,
      monthKey: getString(data.monthKey),
      status: getString(data.status),
      dueDate: getString(data.dueDate),
      reminders: (data.reminders || {}) as { preDebitMonthKey?: string; preDebitDateKey?: string },
    };
  });

  const reminderCandidates = collectDueReminders(pendingDocs, now, reminderDays);

  const reminderResults: Array<{ feePaymentId: string; status: string; errorMessage?: string }> = [];
  for (const candidate of reminderCandidates) {
    const feeDoc = candidate.id ? docById.get(candidate.id) : undefined;
    if (!feeDoc) continue;
    const fee = feeDoc.data() || {};
    const todayKey = now.toISOString().slice(0, 10);
    const daysLeft = daysUntil(getString(fee.dueDate), now);
    try {
      await sendClassFeeNotifications("reminder", {
        ...notificationContextFromFee(feeDoc.id, fee),
        daysUntilDue: daysLeft ?? undefined,
      });
      await feeDoc.ref.update({
        "reminders.preDebitSentAt": now.toISOString(),
        "reminders.preDebitMonthKey": getString(fee.monthKey),
        "reminders.preDebitDateKey": todayKey,
        "reminders.count": FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      reminderResults.push({ feePaymentId: feeDoc.id, status: "sent" });
    } catch (error) {
      console.error("Class fee reminder failed", { feePaymentId: feeDoc.id, error });
      reminderResults.push({ feePaymentId: feeDoc.id, status: "failed", errorMessage: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  // Step C: mark overdue (admin visibility; no separate WhatsApp template).
  let overdueMarked = 0;
  for (const doc of pendingDocs) {
    if (doc.status !== "pending") continue; // already overdue — nothing to flip
    if (!isOverdue(getString(doc.dueDate), now)) continue;
    const feeDoc = docById.get(doc.id);
    if (!feeDoc) continue;
    try {
      await feeDoc.ref.update({ status: "overdue", updatedAt: FieldValue.serverTimestamp() });
      overdueMarked += 1;
    } catch (error) {
      console.error("Class fee overdue marking failed", { feePaymentId: doc.id, error });
    }
  }

  sendJson(response, 200, {
    ok: true,
    monthKey,
    reminderDays,
    whatsappConfig: getWhatsAppConfigStatus(),
    rolledForward,
    scanned: pendingDocs.length,
    remindersSent: reminderResults.filter((result) => result.status === "sent").length,
    overdueMarked,
    reminderResults,
  });
}
