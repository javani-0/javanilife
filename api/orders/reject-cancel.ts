import { getFirebaseAdminAuth, getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import {
  createTimelineEvent,
  getString,
  normalizeCancellationReason,
  requireOpenCancellationRequest,
  type OrderSnapshot,
} from "../_lib/order-delivery.js";

interface RejectCancelBody {
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
    const body = await readJsonBody<RejectCancelBody>(request);
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
      sendError(response, 403, "Only admins can reject cancellation requests.");
      return;
    }
    if (!orderSnapshot.exists) {
      sendError(response, 404, "Order was not found.");
      return;
    }

    const order = orderSnapshot.data() as OrderSnapshot;
    requireOpenCancellationRequest(order);

    await orderSnapshot.ref.update({
      "cancellation.status": "rejected",
      "cancellation.rejectedAt": FieldValue.serverTimestamp(),
      "cancellation.rejectedBy": decoded.uid,
      "cancellation.adminNote": adminNote,
      timeline: FieldValue.arrayUnion(createTimelineEvent(order.status || "placed", "Cancellation rejected", adminNote || "Admin rejected the cancellation request.", decoded.uid)),
      updatedAt: FieldValue.serverTimestamp(),
    });

    sendJson(response, 200, {
      ok: true,
      orderId,
      cancellationStatus: "rejected",
      message: "Cancellation request rejected.",
    });
  } catch (error) {
    console.error("Unable to reject order cancellation", error);
    sendError(response, 500, error instanceof Error ? error.message : "Unable to reject order cancellation.");
  }
}