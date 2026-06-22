import { describe, it, expect } from "vitest";
import {
  buildFinanceSummary,
  orderCollectedInPaise,
  sumClassIncomeInPaise,
  sumExpensesInPaise,
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
});
