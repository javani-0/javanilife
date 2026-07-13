import { getFirebaseAdminAuth, getFirebaseAdminDb } from "./firebase-admin.js";
import { getBearerToken, sendError, sendJson, type ApiRequest, type ApiResponse } from "./http.js";
import { buildFinanceSummary, computePartnerCategoryShareInPaise, splitOrderIncomeInPaise } from "./finance.js";

const isFirebaseAuthError = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  return code.startsWith("auth/");
};

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const pct = (value: unknown): number => Math.max(0, Math.min(100, num(value)));

// ---------------------------------------------------------------------------
// GET /api/partner/summary  (routed through api/razorpay.ts to stay within the
// Hobby plan's 12-function limit — see vercel.json rewrites).
// ---------------------------------------------------------------------------
// Read-only financial aggregates for the partner dashboard (and reusable by the
// admin). Computed with the Admin SDK so the partner never reads raw orders or
// customer PII — only the rolled-up totals + their own per-category share are
// returned. Each partner is resolved from the `partners` collection (req 4).
// ---------------------------------------------------------------------------
export default async function partnerSummary(request: ApiRequest, response: ApiResponse) {
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

    const [ordersSnap, feesSnap, expensesSnap, incomeSnap, partnersSnap] = await Promise.all([
      db.collection("orders").get(),
      db.collection("feePayments").where("status", "==", "paid").get(),
      db.collection("expenses").get(),
      db.collection("manualIncome").get(),
      db.collection("partners").get(),
    ]);

    // Resolve WHICH partner is asking: prefer a stored uid, else match by email.
    const email = String(decoded.email || "").trim().toLowerCase();
    const partnerDoc =
      partnersSnap.docs.find((d) => String((d.data() || {}).partnerUid || "") === decoded.uid) ||
      (email ? partnersSnap.docs.find((d) => String((d.data() || {}).email || "").trim().toLowerCase() === email) : undefined);

    if (role !== "admin" && !partnerDoc) {
      sendError(response, 403, "No partner profile is linked to your account yet.");
      return;
    }

    const { productIncomeInPaise, courseIncomeInPaise } = splitOrderIncomeInPaise(
      ordersSnap.docs.map((orderDoc) => orderDoc.data() || {}),
    );
    const classIncomeInPaise = feesSnap.docs.reduce(
      (sum, feeDoc) => sum + Math.max(0, Math.round(num((feeDoc.data() || {}).amountInPaise))),
      0,
    );
    const expensesInPaise = expensesSnap.docs.reduce(
      (sum, expenseDoc) => sum + Math.max(0, Math.round(num((expenseDoc.data() || {}).amountInPaise))),
      0,
    );
    const otherIncomeInPaise = incomeSnap.docs.reduce(
      (sum, incomeDoc) => sum + Math.max(0, Math.round(num((incomeDoc.data() || {}).amountInPaise))),
      0,
    );

    const summary = buildFinanceSummary({ productIncomeInPaise, courseIncomeInPaise, classIncomeInPaise, otherIncomeInPaise, expensesInPaise });

    const partner = partnerDoc?.data() || {};
    const shareClassesPercent = pct(partner.shareClassesPercent);
    const shareCoursesPercent = pct(partner.shareCoursesPercent);
    const shareProductsPercent = pct(partner.shareProductsPercent);

    const categoryIncome = { classIncomeInPaise, courseIncomeInPaise, productIncomeInPaise };
    const shareClassesInPaise = computePartnerCategoryShareInPaise(categoryIncome, { classesPercent: shareClassesPercent });
    const shareCoursesInPaise = computePartnerCategoryShareInPaise(categoryIncome, { coursesPercent: shareCoursesPercent });
    const shareProductsInPaise = computePartnerCategoryShareInPaise(categoryIncome, { productsPercent: shareProductsPercent });
    const partnerShareInPaise = shareClassesInPaise + shareCoursesInPaise + shareProductsInPaise;

    sendJson(response, 200, {
      ...summary,
      shareClassesPercent,
      shareCoursesPercent,
      shareProductsPercent,
      shareClassesInPaise,
      shareCoursesInPaise,
      shareProductsInPaise,
      partnerShareInPaise,
      partnerName: typeof partner.name === "string" && partner.name ? partner.name : (typeof partner.email === "string" ? partner.email : ""),
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
