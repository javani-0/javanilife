import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.ts";
import { dispatchNotification, getRequesterContext } from "../_lib/notification-dispatch.ts";

interface DispatchNotificationBody {
  notificationId?: string;
}

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
      sendError(response, 403, "Only admins can dispatch queued notifications.");
      return;
    }

    const body = await readJsonBody<DispatchNotificationBody>(request);
    if (!body.notificationId) {
      sendError(response, 400, "notificationId is required.");
      return;
    }

    const result = await dispatchNotification(body.notificationId);
    sendJson(response, 200, result);
  } catch (error) {
    console.error("Unable to dispatch notification", error);
    sendError(response, 500, error instanceof Error ? error.message : "Unable to dispatch notification.");
  }
}