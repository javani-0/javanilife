import { getFirebaseAdminAuth, getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { cancelDeliveryOneShipment } from "../_lib/delivery-one.js";
import {
  createTimelineEvent,
  getCancellationStatus,
  getString,
  isFinalOrderStatus,
  normalizeCancellationReason,
  orderStatusLabels,
  type OrderSnapshot,
} from "../_lib/order-delivery.js";

interface ApproveCancelBody {
  orderId?: string;
  adminNote?: string;
}

const pickupCancellationClosedStatuses = new Set(["manual-required", "cancelled", "not-required"]);

const createPickupCancellationMessage = (pickupId: string) => (
  `Pickup request ${pickupId} may still show Scheduled in Delhivery One. Cancel it from Delhivery One > Pickup Requests if no other AWBs are attached.`
);

const shouldMarkPickupCancellationRequired = (pickupId: string, currentStatus: string) => (
  Boolean(pickupId) && !pickupCancellationClosedStatuses.has(currentStatus)
);

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requirePost(request, response)) return;

  const idToken = getBearerToken(request);
  if (!idToken) {
    sendError(response, 401, "Missing Authorization bearer token.");
    return;
  }

  try {
    const body = await readJsonBody<ApproveCancelBody>(request);
    const orderId = getString(body.orderId).trim();
    const adminNote = normalizeCancellationReason(body.adminNote);

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
      sendError(response, 403, "Only admins can approve cancellation requests.");
      return;
    }
    if (!orderSnapshot.exists) {
      sendError(response, 404, "Order was not found.");
      return;
    }

    const order = orderSnapshot.data() as OrderSnapshot;
    const pickupId = getString(order.delivery?.pickupId).trim();
    const currentPickupCancellationStatus = getString(order.delivery?.pickupCancellationStatus).trim();
    const needsManualPickupCancellation = shouldMarkPickupCancellationRequired(pickupId, currentPickupCancellationStatus);
    const pickupCancellationMessage = needsManualPickupCancellation ? createPickupCancellationMessage(pickupId) : "";

    if (order.status === "cancelled") {
      if (needsManualPickupCancellation) {
        await orderSnapshot.ref.update({
          "delivery.pickupCancellationStatus": "manual-required",
          "delivery.pickupCancellationReason": pickupCancellationMessage,
          "delivery.pickupCancellationMarkedAt": FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          timeline: FieldValue.arrayUnion(createTimelineEvent(
            "cancelled",
            "Pickup cancellation needed",
            pickupCancellationMessage,
            decoded.uid,
          )),
        });
      }

      sendJson(response, 200, {
        ok: true,
        orderId,
        cancellationStatus: "approved",
        pickupCancellationStatus: needsManualPickupCancellation ? "manual-required" : currentPickupCancellationStatus,
        pickupCancellationMessage: pickupCancellationMessage || undefined,
        message: pickupCancellationMessage || "Order is already cancelled.",
      });
      return;
    }
    if (isFinalOrderStatus(order.status)) {
      sendError(response, 409, "Delivered or returned orders cannot be cancelled from this flow.");
      return;
    }

    const hadCustomerRequest = getCancellationStatus(order) === "requested";
    const waybill = getString(order.delivery?.trackingNumber).trim();
    const providerResult = waybill ? await cancelDeliveryOneShipment(waybill) : null;
    const timelineEvents = [createTimelineEvent(
      "cancelled",
      orderStatusLabels.cancelled,
      adminNote || (hadCustomerRequest ? "Admin approved the customer's cancellation request." : "Admin cancelled this order."),
      decoded.uid,
    )];

    if (needsManualPickupCancellation) {
      timelineEvents.push(createTimelineEvent(
        "cancelled",
        "Pickup cancellation needed",
        pickupCancellationMessage,
        decoded.uid,
      ));
    }

    const payload: Record<string, unknown> = {
      status: "cancelled",
      "delivery.status": "cancelled",
      "delivery.lifecycleStatus": "cancelled",
      "delivery.cancelledAt": FieldValue.serverTimestamp(),
      "delivery.lastSyncedAt": FieldValue.serverTimestamp(),
      "cancellation.status": "approved",
      "cancellation.approvedAt": FieldValue.serverTimestamp(),
      "cancellation.approvedBy": decoded.uid,
      "cancellation.adminNote": adminNote,
      updatedAt: FieldValue.serverTimestamp(),
      timeline: FieldValue.arrayUnion(...timelineEvents),
    };

    if (needsManualPickupCancellation) {
      payload["delivery.pickupCancellationStatus"] = "manual-required";
      payload["delivery.pickupCancellationReason"] = pickupCancellationMessage;
      payload["delivery.pickupCancellationMarkedAt"] = FieldValue.serverTimestamp();
    }

    if (providerResult?.providerStatus) payload["delivery.providerStatus"] = providerResult.providerStatus;
    if (providerResult?.providerStatusType) payload["delivery.providerStatusType"] = providerResult.providerStatusType;
    if (providerResult?.trackingNumber) payload["delivery.trackingNumber"] = providerResult.trackingNumber;

    await orderSnapshot.ref.update(payload);

    sendJson(response, 200, {
      ok: true,
      orderId,
      cancellationStatus: "approved",
      providerCancelled: Boolean(waybill),
      providerStatus: providerResult?.providerStatus,
      pickupCancellationStatus: needsManualPickupCancellation ? "manual-required" : undefined,
      pickupCancellationMessage: pickupCancellationMessage || undefined,
      message: pickupCancellationMessage || (waybill ? "Order cancelled and Delhivery cancellation was requested." : "Order cancelled. No Delhivery waybill was present."),
    });
  } catch (error) {
    console.error("Unable to approve order cancellation", error);
    sendError(response, 500, error instanceof Error ? error.message : "Unable to approve order cancellation.");
  }
}