import { getFirebaseAdminAuth, getFirebaseAdminDb } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { trackDeliveryOneShipment } from "../_lib/delivery-one.js";
import { createTrackingUpdatePayload, getString, type OrderSnapshot } from "../_lib/order-delivery.js";

interface TrackDeliveryBody {
  orderId?: string;
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requirePost(request, response)) return;

  const idToken = getBearerToken(request);
  if (!idToken) {
    sendError(response, 401, "Missing Authorization bearer token.");
    return;
  }

  try {
    const body = await readJsonBody<TrackDeliveryBody>(request);
    const orderId = getString(body.orderId).trim();

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
      sendError(response, 403, "Only admins can refresh Delivery One tracking.");
      return;
    }
    if (!orderSnapshot.exists) {
      sendError(response, 404, "Order was not found.");
      return;
    }

    const order = orderSnapshot.data() as OrderSnapshot;
    const waybill = getString(order.delivery?.trackingNumber).trim();
    if (!waybill) {
      sendError(response, 409, "This order does not have a Delivery One tracking number yet.");
      return;
    }

    const update = await trackDeliveryOneShipment(waybill, order.orderNumber || orderId);
    await orderSnapshot.ref.update(createTrackingUpdatePayload({ order, update, createdBy: decoded.uid }));

    sendJson(response, 200, {
      ok: true,
      orderId,
      trackingNumber: update.trackingNumber || waybill,
      providerStatus: update.providerStatus,
      providerStatusType: update.providerStatusType,
      orderStatus: update.orderStatus,
      message: "Delivery One tracking refreshed.",
    });
  } catch (error) {
    console.error("Unable to refresh Delivery One tracking", error);
    sendError(response, 500, error instanceof Error ? error.message : "Unable to refresh Delivery One tracking.");
  }
}