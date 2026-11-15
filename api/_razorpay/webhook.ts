import crypto from "node:crypto";
import { getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { sendEmiInstallmentNotification } from "../orders/notify.js";
import { monthKeyFor } from "../_lib/class-fees.js";
import {
  ensureFeePayment,
  ENROLLMENTS_COLLECTION,
  FEE_PAYMENTS_COLLECTION,
  notificationContextFromFee,
  type EnrollmentRecord,
} from "../_lib/fee-store.js";
import { sendClassFeeNotifications } from "../_lib/notify.js";
import { activateElearnFromWebhook, ElearnError, revokeElearnForRefund } from "../_lib/elearn.js";
import { createRazorpayClient, getRazorpayCurrency } from "../_lib/razorpay.js";

// ---------------------------------------------------------------------------
// Razorpay Webhook Handler
// ---------------------------------------------------------------------------
// Handles:
//   • payment.captured  → mark order paid (existing) OR mark a class fee paid
//                          when notes.kind === "class-fee".
//   • payment.failed    → mark a class fee failed (notes.kind === "class-fee").
//   • subscription.*     → drive class autopay mandate + monthly charges.
//   • refund.processed  → a full refund revokes e-learning access.
//
// The kind (class-fee / emi-installment / elearn) and its ids are read from
// the Razorpay ORDER's notes, which only this server writes. Payment notes come
// from the browser checkout and are never trusted (a ₹1 payment with forged
// notes must not mark a fee paid).
//
// Env var required: RAZORPAY_WEBHOOK_SECRET (set in Vercel + Razorpay dashboard)
// ---------------------------------------------------------------------------

interface RazorpayPaymentEntity {
  id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  notes?: Record<string, string>;
}

interface RazorpaySubscriptionEntity {
  id?: string;
  status?: string;
  plan_id?: string;
  customer_id?: string;
  current_start?: number;
  current_end?: number;
  charge_at?: number;
  notes?: Record<string, string>;
}

interface RazorpayWebhookPayload {
  event?: string;
  payload?: {
    payment?: { entity?: RazorpayPaymentEntity };
    subscription?: { entity?: RazorpaySubscriptionEntity };
    refund?: { entity?: { id?: string; payment_id?: string; amount?: number } };
  };
}

/** A failure Razorpay should retry (answer 5xx), unlike a permanent mismatch. */
class RetryableWebhookError extends Error {}

/**
 * The server-written notes of the payment's Razorpay order, after checking the
 * payment amount and currency equal the order's. null = no order, or a payment
 * that does not match its order (never act on it).
 */
async function trustedOrderNotes(payment: RazorpayPaymentEntity): Promise<Record<string, string> | null> {
  if (!payment.order_id) return null;
  let order: { amount?: number | string; currency?: string; notes?: unknown };
  try {
    order = (await createRazorpayClient().orders.fetch(payment.order_id)) as typeof order;
  } catch (error) {
    throw new RetryableWebhookError(`Could not fetch Razorpay order ${payment.order_id}: ${String(error)}`);
  }
  const currency = getRazorpayCurrency().toUpperCase();
  const orderAmount = Math.round(Number(order.amount));
  if (!Number.isFinite(orderAmount) || orderAmount <= 0
    || Math.round(Number(payment.amount)) !== orderAmount
    || String(order.currency || "").toUpperCase() !== currency
    || String(payment.currency || "").toUpperCase() !== currency) {
    console.warn("Webhook: payment does not match its order", { orderId: payment.order_id, paymentId: payment.id });
    return null;
  }
  const notes = order.notes;
  if (!notes || Array.isArray(notes) || typeof notes !== "object") return {};
  return Object.fromEntries(Object.entries(notes as Record<string, unknown>).map(([key, value]) => [key, String(value ?? "")]));
}

interface StoredOrderData {
  totalInPaise?: number;
  payment?: {
    status?: string;
    plan?: string;
    expectedOnlineAmountInPaise?: number;
    installmentPlan?: {
      status?: string;
      installments?: Array<Record<string, unknown>>;
    };
  };
}

function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(signature, "hex");
  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

async function getRawBody(request: ApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk: Buffer | string) => {
      data += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    request.on("end", () => resolve(data));
    request.on("error", reject);
  });
}

const getExpectedOnlineAmount = (orderData: StoredOrderData) => {
  const expectedOnlineAmount = Number(orderData.payment?.expectedOnlineAmountInPaise);
  if (Number.isFinite(expectedOnlineAmount) && expectedOnlineAmount > 0) return Math.round(expectedOnlineAmount);
  return Math.round(Number(orderData.totalInPaise || 0));
};

const markInitialInstallmentPaid = (orderData: StoredOrderData, razorpayPaymentId: string, paidAtIso: string) => {
  const installments = orderData.payment?.installmentPlan?.installments;
  if (!Array.isArray(installments)) return undefined;

  return installments.map((installment) => {
    const installmentNumber = Number(installment.installmentNumber || 0);
    if (installmentNumber !== 1) return installment;
    return { ...installment, status: "paid", paidAt: paidAtIso, razorpayPaymentId };
  });
};

// --- Existing order flow ----------------------------------------------------

async function handleOrderCaptured(payment: RazorpayPaymentEntity) {
  const razorpayOrderId = payment.order_id || "";
  const razorpayPaymentId = payment.id || "";
  if (!razorpayOrderId) return;

  const db = getFirebaseAdminDb();
  const ordersQuery = await db
    .collection("orders")
    .where("payment.razorpayOrderId", "==", razorpayOrderId)
    .limit(1)
    .get();

  if (ordersQuery.empty) return;

  const orderDoc = ordersQuery.docs[0];
  const orderData = (orderDoc.data() || {}) as StoredOrderData;
  const expectedOnlineAmount = getExpectedOnlineAmount(orderData);
  const capturedAmount = Number(payment.amount || 0);
  const currentPaymentStatus = orderData.payment?.status || "pending";
  const isInstallmentPayment = orderData.payment?.plan === "installment";

  if (capturedAmount !== expectedOnlineAmount) {
    console.warn("Webhook: captured amount does not match stored expected amount", { razorpayOrderId, capturedAmount, expectedOnlineAmount });
    return;
  }

  if (!(["paid", "partially-paid"].includes(currentPaymentStatus))) {
    const paidAtIso = new Date().toISOString();
    const paidInstallments = isInstallmentPayment ? markInitialInstallmentPaid(orderData, razorpayPaymentId, paidAtIso) : undefined;
    const updatePayload: Record<string, unknown> = {
      "payment.status": isInstallmentPayment ? "partially-paid" : "paid",
      "payment.razorpayPaymentId": razorpayPaymentId,
      "payment.paidAt": FieldValue.serverTimestamp(),
      "payment.verifiedVia": "webhook",
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (isInstallmentPayment) {
      updatePayload["payment.installmentPlan.status"] = "active";
      if (paidInstallments) updatePayload["payment.installmentPlan.installments"] = paidInstallments;
    }
    await orderDoc.ref.update(updatePayload);
  }
}

// --- Class fee (manual) flow ------------------------------------------------

async function markClassFeePaid(
  feePaymentId: string,
  razorpayPaymentId: string,
  method: "manual" | "autopay",
  subscriptionId?: string,
  paidOrder?: { orderId: string; amountInPaise: number },
) {
  const db = getFirebaseAdminDb();
  const feeRef = db.collection(FEE_PAYMENTS_COLLECTION).doc(feePaymentId);
  const snapshot = await feeRef.get();
  if (!snapshot.exists) return;

  const fee = snapshot.data() || {};
  if (fee.status === "paid") return; // idempotent

  // One-time (manual) payment: it must be for the order this fee created, and
  // for at least the fee amount.
  if (paidOrder) {
    const expected = Math.round(Number(fee.amountInPaise || 0));
    if (fee.razorpayOrderId !== paidOrder.orderId || (expected > 0 && paidOrder.amountInPaise < expected)) {
      console.warn("Webhook: class fee payment does not match the fee", { feePaymentId, orderId: paidOrder.orderId });
      return;
    }
  }

  await feeRef.update({
    status: "paid",
    paymentMethod: method,
    razorpayPaymentId,
    ...(subscriptionId ? { razorpaySubscriptionId: subscriptionId } : {}),
    paidAt: FieldValue.serverTimestamp(),
    notifiedParentAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // For term-course EMI, also flip the matching installment on the enrollment
  // plan so the parent's schedule view stays accurate.
  const emiMatch = /_emi-(\d+)$/.exec(feePaymentId);
  if (emiMatch && fee.enrollmentId) {
    const installmentNumber = Number(emiMatch[1]);
    try {
      const enrollmentRef = db.collection(ENROLLMENTS_COLLECTION).doc(String(fee.enrollmentId));
      const enrollmentSnap = await enrollmentRef.get();
      const installments = enrollmentSnap.data()?.installmentPlan?.installments;
      if (Array.isArray(installments)) {
        const updated = installments.map((inst: Record<string, unknown>) =>
          Number(inst.installmentNumber) === installmentNumber
            ? { ...inst, status: "paid", paidAt: new Date().toISOString(), razorpayPaymentId }
            : inst,
        );
        const allPaid = updated.every((inst: Record<string, unknown>) => inst.status === "paid");
        await enrollmentRef.update({
          "installmentPlan.installments": updated,
          "installmentPlan.status": allPaid ? "completed" : "active",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    } catch (error) {
      console.error("EMI installment plan update failed", { feePaymentId, error });
    }
  }

  await sendClassFeeNotifications("paid", notificationContextFromFee(feePaymentId, { ...fee, status: "paid" }))
    .catch((error) => console.error("Class fee paid notification failed", { feePaymentId, error }));
}

async function markClassFeeFailed(feePaymentId: string) {
  const db = getFirebaseAdminDb();
  const feeRef = db.collection(FEE_PAYMENTS_COLLECTION).doc(feePaymentId);
  const snapshot = await feeRef.get();
  if (!snapshot.exists) return;

  const fee = snapshot.data() || {};
  if (fee.status === "paid" || fee.status === "waived") return;

  await feeRef.update({ status: "failed", updatedAt: FieldValue.serverTimestamp() });
  await sendClassFeeNotifications("failed", notificationContextFromFee(feePaymentId, fee))
    .catch((error) => console.error("Class fee failed notification failed", { feePaymentId, error }));
}

// --- Subscription (autopay) flow --------------------------------------------

async function loadEnrollmentForSubscription(notesEnrollmentId: string, subscriptionId: string) {
  const db = getFirebaseAdminDb();
  if (notesEnrollmentId) {
    const byId = await db.collection(ENROLLMENTS_COLLECTION).doc(notesEnrollmentId).get();
    if (byId.exists) return byId;
  }
  const bySub = await db
    .collection(ENROLLMENTS_COLLECTION)
    .where("autopay.razorpaySubscriptionId", "==", subscriptionId)
    .limit(1)
    .get();
  return bySub.empty ? null : bySub.docs[0];
}

async function handleSubscriptionEvent(event: string, subscription: RazorpaySubscriptionEntity, payment?: RazorpayPaymentEntity) {
  const subscriptionId = subscription.id || "";
  if (!subscriptionId) return;

  const enrollmentDoc = await loadEnrollmentForSubscription(subscription.notes?.enrollmentId || "", subscriptionId);
  if (!enrollmentDoc) {
    console.warn("Webhook: no enrollment for subscription", { subscriptionId, event });
    return;
  }

  const enrollment = { id: enrollmentDoc.id, ...(enrollmentDoc.data() as Omit<EnrollmentRecord, "id">) };
  const db = getFirebaseAdminDb();

  if (event === "subscription.authenticated") {
    await enrollmentDoc.ref.update({
      "autopay.enabled": true,
      "autopay.mandateStatus": "authenticated",
      "autopay.authorizedAt": FieldValue.serverTimestamp(),
      status: "active",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  if (event === "subscription.activated") {
    await enrollmentDoc.ref.update({
      "autopay.enabled": true,
      "autopay.mandateStatus": "active",
      status: "active",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  if (event === "subscription.charged") {
    const cycleStart = subscription.current_start ? new Date(subscription.current_start * 1000) : new Date();
    const monthKey = monthKeyFor(cycleStart);
    const { id: feeId, data: feeData } = await ensureFeePayment(db, enrollment, monthKey);

    if (feeData.status !== "paid") {
      await markClassFeePaid(feeId, payment?.id || "", "autopay", subscriptionId);
    }

    await enrollmentDoc.ref.update({
      "autopay.enabled": true,
      "autopay.mandateStatus": "active",
      "autopay.nextChargeAt": subscription.charge_at ? new Date(subscription.charge_at * 1000).toISOString() : "",
      status: "active",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  if (event === "subscription.pending" || event === "subscription.halted") {
    await enrollmentDoc.ref.update({
      "autopay.mandateStatus": "halted",
      "autopay.enabled": false,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const monthKey = monthKeyFor(new Date());
    const { id: feeId, data: feeData } = await ensureFeePayment(db, enrollment, monthKey);
    if (feeData.status === "pending" || feeData.status === "processing") {
      await markClassFeeFailed(feeId);
    }
    return;
  }

  if (event === "subscription.cancelled" || event === "subscription.completed") {
    await enrollmentDoc.ref.update({
      "autopay.mandateStatus": "cancelled",
      "autopay.enabled": false,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

// --- EMI Subscription (autopay) & Manual fallback flow ---------------------

async function handleEmiSubscriptionEvent(event: string, subscription: RazorpaySubscriptionEntity, payment?: RazorpayPaymentEntity) {
  const subscriptionId = subscription.id || "";
  if (!subscriptionId) return;

  const orderDocumentId = subscription.notes?.orderDocumentId || "";
  if (!orderDocumentId) return;

  const db = getFirebaseAdminDb();
  const orderRef = db.collection("orders").doc(orderDocumentId);
  const orderDoc = await orderRef.get();

  if (!orderDoc.exists) return;
  const orderData = orderDoc.data() || {};
  const paymentInfo = orderData.payment || {};

  if (event === "subscription.authenticated") {
    await orderRef.update({
      "payment.emiSubscription.mandateStatus": "authenticated",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  if (event === "subscription.activated") {
    await orderRef.update({
      "payment.emiSubscription.mandateStatus": "active",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  if (event === "subscription.charged") {
    // A recurring charge succeeded
    const installments = paymentInfo.installmentPlan?.installments || [];
    const pendingInstallment = installments.find((inst: any) => inst.status === "pending");
    
    if (pendingInstallment) {
      pendingInstallment.status = "paid";
      pendingInstallment.paidAt = new Date().toISOString();
      pendingInstallment.razorpayPaymentId = payment?.id || "";
      pendingInstallment.paymentMethod = "autopay";

      const allPaid = installments.every((inst: any) => inst.status === "paid");

      await orderRef.update({
        "payment.installmentPlan.installments": installments,
        ...(allPaid ? { "payment.status": "paid", "payment.installmentPlan.status": "completed" } : {}),
        "payment.emiSubscription.mandateStatus": "active",
        updatedAt: FieldValue.serverTimestamp(),
      });
      
      void sendEmiInstallmentNotification({
        orderId: orderDocumentId,
        installmentNumber: Number(pendingInstallment.installmentNumber),
        status: "paid",
        amountInPaise: Number(pendingInstallment.amountInPaise || 0)
      }).catch((err) => console.error("Failed to send EMI notification", err));
    }
    return;
  }

  if (event === "subscription.pending" || event === "subscription.halted") {
    await orderRef.update({
      "payment.emiSubscription.mandateStatus": "halted",
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  if (event === "subscription.cancelled" || event === "subscription.completed") {
    await orderRef.update({
      "payment.emiSubscription.mandateStatus": event === "subscription.cancelled" ? "cancelled" : "completed",
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

async function handleEmiInstallmentCaptured(payment: RazorpayPaymentEntity, notes: Record<string, string>) {
  const orderDocumentId = notes.orderDocumentId || "";
  const installmentNumber = Number(notes.installmentNumber || 0);
  const razorpayPaymentId = payment.id || "";

  if (!orderDocumentId || !installmentNumber) return;

  const db = getFirebaseAdminDb();
  const orderRef = db.collection("orders").doc(orderDocumentId);
  const orderDoc = await orderRef.get();

  if (!orderDoc.exists) return;
  const orderData = orderDoc.data() || {};
  const paymentInfo = orderData.payment || {};
  const installments = paymentInfo.installmentPlan?.installments || [];

  const targetInstallment = installments.find((inst: any) => inst.installmentNumber === installmentNumber);
  
  if (targetInstallment && Math.round(Number(payment.amount)) < Math.round(Number(targetInstallment.amountInPaise || 0))) {
    console.warn("Webhook: EMI installment payment is less than the installment", { orderDocumentId, installmentNumber });
    return;
  }

  if (targetInstallment && targetInstallment.status !== "paid") {
    targetInstallment.status = "paid";
    targetInstallment.paidAt = new Date().toISOString();
    targetInstallment.razorpayPaymentId = razorpayPaymentId;
    targetInstallment.paymentMethod = "manual";

    const allPaid = installments.every((inst: any) => inst.status === "paid");

    await orderRef.update({
      "payment.installmentPlan.installments": installments,
      ...(allPaid ? { "payment.status": "paid", "payment.installmentPlan.status": "completed" } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    void sendEmiInstallmentNotification({
      orderId: orderDocumentId,
      installmentNumber: Number(targetInstallment.installmentNumber),
      status: "paid",
      amountInPaise: Number(targetInstallment.amountInPaise || 0)
    }).catch((err) => console.error("Failed to send EMI notification", err));
  }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requirePost(request, response)) return;

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || "";
  if (!webhookSecret) {
    sendError(response, 500, "Webhook secret is not configured.");
    return;
  }

  const rawBody = await getRawBody(request);
  const signature = (request.headers["x-razorpay-signature"] as string) || "";

  if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    sendError(response, 400, "Invalid webhook signature.");
    return;
  }

  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
  } catch {
    sendError(response, 400, "Invalid JSON payload.");
    return;
  }

  const event = payload.event || "";
  const payment = payload.payload?.payment?.entity;
  const subscription = payload.payload?.subscription?.entity;
  const refund = payload.payload?.refund?.entity;

  try {
    if (event === "payment.captured" && payment) {
      const notes = await trustedOrderNotes(payment);
      if (notes?.kind === "class-fee" && notes.feePaymentId) {
        await markClassFeePaid(notes.feePaymentId, payment.id || "", "manual", undefined, {
          orderId: payment.order_id || "",
          amountInPaise: Math.round(Number(payment.amount) || 0),
        });
      } else if (notes?.kind === "emi-installment" && notes.orderDocumentId) {
        await handleEmiInstallmentCaptured(payment, notes);
      } else if (notes?.kind === "elearn") {
        // E-Learning course purchase: same activation as elearn-verify, checked
        // against the stored Razorpay order (amount, currency, uid, course).
        try {
          await activateElearnFromWebhook(getFirebaseAdminDb(), payment);
        } catch (error) {
          // A mismatch is permanent (ACK); anything else (Firestore down…) is retried.
          if (error instanceof ElearnError) throw error;
          throw new RetryableWebhookError(String(error));
        }
      } else if (notes) {
        await handleOrderCaptured(payment);
      }
    } else if (event === "payment.failed" && payment?.order_id) {
      const notes = await trustedOrderNotes(payment).catch(() => null);
      if (notes?.kind === "class-fee" && notes.feePaymentId) await markClassFeeFailed(notes.feePaymentId);
    } else if (event === "refund.processed" && refund?.payment_id) {
      try {
        await revokeElearnForRefund(getFirebaseAdminDb(), refund);
      } catch (error) {
        throw new RetryableWebhookError(String(error));
      }
    } else if (event.startsWith("subscription.") && subscription) {
      if (subscription.notes?.kind === "emi-order") {
        await handleEmiSubscriptionEvent(event, subscription, payment);
      } else {
        await handleSubscriptionEvent(event, subscription, payment);
      }
    }
  } catch (error) {
    console.error("Webhook: error handling event", { event, error });
    if (error instanceof RetryableWebhookError) {
      // Razorpay retries with back-off, so a paid course is not left locked.
      sendError(response, 503, "Temporary error, please retry.");
      return;
    }
    // Otherwise ACK so Razorpay does not retry a permanent problem endlessly.
  }

  sendJson(response, 200, { received: true });
}
