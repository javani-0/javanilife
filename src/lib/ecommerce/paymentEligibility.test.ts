import { describe, expect, it } from "vitest";
import { getAllowedPaymentMethodsForCart, normalizeAllowedPaymentMethods } from "./paymentEligibility";
import type { CartItem } from "./types";

const item = (productId: string, allowedPaymentMethods?: CartItem["allowedPaymentMethods"]): CartItem => ({
  productId,
  itemType: "product",
  name: productId,
  category: "clothing",
  categoryLabel: "Clothing",
  quantity: 1,
  amountInPaise: 10000,
  displayPrice: "₹100/-",
  stockStatus: "available",
  allowedPaymentMethods,
});

describe("payment eligibility", () => {
  it("defaults existing products to both COD and Razorpay", () => {
    expect(normalizeAllowedPaymentMethods(undefined)).toEqual(["cod", "razorpay"]);
    expect(normalizeAllowedPaymentMethods([])).toEqual(["cod", "razorpay"]);
  });

  it("forces courses to Razorpay only", () => {
    const course: CartItem = { ...item("course:abc", ["cod", "razorpay"]), itemType: "course" };

    expect(getAllowedPaymentMethodsForCart([course])).toMatchObject({
      allowedMethods: ["razorpay"],
      codUnavailableReason: "COD is not available for course purchases.",
    });
  });

  it("intersects payment methods across product items", () => {
    const result = getAllowedPaymentMethodsForCart([
      item("online", ["razorpay"]),
      item("both", ["cod", "razorpay"]),
    ]);

    expect(result.allowedMethods).toEqual(["razorpay"]);
    expect(result.codUnavailableReason).toBe("COD is unavailable because this cart contains online-only items.");
  });

  it("detects incompatible mixed carts", () => {
    const result = getAllowedPaymentMethodsForCart([
      item("online", ["razorpay"]),
      item("cod", ["cod"]),
    ]);

    expect(result.allowedMethods).toEqual([]);
    expect(result.blockingReason).toBe("No single payment method is available for every item in this cart. Please checkout these items separately.");
  });
});
