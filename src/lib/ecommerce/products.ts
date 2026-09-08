import { formatPaiseAsRupees, parsePriceToPaise } from "./pricing";
import { normalizeAllowedPaymentMethods } from "./paymentEligibility";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS, type Product, type ProductCategory, type ProductRentalConfig, type ProductStockStatus } from "./types";

export const isProductCategory = (value: unknown): value is ProductCategory => (
  typeof value === "string" && value.trim().length > 0
);

export const getProductCategoryLabel = (product: Pick<Product, "category" | "categoryLabel">): string => {
  return product.categoryLabel || PRODUCT_CATEGORY_LABELS[product.category] || product.category;
};

export const getProductAmountInPaise = (product: Pick<Product, "amountInPaise" | "price" | "displayPrice">): number => {
  if (typeof product.amountInPaise === "number" && Number.isFinite(product.amountInPaise)) {
    return Math.max(0, Math.round(product.amountInPaise));
  }

  return parsePriceToPaise(product.displayPrice || product.price) || 0;
};

export const getProductDisplayPrice = (product: Pick<Product, "amountInPaise" | "price" | "displayPrice">): string => {
  if (product.displayPrice) return product.displayPrice;
  if (product.price) return product.price.includes("₹") ? product.price : `₹${product.price}`;
  return formatPaiseAsRupees(getProductAmountInPaise(product), { includeSuffix: true });
};

export const normalizeProductStockStatus = (stockStatus?: string): ProductStockStatus => {
  if (stockStatus === "out-of-stock" || stockStatus === "coming-soon" || stockStatus === "available") {
    return stockStatus;
  }

  return "available";
};

export const isProductActive = (product: Pick<Product, "active">): boolean => product.active !== false;

const getFallbackShortDescription = (description?: string): string => {
  if (!description) return "";

  const normalizedDescription = description.replace(/\s+/g, " ").trim();
  if (!normalizedDescription) return "";

  if (normalizedDescription.length <= 88) return normalizedDescription;
  return `${normalizedDescription.slice(0, 85).trimEnd()}...`;
};

export const isProductPurchasable = (
  product: Pick<Product, "active" | "stockStatus" | "stockQuantity" | "amountInPaise" | "price" | "displayPrice">
): boolean => {
  if (!isProductActive(product)) return false;
  if (normalizeProductStockStatus(product.stockStatus) !== "available") return false;
  if (typeof product.stockQuantity === "number" && product.stockQuantity <= 0) return false;
  return getProductAmountInPaise(product) > 0;
};

/** Trimmed, de-duplicated, order preserved — an empty list means "no sizes". */
export const normalizeProductSizes = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const sizes: string[] = [];
  for (const value of raw) {
    const size = typeof value === "string" ? value.trim() : "";
    if (!size || seen.has(size.toLowerCase())) continue;
    seen.add(size.toLowerCase());
    sizes.push(size);
  }
  return sizes;
};

/**
 * A rental config is only real when it is switched on AND carries a 24-hour
 * price — a half-filled form must never make an item look rentable for ₹0.
 */
export const normalizeProductRental = (raw: unknown): ProductRentalConfig | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const data = raw as Record<string, unknown>;
  const pricePerDayInPaise = Math.max(0, Math.round(Number(data.pricePerDayInPaise) || 0));
  const enabled = data.enabled === true && pricePerDayInPaise > 0;
  if (!enabled && pricePerDayInPaise <= 0) return undefined;
  return {
    enabled,
    pricePerDayInPaise,
    maxDays: Math.max(0, Math.round(Number(data.maxDays) || 0)),
    units: Math.max(0, Math.round(Number(data.units) || 0)),
    terms: typeof data.terms === "string" ? data.terms : "",
  };
};

export const normalizeProduct = (id: string, data: Partial<Product> & { category?: string }): Product => {
  const category = isProductCategory(data.category) ? data.category : "clothing";
  const amountInPaise = getProductAmountInPaise(data);
  const images = Array.isArray(data.images)
    ? data.images.filter((imageUrl): imageUrl is string => typeof imageUrl === "string" && imageUrl.trim().length > 0)
    : [];
  const primaryImage = data.image || images[0];

  return {
    id,
    name: data.name || "Untitled Product",
    category,
    categoryLabel: data.categoryLabel || PRODUCT_CATEGORY_LABELS[category] || category,
    shortDescription: data.shortDescription || getFallbackShortDescription(data.description),
    description: data.description || "",
    price: data.price,
    displayPrice: data.displayPrice || (amountInPaise ? formatPaiseAsRupees(amountInPaise, { includeSuffix: true }) : data.price),
    amountInPaise,
    image: primaryImage,
    images: images.length > 0 ? images : primaryImage ? [primaryImage] : [],
    features: data.features || [],
    sku: data.sku,
    stockStatus: normalizeProductStockStatus(data.stockStatus),
    stockQuantity: data.stockQuantity,
    active: data.active !== false,
    featured: data.featured === true,
    whatsappEnquiry: data.whatsappEnquiry,
    allowedPaymentMethods: normalizeAllowedPaymentMethods(data.allowedPaymentMethods),
    rating: data.rating,
    reviewCount: data.reviewCount,
    delivery: data.delivery,
    // VASTRA + rentals. A field written to Firestore is invisible until it is
    // mapped here, so all three live in the normalizer from day one.
    // `vestra` is the original misspelling — read it so nothing an admin
    // already ticked is lost.
    vastra: data.vastra === true || (data as { vestra?: boolean }).vestra === true,
    sizes: normalizeProductSizes(data.sizes),
    purchasable: data.purchasable !== false,
    rental: normalizeProductRental(data.rental),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};