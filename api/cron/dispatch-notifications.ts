/**
 * Vercel Cron Job — dispatches pending notifications queued in Firestore.
 *
 * This runs automatically on a schedule defined in vercel.json.
 * It also handles the fallback case: when the immediate /api/notifications/queue
 * call fails during checkout (e.g. cold-start, missing env vars at the time),
 * notifications are written to Firestore with status "pending" or "manual-ready".
 * This cron picks them up and sends them.
 *
 * Required Vercel environment variables:
 *   FIREBASE_ADMIN_SDK_BASE64   — base64-encoded Firebase service account JSON
 *   WHATSAPP_TOKEN              — Meta WhatsApp Cloud API access token
 *   WHATSAPP_PHONE_ID           — Meta WhatsApp phone number ID
 *   CRON_SECRET                 — (optional) secret used by Vercel to authenticate cron calls
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getFirebaseAdminDb } from "../_lib/firebase-admin.ts";
import { dispatchNotification } from "../_lib/notification-dispatch.ts";

const BATCH_SIZE = 20; // max notifications to dispatch per cron run

export default async function handler(request: VercelRequest, response: VercelResponse) {
  // Only GET (cron invocations) are accepted.
  if (request.method !== "GET") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  // Validate Vercel cron secret when it is configured.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = Array.isArray(request.headers["authorization"])
      ? request.headers["authorization"][0]
      : (request.headers["authorization"] || "");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return response.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    const db = getFirebaseAdminDb();

    // Query for notifications that have not been dispatched yet.
    // "manual-ready" = WhatsApp notification waiting to be sent.
    // "pending"       = web-push notification waiting to be sent.
    const snapshot = await db
      .collection("notifications")
      .where("status", "in", ["pending", "manual-ready"])
      .limit(BATCH_SIZE)
      .get();

    if (snapshot.empty) {
      return response.json({ dispatched: 0, failed: 0, total: 0 });
    }

    const results = await Promise.allSettled(
      snapshot.docs.map((doc) => dispatchNotification(doc.id))
    );

    const dispatched = results.filter(
      (r) => r.status === "fulfilled" && (r.value.status === "sent" || r.value.status === "skipped")
    ).length;

    const failed = results.filter(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && r.value.status === "failed")
    ).length;

    console.log(
      `[cron/dispatch-notifications] total=${snapshot.docs.length} dispatched=${dispatched} failed=${failed}`
    );

    return response.json({
      total: snapshot.docs.length,
      dispatched,
      failed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[cron/dispatch-notifications] error:", message);
    return response.status(500).json({ error: message });
  }
}
