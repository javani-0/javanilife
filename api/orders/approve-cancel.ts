import { getFirebaseAdminAuth, getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { cancelDeliveryOnePickup, cancelDeliveryOneShipment, isUsableDeliveryOnePickupId } from "../_lib/delivery-one.js";
import {
  createTimelineEvent,
  getCancellationStatus,
  getString,
  isFinalOrderStatus,
  normalizeCancellationReason,
  orderStatusLabels,
  type OrderSnapshot,
} from "../_lib/order-delivery.js";
import { runOrderAutomation } from "./notify.js";

interface ApproveCancelBody {
  orderId?: string;
  adminNote?: string;
}

type PickupCancellationStatus = "cancelled" | "not-required" | "failed" | "manual-required";

const pickupCancellationClosedStatuses = new Set(["cancelled", "not-required"]);

const createPickupCancelledMessage = (pickupId: string) => `Pickup request ${pickupId} was cancelled from Javani dashboard.`;
const createPickupCancellationFailureMessage = (pickupId: string, reason: string) => `Pickup request ${pickupId} cancellation failed: ${reason}`;
const requiresManualPickupConfig = (message: string) => message.toLowerCase().includes("pickup-slot cancellation endpoint is not configured");

const getPickupCancellationResult = async (pickupId: string, currentStatus: string, pickupRequestStatus = "", waybill = ""): Promise<{
  status?: PickupCancellationStatus;
  message?: string;
  timelineLabel?: string;
  shouldPersist: boolean;
}> => {
  if (!isUsableDeliveryOnePickupId(pickupId)) {
    if (pickupRequestStatus === "id-missing") {
      return {
        status: "failed",
        message: "Javani does not have a real Delhivery pickup ID for this pickup request, so it cannot cancel the pickup slot from the dashboard. Future pickup requests will no longer be saved without a real Delhivery ID.",
        timelineLabel: "Pickup cancellation skipped",
        shouldPersist: true,
      };
    }

    return {
      status: currentStatus === "not-required" ? undefined : "not-required",
      message: "No Delhivery pickup request was booked for this order.",
      shouldPersist: currentStatus !== "not-required",
    };
  }

  if (pickupCancellationClosedStatuses.has(currentStatus)) {
    return { shouldPersist: false };
  }

  try {
    const result = await cancelDeliveryOnePickup(pickupId, waybill);
    return {
      status: "cancelled",
      message: result.message || createPickupCancelledMessage(pickupId),
      timelineLabel: "Pickup cancelled",
      shouldPersist: true,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Delhivery pickup cancellation failed.";
    return {
      status: requiresManualPickupConfig(reason) ? "manual-required" : "failed",
      message: createPickupCancellationFailureMessage(pickupId, reason),
      timelineLabel: "Pickup cancellation failed",
      shouldPersist: true,
    };
  }
};

const applyPickupCancellationPayload = (payload: Record<string, unknown>, status?: PickupCancellationStatus, message?: string) => {
  if (!status) return;
  payload["delivery.pickupCancellationStatus"] = status;
  payload["delivery.pickupCancellationReason"] = message || FieldValue.delete();

  if (status === "cancelled") {
    payload["delivery.pickupCancelledAt"] = FieldValue.serverTimestamp();
    payload["delivery.pickupCancellationMarkedAt"] = FieldValue.delete();
    return;
  }

  if (status === "failed" || status === "manual-required") {
    payload["delivery.pickupCancellationMarkedAt"] = FieldValue.serverTimestamp();
    return;
  }

  payload["delivery.pickupCancellationMarkedAt"] = FieldValue.delete();
};

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
    const pickupRequestStatus = getString(order.delivery?.pickupRequestStatus).trim();
    const currentPickupCancellationStatus = getString(order.delivery?.pickupCancellationStatus).trim();

    if (order.status === "cancelled") {
      const waybill = getString(order.delivery?.trackingNumber).trim();
      const pickupCancellation = await getPickupCancellationResult(pickupId, currentPickupCancellationStatus, pickupRequestStatus, waybill);
      if (pickupCancellation.shouldPersist) {
        const payload: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
        applyPickupCancellationPayload(payload, pickupCancellation.status, pickupCancellation.message);
        if (pickupCancellation.status !== "not-required" && pickupCancellation.timelineLabel && pickupCancellation.message) {
          payload.timeline = FieldValue.arrayUnion(createTimelineEvent(
            "cancelled",
            pickupCancellation.timelineLabel,
            pickupCancellation.message,
            decoded.uid,
          ));
        }
        await orderSnapshot.ref.update(payload);
      }

      sendJson(response, 200, {
        ok: true,
        orderId,
        cancellationStatus: "approved",
        pickupCancellationStatus: pickupCancellation.status || currentPickupCancellationStatus || undefined,
        pickupCancellationMessage: pickupCancellation.message || undefined,
        message: pickupCancellation.message || "Order is already cancelled.",
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
    const pickupCancellation = await getPickupCancellationResult(pickupId, currentPickupCancellationStatus, pickupRequestStatus, waybill);
    const timelineEvents = [createTimelineEvent(
      "cancelled",
      orderStatusLabels.cancelled,
      adminNote || (hadCustomerRequest ? "Admin approved the customer's cancellation request." : "Admin cancelled this order."),
      decoded.uid,
    )];

    if (pickupCancellation.status !== "not-required" && pickupCancellation.timelineLabel && pickupCancellation.message) {
      timelineEvents.push(createTimelineEvent(
        "cancelled",
        pickupCancellation.timelineLabel,
        pickupCancellation.message,
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

    applyPickupCancellationPayload(payload, pickupCancellation.status, pickupCancellation.message);

    if (providerResult?.providerStatus) payload["delivery.providerStatus"] = providerResult.providerStatus;
    if (providerResult?.providerStatusType) payload["delivery.providerStatusType"] = providerResult.providerStatusType;
    if (providerResult?.trackingNumber) payload["delivery.trackingNumber"] = providerResult.trackingNumber;

    await orderSnapshot.ref.update(payload);
    const automation = await runOrderAutomation({
      orderId,
      event: "order-status-updated",
      status: "cancelled",
      recordedBy: decoded.uid,
    }).catch((error) => {
      console.error("Unable to send cancellation automation", error);
      return null;
    });

    sendJson(response, 200, {
      ok: true,
      orderId,
      cancellationStatus: "approved",
      providerCancelled: Boolean(waybill),
      providerStatus: providerResult?.providerStatus,
      pickupCancellationStatus: pickupCancellation.status,
      pickupCancellationMessage: pickupCancellation.message,
      notificationStatus: automation?.warnings?.length ? "attention" : automation ? "sent" : "failed",
      message: pickupCancellation.message || (waybill ? "Order cancelled and Delhivery cancellation was requested." : "Order cancelled. No Delhivery waybill was present."),
    });
  } catch (error) {
    console.error("Unable to approve order cancellation", error);
    sendError(response, 500, error instanceof Error ? error.message : "Unable to approve order cancellation.");
  }
}