import { getFirebaseAdminAuth, getFirebaseAdminDb } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { isStaffForPage } from "../_lib/staff.js";
import { sweepOverdueRentals } from "../_lib/rental-overdue.js";
import { getWhatsAppConfigStatus } from "../_lib/whatsapp.js";

// ---------------------------------------------------------------------------
// POST/GET /api/razorpay/rental-overdue   ·   also /api/cron/rental-overdue
// ---------------------------------------------------------------------------
// Tells every customer whose rental has run past its hour what it is costing
// them (req 3). Two callers, one code path:
//
//   • a SCHEDULER, authorised with CRON_SECRET, for the automatic sweep;
//   • the RENTAL DESK, authorised with a staff login, for "chase them now".
//
// `dryRun` returns the messages it would send without sending or recording
// anything — the desk uses it to preview.
//
// Folded into the shared /api/razorpay router: Vercel's Hobby plan caps this
// project at 12 serverless functions and it is already at 12.
// ---------------------------------------------------------------------------

const getHeader = (request: ApiRequest, name: string) => {
  const value = request.headers[name] || request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const isAuthorizedCron = (request: ApiRequest): boolean => {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return getHeader(request, "authorization") === `Bearer ${secret}`;
};

interface OverdueBody {
  dryRun?: boolean;
  limit?: number;
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "GET" && request.method !== "POST") {
    sendError(response, 405, "Method not allowed.");
    return;
  }

  try {
    const body = request.method === "POST" ? await readJsonBody<OverdueBody>(request) : {};
    const db = getFirebaseAdminDb();

    // Either a scheduler with the cron secret, or a signed-in staff member.
    let authorized = isAuthorizedCron(request);
    if (!authorized) {
      const idToken = getBearerToken(request);
      if (!idToken) {
        sendError(response, 401, "Missing authorisation.");
        return;
      }
      const decoded = await getFirebaseAdminAuth().verifyIdToken(idToken);
      const userSnapshot = await db.doc(`users/${decoded.uid}`).get();
      // The Rental Desk sits behind the same page key.
      authorized = isStaffForPage(userSnapshot.data(), "rentals") || isStaffForPage(userSnapshot.data(), "orders");
      if (!authorized) {
        sendError(response, 403, "Only staff can run the rental overdue check.");
        return;
      }
    }

    const result = await sweepOverdueRentals(db, {
      dryRun: body.dryRun === true,
      limit: body.limit,
    });

    const whatsapp = getWhatsAppConfigStatus();
    sendJson(response, 200, {
      ok: true,
      ...result,
      whatsappConfigured: whatsapp.hasToken && whatsapp.hasPhoneId,
      message: `${result.overdue} overdue · ${result.notified} customer${result.notified === 1 ? "" : "s"} messaged.`,
    });
  } catch (error) {
    console.error("Unable to run the rental overdue sweep", error);
    sendError(response, 500, error instanceof Error ? error.message : "Unable to run the rental overdue sweep.");
  }
}
