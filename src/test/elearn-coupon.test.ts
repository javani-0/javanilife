import { describe, expect, it } from "vitest";
import { computeElearnCouponDiscount, type LoadedCoupon } from "../../api/_lib/coupons";

const base: LoadedCoupon = { code: "GURU10", type: "percentage", value: 10, active: true };
const opts = { courseId: "c1", now: new Date("2026-11-23T10:00:00Z") };

describe("computeElearnCouponDiscount", () => {
  it("gives a percentage off the course price", () => {
    expect(computeElearnCouponDiscount(base, 100000, opts)).toEqual({ discountInPaise: 10000 });
  });
  it("caps a percentage at the max discount", () => {
    expect(computeElearnCouponDiscount({ ...base, value: 50, maxDiscountInPaise: 20000 }, 100000, opts).discountInPaise).toBe(20000);
  });
  it("gives a fixed amount but never below ₹1", () => {
    expect(computeElearnCouponDiscount({ ...base, type: "fixed_amount", value: 30000 }, 100000, opts).discountInPaise).toBe(30000);
    expect(computeElearnCouponDiscount({ ...base, type: "fixed_amount", value: 500000 }, 100000, opts).discountInPaise).toBe(99900);
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
