import { describe, expect, it } from "vitest";
import {
  createEmiInstallmentPlan,
  getEmiEligibility,
  getEmiPayNowAmount,
  getEmiRecurringAmount,
  formatEmiSummary,
} from "./installments";
import type { CartItem, EmiSettings } from "./types";
import { DEFAULT_EMI_SETTINGS } from "./types";

const courseItem = (amountInPaise: number): CartItem => ({
  productId: "course-1",
  sourceId: "course-1",
  itemType: "course",
  name: "Bharatanatyam Grade Course",
  category: "grades",
  categoryLabel: "Grades",
  image: "https://example.com/course.jpg",
  quantity: 1,
  amountInPaise,
  displayPrice: "₹10,000",
  stockStatus: "available",
  allowedPaymentMethods: ["razorpay"],
});

const productItem = (amountInPaise = 120000): CartItem => ({
  productId: "product-1",
  itemType: "product",
  name: "Practice Saree",
  category: "clothing",
  categoryLabel: "Clothing",
  image: "https://example.com/product.jpg",
  quantity: 1,
  amountInPaise,
  displayPrice: "₹1,200",
  stockStatus: "available",
  allowedPaymentMethods: ["cod", "razorpay"],
});

const customEmi: EmiSettings = {
  enabled: true,
  minAmountInPaise: 1200000, // ₹12,000
  upfrontPercentage: 50,
  installmentPercentages: [25, 25],
  reminderDaysBefore: 5,
};

describe("EMI eligibility", () => {
  it("enables EMI for any cart type when total >= min amount", () => {
    // Course-only cart — eligible
    expect(getEmiEligibility([courseItem(1200000)], 1200000, customEmi)).toEqual({ eligible: true });

    // Product-only cart — eligible
    expect(getEmiEligibility([productItem(1200000)], 1200000, customEmi)).toEqual({ eligible: true });

    // Mixed cart — eligible
    expect(getEmiEligibility([courseItem(600000), productItem(700000)], 1300000, customEmi)).toEqual({ eligible: true });
  });

  it("rejects EMI when total < min amount", () => {
    expect(getEmiEligibility([courseItem(500000)], 500000, customEmi)).toMatchObject({
      eligible: false,
      reason: "EMI is available for orders of ₹12,000 or above.",
    });
  });

  it("rejects EMI when disabled", () => {
    const disabled = { ...customEmi, enabled: false };
    expect(getEmiEligibility([courseItem(1500000)], 1500000, disabled)).toMatchObject({
      eligible: false,
      reason: "EMI option is currently disabled.",
    });
  });

  it("rejects EMI for empty cart", () => {
    expect(getEmiEligibility([], 0, customEmi)).toMatchObject({
      eligible: false,
      reason: "Cart is empty.",
    });
  });
});

describe("EMI pay now amount", () => {
  it("returns full amount for full payment plan", () => {
    expect(getEmiPayNowAmount({ paymentPlan: "full", totalInPaise: 1300000, emiSettings: customEmi })).toBe(1300000);
  });

  it("returns upfront percentage for installment plan", () => {
    expect(getEmiPayNowAmount({ paymentPlan: "installment", totalInPaise: 1300000, emiSettings: customEmi })).toBe(650000);
  });

  it("handles odd amounts correctly (rounds up)", () => {
    expect(getEmiPayNowAmount({ paymentPlan: "installment", totalInPaise: 1300001, emiSettings: customEmi })).toBe(650001);
  });
});

describe("EMI installment plan", () => {
  it("splits payment into admin-configured percentages", () => {
    const plan = createEmiInstallmentPlan({
      totalInPaise: 1300000,
      createdAt: new Date("2026-05-12T10:00:00.000Z"),
      emiSettings: customEmi,
    });

    expect(plan).toMatchObject({
      totalInPaise: 1300000,
      initialPaymentInPaise: 650000,
      remainingInPaise: 650000,
    });

    expect(plan.installments).toHaveLength(3);
    expect(plan.installments[0]).toMatchObject({ installmentNumber: 1, percentage: 50, amountInPaise: 650000, status: "pending" });
    expect(plan.installments[1]).toMatchObject({ installmentNumber: 2, percentage: 25, amountInPaise: 325000, status: "pending" });
    expect(plan.installments[2]).toMatchObject({ installmentNumber: 3, percentage: 25, amountInPaise: 325000, status: "pending" });
  });

  it("keeps totals balanced for odd amounts", () => {
    const plan = createEmiInstallmentPlan({
      totalInPaise: 1300001,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      emiSettings: customEmi,
    });
    const totalScheduled = plan.installments.reduce((total, inst) => total + inst.amountInPaise, 0);
    expect(totalScheduled).toBe(1300001);
  });

  it("marks first installment as paid when paidAt is provided", () => {
    const plan = createEmiInstallmentPlan({
      totalInPaise: 1200000,
      createdAt: new Date("2026-06-01T10:00:00.000Z"),
      paidAt: new Date("2026-06-01T12:00:00.000Z"),
      emiSettings: customEmi,
    });

    expect(plan.installments[0].status).toBe("paid");
    expect(plan.installments[0].paidAt).toBe("2026-06-01T12:00:00.000Z");
    expect(plan.installments[1].status).toBe("pending");
    expect(plan.installments[2].status).toBe("pending");
  });
});

describe("EMI helpers", () => {
  it("calculates recurring amount for Razorpay subscription", () => {
    expect(getEmiRecurringAmount(1300000, customEmi)).toBe(325000);
  });

  it("formats EMI summary", () => {
    expect(formatEmiSummary(customEmi)).toBe("50% upfront + 25% + 25%");
  });
});