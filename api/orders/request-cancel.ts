import { getFirebaseAdminAuth, getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import {
  createTimelineEvent,
  getCancellationStatus,
  getString,
  isFinalOrderStatus,
  normalizeCancellationReason,
  type OrderSnapshot,
} from "../_lib/order-delivery.js";

interface RequestCancelBody {
  orderId?: string;
  reason?: string;
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requirePost(request, response)) return;

  const idToken = getBearerToken(request);
  if (!idToken) {
    sendError(response, 401, "Missing Authorization bearer token.");
    return;
  }

  try {
    const body = await readJsonBody<RequestCancelBody>(request);
    const orderId = getString(body.orderId).trim();
    const reason = normalizeCancellationReason(body.reason);

    if (!orderId) {
      sendError(response, 400, "orderId is required.");
      return;
    }
    if (reason.length < 5) {
      sendError(response, 400, "Please provide a cancellation reason with at least 5 characters.");
      return;
    }

    const decoded = await getFirebaseAdminAuth().verifyIdToken(idToken);
    const orderRef = getFirebaseAdminDb().doc(`orders/${orderId}`);
    const orderSnapshot = await orderRef.get();

    if (!orderSnapshot.exists) {
      sendError(response, 404, "Order was not found.");
      return;
    }

    const order = orderSnapshot.data() as OrderSnapshot;
    if (order.customerId !== decoded.uid) {
      sendError(response, 403, "You can only request cancellation for your own orders.");
      return;
    }
    if (isFinalOrderStatus(order.status)) {
      sendError(response, 409, "This order is already completed, cancelled, or returned.");
      return;
    }
    if (getCancellationStatus(order) === "requested") {
      sendError(response, 409, "A cancellation request is already pending for this order.");
      return;
    }

    const status = order.status || "placed";
    await orderRef.update({
      cancellation: {
        status: "requested",
        reason,
        requestedAt: FieldValue.serverTimestamp(),
        requestedBy: decoded.uid,
      },
      timeline: FieldValue.arrayUnion(createTimelineEvent(status, "Cancellation requested", `Customer requested cancellation: ${reason}`, decoded.uid)),
      updatedAt: FieldValue.serverTimestamp(),
    });

    sendJson(response, 200, {
      ok: true,
      orderId,
      cancellationStatus: "requested",
      message: "Cancellation request sent to admin for approval.",
    });
  } catch (error) {
    console.error("Unable to request order cancellation", error);
    sendError(response, 500, error instanceof Error ? error.message : "Unable to request order cancellation.");
  }
}