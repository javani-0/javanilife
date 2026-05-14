import { describe, expect, it } from "vitest";
import {
  COURSE_INSTALLMENT_MIN_AMOUNT_IN_PAISE,
  createCourseInstallmentPlan,
  getCourseInstallmentEligibility,
} from "./installments";
import type { CartItem } from "./types";

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

const productItem = (): CartItem => ({
  productId: "product-1",
  itemType: "product",
  name: "Practice Saree",
  category: "clothing",
  categoryLabel: "Clothing",
  image: "https://example.com/product.jpg",
  quantity: 1,
  amountInPaise: 120000,
  displayPrice: "₹1,200",
  stockStatus: "available",
  allowedPaymentMethods: ["cod", "razorpay"],
});

describe("course installments", () => {
  it("enables installments only for course-only payments of at least ₹10,000", () => {
    expect(COURSE_INSTALLMENT_MIN_AMOUNT_IN_PAISE).toBe(1000000);

    expect(getCourseInstallmentEligibility([courseItem(999900)], 999900)).toMatchObject({
      eligible: false,
      reason: "Installments are available for course payments of ₹10,000 or above.",
    });

    expect(getCourseInstallmentEligibility([courseItem(1000000), productItem()], 1120000)).toMatchObject({
      eligible: false,
      reason: "Installments are available only for course checkout.",
    });

    expect(getCourseInstallmentEligibility([courseItem(1000000)], 1000000)).toEqual({ eligible: true });
  });

  it("splits an eligible course payment into 50%, 25%, and 25% installments", () => {
    const plan = createCourseInstallmentPlan({ totalInPaise: 1000000, createdAt: new Date("2026-05-12T10:00:00.000Z") });

    expect(plan).toMatchObject({
      totalInPaise: 1000000,
      initialPaymentInPaise: 500000,
      remainingInPaise: 500000,
      reminderDayOfMonth: 5,
      installments: [
        { installmentNumber: 1, label: "1st installment", percentage: 50, amountInPaise: 500000, status: "pending", dueDate: "2026-05-12" },
        { installmentNumber: 2, label: "2nd installment", percentage: 25, amountInPaise: 250000, status: "pending", dueDate: "2026-06-05" },
        { installmentNumber: 3, label: "3rd installment", percentage: 25, amountInPaise: 250000, status: "pending", dueDate: "2026-07-05" },
      ],
    });
  });

  it("keeps odd paise totals balanced by assigning the remainder to the final installment", () => {
    const plan = createCourseInstallmentPlan({ totalInPaise: 1000001, createdAt: new Date("2026-05-01T10:00:00.000Z") });
    const totalScheduled = plan.installments.reduce((total, installment) => total + installment.amountInPaise, 0);

    expect(totalScheduled).toBe(1000001);
    expect(plan.installments.map((installment) => installment.amountInPaise)).toEqual([500001, 250000, 250000]);
    expect(plan.installments.map((installment) => installment.dueDate)).toEqual(["2026-05-01", "2026-05-05", "2026-06-05"]);
  });
});