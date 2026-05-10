import { readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { extractDeliveryOneWebhookUpdate } from "../_lib/delivery-one.js";
import { createTrackingUpdatePayload, findOrderByDeliveryOneUpdate, getString, type OrderSnapshot } from "../_lib/order-delivery.js";
import { runOrderAutomation, type OrderStatus } from "../orders/notify.js";

const notificationStatuses = new Set(["delivered", "cancelled"]);
const shouldNotifyStatus = (status?: string): status is OrderStatus => Boolean(status && notificationStatuses.has(status));

const getHeader = (request: ApiRequest, name: string) => {
  const direct = request.headers[name] || request.headers[name.toLowerCase()];
  return Array.isArray(direct) ? direct[0] : direct;
};

const getWebhookSecret = () => process.env.DELIVERY_ONE_WEBHOOK_SECRET?.trim() || process.env.DELHIVERY_WEBHOOK_SECRET?.trim() || "";

const isAuthorizedWebhook = (request: ApiRequest) => {
  const secret = getWebhookSecret();
  if (!secret) return false;

  const webhookSecret = getString(getHeader(request, "x-delivery-one-webhook-secret")) || getString(getHeader(request, "x-delhivery-webhook-secret"));
  if (webhookSecret && webhookSecret === secret) return true;

  const authorization = getString(getHeader(request, "authorization"));
  return authorization === `Bearer ${secret}` || authorization === `Token ${secret}`;
};

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requirePost(request, response)) return;

  if (!getWebhookSecret()) {
    sendError(response, 503, "Delivery One webhook secret is not configured.");
    return;
  }
  if (!isAuthorizedWebhook(request)) {
    sendError(response, 401, "Invalid Delivery One webhook secret.");
    return;
  }

  try {
    const body = await readJsonBody<unknown>(request);
    const update = extractDeliveryOneWebhookUpdate(body);

    if (!update.trackingNumber && !update.providerOrderId) {
      sendError(response, 400, "Webhook payload is missing waybill or order reference.");
      return;
    }

    const orderDocument = await findOrderByDeliveryOneUpdate(update);
    if (!orderDocument) {
      sendJson(response, 202, {
        ok: true,
        matched: false,
        message: "Webhook accepted, but no matching order was found.",
      });
      return;
    }

    const order = orderDocument.data() as OrderSnapshot;
    const nextStatus = update.orderStatus;
    await orderDocument.ref.update(createTrackingUpdatePayload({ order, update, createdBy: "delivery-one-webhook" }));
    const automation = shouldNotifyStatus(nextStatus) && order.status !== nextStatus
      ? await runOrderAutomation({
        orderId: orderDocument.id,
        event: "order-status-updated",
        status: nextStatus,
        recordedBy: "delivery-one-webhook",
      }).catch((error) => {
        console.error("Unable to send Delivery One webhook automation", error);
        return null;
      })
      : null;

    sendJson(response, 200, {
      ok: true,
      matched: true,
      orderId: orderDocument.id,
      trackingNumber: update.trackingNumber,
      providerStatus: update.providerStatus,
      orderStatus: update.orderStatus,
      notificationStatus: automation?.warnings?.length ? "attention" : automation ? "sent" : shouldNotifyStatus(nextStatus) ? "unchanged" : "not-required",
    });
  } catch (error) {
    console.error("Unable to process Delivery One webhook", error);
    sendError(response, 500, error instanceof Error ? error.message : "Unable to process Delivery One webhook.");
  }
}