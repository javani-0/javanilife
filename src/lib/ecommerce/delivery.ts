import type {
  CartItem,
  CheckoutAddress,
  DeliveryInfo,
  DeliveryPricingSettings,
  DeliveryProvider,
  OrderItem,
  PaymentInfo,
  ProductDeliveryProfile,
} from "./types";

export const DEFAULT_ITEM_WEIGHT_IN_GRAMS = 500;
export const DELIVERY_SLAB_WEIGHT_IN_GRAMS = 500;
export const BASE_DELIVERY_CHARGE_IN_PAISE = 7000;
export const EXTRA_DELIVERY_SLAB_CHARGE_IN_PAISE = 3500;
export const DEFAULT_DELIVERY_PROVIDER: DeliveryProvider = "delivery-one";
export const DELIVERY_SETTINGS_DOCUMENT_ID = "delivery";

export type DeliveryProfileMap = Record<string, ProductDeliveryProfile>;

export interface DeliveryEstimate {
  chargeInPaise: number;
  weightInGrams: number;
  usesFallbackWeight: boolean;
  freeDeliveryItemCount: number;
  billableItemCount: number;
}

export interface DeliveryOneShipmentPayload {
  provider: "delivery-one";
  mode: "manual-ready";
  orderDocumentId: string;
  orderNumber: string;
  customer: {
    name: string;
    phone: string;
    email?: string;
  };
  destination: CheckoutAddress;
  payment: {
    method: PaymentInfo["method"];
    status: PaymentInfo["status"];
    codAmountInPaise: number;
  };
  package: {
    weightInGrams: number;
    usesFallbackWeight: boolean;
    deliveryChargeInPaise: number;
  };
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    shipmentWeightInGrams: number;
    delivery?: ProductDeliveryProfile;
  }>;
}

const getPositiveNumber = (value: unknown) => (
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined
);

export const normalizeDeliveryPricingSettings = (settings?: DeliveryPricingSettings | null): Required<DeliveryPricingSettings> => ({
  baseChargeInPaise: getPositiveNumber(settings?.baseChargeInPaise) || BASE_DELIVERY_CHARGE_IN_PAISE,
});

export const normalizeDeliveryProfile = (profile?: ProductDeliveryProfile | null): ProductDeliveryProfile => {
  if (!profile) return {};

  return {
    weightInGrams: getPositiveNumber(profile.weightInGrams),
    lengthInCm: getPositiveNumber(profile.lengthInCm),
    widthInCm: getPositiveNumber(profile.widthInCm),
    heightInCm: getPositiveNumber(profile.heightInCm),
    freeDeliveryEligible: profile.freeDeliveryEligible === true,
  };
};

export const getProfileWeightInGrams = (profile?: ProductDeliveryProfile) => {
  const normalizedProfile = normalizeDeliveryProfile(profile);
  return normalizedProfile.weightInGrams || DEFAULT_ITEM_WEIGHT_IN_GRAMS;
};

export const getBillableWeight = (item: CartItem, profiles: DeliveryProfileMap): number => {
  const profile = normalizeDeliveryProfile(profiles[item.productId]);
  if (profile?.freeDeliveryEligible) return 0;

  const itemWeightInGrams = getProfileWeightInGrams(profile);

  return itemWeightInGrams * item.quantity;
};

export const calculateDeliveryEstimate = (
  items: CartItem[],
  profiles: DeliveryProfileMap,
  settings?: DeliveryPricingSettings | null,
): DeliveryEstimate => {
  let usesFallbackWeight = false;
  let freeDeliveryItemCount = 0;
  let billableItemCount = 0;
  const pricingSettings = normalizeDeliveryPricingSettings(settings);

  const weightInGrams = items.reduce((total, item) => {
    const profile = normalizeDeliveryProfile(profiles[item.productId]);
    if (profile.freeDeliveryEligible) {
      freeDeliveryItemCount += item.quantity;
      return total;
    }

    billableItemCount += item.quantity;
    if (!profile.weightInGrams) usesFallbackWeight = true;
    return total + getBillableWeight(item, profiles);
  }, 0);

  if (weightInGrams <= 0) {
    return { chargeInPaise: 0, weightInGrams, usesFallbackWeight, freeDeliveryItemCount, billableItemCount };
  }

  const slabs = Math.max(1, Math.ceil(weightInGrams / DELIVERY_SLAB_WEIGHT_IN_GRAMS));

  return {
    chargeInPaise: pricingSettings.baseChargeInPaise + Math.max(0, slabs - 1) * EXTRA_DELIVERY_SLAB_CHARGE_IN_PAISE,
    weightInGrams,
    usesFallbackWeight,
    freeDeliveryItemCount,
    billableItemCount,
  };
};

export const formatShipmentWeight = (weightInGrams: number): string => {
  if (!Number.isFinite(weightInGrams) || weightInGrams <= 0) return "0 g";
  if (weightInGrams < 1000) return `${Math.round(weightInGrams)} g`;
  const kilograms = weightInGrams / 1000;
  return `${Number.isInteger(kilograms) ? kilograms.toFixed(0) : kilograms.toFixed(2)} kg`;
};

export const createDeliveryOneShipmentPayload = ({
  orderDocumentId,
  orderNumber,
  customerName,
  customerPhone,
  customerEmail,
  address,
  items,
  payment,
  delivery,
  totalInPaise,
}: {
  orderDocumentId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  address: CheckoutAddress;
  items: OrderItem[];
  payment: PaymentInfo;
  delivery: DeliveryInfo;
  totalInPaise: number;
}): DeliveryOneShipmentPayload => ({
  provider: "delivery-one",
  mode: "manual-ready",
  orderDocumentId,
  orderNumber,
  customer: {
    name: customerName,
    phone: customerPhone,
    email: customerEmail,
  },
  destination: address,
  payment: {
    method: payment.method,
    status: payment.status,
    codAmountInPaise: payment.method === "cod" ? totalInPaise : 0,
  },
  package: {
    weightInGrams: delivery.shipmentWeightInGrams || 0,
    usesFallbackWeight: delivery.usesFallbackWeight === true,
    deliveryChargeInPaise: delivery.chargeInPaise,
  },
  items: items.map((item) => ({
    productId: item.productId,
    name: item.name,
    quantity: item.quantity,
    shipmentWeightInGrams: item.shipmentWeightInGrams || 0,
    delivery: item.delivery,
  })),
});