// ---------------------------------------------------------------------------
// Finance math — server mirror of src/lib/finance/income.ts (which carries the
// unit tests). Pure, dependency-free. Keep the two in sync.
// ---------------------------------------------------------------------------

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

interface OrderLike {
  totalInPaise?: number;
  payment?: {
    status?: string;
    installmentPlan?: { installments?: Array<{ status?: string; amountInPaise?: number }> };
  };
}

export const orderCollectedInPaise = (order: OrderLike): number => {
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

interface OrderLineItem {
  itemType?: string;
  lineTotalInPaise?: number;
  amountInPaise?: number;
  quantity?: number;
}

const lineTotalOf = (item: OrderLineItem): number =>
  Math.max(0, Math.round(num(item.lineTotalInPaise ?? num(item.amountInPaise) * (num(item.quantity) || 1))));

/**
 * Split collected order income into product vs. course buckets (req 4). Mirror
 * of src/lib/finance/income.ts splitOrderIncomeInPaise — keep in sync.
 */
export const splitOrderIncomeInPaise = (
  orders: Array<OrderLike & { items?: OrderLineItem[] }>,
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

/** A partner's payout = Σ (each category's collected income × that category's %). */
export const computePartnerCategoryShareInPaise = (
  income: { classIncomeInPaise: number; courseIncomeInPaise: number; productIncomeInPaise: number },
  shares: { classesPercent?: number; coursesPercent?: number; productsPercent?: number },
): number =>
  Math.round((Math.max(0, income.classIncomeInPaise) * clampPct(shares.classesPercent)) / 100)
  + Math.round((Math.max(0, income.courseIncomeInPaise) * clampPct(shares.coursesPercent)) / 100)
  + Math.round((Math.max(0, income.productIncomeInPaise) * clampPct(shares.productsPercent)) / 100);

export interface FinanceSummary {
  productIncomeInPaise: number;
  courseIncomeInPaise: number;
  classIncomeInPaise: number;
  otherIncomeInPaise: number;
  incomeInPaise: number;
  expensesInPaise: number;
  netProfitInPaise: number;
  profitSharePercent: number;
  partnerShareInPaise: number;
}

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
