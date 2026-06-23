import { calculateLineTotal, formatPaiseAsRupees, parsePriceToPaise } from "./pricing";
import { slugifyCategoryId } from "./categories";
import type { CartItem, CartItemType } from "./types";

export type CouponType = "percentage" | "fixed_amount" | "free_delivery";

export interface Coupon {
  id: string;
  code: string;
  title: string;
  description?: string;
  type: CouponType;
  value: number;
  maxDiscountInPaise?: number;
  minSubtotalInPaise?: number;
  active: boolean;
  visibleAtCheckout: boolean;
  startsAt?: unknown;
  expiresAt?: unknown;
  maxRedemptions?: number;
  redeemedCount?: number;
  perUserLimit?: number;
  applicableItemTypes?: CartItemType[];
  applicableCategoryIds?: string[];
  applicableProductIds?: string[];
  adminNotes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CouponCartContext {
  items: Pick<CartItem, "productId" | "sourceId" | "itemType" | "category" | "quantity" | "amountInPaise">[];
  subtotalInPaise: number;
  deliveryChargeInPaise: number;
  now?: Date;
}

export interface CouponEligibility {
  eligible: boolean;
  reason?: string;
}

export interface AppliedCoupon {
  id: string;
  code: string;
  title: string;
  type: CouponType;
  label: string;
  discountInPaise: number;
  deliveryDiscountInPaise: number;
  freeDelivery: boolean;
}

const couponTypes: CouponType[] = ["percentage", "fixed_amount", "free_delivery"];

const getRecord = (value: unknown): Record<string, unknown> => (
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {}
);

const getString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const getBoolean = (value: unknown, fallback = false) => (typeof value === "boolean" ? value : fallback);
const getNumber = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

const parseDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const record = getRecord(value);
  if (typeof record.toDate === "function") {
    const date = (record.toDate as () => unknown)();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof record.seconds === "number") {
    return new Date(record.seconds * 1000);
  }
  return null;
};

export const normalizeCouponCode = (value: string) => value.trim().toUpperCase().replace(/\s+/g, "-");

const normalizeCouponType = (value: unknown): CouponType => (
  couponTypes.includes(value as CouponType) ? value as CouponType : "percentage"
);

const normalizeScopeList = (value: unknown): string[] => (
  Array.isArray(value) ? value.map((item) => getString(item).trim()).filter(Boolean) : []
);

const normalizeItemTypes = (value: unknown): CartItemType[] => (
  Array.isArray(value)
    ? value.filter((item): item is CartItemType => item === "product" || item === "course")
    : []
);

export const normalizeCoupon = (id: string, value: unknown): Coupon => {
  const record = getRecord(value);
  const type = normalizeCouponType(record.type);
  const rawCode = getString(record.code, id);
  const code = normalizeCouponCode(rawCode || id);
  const rawValue = getNumber(record.value, type === "percentage" ? 0 : parsePriceToPaise(record.value as string) || 0);
  const normalizedValue = type === "fixed_amount" ? Math.max(0, Math.round(rawValue * (rawValue > 0 && rawValue < 1000 ? 100 : 1))) : Math.max(0, rawValue);

  return {
    id: id.trim() || code,
    code,
    title: getString(record.title, code).trim() || code,
    description: getString(record.description).trim(),
    type,
    value: normalizedValue,
    maxDiscountInPaise: getNumber(record.maxDiscountInPaise, 0) > 0 ? Math.round(getNumber(record.maxDiscountInPaise)) : undefined,
    minSubtotalInPaise: getNumber(record.minSubtotalInPaise, 0) > 0 ? Math.round(getNumber(record.minSubtotalInPaise)) : undefined,
    active: getBoolean(record.active, true),
    visibleAtCheckout: getBoolean(record.visibleAtCheckout, true),
    startsAt: record.startsAt,
    expiresAt: record.expiresAt,
    maxRedemptions: getNumber(record.maxRedemptions, 0) > 0 ? Math.floor(getNumber(record.maxRedemptions)) : undefined,
    redeemedCount: Math.max(0, Math.floor(getNumber(record.redeemedCount, 0))),
    perUserLimit: getNumber(record.perUserLimit, 0) > 0 ? Math.floor(getNumber(record.perUserLimit)) : undefined,
    applicableItemTypes: normalizeItemTypes(record.applicableItemTypes),
    applicableCategoryIds: normalizeScopeList(record.applicableCategoryIds),
    applicableProductIds: normalizeScopeList(record.applicableProductIds),
    adminNotes: getString(record.adminNotes).trim(),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
};

export const isCouponActive = (coupon: Coupon, now = new Date()): boolean => {
  if (!coupon.active) return false;

  const startsAt = parseDate(coupon.startsAt);
  if (startsAt && startsAt.getTime() > now.getTime()) return false;

  const expiresAt = parseDate(coupon.expiresAt);
  if (expiresAt && expiresAt.getTime() < now.getTime()) return false;

  if (coupon.maxRedemptions && (coupon.redeemedCount || 0) >= coupon.maxRedemptions) return false;

  return true;
};

const itemMatchesCouponScope = (coupon: Coupon, item: CouponCartContext["items"][number]) => {
  if (coupon.applicableItemTypes?.length && !coupon.applicableItemTypes.includes(item.itemType || "product")) return false;

  if (coupon.applicableCategoryIds?.length) {
    // Categories are stored on products as a slug id (e.g. "masterclass-and-workshops").
    // Slugify BOTH sides so an admin can enter the category id, its label, or any
    // casing/spacing in the coupon and it still matches the item's stored category.
    const itemCategory = slugifyCategoryId(item.category || "");
    const allowedCategories = coupon.applicableCategoryIds.map((value) => slugifyCategoryId(value));
    if (!allowedCategories.includes(itemCategory)) return false;
  }

  if (coupon.applicableProductIds?.length) {
    const identifiers = [item.productId, item.sourceId].filter(Boolean);
    if (!identifiers.some((identifier) => coupon.applicableProductIds?.includes(identifier as string))) return false;
  }

  return true;
};

const scopedSubtotal = (coupon: Coupon, context: CouponCartContext) => {
  const hasScope = Boolean(
    coupon.applicableItemTypes?.length || coupon.applicableCategoryIds?.length || coupon.applicableProductIds?.length,
  );

  if (!hasScope) return context.subtotalInPaise;

  return context.items.reduce((total, item) => (
    itemMatchesCouponScope(coupon, item) ? total + calculateLineTotal(item.amountInPaise, item.quantity) : total
  ), 0);
};

export const evaluateCouponEligibility = (coupon: Coupon, context: CouponCartContext): CouponEligibility => {
  if (!isCouponActive(coupon, context.now)) return { eligible: false, reason: "This coupon is not active." };

  if (coupon.minSubtotalInPaise && context.subtotalInPaise < coupon.minSubtotalInPaise) {
    return {
      eligible: false,
      reason: `Add ${formatPaiseAsRupees(coupon.minSubtotalInPaise - context.subtotalInPaise)} more to use this coupon.`,
    };
  }

  if (scopedSubtotal(coupon, context) <= 0) {
    return { eligible: false, reason: "This coupon is not valid for the items in your cart." };
  }

  if (coupon.type === "free_delivery" && context.deliveryChargeInPaise <= 0) {
    return { eligible: false, reason: "Delivery is already free for this cart." };
  }

  return { eligible: true };
};

export const calculateCouponDiscount = (coupon: Coupon, context: CouponCartContext): AppliedCoupon => {
  const eligibility = evaluateCouponEligibility(coupon, context);
  if (!eligibility.eligible) {
    return {
      id: coupon.id,
      code: coupon.code,
      title: coupon.title,
      type: coupon.type,
      label: coupon.title,
      discountInPaise: 0,
      deliveryDiscountInPaise: 0,
      freeDelivery: false,
    };
  }

  const eligibleSubtotal = scopedSubtotal(coupon, context);
  let discountInPaise = 0;
  let deliveryDiscountInPaise = 0;

  if (coupon.type === "percentage") {
    discountInPaise = Math.floor(eligibleSubtotal * Math.min(100, coupon.value) / 100);
    if (coupon.maxDiscountInPaise) discountInPaise = Math.min(discountInPaise, coupon.maxDiscountInPaise);
  } else if (coupon.type === "fixed_amount") {
    discountInPaise = Math.min(coupon.value, eligibleSubtotal);
  } else {
    deliveryDiscountInPaise = Math.max(0, context.deliveryChargeInPaise);
  }

  return {
    id: coupon.id,
    code: coupon.code,
    title: coupon.title,
    type: coupon.type,
    label: coupon.title,
    discountInPaise,
    deliveryDiscountInPaise,
    freeDelivery: coupon.type === "free_delivery" && deliveryDiscountInPaise > 0,
  };
};

export const formatCouponBenefit = (coupon: Pick<Coupon, "type" | "value" | "maxDiscountInPaise">): string => {
  if (coupon.type === "free_delivery") return "Free delivery";
  if (coupon.type === "percentage") {
    const value = Number.isInteger(coupon.value) ? coupon.value.toFixed(0) : coupon.value.toFixed(1);
    return coupon.maxDiscountInPaise
      ? `${value}% off up to ${formatPaiseAsRupees(coupon.maxDiscountInPaise)}`
      : `${value}% off`;
  }

  return `${formatPaiseAsRupees(coupon.value)} off`;
};
