import { calculateCartTotals } from "./pricing";
import { getProductAmountInPaise, getProductCategoryLabel, getProductDisplayPrice, normalizeProductStockStatus } from "./products";
import { clampRentalDays, rentalBaseInPaise, rentalDueAt } from "./rentals";
import type { Cart, CartItem, Product, RentalSelection } from "./types";

export const CART_STORAGE_KEY = "javani.cart.v1";
export const BUY_NOW_STORAGE_KEY = "javani.buyNow.v1";

export const clampCartQuantity = (quantity: number, maxQuantity?: number): number => {
  const safeQuantity = Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : 1;
  return typeof maxQuantity === "number" && maxQuantity > 0 ? Math.min(safeQuantity, maxQuantity) : safeQuantity;
};

export const createCartItemFromProduct = (product: Product, quantity = 1, size?: string): CartItem => {
  const maxQuantity = typeof product.stockQuantity === "number" ? Math.max(0, product.stockQuantity) : undefined;
  const chosenSize = (size || "").trim();

  return {
    // Two sizes of the same dress are two different things to pick, pack and
    // count, so they are two cart lines (the cart is keyed by productId).
    productId: chosenSize ? `${product.id}::${chosenSize}` : product.id,
    sourceId: product.id,
    itemType: "product",
    name: chosenSize ? `${product.name} (${chosenSize})` : product.name,
    category: product.category,
    categoryLabel: getProductCategoryLabel(product),
    image: product.image || product.images?.[0],
    quantity: clampCartQuantity(quantity, maxQuantity),
    amountInPaise: getProductAmountInPaise(product),
    displayPrice: getProductDisplayPrice(product),
    stockStatus: normalizeProductStockStatus(product.stockStatus),
    allowedPaymentMethods: product.allowedPaymentMethods,
    maxQuantity,
    ...(chosenSize ? { size: chosenSize } : {}),
  };
};

/**
 * A RENTAL line (req 3/4). Namespaced exactly like a course line
 * ("course:<id>"), because the same costume can sit in the cart twice — once
 * bought, once rented for a particular weekend — and the cart is keyed by
 * `productId`. The amount is the whole booking (days × the 24-hour price), so
 * every existing total, coupon and payment rule works untouched.
 */
export const createCartItemFromRental = (
  product: Product,
  selection: { startAt: string; days: number; quantity?: number; fulfilment?: "pickup" | "delivery"; size?: string },
): CartItem => {
  const pricePerDayInPaise = Math.max(0, Math.round(product.rental?.pricePerDayInPaise || 0));
  const days = clampRentalDays(selection.days, product.rental?.maxDays || 0);
  const quantity = clampCartQuantity(selection.quantity || 1, product.rental?.units || undefined);
  const rental: RentalSelection = {
    startAt: selection.startAt,
    dueAt: rentalDueAt(selection.startAt, days),
    days,
    pricePerDayInPaise,
    ...(selection.fulfilment ? { fulfilment: selection.fulfilment } : {}),
  };

  const chosenSize = (selection.size || "").trim();

  return {
    productId: `rent:${product.id}:${selection.startAt}${chosenSize ? `:${chosenSize}` : ""}`,
    sourceId: product.id,
    itemType: "rental",
    name: `${product.name}${chosenSize ? ` (${chosenSize})` : ""} — ${days} day${days === 1 ? "" : "s"} rental`,
    category: product.category,
    categoryLabel: getProductCategoryLabel(product),
    image: product.image || product.images?.[0],
    quantity,
    // One "unit" of this line is the whole booking for one item.
    amountInPaise: rentalBaseInPaise(pricePerDayInPaise, days, 1),
    displayPrice: `₹${(rentalBaseInPaise(pricePerDayInPaise, days, 1) / 100).toLocaleString("en-IN")}`,
    stockStatus: normalizeProductStockStatus(product.stockStatus),
    allowedPaymentMethods: product.allowedPaymentMethods,
    maxQuantity: product.rental?.units || undefined,
    rental,
    ...(chosenSize ? { size: chosenSize } : {}),
  };
};

export const mergeCartItems = (currentItems: CartItem[], incomingItems: CartItem[]): CartItem[] => {
  const mergedItems = new Map<string, CartItem>();

  currentItems.forEach((item) => {
    mergedItems.set(item.productId, { ...item, quantity: clampCartQuantity(item.quantity, item.maxQuantity) });
  });

  incomingItems.forEach((incomingItem) => {
    const existingItem = mergedItems.get(incomingItem.productId);
    if (!existingItem) {
      mergedItems.set(incomingItem.productId, {
        ...incomingItem,
        quantity: clampCartQuantity(incomingItem.quantity, incomingItem.maxQuantity),
      });
      return;
    }

    mergedItems.set(incomingItem.productId, {
      ...existingItem,
      ...incomingItem,
      quantity: clampCartQuantity(existingItem.quantity + incomingItem.quantity, incomingItem.maxQuantity || existingItem.maxQuantity),
    });
  });

  return Array.from(mergedItems.values());
};

export const setCartItemQuantity = (items: CartItem[], productId: string, quantity: number): CartItem[] => (
  items.map((item) => item.productId === productId ? { ...item, quantity: clampCartQuantity(quantity, item.maxQuantity) } : item)
);

export const removeCartItem = (items: CartItem[], productId: string): CartItem[] => (
  items.filter((item) => item.productId !== productId)
);

export const createCart = (items: CartItem[], userId?: string): Cart => ({
  userId,
  items,
  totals: calculateCartTotals(items),
});