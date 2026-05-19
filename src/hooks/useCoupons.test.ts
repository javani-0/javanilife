import { describe, expect, it } from "vitest";
import { getCheckoutCoupons, getRedeemableCoupons } from "./useCoupons";
import type { Coupon } from "@/lib/ecommerce";

const now = new Date("2026-05-19T10:00:00.000Z");

const makeCoupon = (overrides: Partial<Coupon>): Coupon => ({
  id: overrides.id || overrides.code || "SAVE10",
  code: overrides.code || "SAVE10",
  title: overrides.title || "Save 10%",
  type: overrides.type || "percentage",
  value: overrides.value ?? 10,
  active: overrides.active ?? true,
  visibleAtCheckout: overrides.visibleAtCheckout ?? true,
  ...overrides,
});

describe("useCoupons selectors", () => {
  it("keeps hidden active coupons redeemable while removing them from checkout offers", () => {
    const hiddenCoupon = makeCoupon({ code: "STU30", visibleAtCheckout: false });
    const visibleCoupon = makeCoupon({ code: "SAVE10", visibleAtCheckout: true });

    expect(getRedeemableCoupons([hiddenCoupon, visibleCoupon], now).map((coupon) => coupon.code)).toEqual(["STU30", "SAVE10"]);
    expect(getCheckoutCoupons([hiddenCoupon, visibleCoupon], now).map((coupon) => coupon.code)).toEqual(["SAVE10"]);
  });

  it("removes inactive coupons from both redeemable and checkout lists", () => {
    const inactiveCoupon = makeCoupon({ code: "OLD10", active: false, visibleAtCheckout: true });

    expect(getRedeemableCoupons([inactiveCoupon], now)).toEqual([]);
    expect(getCheckoutCoupons([inactiveCoupon], now)).toEqual([]);
  });
});