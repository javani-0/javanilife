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

export interface OrderLineItem {
  itemType?: string;
  lineTotalInPaise?: number;
  amountInPaise?: number;
  quantity?: number;
}

export interface SplittableOrder extends CollectibleOrder {
  items?: OrderLineItem[];
}

const lineTotalOf = (item: OrderLineItem): number =>
  Math.max(0, Math.round(num(item.lineTotalInPaise ?? num(item.amountInPaise) * (num(item.quantity) || 1))));

/**
 * Split collected order income into product vs. course buckets (req 4). Each
 * order's collected amount is apportioned across its line items by their line
 * totals, so product + course always sums back to the order's collected total.
 * Orders with no identifiable items count entirely as product income.
 */
export const splitOrderIncomeInPaise = (
  orders: SplittableOrder[],
): { productIncomeInPaise: number; courseIncomeInPaise: number } => {
  let productIncomeInPaise = 0;
  let courseIncomeInPaise = 0;
  for (const order of orders) {
    const collected = orderCollectedInPaise(order);
    if (collected <= 0) continue;
    const items = order.items || [];
    const courseLine = items.filter((it) => it.itemType === "course").reduce((s, it) => s + lineTotalOf(it), 0);
    const productLine = items.filter((it) => it.itemType !== "course").reduce((s, it) => s + lineTotalOf(it), 0);
    const lineSum = courseLine + productLine;
    if (lineSum <= 0) { productIncomeInPaise += collected; continue; }
    const courseShare = Math.round((collected * courseLine) / lineSum);
    courseIncomeInPaise += courseShare;
    productIncomeInPaise += collected - courseShare;
  }
  return { productIncomeInPaise, courseIncomeInPaise };
};

const clampPct = (value: unknown): number => Math.max(0, Math.min(100, num(value)));

export interface CategoryIncome {
  classIncomeInPaise: number;
  courseIncomeInPaise: number;
  productIncomeInPaise: number;
}

export interface CategorySharePercents {
  classesPercent?: number;
  coursesPercent?: number;
  productsPercent?: number;
}

/** A partner's payout = Σ (each category's collected income × that category's %). */
export const computePartnerCategoryShareInPaise = (
  income: CategoryIncome,
  shares: CategorySharePercents,
): number =>
  Math.round((Math.max(0, income.classIncomeInPaise) * clampPct(shares.classesPercent)) / 100)
  + Math.round((Math.max(0, income.courseIncomeInPaise) * clampPct(shares.coursesPercent)) / 100)
  + Math.round((Math.max(0, income.productIncomeInPaise) * clampPct(shares.productsPercent)) / 100);

export interface PaidFeeLike { status?: string; amountInPaise?: number }

/** Sum collected class fees (status === "paid"). */
export const sumClassIncomeInPaise = (fees: PaidFeeLike[]): number =>
  fees
    .filter((fee) => fee?.status === "paid")
    .reduce((sum, fee) => sum + Math.max(0, Math.round(num(fee.amountInPaise))), 0);

export interface ExpenseLike { amountInPaise?: number }

export const sumExpensesInPaise = (expenses: ExpenseLike[]): number =>
  expenses.reduce((sum, expense) => sum + Math.max(0, Math.round(num(expense.amountInPaise))), 0);

export interface IncomeLike { amountInPaise?: number }

/** Sum manually-entered extra income entries. */
export const sumManualIncomeInPaise = (entries: IncomeLike[]): number =>
  entries.reduce((sum, entry) => sum + Math.max(0, Math.round(num(entry.amountInPaise))), 0);

/** Roll income + expenses + share% into the summary shown to admin + partner. */
export const buildFinanceSummary = (params: {
  productIncomeInPaise: number;
  courseIncomeInPaise?: number;
  classIncomeInPaise: number;
  otherIncomeInPaise?: number;
  expensesInPaise: number;
  profitSharePercent?: number;
}): FinanceSummary => {
  const productIncomeInPaise = Math.max(0, Math.round(num(params.productIncomeInPaise)));
  const courseIncomeInPaise = Math.max(0, Math.round(num(params.courseIncomeInPaise)));
  const classIncomeInPaise = Math.max(0, Math.round(num(params.classIncomeInPaise)));
  const otherIncomeInPaise = Math.max(0, Math.round(num(params.otherIncomeInPaise)));
  const expensesInPaise = Math.max(0, Math.round(num(params.expensesInPaise)));
  const incomeInPaise = productIncomeInPaise + courseIncomeInPaise + classIncomeInPaise + otherIncomeInPaise;
  const netProfitInPaise = incomeInPaise - expensesInPaise;
  const profitSharePercent = Math.max(0, Math.min(100, num(params.profitSharePercent)));
  // Never pay a share on a loss. (Legacy single-partner share.)
  const partnerShareInPaise = Math.round((Math.max(0, netProfitInPaise) * profitSharePercent) / 100);
  return {
    productIncomeInPaise,
    courseIncomeInPaise,
    classIncomeInPaise,
    otherIncomeInPaise,
    incomeInPaise,
    expensesInPaise,
    netProfitInPaise,
    profitSharePercent,
    partnerShareInPaise,
  };
};
