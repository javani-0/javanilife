import { describe, it, expect } from "vitest";
import {
  buildFinanceSummary,
  computePartnerCategoryShareInPaise,
  orderCollectedInPaise,
  splitOrderIncomeInPaise,
  sumClassIncomeInPaise,
  sumExpensesInPaise,
  sumManualIncomeInPaise,
  sumOrderIncomeInPaise,
} from "./income";

describe("orderCollectedInPaise", () => {
  it("counts the full total for paid / cod-collected orders", () => {
    expect(orderCollectedInPaise({ totalInPaise: 50000, payment: { status: "paid" } })).toBe(50000);
    expect(orderCollectedInPaise({ totalInPaise: 50000, payment: { status: "cod-collected" } })).toBe(50000);
  });

  it("counts only paid installments for partially-paid orders", () => {
    const order = {
      totalInPaise: 90000,
      payment: {
        status: "partially-paid",
        installmentPlan: { installments: [
          { status: "paid", amountInPaise: 30000 },
          { status: "pending", amountInPaise: 30000 },
          { status: "paid", amountInPaise: 30000 },
        ] },
      },
    };
    expect(orderCollectedInPaise(order)).toBe(60000);
  });

  it("counts nothing for pending / failed / refunded / cod-pending", () => {
    expect(orderCollectedInPaise({ totalInPaise: 50000, payment: { status: "pending" } })).toBe(0);
    expect(orderCollectedInPaise({ totalInPaise: 50000, payment: { status: "failed" } })).toBe(0);
    expect(orderCollectedInPaise({ totalInPaise: 50000, payment: { status: "refunded" } })).toBe(0);
    expect(orderCollectedInPaise({ totalInPaise: 50000, payment: { status: "cod-pending" } })).toBe(0);
  });
});

describe("sumOrderIncomeInPaise / sumClassIncomeInPaise / sumExpensesInPaise", () => {
  it("sums orders, only-paid fees, and expenses", () => {
    expect(sumOrderIncomeInPaise([
      { totalInPaise: 10000, payment: { status: "paid" } },
      { totalInPaise: 20000, payment: { status: "pending" } },
    ])).toBe(10000);
    expect(sumClassIncomeInPaise([
      { status: "paid", amountInPaise: 5000 },
      { status: "overdue", amountInPaise: 5000 },
    ])).toBe(5000);
    expect(sumExpensesInPaise([{ amountInPaise: 3000 }, { amountInPaise: 2000 }])).toBe(5000);
    expect(sumManualIncomeInPaise([{ amountInPaise: 1500 }, { amountInPaise: 2500 }])).toBe(4000);
  });
});

describe("buildFinanceSummary", () => {
  it("computes income, net profit and the partner share", () => {
    const summary = buildFinanceSummary({
      productIncomeInPaise: 100000,
      classIncomeInPaise: 50000,
      expensesInPaise: 30000,
      profitSharePercent: 40,
    });
    expect(summary.incomeInPaise).toBe(150000);
    expect(summary.netProfitInPaise).toBe(120000);
    expect(summary.partnerShareInPaise).toBe(48000); // 40% of 120000
  });

  it("adds manually-entered extra income to the total", () => {
    const summary = buildFinanceSummary({
      productIncomeInPaise: 100000,
      classIncomeInPaise: 50000,
      otherIncomeInPaise: 25000,
      expensesInPaise: 30000,
      profitSharePercent: 40,
    });
    expect(summary.otherIncomeInPaise).toBe(25000);
    expect(summary.incomeInPaise).toBe(175000);
    expect(summary.netProfitInPaise).toBe(145000);
    expect(summary.partnerShareInPaise).toBe(58000); // 40% of 145000
  });

  it("never pays a share on a loss and clamps the percent", () => {
    const summary = buildFinanceSummary({
      productIncomeInPaise: 10000,
      classIncomeInPaise: 0,
      expensesInPaise: 50000,
      profitSharePercent: 250,
    });
    expect(summary.netProfitInPaise).toBe(-40000);
    expect(summary.profitSharePercent).toBe(100);
    expect(summary.partnerShareInPaise).toBe(0);
  });

  it("adds course income into the total", () => {
    const summary = buildFinanceSummary({
      productIncomeInPaise: 100000,
      courseIncomeInPaise: 40000,
      classIncomeInPaise: 50000,
      expensesInPaise: 0,
    });
    expect(summary.courseIncomeInPaise).toBe(40000);
    expect(summary.incomeInPaise).toBe(190000);
  });
});

describe("splitOrderIncomeInPaise", () => {
  it("apportions collected income across product vs course line items", () => {
    const orders = [
      // ₹1000 collected, split 60/40 product/course by line totals.
      { totalInPaise: 100000, payment: { status: "paid" }, items: [
        { itemType: "product", lineTotalInPaise: 60000 },
        { itemType: "course", lineTotalInPaise: 40000 },
      ] },
    ];
    expect(splitOrderIncomeInPaise(orders)).toEqual({ productIncomeInPaise: 60000, courseIncomeInPaise: 40000 });
  });

  it("treats item-less or unpaid orders as product income / zero", () => {
    const orders = [
      { totalInPaise: 50000, payment: { status: "paid" } },                 // no items → product
      { totalInPaise: 99999, payment: { status: "pending" }, items: [{ itemType: "course", lineTotalInPaise: 99999 }] }, // unpaid → 0
    ];
    expect(splitOrderIncomeInPaise(orders)).toEqual({ productIncomeInPaise: 50000, courseIncomeInPaise: 0 });
  });

  it("always sums back to the collected total", () => {
    const orders = [
      { totalInPaise: 77777, payment: { status: "paid" }, items: [
        { itemType: "product", lineTotalInPaise: 33333 },
        { itemType: "course", lineTotalInPaise: 44444 },
      ] },
    ];
    const { productIncomeInPaise, courseIncomeInPaise } = splitOrderIncomeInPaise(orders);
    expect(productIncomeInPaise + courseIncomeInPaise).toBe(77777);
  });
});

describe("computePartnerCategoryShareInPaise", () => {
  const income = { classIncomeInPaise: 100000, courseIncomeInPaise: 50000, productIncomeInPaise: 20000 };

  it("sums the per-category shares", () => {
    // 30% classes + 10% courses + 0% products = 30000 + 5000 + 0
    expect(computePartnerCategoryShareInPaise(income, { classesPercent: 30, coursesPercent: 10 })).toBe(35000);
  });

  it("earns only from the selected categories (classes-only partner)", () => {
    expect(computePartnerCategoryShareInPaise(income, { classesPercent: 50 })).toBe(50000);
  });

  it("clamps percentages to 0–100", () => {
    expect(computePartnerCategoryShareInPaise(income, { classesPercent: 250 })).toBe(100000);
    expect(computePartnerCategoryShareInPaise(income, { classesPercent: -5 })).toBe(0);
  });
});
