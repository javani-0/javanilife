// ---------------------------------------------------------------------------
// Server-side coupon validation for class fees (req 2). The client computes a
// preview with the shared engine (src/lib/ecommerce/discounts.ts), but the
// discount that actually reduces a fee is re-computed here so a tampered client
// can never under-charge. Scoped to what a class fee needs: percentage /
// fixed-amount coupons, active window, min-subtotal, max-discount, and course
// item-type / class-id scoping.
// ---------------------------------------------------------------------------

import type { DocumentData, Firestore } from "firebase-admin/firestore";

const num = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const getString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

export interface LoadedCoupon {
  code: string;
  type: "percentage" | "fixed_amount" | "free_delivery";
  value: number;
  maxDiscountInPaise?: number;
  minSubtotalInPaise?: number;
  active: boolean;
  startsAt?: unknown;
  expiresAt?: unknown;
  applicableItemTypes?: string[];
  applicableProductIds?: string[];
  applicableCategoryIds?: string[];
  /** 0/undefined = unlimited. */
  maxRedemptions?: number;
  redeemedCount?: number;
}

const parseDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (typeof value === "string") { const d = new Date(value); return Number.isFinite(d.getTime()) ? d : null; }
  const record = value as { toDate?: () => Date; seconds?: number };
  if (typeof record.toDate === "function") { const d = record.toDate(); return d instanceof Date && Number.isFinite(d.getTime()) ? d : null; }
  if (typeof record.seconds === "number") return new Date(record.seconds * 1000);
  return null;
};

const normalizeCode = (raw: string) => raw.trim().toUpperCase().replace(/\s+/g, "-");

/** Fixed-amount coupons stored as rupees for small values are normalized to paise (mirrors the client). */
const normalizeValue = (type: string, raw: unknown): number => {
  const value = num(raw);
  if (type === "fixed_amount") return Math.max(0, Math.round(value * (value > 0 && value < 1000 ? 100 : 1)));
  return Math.max(0, value);
};

const normalizeCoupon = (data: DocumentData, fallbackCode: string): LoadedCoupon => {
  const type = (["percentage", "fixed_amount", "free_delivery"].includes(getString(data.type)) ? data.type : "percentage") as LoadedCoupon["type"];
  return {
    code: normalizeCode(getString(data.code, fallbackCode)),
    type,
    value: normalizeValue(type, data.value),
    maxDiscountInPaise: num(data.maxDiscountInPaise) > 0 ? Math.round(num(data.maxDiscountInPaise)) : undefined,
    minSubtotalInPaise: num(data.minSubtotalInPaise) > 0 ? Math.round(num(data.minSubtotalInPaise)) : undefined,
    active: data.active !== false,
    startsAt: data.startsAt,
    expiresAt: data.expiresAt,
    applicableItemTypes: Array.isArray(data.applicableItemTypes) ? data.applicableItemTypes.map((v: unknown) => getString(v)) : undefined,
    applicableProductIds: Array.isArray(data.applicableProductIds) ? data.applicableProductIds.map((v: unknown) => getString(v)).filter(Boolean) : undefined,
    applicableCategoryIds: Array.isArray(data.applicableCategoryIds) ? data.applicableCategoryIds.map((v: unknown) => getString(v)).filter(Boolean) : undefined,
    maxRedemptions: num(data.maxRedemptions) > 0 ? Math.floor(num(data.maxRedemptions)) : undefined,
    redeemedCount: Math.max(0, Math.floor(num(data.redeemedCount))),
  };
};

export const normalizeCouponCodeServer = normalizeCode;

/** Load a coupon by code — tries the doc id (code) first, then a `code` field query. */
export const loadCouponByCode = async (db: Firestore, rawCode: string): Promise<LoadedCoupon | null> => {
  const code = normalizeCode(rawCode || "");
  if (!code) return null;
  const byId = await db.collection("coupons").doc(code).get();
  if (byId.exists) return normalizeCoupon(byId.data() || {}, code);
  const query = await db.collection("coupons").where("code", "==", code).limit(1).get();
  if (!query.empty) return normalizeCoupon(query.docs[0].data() || {}, code);
  return null;
};

export interface CouponDiscountResult { discountInPaise: number; reason?: string }

/**
 * Compute the discount a coupon gives on a single class-fee amount (paise). A
 * class fee is treated as a "course" item. Returns 0 with a reason when the
 * coupon doesn't apply.
 */
export const computeClassCouponDiscount = (
  coupon: LoadedCoupon,
  baseAmountInPaise: number,
  opts: { classId?: string; now?: Date } = {},
): CouponDiscountResult => {
  const now = opts.now || new Date();
  const base = Math.max(0, Math.round(num(baseAmountInPaise)));
  if (!coupon.active) return { discountInPaise: 0, reason: "This coupon is not active." };
  const startsAt = parseDate(coupon.startsAt);
  if (startsAt && startsAt.getTime() > now.getTime()) return { discountInPaise: 0, reason: "This coupon is not active yet." };
  const expiresAt = parseDate(coupon.expiresAt);
  if (expiresAt && expiresAt.getTime() < now.getTime()) return { discountInPaise: 0, reason: "This coupon has expired." };
  if (coupon.minSubtotalInPaise && base < coupon.minSubtotalInPaise) return { discountInPaise: 0, reason: "The amount is below this coupon's minimum." };
  if (coupon.applicableItemTypes?.length && !coupon.applicableItemTypes.includes("course")) return { discountInPaise: 0, reason: "This coupon is not valid for classes." };
  if (coupon.applicableProductIds?.length && opts.classId && !coupon.applicableProductIds.includes(opts.classId)) return { discountInPaise: 0, reason: "This coupon is not valid for this class." };

  let discount = 0;
  if (coupon.type === "percentage") {
    discount = Math.floor(base * Math.min(100, coupon.value) / 100);
    if (coupon.maxDiscountInPaise) discount = Math.min(discount, coupon.maxDiscountInPaise);
  } else if (coupon.type === "fixed_amount") {
    discount = Math.min(coupon.value, base);
  } else {
    return { discountInPaise: 0, reason: "This coupon can't be used for class fees." };
  }
  // Never discount below ₹1.
  return { discountInPaise: Math.max(0, Math.min(discount, Math.max(0, base - 100))) };
};

export interface ElearnBundleItem { courseId: string; priceInPaise: number }
export interface ElearnBundleDiscount {
  /** Total discount on the whole purchase. */
  discountInPaise: number;
  /** The discount split per course (sums to discountInPaise). */
  perCourse: Record<string, number>;
  reason?: string;
}

/**
 * Discount a coupon gives on one or more online (e-learning) master classes
 * bought together, in paise. Valid when the coupon is scoped to everything (no
 * item types) or to "elearning"; a coupon that lists ids discounts only the
 * listed courses. A coupon may make the purchase FREE (total 0, e.g. 100% off
 * for our own students); otherwise the total never ends between 1 and 99 paise
 * (Razorpay and UPI need at least ₹1). The discount is split across the
 * discounted courses by price, so each course's record holds its own share.
 */
export const computeElearnBundleDiscount = (
  coupon: LoadedCoupon,
  items: ElearnBundleItem[],
  opts: { now?: Date } = {},
): ElearnBundleDiscount => {
  const none = (reason: string): ElearnBundleDiscount => ({ discountInPaise: 0, perCourse: {}, reason });
  const now = opts.now || new Date();
  const priced = items.map((item) => ({ courseId: item.courseId, price: Math.max(0, Math.round(num(item.priceInPaise))) }));
  const several = priced.length > 1;
  if (!coupon.active) return none("This coupon is not active.");
  const startsAt = parseDate(coupon.startsAt);
  if (startsAt && startsAt.getTime() > now.getTime()) return none("This coupon is not active yet.");
  const expiresAt = parseDate(coupon.expiresAt);
  if (expiresAt && expiresAt.getTime() < now.getTime()) return none("This coupon has expired.");
  if (coupon.maxRedemptions && (coupon.redeemedCount || 0) >= coupon.maxRedemptions) return none("This coupon has been fully used.");
  if (coupon.applicableItemTypes?.length && !coupon.applicableItemTypes.includes("elearning")) return none("This coupon is not valid for master classes.");
  // Category ids are shop/class categories; an online course has none.
  if (coupon.applicableCategoryIds?.length && !coupon.applicableItemTypes?.includes("elearning")) return none("This coupon is not valid for master classes.");
  const eligible = coupon.applicableProductIds?.length
    ? priced.filter((item) => coupon.applicableProductIds!.includes(item.courseId))
    : priced;
  if (!eligible.length) return none(several ? "This coupon is not valid for these master classes." : "This coupon is not valid for this master class.");
  const base = eligible.reduce((sum, item) => sum + item.price, 0);
  const total = priced.reduce((sum, item) => sum + item.price, 0);
  if (coupon.minSubtotalInPaise && base < coupon.minSubtotalInPaise) {
    return none(several ? "The total is below this coupon's minimum." : "This master class price is below this coupon's minimum.");
  }
  let discount = 0;
  if (coupon.type === "percentage") {
    discount = Math.floor(base * Math.min(100, coupon.value) / 100);
    if (coupon.maxDiscountInPaise) discount = Math.min(discount, coupon.maxDiscountInPaise);
  } else if (coupon.type === "fixed_amount") {
    discount = coupon.value;
  } else {
    return none("This coupon can't be used for master classes.");
  }
  discount = Math.max(0, Math.min(Math.round(discount), base));
  const left = total - discount;
  if (left > 0 && left < 100) discount = Math.max(0, total - 100);
  if (discount <= 0) return none(several ? "This coupon gives no discount on these master classes." : "This coupon gives no discount on this master class.");

  // Split by price; the leftover paise go one by one to courses with room.
  const perCourse: Record<string, number> = {};
  let given = 0;
  for (const item of eligible) {
    const share = base > 0 ? Math.floor(discount * item.price / base) : 0;
    perCourse[item.courseId] = share;
    given += share;
  }
  for (let i = 0; given < discount && i < eligible.length * 2; i += 1) {
    const item = eligible[i % eligible.length];
    if (perCourse[item.courseId] < item.price) {
      perCourse[item.courseId] += 1;
      given += 1;
    }
  }
  return { discountInPaise: discount, perCourse };
};

/** One course: see computeElearnBundleDiscount (a coupon may make it free). */
export const computeElearnCouponDiscount = (
  coupon: LoadedCoupon,
  priceInPaise: number,
  opts: { courseId: string; now?: Date },
): CouponDiscountResult => {
  const result = computeElearnBundleDiscount(coupon, [{ courseId: opts.courseId, priceInPaise }], { now: opts.now });
  return result.reason ? { discountInPaise: 0, reason: result.reason } : { discountInPaise: result.discountInPaise };
};
