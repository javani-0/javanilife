import type { CartItem, CartTotals } from "./types";

export const DEFAULT_CURRENCY = "INR";

export const parsePriceToPaise = (price: string | number | null | undefined): number | null => {
  if (typeof price === "number") {
    return Number.isFinite(price) && price >= 0 ? Math.round(price * 100) : null;
  }

  if (!price) return null;

  const normalized = price
    .replace(/,/g, "")
    .replace(/₹/g, "")
    .replace(/\/-/g, "")
    .replace(/-/g, "")
    .replace(/[^0-9.]/g, "")
    .trim();

  if (!normalized) return null;

  const rupeeAmount = Number(normalized);
  if (!Number.isFinite(rupeeAmount) || rupeeAmount < 0) return null;

  return Math.round(rupeeAmount * 100);
};

export const formatPaiseAsRupees = (
  amountInPaise: number,
  options: { includeSymbol?: boolean; includeSuffix?: boolean } = {}
): string => {
  const { includeSymbol = true, includeSuffix = false } = options;
  const safeAmount = Number.isFinite(amountInPaise) ? amountInPaise : 0;
  const rupeeAmount = Math.max(0, safeAmount) / 100;
  const hasPaise = !Number.isInteger(rupeeAmount);
  const formatted = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: Number.isInteger(rupeeAmount) ? 0 : 2,
    minimumFractionDigits: hasPaise ? 2 : 0,
  }).format(rupeeAmount);

  return `${includeSymbol ? "₹" : ""}${formatted}${includeSuffix ? "/-" : ""}`;
};

export const calculateLineTotal = (amountInPaise: number, quantity: number): number => {
  const safeAmount = Number.isFinite(amountInPaise) ? amountInPaise : 0;
  const safeQuantity = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
  return Math.max(0, safeAmount) * safeQuantity;
};

export const calculateCartTotals = (
  items: Pick<CartItem, "amountInPaise" | "quantity">[],
  deliveryChargeInPaise = 0,
  discountInPaise = 0
): CartTotals => {
  const subtotalInPaise = items.reduce(
    (subtotal, item) => subtotal + calculateLineTotal(item.amountInPaise, item.quantity),
    0
  );
  const safeDeliveryCharge = Math.max(0, Number.isFinite(deliveryChargeInPaise) ? deliveryChargeInPaise : 0);
  const safeDiscount = Math.max(0, Number.isFinite(discountInPaise) ? discountInPaise : 0);
  const totalItems = items.reduce((itemCount, item) => itemCount + Math.max(0, Math.floor(item.quantity || 0)), 0);
  const totalInPaise = Math.max(0, subtotalInPaise + safeDeliveryCharge - safeDiscount);

  return {
    subtotalInPaise,
    deliveryChargeInPaise: safeDeliveryCharge,
    discountInPaise: safeDiscount,
    totalInPaise,
    totalItems,
  };
};