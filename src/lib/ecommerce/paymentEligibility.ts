import type { CartItem, PaymentMethod } from "./types";

export const ALL_PAYMENT_METHODS: PaymentMethod[] = ["cod", "razorpay"];

export interface CartPaymentEligibility {
  allowedMethods: PaymentMethod[];
  codUnavailableReason?: string;
  onlineUnavailableReason?: string;
  blockingReason?: string;
}

export const normalizeAllowedPaymentMethods = (methods?: PaymentMethod[] | null): PaymentMethod[] => {
  const normalized = ALL_PAYMENT_METHODS.filter((method) => methods?.includes(method));
  return normalized.length > 0 ? normalized : [...ALL_PAYMENT_METHODS];
};

const getItemAllowedPaymentMethods = (item: Pick<CartItem, "itemType" | "allowedPaymentMethods">): PaymentMethod[] => {
  if (item.itemType === "course") return ["razorpay"];
  return normalizeAllowedPaymentMethods(item.allowedPaymentMethods);
};

export const getAllowedPaymentMethodsForCart = (items: Pick<CartItem, "itemType" | "allowedPaymentMethods">[]): CartPaymentEligibility => {
  if (items.length === 0) return { allowedMethods: [...ALL_PAYMENT_METHODS] };

  const allowedMethods = ALL_PAYMENT_METHODS.filter((method) => (
    items.every((item) => getItemAllowedPaymentMethods(item).includes(method))
  ));

  const hasCourse = items.some((item) => item.itemType === "course");
  const hasOnlineOnlyProduct = items.some((item) => item.itemType !== "course" && !getItemAllowedPaymentMethods(item).includes("cod"));
  const hasCodOnlyProduct = items.some((item) => item.itemType !== "course" && !getItemAllowedPaymentMethods(item).includes("razorpay"));

  return {
    allowedMethods,
    codUnavailableReason: allowedMethods.includes("cod")
      ? undefined
      : hasCourse
        ? "COD is not available for course purchases."
        : hasOnlineOnlyProduct
          ? "COD is unavailable because this cart contains online-only items."
          : undefined,
    onlineUnavailableReason: allowedMethods.includes("razorpay")
      ? undefined
      : hasCodOnlyProduct
        ? "Online payment is unavailable because this cart contains COD-only items."
        : undefined,
    blockingReason: allowedMethods.length === 0
      ? "No single payment method is available for every item in this cart. Please checkout these items separately."
      : undefined,
  };
};
