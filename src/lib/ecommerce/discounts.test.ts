import { describe, expect, it } from "vitest";
import {
  calculateCouponDiscount,
  evaluateCouponEligibility,
  formatCouponBenefit,
  normalizeCoupon,
  type Coupon,
} from "./discounts";
import type { CartItem } from "./types";

const productItem: CartItem = {
  productId: "product-1",
  itemType: "product",
  name: "Practice Saree",
  category: "clothing",
  categoryLabel: "Clothing",
  quantity: 2,
  amountInPaise: 100000,
  displayPrice: "₹1,000/-",
  stockStatus: "available",
};

const courseItem: CartItem = {
  productId: "course:abc",
  sourceId: "abc",
  itemType: "course",
  name: "Kuchipudi Diploma",
  category: "diploma",
  categoryLabel: "Diploma",
  quantity: 1,
  amountInPaise: 500000,
  displayPrice: "₹5,000/-",
  stockStatus: "available",
};

const baseCoupon: Coupon = {
  id: "SAVE10",
  code: "SAVE10",
  title: "Save 10%",
  type: "percentage",
  value: 10,
  active: true,
  visibleAtCheckout: true,
};

describe("discount helpers", () => {
  it("normalizes coupon codes and fixed amount values", () => {
    const coupon = normalizeCoupon(" save200 ", {
      code: " save200 ",
      title: "Save 200",
      type: "fixed_amount",
      value: 200,
      active: true,
      visibleAtCheckout: true,
      minSubtotalInPaise: 50000,
    });

    expect(coupon.code).toBe("SAVE200");
    expect(coupon.value).toBe(20000);
    expect(coupon.minSubtotalInPaise).toBe(50000);
  });

  it("calculates percentage discounts with a max cap", () => {
    const discount = calculateCouponDiscount(
      { ...baseCoupon, maxDiscountInPaise: 15000 },
      { items: [productItem], subtotalInPaise: 200000, deliveryChargeInPaise: 7000 },
    );

    expect(discount).toMatchObject({
      code: "SAVE10",
      discountInPaise: 15000,
      freeDelivery: false,
    });
  });

  it("calculates fixed amount discounts without going below zero", () => {
    const discount = calculateCouponDiscount(
      { ...baseCoupon, type: "fixed_amount", value: 300000, title: "Big Save" },
      { items: [productItem], subtotalInPaise: 200000, deliveryChargeInPaise: 7000 },
    );

    expect(discount.discountInPaise).toBe(200000);
  });

  it("treats free delivery coupons as delivery waivers", () => {
    const discount = calculateCouponDiscount(
      { ...baseCoupon, type: "free_delivery", value: 0, title: "Free Delivery" },
      { items: [productItem], subtotalInPaise: 200000, deliveryChargeInPaise: 7000 },
    );

    expect(discount).toMatchObject({
      discountInPaise: 0,
      deliveryDiscountInPaise: 7000,
      freeDelivery: true,
    });
  });

  it("explains minimum subtotal and category eligibility failures", () => {
    const minSubtotal = evaluateCouponEligibility(
      { ...baseCoupon, minSubtotalInPaise: 300000 },
      { items: [productItem], subtotalInPaise: 200000, deliveryChargeInPaise: 7000 },
    );
    const category = evaluateCouponEligibility(
      { ...baseCoupon, applicableCategoryIds: ["books"] },
      { items: [productItem], subtotalInPaise: 200000, deliveryChargeInPaise: 7000 },
    );

    expect(minSubtotal).toEqual({ eligible: false, reason: "Add ₹1,000 more to use this coupon." });
    expect(category).toEqual({ eligible: false, reason: "This coupon is not valid for the items in your cart." });
  });

  it("applies a category-scoped coupon to matching items", () => {
    const discount = calculateCouponDiscount(
      { ...baseCoupon, applicableCategoryIds: ["clothing"] },
      { items: [productItem], subtotalInPaise: 200000, deliveryChargeInPaise: 7000 },
    );
    expect(discount.discountInPaise).toBe(20000); // 10% of the clothing line total
  });

  it("matches category coupons by label, casing, or spacing (slug-tolerant)", () => {
    const masterclassItem: CartItem = {
      ...productItem,
      category: "masterclass-and-workshops",
      categoryLabel: "Masterclass & Workshops",
    };
    for (const entered of ["Masterclass & Workshops", "MASTERCLASS-AND-WORKSHOPS", "  masterclass and workshops  "]) {
      const result = evaluateCouponEligibility(
        { ...baseCoupon, applicableCategoryIds: [entered] },
        { items: [masterclassItem], subtotalInPaise: 200000, deliveryChargeInPaise: 7000 },
      );
      expect(result.eligible).toBe(true);
    }
  });

  it("only discounts items in the coupon's category within a mixed cart", () => {
    const discount = calculateCouponDiscount(
      { ...baseCoupon, applicableCategoryIds: ["clothing"] },
      { items: [productItem, courseItem], subtotalInPaise: 700000, deliveryChargeInPaise: 7000 },
    );
    // 10% of the clothing line (₹2,000) only — the diploma course is excluded.
    expect(discount.discountInPaise).toBe(20000);
  });

  it("supports item-type scoped coupons", () => {
    const courseOnly = evaluateCouponEligibility(
      { ...baseCoupon, applicableItemTypes: ["course"] },
      { items: [productItem], subtotalInPaise: 200000, deliveryChargeInPaise: 7000 },
    );
    const mixedCart = evaluateCouponEligibility(
      { ...baseCoupon, applicableItemTypes: ["course"] },
      { items: [courseItem, productItem], subtotalInPaise: 700000, deliveryChargeInPaise: 7000 },
    );

    expect(courseOnly.eligible).toBe(false);
    expect(mixedCart.eligible).toBe(true);
  });

  it("formats coupon benefits for checkout cards", () => {
    expect(formatCouponBenefit({ ...baseCoupon, type: "percentage", value: 15 })).toBe("15% off");
    expect(formatCouponBenefit({ ...baseCoupon, type: "fixed_amount", value: 25000 })).toBe("₹250 off");
    expect(formatCouponBenefit({ ...baseCoupon, type: "free_delivery", value: 0 })).toBe("Free delivery");
  });
});
