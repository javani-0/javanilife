export interface ManagedCategoryOption {
  id: string;
  label: string;
  active?: boolean;
  order?: number;
}

export interface CourseCategoryOption extends ManagedCategoryOption {
  badge: string;
  badgeColor: "red" | "gold" | "charcoal";
  detail: string;
  sectionLabel: string;
  description: string;
}

export const DEFAULT_PRODUCT_CATEGORY_OPTIONS: ManagedCategoryOption[] = [
  { id: "clothing", label: "Clothing", active: true, order: 0 },
  { id: "thermic-toys", label: "Thermic Toys", active: true, order: 1 },
  { id: "aaharya", label: "Aaharya Collections", active: true, order: 2 },
  { id: "accessories", label: "Practice Accessories", active: true, order: 3 },
  { id: "books-stationaries", label: "Books & Stationaries", active: true, order: 4 },
  { id: "sattvic-refreshments", label: "Sattvic Refreshments", active: true, order: 5 },
];

export const DEFAULT_COURSE_CATEGORY_OPTIONS: CourseCategoryOption[] = [
  {
    id: "grades",
    label: "Grades",
    badge: "Grades Course",
    badgeColor: "red",
    detail: "Recognized Certification",
    sectionLabel: "STRUCTURED LEARNING",
    description: "Complete a structured grade-based journey and earn recognized certification through progressive levels.",
    active: true,
    order: 0,
  },
  {
    id: "diploma",
    label: "Diploma",
    badge: "Diploma Course",
    badgeColor: "gold",
    detail: "University-Linked Certificate",
    sectionLabel: "ADVANCED MASTERY",
    description: "Deepen your mastery with advanced, university-linked diploma programs.",
    active: true,
    order: 1,
  },
  {
    id: "pre-grade",
    label: "Pre-Grade",
    badge: "Pre-Grade",
    badgeColor: "charcoal",
    detail: "Beginner Friendly",
    sectionLabel: "EXPLORE & DISCOVER",
    description: "Perfect for curious beginners, young children, or those exploring arts without formal examination pressure.",
    active: true,
    order: 2,
  },
  {
    id: "masterclass-workshops",
    label: "Masterclass & Workshops",
    badge: "Masterclass & Workshop",
    badgeColor: "gold",
    detail: "Intensive Sessions",
    sectionLabel: "INTENSIVE TRAINING",
    description: "Deep dive into specific techniques and practices with intensive masterclasses and focused workshops.",
    active: true,
    order: 3,
  },
  {
    id: "yoga",
    label: "Yoga",
    badge: "Yoga Course",
    badgeColor: "charcoal",
    detail: "Certificate on Completion",
    sectionLabel: "MIND & BODY",
    description: "Ancient practices for holistic wellness, combining physical postures, breathing techniques, and meditation.",
    active: true,
    order: 4,
  },
  {
    id: "konnakol",
    label: "Konnakol",
    badge: "Konnakol Course",
    badgeColor: "red",
    detail: "Grade-based Levels",
    sectionLabel: "RHYTHMIC ARTS",
    description: "Master the art of South Indian vocal percussion through systematic practice and rhythmic recitation.",
    active: true,
    order: 5,
  },
];

export const PRODUCT_CATEGORIES = DEFAULT_PRODUCT_CATEGORY_OPTIONS.map((category) => category.id);
export type ProductCategory = string;
export type ProductCategoryFilter = "all" | ProductCategory;

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = Object.fromEntries(
  DEFAULT_PRODUCT_CATEGORY_OPTIONS.map((category) => [category.id, category.label]),
);

export type CartItemType = "product" | "course";

export type ProductStockStatus = "available" | "out-of-stock" | "coming-soon";
export type PaymentMethod = "cod" | "razorpay";
export type PaymentStatus = "pending" | "paid" | "partially-paid" | "failed" | "refunded" | "cod-pending" | "cod-collected";
export type CoursePaymentPlanOption = "full" | "installment";
export type CourseInstallmentStatus = "pending" | "paid" | "overdue";
export type OrderStatus = "placed" | "confirmed" | "packed" | "shipped" | "out-for-delivery" | "delivered" | "cancelled" | "returned";
export type UserRole = "admin" | "user";
export type OrderCancellationStatus = "none" | "requested" | "approved" | "rejected";

export interface CourseInstallmentPayment {
  installmentNumber: number;
  label: string;
  percentage: number;
  amountInPaise: number;
  status: CourseInstallmentStatus;
  dueDate?: string;
  paidAt?: unknown;
  razorpayPaymentId?: string;
  lastReminderSentAt?: unknown;
  lastReminderMonthKey?: string;
  reminderCount?: number;
}

export interface CourseInstallmentPlan {
  status: "active" | "completed" | "cancelled";
  totalInPaise: number;
  initialPaymentInPaise: number;
  remainingInPaise: number;
  reminderDayOfMonth: number;
  installments: CourseInstallmentPayment[];
}

export interface ProductDeliveryProfile {
  weightInGrams?: number;
  lengthInCm?: number;
  widthInCm?: number;
  heightInCm?: number;
  freeDeliveryEligible?: boolean;
}

export type DeliveryProvider = "manual" | "delivery-one";
export type DeliverySyncStatus = "manual-ready" | "pending" | "synced" | "failed";
export type DeliveryLifecycleStatus = "pending" | "ready-to-ship" | "ready-for-pickup" | "in-transit" | "out-for-delivery" | "delivered" | "cancelled" | "rto-in-transit" | "rto-returned" | "lost" | "ndr";
export type DeliveryPickupRequestStatus = "booked" | "id-missing";
export type DeliveryPickupCancellationStatus = "manual-required" | "cancelled" | "not-required" | "failed";

export interface DeliveryPricingSettings {
  baseChargeInPaise?: number;
  freeDeliveryEnabled?: boolean;
  freeDeliveryMinSubtotalInPaise?: number;
  freeDeliveryMessage?: string;
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
  allowedPaymentMethods?: PaymentMethod[];
  rating?: number;
  reviewCount?: number;
  delivery?: ProductDeliveryProfile;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CartItem {
  productId: string;
  sourceId?: string;
  itemType?: CartItemType;
  name: string;
  category: ProductCategory;
  categoryLabel: string;
  image?: string;
  quantity: number;
  amountInPaise: number;
  displayPrice: string;
  stockStatus: ProductStockStatus;
  allowedPaymentMethods?: PaymentMethod[];
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
  plan?: CoursePaymentPlanOption;
  totalPayableInPaise?: number;
  expectedOnlineAmountInPaise?: number;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignatureVerified?: boolean;
  installmentPlan?: CourseInstallmentPlan;
  paidAt?: unknown;
}

export interface DeliveryInfo {
  chargeInPaise: number;
  status?: OrderStatus;
  provider?: DeliveryProvider;
  syncStatus?: DeliverySyncStatus;
  lifecycleStatus?: DeliveryLifecycleStatus;
  method?: "shipping" | "store-pickup";
  providerOrderId?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  providerStatus?: string;
  providerStatusType?: string;
  labelUrl?: string;
  labelPdfSize?: "A4" | "4R";
  labelFetchedAt?: unknown;
  manifestedAt?: unknown;
  pickupId?: string;
  pickupRequestStatus?: DeliveryPickupRequestStatus;
  pickupRequestMessage?: string;
  pickupDate?: string;
  pickupTime?: string;
  pickupLocation?: string;
  expectedPackageCount?: number;
  pickupCancellationStatus?: DeliveryPickupCancellationStatus;
  pickupCancellationReason?: string;
  pickupCancellationMarkedAt?: unknown;
  pickupCancelledAt?: unknown;
  lastWebhookAt?: unknown;
  lastCarrierEventAt?: unknown;
  ndrReason?: string;
  rtoReason?: string;
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
  sourceId?: string;
  itemType?: CartItemType;
  name: string;
  category: ProductCategory;
  categoryLabel: string;
  image?: string;
  quantity: number;
  amountInPaise: number;
  lineTotalInPaise: number;
  allowedPaymentMethods?: PaymentMethod[];
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
  coupon?: {
    id: string;
    code: string;
    title: string;
    type: string;
    discountInPaise: number;
    deliveryDiscountInPaise?: number;
    freeDelivery?: boolean;
  };
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

