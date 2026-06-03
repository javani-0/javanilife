// ---------------------------------------------------------------------------
// Razorpay Subscriptions helpers (autopay / e-mandate). Wraps the razorpay SDK.
// ---------------------------------------------------------------------------
// Plan  = a recurring monthly price (one per class, created lazily, id on class)
// Subscription = a parent's mandate against a plan (one per enrolment-with-autopay)
// ---------------------------------------------------------------------------
import { FieldValue } from "./firebase-admin.js";
import { getRazorpayCurrency } from "./razorpay.js";

// The razorpay SDK ships loose types; treat the client loosely here.
type RazorpayClient = {
  plans: { create: (params: Record<string, unknown>) => Promise<{ id: string }> };
  subscriptions: {
    create: (params: Record<string, unknown>) => Promise<RazorpaySubscription>;
    cancel: (id: string, cancelAtCycleEnd?: boolean) => Promise<RazorpaySubscription>;
    fetch: (id: string) => Promise<RazorpaySubscription>;
  };
};

export interface RazorpaySubscription {
  id: string;
  status?: string;
  short_url?: string;
  plan_id?: string;
  customer_id?: string;
  current_start?: number;
  current_end?: number;
  charge_at?: number;
  notes?: Record<string, string>;
}

type Firestore = FirebaseFirestore.Firestore;

const CLASSES_COLLECTION = "classes";
// 10 years of monthly cycles — Razorpay requires a finite count; this is a
// practical "open-ended" upper bound. Parents can cancel anytime.
const DEFAULT_TOTAL_COUNT = 120;

/**
 * Return the class's monthly Razorpay plan id, creating it lazily on first use
 * and persisting it back onto the class doc.
 *
 * When `useAutopayDiscount` is true and the class has a non-zero
 * `autopayDiscountInPaise`, a separate discounted plan is created/reused
 * (stored as `razorpayAutopayPlanId` / `razorpayAutopayPlanAmountInPaise`).
 */
export const ensureClassPlan = async (
  razorpay: RazorpayClient,
  db: Firestore,
  classId: string,
  useAutopayDiscount = false,
): Promise<{ planId: string; amountInPaise: number; className: string }> => {
  const classRef = db.collection(CLASSES_COLLECTION).doc(classId);
  const snapshot = await classRef.get();
  if (!snapshot.exists) throw new Error("Class was not found.");

  const data = snapshot.data() || {};
  const baseAmountInPaise = Math.round(Number(data.monthlyFeeInPaise || 0));
  const className = String(data.name || "Class");
  if (!Number.isInteger(baseAmountInPaise) || baseAmountInPaise < 100) {
    throw new Error("Class monthly fee is not configured.");
  }

  // Compute effective amount — apply autopay discount when requested.
  const discountInPaise = useAutopayDiscount ? Math.round(Number(data.autopayDiscountInPaise || 0)) : 0;
  const amountInPaise = discountInPaise > 0
    ? Math.max(100, baseAmountInPaise - discountInPaise)
    : baseAmountInPaise;

  // Choose which plan fields to read/write based on whether we're using the
  // discounted autopay variant.
  const planIdField = discountInPaise > 0 ? "razorpayAutopayPlanId" : "razorpayPlanId";
  const planAmountField = discountInPaise > 0 ? "razorpayAutopayPlanAmountInPaise" : "razorpayPlanAmountInPaise";

  // Reuse the stored plan only when its amount still matches the current fee.
  // A Razorpay plan's amount is immutable, so a fee change requires a new plan
  // (existing subscriptions keep charging their original amount, by design).
  const existingPlanId = typeof data[planIdField] === "string" ? data[planIdField].trim() : "";
  const existingPlanAmount = Math.round(Number(data[planAmountField] || 0));
  if (existingPlanId && existingPlanAmount === amountInPaise) {
    return { planId: existingPlanId, amountInPaise, className };
  }

  const plan = await razorpay.plans.create({
    period: "monthly",
    interval: 1,
    item: {
      name: discountInPaise > 0
        ? `${className} — Monthly Fee (Autopay)`
        : `${className} — Monthly Fee`,
      amount: amountInPaise,
      currency: getRazorpayCurrency().toUpperCase(),
      description: discountInPaise > 0
        ? `Monthly tuition for ${className} (autopay discounted)`
        : `Monthly tuition for ${className}`,
    },
    notes: { classId },
  });

  await classRef.update({
    [planIdField]: plan.id,
    [planAmountField]: amountInPaise,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { planId: plan.id, amountInPaise, className };
};

export const createSubscription = (
  razorpay: RazorpayClient,
  {
    planId,
    enrollmentId,
    classId,
    parentUserId,
    totalCount = DEFAULT_TOTAL_COUNT,
  }: { planId: string; enrollmentId: string; classId: string; parentUserId: string; totalCount?: number },
): Promise<RazorpaySubscription> =>
  razorpay.subscriptions.create({
    plan_id: planId,
    total_count: totalCount,
    customer_notify: 1,
    notes: { kind: "class-fee-subscription", enrollmentId, classId, parentUserId },
  });

export const cancelSubscription = (
  razorpay: RazorpayClient,
  subscriptionId: string,
  cancelAtCycleEnd = false,
): Promise<RazorpaySubscription> => razorpay.subscriptions.cancel(subscriptionId, cancelAtCycleEnd);

export const getSubscription = (
  razorpay: RazorpayClient,
  subscriptionId: string,
): Promise<RazorpaySubscription> => razorpay.subscriptions.fetch(subscriptionId);
