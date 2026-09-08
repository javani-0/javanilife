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

export type CartItemType = "product" | "course" | "rental";

/**
 * The rental terms carried by a cart line and copied onto the order item, so a
 * booking can be reconstructed from the order alone (req 3).
 */
export interface RentalSelection {
  /** ISO moment the item goes out. */
  startAt: string;
  /** ISO moment it is due back — start + days × 24h. */
  dueAt: string;
  days: number;
  pricePerDayInPaise: number;
  /** "pickup" or "delivery", chosen at checkout (req 4). */
  fulfilment?: "pickup" | "delivery";
}

export type ProductStockStatus = "available" | "out-of-stock" | "coming-soon";

export const PRODUCT_STOCK_LABEL: Record<ProductStockStatus, string> = {
  available: "Available",
  "out-of-stock": "Out of stock",
  "coming-soon": "Coming soon",
};
export type PaymentMethod = "cod" | "razorpay";
export type PaymentStatus = "pending" | "paid" | "partially-paid" | "failed" | "refunded" | "cod-pending" | "cod-collected";
export type CoursePaymentPlanOption = "full" | "installment";
export type CourseInstallmentStatus = "pending" | "paid" | "overdue";
export type OrderStatus = "placed" | "confirmed" | "packed" | "shipped" | "out-for-delivery" | "delivered" | "cancelled" | "returned";
export type UserRole = "admin" | "user";
export type OrderCancellationStatus = "none" | "requested" | "approved" | "rejected";

export interface EmiSettings {
  enabled: boolean;
  minAmountInPaise: number;
  upfrontPercentage: number;
  installmentPercentages: number[];
  reminderDaysBefore: number;
}

export const DEFAULT_EMI_SETTINGS: EmiSettings = {
  enabled: true,
  minAmountInPaise: 1200000,
  upfrontPercentage: 50,
  installmentPercentages: [25, 25],
  reminderDaysBefore: 5,
};

export const normalizeEmiSettings = (data?: Partial<EmiSettings> | null): EmiSettings => ({
  enabled: data?.enabled ?? DEFAULT_EMI_SETTINGS.enabled,
  minAmountInPaise: Number(data?.minAmountInPaise) || DEFAULT_EMI_SETTINGS.minAmountInPaise,
  upfrontPercentage: Number(data?.upfrontPercentage) || DEFAULT_EMI_SETTINGS.upfrontPercentage,
  installmentPercentages: Array.isArray(data?.installmentPercentages) && data!.installmentPercentages.length > 0
    ? data!.installmentPercentages.map(Number)
    : [...DEFAULT_EMI_SETTINGS.installmentPercentages],
  reminderDaysBefore: Number(data?.reminderDaysBefore) || DEFAULT_EMI_SETTINGS.reminderDaysBefore,
});

export interface EmiSubscriptionInfo {
  razorpaySubscriptionId?: string;
  razorpayPlanId?: string;
  mandateStatus?: "created" | "authenticated" | "active" | "halted" | "cancelled" | "completed";
  shortUrl?: string;
  autopayEnabled?: boolean;
  createdAt?: unknown;
}

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

// ── Rentals (req 2-4) ─────────────────────────────────────────────────────
// The admin sets ONE price: what 24 hours costs. Everything else is derived —
// a booking of N days is N × that, and time past the return moment is billed
// per started hour at a 24th of it (see src/lib/ecommerce/rentals.ts).
export interface ProductRentalConfig {
  enabled: boolean;
  /** What 24 hours costs. The only price the admin types. */
  pricePerDayInPaise: number;
  /** Longest booking the customer may make. 0 = no limit. */
  maxDays?: number;
  /** How many of this item can be out at once. 0 = not tracked. */
  units?: number;
  /** Shown on the rental card — care instructions, ID proof needed, etc. */
  terms?: string;
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
  /** Shown in the VESTRA section (req 2/4). */
  vestra?: boolean;
  /** Rentable, and on what terms (req 3). Absent = purchase only. */
  rental?: ProductRentalConfig;
  /** Sold outright. Default true; a rent-only costume sets it false. */
  purchasable?: boolean;
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
  /** Present only on `itemType: "rental"` lines. */
  rental?: RentalSelection;
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
  emiSubscription?: EmiSubscriptionInfo;
  emiSettings?: EmiSettings;
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
  /** 1 = first manifest; 2+ after a re-manifest (req 7). */
  manifestAttempt?: number;
  remanifestReason?: string;
  remanifestedAt?: unknown;
  /** Waybills this order carried before it was re-booked — never overwritten. */
  previousShipments?: {
    attempt?: number;
    trackingNumber?: string;
    providerOrderId?: string;
    providerStatus?: string;
    lifecycleStatus?: string;
    pickupId?: string;
    reason?: string;
    archivedAt?: string;
  }[];
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
  /** Present only on rental lines — what was booked, and until when. */
  rental?: RentalSelection;
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

