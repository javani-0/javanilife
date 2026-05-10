import { calculateCartTotals } from "./pricing";
import { getProductAmountInPaise, getProductCategoryLabel, getProductDisplayPrice, normalizeProductStockStatus } from "./products";
import type { Cart, CartItem, Product } from "./types";

export const CART_STORAGE_KEY = "javani.cart.v1";
export const BUY_NOW_STORAGE_KEY = "javani.buyNow.v1";

export const clampCartQuantity = (quantity: number, maxQuantity?: number): number => {
  const safeQuantity = Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : 1;
  return typeof maxQuantity === "number" && maxQuantity > 0 ? Math.min(safeQuantity, maxQuantity) : safeQuantity;
};

export const createCartItemFromProduct = (product: Product, quantity = 1): CartItem => {
  const maxQuantity = typeof product.stockQuantity === "number" ? Math.max(0, product.stockQuantity) : undefined;

  return {
    productId: product.id,
    sourceId: product.id,
    itemType: "product",
    name: product.name,
    category: product.category,
    categoryLabel: getProductCategoryLabel(product),
    image: product.image || product.images?.[0],
    quantity: clampCartQuantity(quantity, maxQuantity),
    amountInPaise: getProductAmountInPaise(product),
    displayPrice: getProductDisplayPrice(product),
    stockStatus: normalizeProductStockStatus(product.stockStatus),
    maxQuantity,
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