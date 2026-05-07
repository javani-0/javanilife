export const PRODUCT_CATEGORIES = [
  "clothing",
  "thermic-toys",
  "aaharya",
  "accessories",
  "books-stationaries",
  "sattvic-refreshments",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
export type ProductCategoryFilter = "all" | ProductCategory;

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  clothing: "Clothing",
  "thermic-toys": "Thermic Toys",
  aaharya: "Aaharya Collections",
  accessories: "Practice Accessories",
  "books-stationaries": "Books & Stationaries",
  "sattvic-refreshments": "Sattvic Refreshments",
};

export type ProductStockStatus = "available" | "out-of-stock" | "coming-soon";
export type PaymentMethod = "cod" | "razorpay";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded" | "cod-pending" | "cod-collected";
export type OrderStatus = "placed" | "confirmed" | "packed" | "shipped" | "out-for-delivery" | "delivered" | "cancelled" | "returned";
export type UserRole = "admin" | "user";
export type OrderCancellationStatus = "none" | "requested" | "approved" | "rejected";

export interface ProductDeliveryProfile {
  weightInGrams?: number;
  lengthInCm?: number;
  widthInCm?: number;
  heightInCm?: number;
  freeDeliveryEligible?: boolean;
}

export type DeliveryProvider = "manual" | "delivery-one";
export type DeliverySyncStatus = "manual-ready" | "pending" | "synced" | "failed";

export interface DeliveryPricingSettings {
  baseChargeInPaise?: number;
}

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  categoryLabel?: string;
  shortDescription?: string;
  description?: string;
  price?: string;
  displayPrice?: string;
  amountInPaise?: number;
  image?: string;
  images?: string[];
  features?: string[];
  sku?: string;
  stockStatus?: ProductStockStatus;
  stockQuantity?: number;
  active?: boolean;
  featured?: boolean;
  whatsappEnquiry?: boolean;
  rating?: number;
  reviewCount?: number;
  delivery?: ProductDeliveryProfile;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CartItem {
  productId: string;
  name: string;
  category: ProductCategory;
  categoryLabel: string;
  image?: string;
  quantity: number;
  amountInPaise: number;
  displayPrice: string;
  stockStatus: ProductStockStatus;
  maxQuantity?: number;
  addedAt?: unknown;
  updatedAt?: unknown;
}

export interface CartTotals {
  subtotalInPaise: number;
  deliveryChargeInPaise: number;
  discountInPaise: number;
  totalInPaise: number;
  totalItems: number;
}

export interface Cart {
  userId?: string;
  items: CartItem[];
  totals: CartTotals;
  updatedAt?: unknown;
}

export interface CheckoutAddress {
  id?: string;
  fullName: string;
  phone: string;
  email?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  landmark?: string;
  notes?: string;
  isDefault?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PaymentInfo {
  method: PaymentMethod;
  status: PaymentStatus;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignatureVerified?: boolean;
  paidAt?: unknown;
}

export interface DeliveryInfo {
  chargeInPaise: number;
  status?: OrderStatus;
  provider?: DeliveryProvider;
  syncStatus?: DeliverySyncStatus;
  providerOrderId?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  providerStatus?: string;
  providerStatusType?: string;
  shipmentWeightInGrams?: number;
  usesFallbackWeight?: boolean;
  lastSyncedAt?: unknown;
  lastTrackedAt?: unknown;
  lastSyncError?: string;
  deliveredAt?: unknown;
  cancelledAt?: unknown;
}

export interface OrderCancellationInfo {
  status?: OrderCancellationStatus;
  reason?: string;
  requestedAt?: unknown;
  requestedBy?: string;
  approvedAt?: unknown;
  approvedBy?: string;
  rejectedAt?: unknown;
  rejectedBy?: string;
  adminNote?: string;
  providerStatus?: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  category: ProductCategory;
  categoryLabel: string;
  image?: string;
  quantity: number;
  amountInPaise: number;
  lineTotalInPaise: number;
  delivery?: ProductDeliveryProfile;
  shipmentWeightInGrams?: number;
}

export interface OrderTimelineEvent {
  status: OrderStatus;
  label: string;
  note?: string;
  createdAt: unknown;
  createdBy?: string;
}

export interface Order {
  id: string;
  orderNumber?: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  customerWhatsAppNumber?: string;
  customerCallNumber?: string;
  items: OrderItem[];
  address: CheckoutAddress;
  payment: PaymentInfo;
  delivery: DeliveryInfo;
  cancellation?: OrderCancellationInfo;
  status: OrderStatus;
  subtotalInPaise: number;
  deliveryChargeInPaise: number;
  discountInPaise: number;
  totalInPaise: number;
  timeline: OrderTimelineEvent[];
  customerNotes?: string;
  adminNotes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WishlistItem {
  productId: string;
  name?: string;
  categoryLabel?: string;
  image?: string;
  displayPrice?: string;
  amountInPaise?: number;
  addedAt?: unknown;
}

export interface CustomerProfile {
  uid: string;
  username: string;
  email: string;
  phone?: string;
  whatsappNumber?: string;
  callNumber?: string;
  role: UserRole;
  totalSpendInPaise?: number;
  orderCount?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProductRevenueSummary {
  productId: string;
  productName: string;
  unitsSold: number;
  revenueInPaise: number;
  orderCount: number;
}

export interface CustomerRevenueSummary {
  customerId: string;
  customerName: string;
  customerEmail?: string;
  orderCount: number;
  totalSpendInPaise: number;
  averageOrderValueInPaise: number;
}

