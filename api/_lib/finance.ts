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

export interface FinanceSummary {
  productIncomeInPaise: number;
  classIncomeInPaise: number;
  incomeInPaise: number;
  expensesInPaise: number;
  netProfitInPaise: number;
  profitSharePercent: number;
  partnerShareInPaise: number;
}

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
