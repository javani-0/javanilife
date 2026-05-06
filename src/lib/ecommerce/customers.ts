import { getProductAmountInPaise, getProductCategoryLabel, getProductDisplayPrice } from "./products";
import type { CheckoutAddress, CustomerProfile, Order, Product, WishlistItem } from "./types";

const toRecord = (value: unknown): Record<string, unknown> => (
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {}
);

const getString = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const getNumber = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const getBoolean = (value: unknown, fallback = false) => typeof value === "boolean" ? value : fallback;

export const normalizeCustomerProfile = (uid: string, data: unknown): CustomerProfile => {
  const profile = toRecord(data);
  const email = getString(profile.email);

  return {
    uid,
    username: getString(profile.username, getString(profile.displayName, email || "Javani Member")),
    email,
    phone: getString(profile.phone) || undefined,
    role: profile.role === "admin" ? "admin" : "user",
    totalSpendInPaise: getNumber(profile.totalSpendInPaise, 0),
    orderCount: getNumber(profile.orderCount, 0),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
};

export const normalizeCustomerAddress = (id: string, data: unknown): CheckoutAddress => {
  const address = toRecord(data);

  return {
    id,
    fullName: getString(address.fullName),
    phone: getString(address.phone),
    email: getString(address.email) || undefined,
    line1: getString(address.line1),
    line2: getString(address.line2) || undefined,
    city: getString(address.city),
    state: getString(address.state),
    pincode: getString(address.pincode),
    landmark: getString(address.landmark) || undefined,
    notes: getString(address.notes) || undefined,
    isDefault: getBoolean(address.isDefault, false),
    createdAt: address.createdAt,
    updatedAt: address.updatedAt,
  };
};

export const normalizeWishlistItem = (productId: string, data: unknown): WishlistItem => {
  const item = toRecord(data);

  return {
    productId: getString(item.productId, productId),
    name: getString(item.name) || undefined,
    categoryLabel: getString(item.categoryLabel) || undefined,
    image: getString(item.image) || undefined,
    displayPrice: getString(item.displayPrice) || undefined,
    amountInPaise: getNumber(item.amountInPaise, 0),
    addedAt: item.addedAt,
  };
};

export const createWishlistItemFromProduct = (product: Product): Omit<WishlistItem, "addedAt"> => ({
  productId: product.id,
  name: product.name,
  categoryLabel: getProductCategoryLabel(product),
  image: product.image || product.images?.[0],
  displayPrice: getProductDisplayPrice(product),
  amountInPaise: getProductAmountInPaise(product),
});

export const normalizeCustomerOrder = (id: string, data: unknown): Order => ({
  id,
  ...(toRecord(data) as Omit<Order, "id">),
});

export const getDateValue = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate() as Date;
  }
  return null;
};

export const formatAccountDate = (value: unknown): string => {
  const date = getDateValue(value);
  if (!date) return "Pending";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

export const sortOrdersNewestFirst = (orders: Order[]) => [...orders].sort((first, second) => {
  const firstDate = getDateValue(first.createdAt)?.getTime() || 0;
  const secondDate = getDateValue(second.createdAt)?.getTime() || 0;
  return secondDate - firstDate;
});