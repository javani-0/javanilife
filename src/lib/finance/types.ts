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

// A manually-entered extra income entry (admin-only write). This is income that
// does NOT come from a product order or class fee — e.g. donations, workshops
// paid in cash, hall rentals. Money in paise.
export interface IncomeDoc {
  id: string;
  title: string;
  category?: string;
  amountInPaise: number;
  note?: string;
  receivedOn?: string; // "YYYY-MM-DD"
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
  otherIncomeInPaise: number;   // manually-entered extra income
  incomeInPaise: number;        // product + class + other
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

export const INCOME_CATEGORIES = [
  "Donation",
  "Workshop",
  "Event",
  "Hall Rental",
  "Merchandise",
  "Grant",
  "Other",
] as const;
