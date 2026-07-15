import { getFirebaseAdminAuth, getFirebaseAdminDb } from "./firebase-admin.js";
import { getBearerToken, sendError, sendJson, type ApiRequest, type ApiResponse } from "./http.js";
import { computePartnerCategoryShareInPaise, splitOrderIncomeInPaise } from "./finance.js";

const isFirebaseAuthError = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  return code.startsWith("auth/");
};

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const pct = (value: unknown): number => Math.max(0, Math.min(100, num(value)));

/** "YYYY-MM" from a Firestore Timestamp, {seconds}, Date, or ISO string. "" if unusable. */
const monthKeyOf = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "string") {
    const match = /^(\d{4}-\d{2})/.exec(value);
    if (match) return match[1];
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 7) : "";
  }
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 7) : "";
  const record = value as { toDate?: () => Date; seconds?: number };
  if (typeof record.toDate === "function") {
    const date = record.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 7) : "";
  }
  if (typeof record.seconds === "number") return new Date(record.seconds * 1000).toISOString().slice(0, 7);
  return "";
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthLabel = (key: string): string => {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return key;
  return `${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}`;
};

// ---------------------------------------------------------------------------
// GET /api/partner/summary  (routed through api/razorpay.ts — 12-fn limit).
// ---------------------------------------------------------------------------
// Minimal, partner-scoped view (req): the partner sees ONLY their own share —
// career (all-time) + per-month buckets — plus the total expenses figure.
// No income breakdown, no net profit, no other partners. Computed with the
// Admin SDK; the partner never reads raw orders/fees.
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

    const [ordersSnap, feesSnap, expensesSnap, partnersSnap] = await Promise.all([
      db.collection("orders").get(),
      db.collection("feePayments").where("status", "==", "paid").get(),
      db.collection("expenses").get(),
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

    const partner = partnerDoc?.data() || {};
    const shareClassesPercent = pct(partner.shareClassesPercent);
    const shareCoursesPercent = pct(partner.shareCoursesPercent);
    const shareProductsPercent = pct(partner.shareProductsPercent);
    const shares = { classesPercent: shareClassesPercent, coursesPercent: shareCoursesPercent, productsPercent: shareProductsPercent };

    // --- Per-month category income buckets --------------------------------
    // Orders → the month the payment landed; fees → the month they were paid.
    const ordersByMonth = new Map<string, FirebaseFirestore.DocumentData[]>();
    for (const orderDoc of ordersSnap.docs) {
      const order = orderDoc.data() || {};
      const key = monthKeyOf((order.payment as { paidAt?: unknown } | undefined)?.paidAt || order.createdAt);
      if (!key) continue;
      const list = ordersByMonth.get(key) || [];
      list.push(order);
      ordersByMonth.set(key, list);
    }
    const classIncomeByMonth = new Map<string, number>();
    for (const feeDoc of feesSnap.docs) {
      const fee = feeDoc.data() || {};
      const key = monthKeyOf(fee.paidAt || fee.updatedAt || fee.createdAt);
      if (!key) continue;
      classIncomeByMonth.set(key, (classIncomeByMonth.get(key) || 0) + Math.max(0, Math.round(num(fee.amountInPaise))));
    }

    const monthKeys = new Set<string>([...ordersByMonth.keys(), ...classIncomeByMonth.keys()]);
    const months: Array<{ key: string; label: string; shareInPaise: number }> = [];
    let careerShareInPaise = 0;
    for (const key of monthKeys) {
      const { productIncomeInPaise, courseIncomeInPaise } = splitOrderIncomeInPaise(ordersByMonth.get(key) || []);
      const classIncomeInPaise = classIncomeByMonth.get(key) || 0;
      const shareInPaise = computePartnerCategoryShareInPaise(
        { classIncomeInPaise, courseIncomeInPaise, productIncomeInPaise },
        shares,
      );
      careerShareInPaise += shareInPaise;
      // Only months with an actual share are selectable; the rest stay disabled.
      if (shareInPaise > 0) months.push({ key, label: monthLabel(key), shareInPaise });
    }
    months.sort((a, b) => (a.key < b.key ? 1 : -1)); // newest first

    const thisMonthKey = new Date().toISOString().slice(0, 7);
    const thisMonthShareInPaise = months.find((month) => month.key === thisMonthKey)?.shareInPaise || 0;

    // Total expenses — just the figure, nothing detailed (req).
    const careerExpensesInPaise = expensesSnap.docs.reduce(
      (sum, expenseDoc) => sum + Math.max(0, Math.round(num((expenseDoc.data() || {}).amountInPaise))),
      0,
    );

    sendJson(response, 200, {
      partnerName: typeof partner.name === "string" && partner.name ? partner.name : (typeof partner.email === "string" ? partner.email : ""),
      shareClassesPercent,
      shareCoursesPercent,
      shareProductsPercent,
      months,
      careerShareInPaise,
      thisMonthShareInPaise,
      careerExpensesInPaise,
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
