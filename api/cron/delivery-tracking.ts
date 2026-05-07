import { getFirebaseAdminDb } from "../_lib/firebase-admin.js";
import { sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { trackDeliveryOneShipment } from "../_lib/delivery-one.js";
import { createTrackingUpdatePayload, getString, type OrderSnapshot } from "../_lib/order-delivery.js";

const activeOrderStatuses = new Set(["placed", "confirmed", "packed", "shipped", "out-for-delivery"]);

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
  const configured = Number(process.env.DELIVERY_ONE_TRACKING_POLL_LIMIT || 20);
  return Number.isFinite(configured) ? Math.min(Math.max(1, Math.floor(configured)), 50) : 20;
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
  const limit = getPollLimit();
  const snapshot = await db.collection("orders").where("delivery.syncStatus", "==", "synced").limit(limit).get();
  const candidates = snapshot.docs
    .map((orderDocument) => ({ orderDocument, order: orderDocument.data() as OrderSnapshot }))
    .filter(({ order }) => activeOrderStatuses.has(getString(order.status, "placed")) && getString(order.delivery?.trackingNumber));

  const results = [];
  for (const { orderDocument, order } of candidates) {
    try {
      const trackingNumber = getString(order.delivery?.trackingNumber);
      const update = await trackDeliveryOneShipment(trackingNumber, order.orderNumber || orderDocument.id);
      await orderDocument.ref.update(createTrackingUpdatePayload({ order, update, createdBy: "delivery-one-cron" }));
      results.push({ orderId: orderDocument.id, status: "updated", providerStatus: update.providerStatus, orderStatus: update.orderStatus });
    } catch (error) {
      console.error("Unable to refresh Delivery One tracking from cron", orderDocument.id, error);
      results.push({ orderId: orderDocument.id, status: "failed", error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  sendJson(response, 200, {
    ok: true,
    scanned: snapshot.docs.length,
    attempted: candidates.length,
    results,
  });
}