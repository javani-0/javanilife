import { getFirebaseAdminAuth, getFirebaseAdminDb } from "../_lib/firebase-admin.js";
import { getBearerToken, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { buildFinanceSummary, orderCollectedInPaise } from "../_lib/finance.js";

const isFirebaseAuthError = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  return code.startsWith("auth/");
};

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// ---------------------------------------------------------------------------
// GET /api/partner/summary
// ---------------------------------------------------------------------------
// Read-only financial aggregates for the partner dashboard (and reusable by the
// admin). Computed with the Admin SDK so the partner never reads raw orders or
// customer PII — only the rolled-up totals are returned. Gated to admin/partner.
// ---------------------------------------------------------------------------
export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader?.("Allow", "GET, POST");
    sendError(response, 405, "Method not allowed");
    return;
  }

  try {
    const token = getBearerToken(request);
    if (!token) {
      sendError(response, 401, "Missing Firebase authentication token.");
      return;
    }

    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    const db = getFirebaseAdminDb();

    const userSnapshot = await db.doc(`users/${decoded.uid}`).get();
    const role = String(userSnapshot.data()?.role || "");
    if (role !== "admin" && role !== "partner") {
      sendError(response, 403, "You do not have access to the financial summary.");
      return;
    }

    const [ordersSnap, feesSnap, expensesSnap, settingsSnap] = await Promise.all([
      db.collection("orders").get(),
      db.collection("feePayments").where("status", "==", "paid").get(),
      db.collection("expenses").get(),
      db.doc("finance/settings").get(),
    ]);

    const productIncomeInPaise = ordersSnap.docs.reduce(
      (sum, orderDoc) => sum + orderCollectedInPaise(orderDoc.data() || {}),
      0,
    );
    const classIncomeInPaise = feesSnap.docs.reduce(
      (sum, feeDoc) => sum + Math.max(0, Math.round(num((feeDoc.data() || {}).amountInPaise))),
      0,
    );
    const expensesInPaise = expensesSnap.docs.reduce(
      (sum, expenseDoc) => sum + Math.max(0, Math.round(num((expenseDoc.data() || {}).amountInPaise))),
      0,
    );

    const settings = settingsSnap.exists ? settingsSnap.data() || {} : {};
    const profitSharePercent = Math.max(0, Math.min(100, num(settings.profitSharePercent)));

    const summary = buildFinanceSummary({ productIncomeInPaise, classIncomeInPaise, expensesInPaise, profitSharePercent });

    sendJson(response, 200, {
      ...summary,
      partnerName: typeof settings.partnerName === "string" ? settings.partnerName : "",
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Unable to build partner summary", error);
    if (isFirebaseAuthError(error)) {
      sendError(response, 401, "Invalid Firebase authentication token.");
      return;
    }
    sendError(response, 500, error instanceof Error ? error.message : "Unable to build partner summary.");
  }
}
