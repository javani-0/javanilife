import type { NotificationPayload } from "./notifications";

export interface QueueNotificationsResponse {
  queued: number;
  results: Array<{
    id?: string;
    channel?: string;
    status?: string;
    errorMessage?: string;
  }>;
}

const postNotificationJson = async <T>(url: string, idToken: string, payload: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : "Notification request failed.";
    throw new Error(message);
  }

  return data as T;
};

export const queueNotificationPayloads = (idToken: string, notifications: NotificationPayload[]) => (
  postNotificationJson<QueueNotificationsResponse>("/api/notifications/queue", idToken, { notifications })
);

export const dispatchNotificationById = (idToken: string, notificationId: string) => (
  postNotificationJson<{ id: string; status: string; errorMessage?: string }>("/api/notifications/dispatch", idToken, { notificationId })
);

export const sendTestWebPush = (idToken: string) => (
  postNotificationJson<QueueNotificationsResponse>("/api/notifications/test-web-push", idToken, {})
);