import type { Timestamp } from "firebase/firestore";

// A manually-entered business expense (admin-only write). Money in paise.
export interface ExpenseDoc {
  id: string;
  title: string;
  category?: string;
  amountInPaise: number;
  note?: string;
  spentOn?: string; // "YYYY-MM-DD" (the date the expense was incurred)
  createdBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// Admin-configured partner access + profit share. Stored at finance/settings.
export interface PartnerSettings {
  partnerName?: string;
  partnerEmail?: string;
  partnerUid?: string;
  profitSharePercent: number; // 0–100
  updatedAt?: Timestamp;
}

// The aggregated financial picture shown to admin + partner.
export interface FinanceSummary {
  productIncomeInPaise: number; // collected from product/course orders
  classIncomeInPaise: number;   // collected class fees
  incomeInPaise: number;        // product + class
  expensesInPaise: number;
  netProfitInPaise: number;     // income − expenses
  profitSharePercent: number;
  partnerShareInPaise: number;  // netProfit × share%
}

export const EXPENSE_CATEGORIES = [
  "Rent",
  "Salaries",
  "Utilities",
  "Marketing",
  "Inventory",
  "Equipment",
  "Maintenance",
  "Travel",
  "Other",
] as const;
