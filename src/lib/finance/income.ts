// ---------------------------------------------------------------------------
// Finance math — pure, dependency-free helpers (mirrored server-side in
// api/_lib/finance.ts; keep in sync). Income = product/course orders collected
// + class fees collected. Net profit = income − expenses.
// ---------------------------------------------------------------------------
import type { FinanceSummary } from "./types";

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface CollectibleOrder {
  totalInPaise?: number;
  payment?: {
    status?: string;
    installmentPlan?: { installments?: Array<{ status?: string; amountInPaise?: number }> };
  };
}

/**
 * Money actually collected for one order. Fully-paid / COD-collected orders
 * count their total; partially-paid (EMI) orders count only the paid
 * installments; everything else (pending/failed/refunded/cod-pending) counts 0.
 */
export const orderCollectedInPaise = (order: CollectibleOrder): number => {
  const status = order.payment?.status || "";
  const total = Math.max(0, Math.round(num(order.totalInPaise)));
  if (status === "paid" || status === "cod-collected") return total;
  if (status === "partially-paid") {
    const installments = order.payment?.installmentPlan?.installments || [];
    return installments
      .filter((installment) => installment?.status === "paid")
      .reduce((sum, installment) => sum + Math.max(0, Math.round(num(installment.amountInPaise))), 0);
  }
  return 0;
};

export const sumOrderIncomeInPaise = (orders: CollectibleOrder[]): number =>
  orders.reduce((sum, order) => sum + orderCollectedInPaise(order), 0);

export interface PaidFeeLike { status?: string; amountInPaise?: number }

/** Sum collected class fees (status === "paid"). */
export const sumClassIncomeInPaise = (fees: PaidFeeLike[]): number =>
  fees
    .filter((fee) => fee?.status === "paid")
    .reduce((sum, fee) => sum + Math.max(0, Math.round(num(fee.amountInPaise))), 0);

export interface ExpenseLike { amountInPaise?: number }

export const sumExpensesInPaise = (expenses: ExpenseLike[]): number =>
  expenses.reduce((sum, expense) => sum + Math.max(0, Math.round(num(expense.amountInPaise))), 0);

/** Roll income + expenses + share% into the summary shown to admin + partner. */
export const buildFinanceSummary = (params: {
  productIncomeInPaise: number;
  classIncomeInPaise: number;
  expensesInPaise: number;
  profitSharePercent: number;
}): FinanceSummary => {
  const productIncomeInPaise = Math.max(0, Math.round(num(params.productIncomeInPaise)));
  const classIncomeInPaise = Math.max(0, Math.round(num(params.classIncomeInPaise)));
  const expensesInPaise = Math.max(0, Math.round(num(params.expensesInPaise)));
  const incomeInPaise = productIncomeInPaise + classIncomeInPaise;
  const netProfitInPaise = incomeInPaise - expensesInPaise;
  const profitSharePercent = Math.max(0, Math.min(100, num(params.profitSharePercent)));
  // Never pay a share on a loss.
  const partnerShareInPaise = Math.round((Math.max(0, netProfitInPaise) * profitSharePercent) / 100);
  return {
    productIncomeInPaise,
    classIncomeInPaise,
    incomeInPaise,
    expensesInPaise,
    netProfitInPaise,
    profitSharePercent,
    partnerShareInPaise,
  };
};
