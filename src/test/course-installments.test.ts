import { describe, expect, it } from "vitest";
import {
  COURSE_INSTALLMENT_MIN_AMOUNT_IN_PAISE,
  createCourseInstallmentPlan,
  getCourseCheckoutPayNowAmount,
  isCourseInstallmentEligible,
} from "@/lib/ecommerce";
import { collectDueCourseInstallmentReminders } from "../../api/_lib/course-installments";

describe("course installment checkout", () => {
  it("enables installments only for course-only checkout totals of ₹10,000 or more", () => {
    expect(COURSE_INSTALLMENT_MIN_AMOUNT_IN_PAISE).toBe(1000000);
    expect(isCourseInstallmentEligible({ hasCourseItems: true, hasShippableItems: false, subtotalInPaise: 1000000 })).toBe(true);
    expect(isCourseInstallmentEligible({ hasCourseItems: true, hasShippableItems: false, subtotalInPaise: 999999 })).toBe(false);
    expect(isCourseInstallmentEligible({ hasCourseItems: false, hasShippableItems: false, subtotalInPaise: 1500000 })).toBe(false);
    expect(isCourseInstallmentEligible({ hasCourseItems: true, hasShippableItems: true, subtotalInPaise: 1500000 })).toBe(false);
  });

  it("creates a 50%, 25%, 25% course installment schedule from the payment date", () => {
    const plan = createCourseInstallmentPlan({
      totalInPaise: 1000000,
      paidAt: new Date("2026-05-12T09:30:00.000Z"),
    });

    expect(plan.initialPaymentInPaise).toBe(500000);
    expect(plan.remainingInPaise).toBe(500000);
    expect(plan.installments).toEqual([
      expect.objectContaining({ installmentNumber: 1, percentage: 50, amountInPaise: 500000, status: "paid" }),
      expect.objectContaining({ installmentNumber: 2, percentage: 25, amountInPaise: 250000, status: "pending", dueDate: "2026-06-05" }),
      expect.objectContaining({ installmentNumber: 3, percentage: 25, amountInPaise: 250000, status: "pending", dueDate: "2026-07-05" }),
    ]);
  });

  it("charges the full amount for full payment and 50% for installment payment", () => {
    expect(getCourseCheckoutPayNowAmount({ paymentPlan: "full", totalInPaise: 1200000 })).toBe(1200000);
    expect(getCourseCheckoutPayNowAmount({ paymentPlan: "installment", totalInPaise: 1200000 })).toBe(600000);
  });
});

describe("course installment reminder candidates", () => {
  it("selects pending due installments and skips installments already reminded this month", () => {
    const candidates = collectDueCourseInstallmentReminders([
      {
        id: "order-1",
        orderNumber: "JAV-20260512-AAA11",
        customerId: "user-1",
        customerName: "Govardhan",
        customerPhone: "9876543210",
        customerWhatsAppNumber: "9876543210",
        payment: {
          method: "razorpay",
          status: "partially-paid",
          installmentPlan: {
            status: "active",
            totalInPaise: 1000000,
            initialPaymentInPaise: 500000,
            remainingInPaise: 500000,
            installments: [
              { installmentNumber: 1, percentage: 50, amountInPaise: 500000, status: "paid", paidAt: "2026-05-12T09:30:00.000Z" },
              { installmentNumber: 2, percentage: 25, amountInPaise: 250000, status: "pending", dueDate: "2026-06-05" },
              { installmentNumber: 3, percentage: 25, amountInPaise: 250000, status: "pending", dueDate: "2026-07-05", lastReminderMonthKey: "2026-06" },
            ],
          },
        },
      },
    ], new Date("2026-06-05T05:00:00.000Z"));

    expect(candidates).toEqual([
      expect.objectContaining({
        orderId: "order-1",
        installmentNumber: 2,
        amountInPaise: 250000,
        dueDate: "2026-06-05",
      }),
    ]);
  });
});