import { getFirebaseAdminAuth, getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import {
  assertDeliveryOneEligible,
  cancelDeliveryOnePickup,
  createDeliveryOneShipmentPayload,
  fetchDeliveryOneLabelUrl,
  hasDeliveryOneApiConfig,
  isUsableDeliveryOnePickupId,
  normalizeDeliveryOneLabelPdfSize,
  pushDeliveryOneOrder,
  scheduleDeliveryOnePickup,
} from "../_lib/delivery-one.js";

interface SyncDeliveryBody {
  orderId?: string;
  action?: "sync" | "label" | "pickup" | "cancel-pickup" | "mark-pickup-cancelled";
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

const requiresManualPickupConfig = (message: string) => message.toLowerCase().includes("pickup-slot cancellation endpoint is not configured");

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
    const action = getString(body.action, "sync") as "sync" | "label" | "pickup" | "cancel-pickup" | "mark-pickup-cancelled";
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

    if (action === "mark-pickup-cancelled") {
      if (getString(order.status) !== "cancelled") {
        sendError(response, 409, "Pickup can only be marked as manually cancelled after the order is cancelled.");
        return;
      }
      const delivery = getRecord(order.delivery);
      const pickupId = getString(delivery.pickupId).trim();
      const message = `Pickup request ${pickupId} was manually cancelled on Delhivery One dashboard.`;
      await orderSnapshot.ref.update({
        "delivery.pickupCancellationStatus": "cancelled",
        "delivery.pickupCancellationReason": message,
        "delivery.pickupCancelledAt": FieldValue.serverTimestamp(),
        "delivery.pickupCancellationMarkedAt": FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        timeline: FieldValue.arrayUnion(createTimelineEvent(
          order,
          "Pickup manually cancelled",
          message,
          decoded.uid,
        )),
      });
      sendJson(response, 200, { ok: true, orderId, pickupId, pickupCancellationStatus: "cancelled", message });
      return;
    }

    if (action === "label" || action === "pickup" || action === "cancel-pickup") {
      const delivery = getRecord(order.delivery);

      if (action === "cancel-pickup") {
        if (getString(order.status) !== "cancelled") {
          sendError(response, 409, "Pickup cancellation is only available after the order is cancelled.");
          return;
        }

        const pickupId = getString(delivery.pickupId).trim();
        if (!isUsableDeliveryOnePickupId(pickupId)) {
          const pickupRequestStatus = getString(delivery.pickupRequestStatus).trim();
          const message = pickupRequestStatus === "id-missing"
            ? "Javani does not have a real Delhivery pickup ID for this pickup request, so it cannot cancel the pickup slot from the dashboard. Future pickup requests will no longer be saved without a real Delhivery ID."
            : "No Delhivery pickup request was booked for this order.";
          await orderSnapshot.ref.update({
            "delivery.pickupId": FieldValue.delete(),
            "delivery.pickupCancellationStatus": pickupRequestStatus === "id-missing" ? "failed" : "not-required",
            "delivery.pickupCancellationReason": pickupRequestStatus === "id-missing" ? message : FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          sendJson(response, 200, {
            ok: true,
            orderId,
            pickupCancellationStatus: pickupRequestStatus === "id-missing" ? "failed" : "not-required",
            pickupCancellationMessage: pickupRequestStatus === "id-missing" ? message : undefined,
            message,
          });
          return;
        }

        const currentPickupCancellationStatus = getString(delivery.pickupCancellationStatus).trim();
        if (currentPickupCancellationStatus === "cancelled" || currentPickupCancellationStatus === "not-required") {
          sendJson(response, 200, {
            ok: true,
            orderId,
            pickupId,
            pickupCancellationStatus: currentPickupCancellationStatus,
            message: currentPickupCancellationStatus === "cancelled" ? "Pickup is already cancelled from Javani dashboard." : "No pickup cancellation is required for this order.",
          });
          return;
        }

        const waybill = getString(delivery.trackingNumber).trim();

        try {
          const pickupResult = await cancelDeliveryOnePickup(pickupId, waybill);
          const message = `Pickup request ${pickupId} was cancelled from Javani dashboard.`;
          await orderSnapshot.ref.update({
            "delivery.pickupCancellationStatus": "cancelled",
            "delivery.pickupCancellationReason": pickupResult.message || message,
            "delivery.pickupCancelledAt": FieldValue.serverTimestamp(),
            "delivery.pickupCancellationMarkedAt": FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
            timeline: FieldValue.arrayUnion(createTimelineEvent(
              order,
              "Pickup cancelled",
              message,
              decoded.uid,
            )),
          });
          sendJson(response, 200, { ok: true, orderId, pickupId, pickupCancellationStatus: "cancelled", message });
        } catch (pickupError) {
          const reason = pickupError instanceof Error ? pickupError.message : "Delhivery pickup cancellation failed.";
          const message = `Pickup request ${pickupId} cancellation failed: ${reason}`;
          const pickupCancellationStatus = requiresManualPickupConfig(reason) ? "manual-required" : "failed";
          await orderSnapshot.ref.update({
            "delivery.pickupCancellationStatus": pickupCancellationStatus,
            "delivery.pickupCancellationReason": message,
            "delivery.pickupCancellationMarkedAt": FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            timeline: FieldValue.arrayUnion(createTimelineEvent(
              order,
              "Pickup cancellation failed",
              message,
              decoded.uid,
            )),
          });
          sendJson(response, 200, { ok: true, orderId, pickupId, pickupCancellationStatus, pickupCancellationMessage: message, message });
        }
        return;
      }

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
      if (isUsableDeliveryOnePickupId(existingPickupId)) {
        sendJson(response, 200, { ok: true, orderId, pickupId: existingPickupId, message: "Pickup already scheduled for this waybill." });
        return;
      }
      if (existingPickupId) {
        const message = "This order has an old placeholder pickup ID, not a real Delhivery pickup ID. Javani will not create another pickup request until this state is reviewed.";
        await orderSnapshot.ref.update({
          "delivery.pickupId": FieldValue.delete(),
          "delivery.pickupRequestStatus": "id-missing",
          "delivery.pickupRequestMessage": message,
          "delivery.lifecycleStatus": "ready-to-ship",
          updatedAt: FieldValue.serverTimestamp(),
        });
        sendJson(response, 200, { ok: true, orderId, pickupRequestStatus: "id-missing", message });
        return;
      }
      const { pickupId, pickupDate, pickupTime, pickupLocation, expectedPackageCount, message, pickupRequestStatus } = await scheduleDeliveryOnePickup(waybill, {
        pickupDate: body.pickupDate,
        pickupTime: body.pickupTime,
        pickupLocation: body.pickupLocation,
        expectedPackageCount: getNumber(body.expectedPackageCount, 1),
      });
      const booked = isUsableDeliveryOnePickupId(pickupId);
      const pickupMessage = booked
        ? message
        : "Pickup request was sent to Delhivery, but Delhivery did not return a real pickup ID. Javani did not mark this order as pickup booked, so it will not try to cancel a fake pickup ID later.";
      const pickupOrderRef = db.doc(`orders/${orderId}`);
      await pickupOrderRef.update({
        "delivery.pickupId": booked ? pickupId : FieldValue.delete(),
        "delivery.pickupDate": pickupDate,
        "delivery.pickupTime": pickupTime,
        "delivery.pickupLocation": pickupLocation,
        "delivery.expectedPackageCount": expectedPackageCount,
        "delivery.pickupRequestStatus": pickupRequestStatus,
        "delivery.pickupRequestMessage": pickupMessage,
        "delivery.lifecycleStatus": booked ? "ready-for-pickup" : "ready-to-ship",
        updatedAt: FieldValue.serverTimestamp(),
        timeline: FieldValue.arrayUnion(createTimelineEvent(
          order,
          booked ? "Pickup scheduled" : "Pickup ID missing",
          booked
            ? `Delhivery pickup scheduled for ${pickupDate} at ${pickupTime} (ID: ${pickupId}).`
            : pickupMessage,
          decoded.uid,
        )),
      });
      sendJson(response, 200, { ok: true, orderId, pickupId: booked ? pickupId : undefined, pickupDate, pickupTime, pickupLocation, expectedPackageCount, pickupRequestStatus, message: pickupMessage });
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