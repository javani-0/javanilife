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
    if (order.status === "cancelled") {
      sendJson(response, 200, { ok: true, orderId, cancellationStatus: "approved", message: "Order is already cancelled." });
      return;
    }
    if (isFinalOrderStatus(order.status)) {
      sendError(response, 409, "Delivered or returned orders cannot be cancelled from this flow.");
      return;
    }

    const hadCustomerRequest = getCancellationStatus(order) === "requested";
    const waybill = getString(order.delivery?.trackingNumber).trim();
    const providerResult = waybill ? await cancelDeliveryOneShipment(waybill) : null;

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
      timeline: FieldValue.arrayUnion(createTimelineEvent(
        "cancelled",
        orderStatusLabels.cancelled,
        adminNote || (hadCustomerRequest ? "Admin approved the customer's cancellation request." : "Admin cancelled this order."),
        decoded.uid,
      )),
    };

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
      message: waybill ? "Order cancelled and Delhivery cancellation was requested." : "Order cancelled. No Delhivery waybill was present.",
    });
  } catch (error) {
    console.error("Unable to approve order cancellation", error);
    sendError(response, 500, error instanceof Error ? error.message : "Unable to approve order cancellation.");
  }
}