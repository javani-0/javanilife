import { getFirebaseAdminAuth, getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import {
  assertDeliveryOneEligible,
  createDeliveryOneShipmentPayload,
  fetchDeliveryOneLabelUrl,
  hasDeliveryOneApiConfig,
  normalizeDeliveryOneLabelPdfSize,
  pushDeliveryOneOrder,
  scheduleDeliveryOnePickup,
} from "../_lib/delivery-one.js";

interface SyncDeliveryBody {
  orderId?: string;
  action?: "sync" | "label" | "pickup";
  pdfSize?: string;
  pickupDate?: string;
  pickupTime?: string;
  pickupLocation?: string;
  expectedPackageCount?: number;
}

const getString = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const getNumber = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const getRecord = (value: unknown): Record<string, unknown> => (
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {}
);

const createTimelineEvent = (order: { status?: string }, label: string, note: string, createdBy: string) => ({
  status: getString(order.status, "placed"),
  label,
  note,
  createdAt: new Date().toISOString(),
  createdBy,
});

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requirePost(request, response)) return;

  const idToken = getBearerToken(request);
  if (!idToken) {
    sendError(response, 401, "Missing Authorization bearer token.");
    return;
  }

  try {
    const body = await readJsonBody<SyncDeliveryBody>(request);
    const orderId = getString(body.orderId).trim();
    const action = getString(body.action, "sync") as "sync" | "label" | "pickup";
    if (!orderId) {
      sendError(response, 400, "orderId is required.");
      return;
    }

    const decoded = await getFirebaseAdminAuth().verifyIdToken(idToken);
    const db = getFirebaseAdminDb();
    const [orderSnapshot, userSnapshot] = await Promise.all([
      db.doc(`orders/${orderId}`).get(),
      db.doc(`users/${decoded.uid}`).get(),
    ]);

    if (userSnapshot.data()?.role !== "admin") {
      sendError(response, 403, "Only admins can manage Delivery One orders.");
      return;
    }
    if (!orderSnapshot.exists) {
      sendError(response, 404, "Order was not found.");
      return;
    }

    const order = orderSnapshot.data() || {};

    if (action === "label" || action === "pickup") {
      const delivery = getRecord(order.delivery);
      const waybill = getString(delivery.trackingNumber).trim();
      if (!waybill) {
        sendError(response, 400, "This order does not have a Delhivery waybill yet. Manifest the shipment first.");
        return;
      }

      if (action === "label") {
        const pdfSize = normalizeDeliveryOneLabelPdfSize(body.pdfSize);
        const labelUrl = await fetchDeliveryOneLabelUrl(waybill, pdfSize);
        await orderSnapshot.ref.update({
          "delivery.labelUrl": labelUrl,
          "delivery.labelPdfSize": pdfSize,
          "delivery.labelFetchedAt": FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          timeline: FieldValue.arrayUnion(createTimelineEvent(
            order,
            "Shipping label ready",
            `Delhivery ${pdfSize} shipping label was generated for AWB ${waybill}.`,
            decoded.uid,
          )),
        });
        sendJson(response, 200, { ok: true, orderId, labelUrl, waybill, pdfSize });
        return;
      }

      // action === "pickup"
      const existingPickupId = getString(delivery.pickupId).trim();
      if (existingPickupId) {
        sendJson(response, 200, { ok: true, orderId, pickupId: existingPickupId, message: "Pickup already scheduled for this waybill." });
        return;
      }
      const { pickupId, pickupDate, pickupTime, pickupLocation, expectedPackageCount, message } = await scheduleDeliveryOnePickup(waybill, {
        pickupDate: body.pickupDate,
        pickupTime: body.pickupTime,
        pickupLocation: body.pickupLocation,
        expectedPackageCount: getNumber(body.expectedPackageCount, 1),
      });
      const pickupOrderRef = db.doc(`orders/${orderId}`);
      await pickupOrderRef.update({
        "delivery.pickupId": pickupId || `requested-${pickupDate}`,
        "delivery.pickupDate": pickupDate,
        "delivery.pickupTime": pickupTime,
        "delivery.pickupLocation": pickupLocation,
        "delivery.expectedPackageCount": expectedPackageCount,
        "delivery.lifecycleStatus": "ready-for-pickup",
        updatedAt: FieldValue.serverTimestamp(),
        timeline: FieldValue.arrayUnion(createTimelineEvent(
          order,
          "Pickup scheduled",
          `Delhivery pickup scheduled for ${pickupDate} at ${pickupTime}${pickupId ? ` (ID: ${pickupId})` : ""}.`,
          decoded.uid,
        )),
      });
      sendJson(response, 200, { ok: true, orderId, pickupId, pickupDate, pickupTime, pickupLocation, expectedPackageCount, message });
      return;
    }

    assertDeliveryOneEligible(order);

    const existingDelivery = getRecord(order.delivery);
    const existingProviderOrderId = getString(existingDelivery.providerOrderId);
    const existingTrackingNumber = getString(existingDelivery.trackingNumber);
    const existingTrackingUrl = getString(existingDelivery.trackingUrl);
    const existingProviderStatus = getString(existingDelivery.providerStatus);
    const existingLifecycleStatus = getString(existingDelivery.lifecycleStatus);

    if (existingProviderOrderId || existingTrackingNumber) {
      if (!existingLifecycleStatus) {
        await orderSnapshot.ref.update({
          "delivery.lifecycleStatus": getString(existingDelivery.pickupId) ? "ready-for-pickup" : "ready-to-ship",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      sendJson(response, 200, {
        ok: true,
        orderId,
        syncStatus: "synced",
        mode: "api-sync",
        lifecycleStatus: existingLifecycleStatus || (getString(existingDelivery.pickupId) ? "ready-for-pickup" : "ready-to-ship"),
        providerOrderId: existingProviderOrderId,
        trackingNumber: existingTrackingNumber,
        trackingUrl: existingTrackingUrl,
        providerStatus: existingProviderStatus,
        message: "This order is already manifested with Delhivery. Saved tracking details were returned.",
      });
      return;
    }

    const payload = createDeliveryOneShipmentPayload(orderId, order);
    const orderRef = db.doc(`orders/${orderId}`);

    if (!hasDeliveryOneApiConfig()) {
      await orderRef.update({
        "delivery.provider": "delivery-one",
        "delivery.syncStatus": "manual-ready",
        "delivery.lifecycleStatus": "pending",
        "delivery.lastSyncedAt": FieldValue.serverTimestamp(),
        "delivery.lastSyncError": FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
        timeline: FieldValue.arrayUnion(createTimelineEvent(
          order,
          "Manifest payload prepared",
          "Order shipment details are ready for manual Delhivery handoff. Configure Delivery One API credentials to manifest automatically.",
          decoded.uid,
        )),
      });

      sendJson(response, 200, {
        ok: true,
        orderId,
        syncStatus: "manual-ready",
        mode: "manual-ready",
        lifecycleStatus: "pending",
        message: "Delivery One API credentials are not configured. Manual-ready manifest payload was prepared.",
        payload,
      });
      return;
    }

    await orderRef.update({
      "delivery.provider": "delivery-one",
      "delivery.syncStatus": "pending",
      "delivery.lifecycleStatus": "pending",
      "delivery.lastSyncError": FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    try {
      const providerResult = await pushDeliveryOneOrder(payload);
      await orderRef.update({
        "delivery.syncStatus": "synced",
        "delivery.providerOrderId": providerResult.providerOrderId || FieldValue.delete(),
        "delivery.trackingNumber": providerResult.trackingNumber || FieldValue.delete(),
        "delivery.trackingUrl": providerResult.trackingUrl || FieldValue.delete(),
        "delivery.providerStatus": providerResult.providerStatus || FieldValue.delete(),
        "delivery.lifecycleStatus": "ready-to-ship",
        "delivery.manifestedAt": FieldValue.serverTimestamp(),
        "delivery.lastSyncedAt": FieldValue.serverTimestamp(),
        "delivery.lastSyncError": FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
        timeline: FieldValue.arrayUnion(createTimelineEvent(
          order,
          "Order manifested",
          "Order was manifested with Delhivery and AWB tracking details were stored.",
          decoded.uid,
        )),
      });

      sendJson(response, 200, {
        ok: true,
        orderId,
        syncStatus: "synced",
        mode: "api-sync",
        lifecycleStatus: "ready-to-ship",
        providerOrderId: providerResult.providerOrderId,
        trackingNumber: providerResult.trackingNumber,
        trackingUrl: providerResult.trackingUrl,
        providerStatus: providerResult.providerStatus,
      });
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : "Delivery One API sync failed.";
      console.error("[sync-delivery] Delhivery push failed for order", orderId, "—", message);
      // Auto-push failed — fall back to manual-ready so the payload is still
      // usable and the admin can manually enter tracking details or retry later.
      await orderRef.update({
        "delivery.syncStatus": "manual-ready",
        "delivery.lifecycleStatus": "pending",
        "delivery.lastSyncedAt": FieldValue.serverTimestamp(),
        "delivery.lastSyncError": message,
        updatedAt: FieldValue.serverTimestamp(),
        timeline: FieldValue.arrayUnion(createTimelineEvent(
          order,
          "Manifest payload prepared (auto-push failed)",
          `Shipment payload is ready for manual handoff. Manifest error: ${message}`,
          decoded.uid,
        )),
      });
      sendJson(response, 200, {
        ok: true,
        orderId,
        syncStatus: "manual-ready",
        mode: "manual-ready",
        lifecycleStatus: "pending",
        message: `Payload prepared. Delhivery manifest failed: ${message}`,
        payload,
      });
    }
  } catch (error) {
    console.error("Unable to manage Delivery One order", error);
    sendError(response, 500, error instanceof Error ? error.message : "Unable to manage Delivery One order.");
  }
}