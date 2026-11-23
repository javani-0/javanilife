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

/**
 * Discount a coupon gives on an online (e-learning) course price, in paise.
 * Valid when the coupon is scoped to everything (no item types) or to
 * "elearning"; a coupon that lists ids must list this course. The price never
 * drops below ₹1 (Razorpay and UPI need a real amount).
 */
export const computeElearnCouponDiscount = (
  coupon: LoadedCoupon,
  priceInPaise: number,
  opts: { courseId: string; now?: Date },
): CouponDiscountResult => {
  const now = opts.now || new Date();
  const base = Math.max(0, Math.round(num(priceInPaise)));
  if (!coupon.active) return { discountInPaise: 0, reason: "This coupon is not active." };
  const startsAt = parseDate(coupon.startsAt);
  if (startsAt && startsAt.getTime() > now.getTime()) return { discountInPaise: 0, reason: "This coupon is not active yet." };
  const expiresAt = parseDate(coupon.expiresAt);
  if (expiresAt && expiresAt.getTime() < now.getTime()) return { discountInPaise: 0, reason: "This coupon has expired." };
  if (coupon.maxRedemptions && (coupon.redeemedCount || 0) >= coupon.maxRedemptions) {
    return { discountInPaise: 0, reason: "This coupon has been fully used." };
  }
  if (coupon.applicableItemTypes?.length && !coupon.applicableItemTypes.includes("elearning")) {
    return { discountInPaise: 0, reason: "This coupon is not valid for online courses." };
  }
  // Category ids are shop/class categories; an online course has none.
  if (coupon.applicableCategoryIds?.length && !coupon.applicableItemTypes?.includes("elearning")) {
    return { discountInPaise: 0, reason: "This coupon is not valid for online courses." };
  }
  if (coupon.applicableProductIds?.length && !coupon.applicableProductIds.includes(opts.courseId)) {
    return { discountInPaise: 0, reason: "This coupon is not valid for this course." };
  }
  if (coupon.minSubtotalInPaise && base < coupon.minSubtotalInPaise) {
    return { discountInPaise: 0, reason: "This course price is below this coupon's minimum." };
  }
  let discount = 0;
  if (coupon.type === "percentage") {
    discount = Math.floor(base * Math.min(100, coupon.value) / 100);
    if (coupon.maxDiscountInPaise) discount = Math.min(discount, coupon.maxDiscountInPaise);
  } else if (coupon.type === "fixed_amount") {
    discount = Math.min(coupon.value, base);
  } else {
    return { discountInPaise: 0, reason: "This coupon can't be used for online courses." };
  }
  discount = Math.max(0, Math.min(discount, Math.max(0, base - 100)));
  if (discount <= 0) return { discountInPaise: 0, reason: "This coupon gives no discount on this course." };
  return { discountInPaise: discount };
};
