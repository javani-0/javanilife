import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.ts";
import { getRequesterContext, queueAndDispatchNotifications } from "../_lib/notification-dispatch.ts";

interface QueueNotificationsBody {
  notifications?: unknown[];
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requirePost(request, response)) return;

  const token = getBearerToken(request);
  if (!token) {
    sendError(response, 401, "Missing Firebase ID token.");
    return;
  }

  try {
    const body = await readJsonBody<QueueNotificationsBody>(request);
    const notifications = Array.isArray(body.notifications) ? body.notifications : [];
    if (notifications.length === 0) {
      sendError(response, 400, "At least one notification is required.");
      return;
    }

    const requester = await getRequesterContext(token);
    const results = await queueAndDispatchNotifications(requester, notifications);
    sendJson(response, 200, { queued: results.length, results });
  } catch (error) {
    console.error("Unable to queue notifications", error);
    sendError(response, 500, error instanceof Error ? error.message : "Unable to queue notifications.");
  }
}