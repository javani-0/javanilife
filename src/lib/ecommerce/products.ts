import { formatPaiseAsRupees, parsePriceToPaise } from "./pricing";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS, type Product, type ProductCategory, type ProductStockStatus } from "./types";

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
    rating: data.rating,
    reviewCount: data.reviewCount,
    delivery: data.delivery,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};