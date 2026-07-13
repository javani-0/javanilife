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
// Legacy single-partner model — kept for backward compatibility. The live model
// is now multi-partner with per-category shares stored on each `partners` doc
// (see PartnerCategoryShares / FinancePartner below).
export interface PartnerSettings {
  partnerName?: string;
  partnerEmail?: string;
  partnerUid?: string;
  profitSharePercent: number; // 0–100
  updatedAt?: Timestamp;
}

// The three income categories a partner can draw a share from (req 4). Each is a
// percentage 0–100; 0 (or blank) means the partner earns nothing from it.
export interface PartnerCategoryShares {
  classesPercent: number;  // % of collected class fees
  coursesPercent: number;  // % of collected course-order income
  productsPercent: number; // % of collected product-order income
}

// A partner (from the `partners` collection) that has financial-dashboard
// access. `partnerUid` is the signed-up user granted the "partner" role.
export interface FinancePartner extends PartnerCategoryShares {
  id: string;
  name?: string;
  email?: string;
  partnerUid?: string;
}

// The aggregated financial picture shown to admin + partner.
export interface FinanceSummary {
  productIncomeInPaise: number; // collected from product orders
  courseIncomeInPaise: number;  // collected from course orders
  classIncomeInPaise: number;   // collected class fees
  otherIncomeInPaise: number;   // manually-entered extra income
  incomeInPaise: number;        // product + course + class + other
  expensesInPaise: number;
  netProfitInPaise: number;     // income − expenses
  profitSharePercent: number;   // legacy single-partner share %
  partnerShareInPaise: number;  // legacy: netProfit × share%
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
