import { describe, expect, it } from "vitest";
import { computeElearnBundleDiscount, computeElearnCouponDiscount, type LoadedCoupon } from "../../api/_lib/coupons";

const base: LoadedCoupon = { code: "GURU10", type: "percentage", value: 10, active: true };
const opts = { courseId: "c1", now: new Date("2026-11-23T10:00:00Z") };

describe("computeElearnCouponDiscount", () => {
  it("gives a percentage off the course price", () => {
    expect(computeElearnCouponDiscount(base, 100000, opts)).toEqual({ discountInPaise: 10000 });
  });
  it("caps a percentage at the max discount", () => {
    expect(computeElearnCouponDiscount({ ...base, value: 50, maxDiscountInPaise: 20000 }, 100000, opts).discountInPaise).toBe(20000);
  });
  it("gives a fixed amount; a bigger one makes it free; never leaves 1-99 paise", () => {
    expect(computeElearnCouponDiscount({ ...base, type: "fixed_amount", value: 30000 }, 100000, opts).discountInPaise).toBe(30000);
    expect(computeElearnCouponDiscount({ ...base, type: "fixed_amount", value: 500000 }, 100000, opts).discountInPaise).toBe(100000);
    expect(computeElearnCouponDiscount({ ...base, type: "fixed_amount", value: 99950 }, 100000, opts).discountInPaise).toBe(99900);
  });
  it("a 100% coupon makes the master class free", () => {
    expect(computeElearnCouponDiscount({ ...base, value: 100 }, 149900, opts)).toEqual({ discountInPaise: 149900 });
  });
  it("accepts coupons scoped to e-learning, rejects shop-only ones", () => {
    expect(computeElearnCouponDiscount({ ...base, applicableItemTypes: ["elearning"] }, 100000, opts).discountInPaise).toBe(10000);
    expect(computeElearnCouponDiscount({ ...base, applicableItemTypes: ["product"] }, 100000, opts).reason).toMatch(/master classes/);
  });
  it("respects the course list", () => {
    expect(computeElearnCouponDiscount({ ...base, applicableProductIds: ["c2"] }, 100000, opts).reason).toMatch(/this master class/);
    expect(computeElearnCouponDiscount({ ...base, applicableProductIds: ["c1"] }, 100000, opts).discountInPaise).toBe(10000);
  });
  it("rejects inactive, expired, not-started and fully used coupons", () => {
    expect(computeElearnCouponDiscount({ ...base, active: false }, 100000, opts).discountInPaise).toBe(0);
    expect(computeElearnCouponDiscount({ ...base, expiresAt: "2026-11-01" }, 100000, opts).reason).toMatch(/expired/);
    expect(computeElearnCouponDiscount({ ...base, startsAt: "2026-12-01" }, 100000, opts).reason).toMatch(/not active yet/);
    expect(computeElearnCouponDiscount({ ...base, maxRedemptions: 5, redeemedCount: 5 }, 100000, opts).reason).toMatch(/fully used/);
    expect(computeElearnCouponDiscount({ ...base, maxRedemptions: 5, redeemedCount: 4 }, 100000, opts).discountInPaise).toBe(10000);
  });
  it("rejects free-delivery coupons and the minimum", () => {
    expect(computeElearnCouponDiscount({ ...base, type: "free_delivery" }, 100000, opts).discountInPaise).toBe(0);
    expect(computeElearnCouponDiscount({ ...base, minSubtotalInPaise: 200000 }, 100000, opts).discountInPaise).toBe(0);
  });
});

describe("computeElearnBundleDiscount (several master classes together)", () => {
  const now = opts.now;
  const three = [
    { courseId: "a", priceInPaise: 100000 },
    { courseId: "b", priceInPaise: 200000 },
    { courseId: "c", priceInPaise: 300000 },
  ];
  const sum = (r: Record<string, number>) => Object.values(r).reduce((s, v) => s + v, 0);
  it("applies a percentage to the total and splits it by price", () => {
    const r = computeElearnBundleDiscount(base, three, { now });
    expect(r.discountInPaise).toBe(60000);
    expect(r.perCourse).toEqual({ a: 10000, b: 20000, c: 30000 });
  });
  it("a fixed amount counts once for the whole purchase", () => {
    const r = computeElearnBundleDiscount({ ...base, type: "fixed_amount", value: 50000 }, three, { now });
    expect(r.discountInPaise).toBe(50000);
    expect(sum(r.perCourse)).toBe(50000);
  });
  it("spreads odd paise so the shares always add up", () => {
    const r = computeElearnBundleDiscount({ ...base, type: "fixed_amount", value: 100001 }, three, { now });
    expect(sum(r.perCourse)).toBe(100001);
  });
  it("100% makes all of them free", () => {
    const r = computeElearnBundleDiscount({ ...base, value: 100 }, three, { now });
    expect(r.discountInPaise).toBe(600000);
    expect(r.perCourse).toEqual({ a: 100000, b: 200000, c: 300000 });
  });
  it("a coupon for one course discounts only that course", () => {
    const r = computeElearnBundleDiscount({ ...base, value: 100, applicableProductIds: ["b"] }, three, { now });
    expect(r.perCourse).toEqual({ b: 200000 });
    expect(computeElearnBundleDiscount({ ...base, applicableProductIds: ["z"] }, three, { now }).reason).toMatch(/these master classes/);
  });
  it("the minimum is checked on the total", () => {
    expect(computeElearnBundleDiscount({ ...base, minSubtotalInPaise: 500000 }, three, { now }).discountInPaise).toBe(60000);
    expect(computeElearnBundleDiscount({ ...base, minSubtotalInPaise: 700000 }, three, { now }).reason).toMatch(/minimum/);
  });
});
