import { calculateLineTotal } from "./pricing";
import { getBillableWeight, normalizeDeliveryProfile } from "./delivery";
import type { CartItem, OrderItem, OrderStatus, ProductDeliveryProfile } from "./types";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  placed: "Placed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  "out-for-delivery": "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  placed: ["confirmed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["out-for-delivery", "delivered", "returned"],
  "out-for-delivery": ["delivered", "returned"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
};

export const canTransitionOrderStatus = (currentStatus: OrderStatus, nextStatus: OrderStatus): boolean => {
  return ORDER_STATUS_TRANSITIONS[currentStatus].includes(nextStatus);
};

export const createOrderItemFromCartItem = (cartItem: CartItem, deliveryProfile?: ProductDeliveryProfile): OrderItem => {
  const normalizedDeliveryProfile = normalizeDeliveryProfile(deliveryProfile);

  return {
    productId: cartItem.productId,
    sourceId: cartItem.sourceId || cartItem.productId,
    itemType: cartItem.itemType || "product",
    name: cartItem.name,
    category: cartItem.category,
    categoryLabel: cartItem.categoryLabel,
    image: cartItem.image,
    quantity: cartItem.quantity,
    amountInPaise: cartItem.amountInPaise,
    lineTotalInPaise: calculateLineTotal(cartItem.amountInPaise, cartItem.quantity),
    allowedPaymentMethods: cartItem.allowedPaymentMethods,
    delivery: normalizedDeliveryProfile,
    shipmentWeightInGrams: getBillableWeight(cartItem, { [cartItem.productId]: normalizedDeliveryProfile }),
  };
};