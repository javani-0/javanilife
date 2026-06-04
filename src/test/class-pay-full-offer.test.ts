import { describe, expect, it } from "vitest";
import { termPayFullAmountInPaise } from "../../api/_lib/class-fees";

// Mirrors the client helpers in src/lib/classes/classes.ts. These guard the
// real money math: the discounted full-payment amount charged via Razorpay.
describe("term pay-full offer (N free months)", () => {
  it("gives one month free on a 4-month ₹8,000 course → pay ₹6,000", () => {
    expect(termPayFullAmountInPaise({ termFeeInPaise: 800000, durationMonths: 4, termFreeMonthsOnFullPayment: 1 })).toBe(600000);
  });

  it("charges the full fee when there is no offer", () => {
    expect(termPayFullAmountInPaise({ termFeeInPaise: 800000, durationMonths: 4, termFreeMonthsOnFullPayment: 0 })).toBe(800000);
    expect(termPayFullAmountInPaise({ termFeeInPaise: 800000, durationMonths: 4 })).toBe(800000);
  });

  it("supports more than one free month", () => {
    // 6-month ₹12,000 course, 2 months free → 12,000 − (12,000/6 × 2) = ₹8,000
    expect(termPayFullAmountInPaise({ termFeeInPaise: 1200000, durationMonths: 6, termFreeMonthsOnFullPayment: 2 })).toBe(800000);
  });

  it("never gives away the whole course (clamps free months to duration − 1)", () => {
    // 4 months, 5 free requested → capped at 3 free → 8,000 − 6,000 = ₹2,000
    expect(termPayFullAmountInPaise({ termFeeInPaise: 800000, durationMonths: 4, termFreeMonthsOnFullPayment: 5 })).toBe(200000);
  });

  it("falls back to the term fee when duration or fee is missing", () => {
    expect(termPayFullAmountInPaise({ termFeeInPaise: 800000, durationMonths: 0, termFreeMonthsOnFullPayment: 1 })).toBe(800000);
    expect(termPayFullAmountInPaise({ termFeeInPaise: 0, durationMonths: 4, termFreeMonthsOnFullPayment: 1 })).toBe(0);
  });
});
