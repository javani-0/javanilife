import { getBearerToken, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.ts";
import { getRequesterContext, queueAndDispatchNotifications } from "../_lib/notification-dispatch.ts";

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requirePost(request, response)) return;

  const token = getBearerToken(request);
  if (!token) {
    sendError(response, 401, "Missing Firebase ID token.");
    return;
  }

  try {
    const requester = await getRequesterContext(token);
    if (requester.role !== "admin") {
      sendError(response, 403, "Only admins can test web push notifications.");
      return;
    }

    const results = await queueAndDispatchNotifications(requester, [{
      channel: "web-push",
      audience: "admin",
      eventType: "order-placed",
      status: "pending",
      title: "Test web notification",
      message: "Your Javani web push setup is working.",
      webTitle: "Test web notification",
      webBody: "Your Javani web push setup is working.",
      webLink: "/admin/notifications",
      customerId: requester.uid,
      recipientRole: "admin",
    }]);

    sendJson(response, 200, { queued: results.length, results });
  } catch (error) {
    console.error("Unable to send test web push", error);
    sendError(response, 500, error instanceof Error ? error.message : "Unable to send test web push.");
  }
}