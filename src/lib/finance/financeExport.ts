// ---------------------------------------------------------------------------
// FINANCE EXPORT (req 1): "download Excel, and the admin needs full control".
//
// The Finance page already derives every rupee it shows from orders, class
// fees, manual income and expenses. This module turns exactly those records
// into spreadsheet tabs — the admin choosing the date range, which tabs, which
// sale categories, online/offline, which columns and whether money comes out as
// rupees or paise.
//
// PURE (no DOM, no Firestore) so the numbers can be asserted in tests. It
// reuses the SAME helpers as the page (`buildFinanceSummary`,
// `computePartnerCategoryShareInPaise`), so an export can never disagree with
// the tiles the admin was looking at when they pressed the button.
// ---------------------------------------------------------------------------
import type { CellValue, SheetSpec } from "@/lib/export/xlsx";
import { buildFinanceSummary, computePartnerCategoryShareInPaise } from "./income";
import { SALE_CATEGORY_LABELS, summarizeSalesByItem, summarizeSalesByMode, type SaleCategory, type SaleLine, type SaleMode } from "./salesLedger";
import type { ExpenseDoc, FinancePartner, IncomeDoc } from "./types";

export type FinanceSheetKey = "summary" | "byItem" | "sales" | "expenses" | "otherIncome" | "partners";

export const FINANCE_SHEET_LABELS: Record<FinanceSheetKey, string> = {
  summary: "Summary",
  byItem: "What sold (per item)",
  sales: "Sales (itemised)",
  expenses: "Expenses",
  otherIncome: "Other income",
  partners: "Partner payouts",
};

export const FINANCE_SHEET_KEYS: FinanceSheetKey[] = ["summary", "byItem", "sales", "expenses", "otherIncome", "partners"];

export type SalesColumn = "date" | "category" | "name" | "buyer" | "phone" | "email" | "quantity" | "reference" | "mode" | "method" | "amount";

export const SALES_COLUMNS: SalesColumn[] = ["date", "category", "name", "buyer", "phone", "email", "quantity", "reference", "mode", "method", "amount"];

export const SALES_COLUMN_LABELS: Record<SalesColumn, string> = {
  date: "Date",
  category: "Category",
  name: "Item / class",
  buyer: "Paid by",
  phone: "Phone",
  email: "Email",
  quantity: "Qty",
  reference: "Reference",
  mode: "Online / offline",
  method: "Method",
  amount: "Amount",
};

const SALES_COLUMN_WIDTHS: Record<SalesColumn, number> = {
  date: 12, category: 16, name: 34, buyer: 24, phone: 16, email: 28, quantity: 8, reference: 22, mode: 16, method: 18, amount: 14,
};

export type AmountUnit = "rupees" | "paise";

export interface FinanceExportOptions {
  /** Inclusive "YYYY-MM-DD" bounds. Empty means unbounded on that side. */
  from: string;
  to: string;
  sheets: FinanceSheetKey[];
  /** Sale categories kept on the Sales tab (and in its totals). */
  categories: SaleCategory[];
  /** "all" keeps every payment mode. */
  mode: SaleMode | "all";
  columns: SalesColumn[];
  amountUnit: AmountUnit;
  /** Append a totals row to each table. */
  includeTotals: boolean;
  /** Free-text label written into the Summary tab. */
  periodLabel?: string;
}

export const DEFAULT_EXPORT_OPTIONS: Omit<FinanceExportOptions, "from" | "to"> = {
  sheets: FINANCE_SHEET_KEYS,
  categories: ["product", "course", "class", "rental", "other"],
  mode: "all",
  columns: SALES_COLUMNS,
  amountUnit: "rupees",
  includeTotals: true,
};

export interface FinanceExportInput {
  /** Every sale line, UNFILTERED — this module applies the admin's range. */
  lines: SaleLine[];
  expenses: ExpenseDoc[];
  otherIncome: IncomeDoc[];
  partners: FinancePartner[];
}

// ── Filtering ─────────────────────────────────────────────────────────────

/**
 * Is a "YYYY-MM-DD" key inside the chosen range? Undated records (an import
 * with no date) are excluded whenever a bound is set — including them would
 * silently inflate a month's total.
 */
export const inDateRange = (dateKey: string, from: string, to: string): boolean => {
  if (!from && !to) return true;
  if (!dateKey) return false;
  if (from && dateKey < from) return false;
  if (to && dateKey > to) return false;
  return true;
};

export const filterSaleLines = (lines: SaleLine[], options: FinanceExportOptions): SaleLine[] => {
  const categories = new Set(options.categories);
  return (lines || []).filter((line) => {
    if (!inDateRange(line.dateKey, options.from, options.to)) return false;
    if (!categories.has(line.category)) return false;
    if (options.mode !== "all" && line.mode !== options.mode) return false;
    return true;
  });
};

const filterExpenses = (expenses: ExpenseDoc[], options: FinanceExportOptions): ExpenseDoc[] =>
  (expenses || []).filter((expense) => inDateRange(expense.spentOn || "", options.from, options.to));

const filterOtherIncome = (entries: IncomeDoc[], options: FinanceExportOptions): IncomeDoc[] =>
  (entries || []).filter((entry) => inDateRange(entry.receivedOn || "", options.from, options.to));

// ── Formatting ────────────────────────────────────────────────────────────

/** Money as the admin asked for it: rupees with paise, or the raw paise integer. */
export const amountCell = (amountInPaise: number, unit: AmountUnit): number =>
  unit === "paise" ? Math.round(amountInPaise) : Math.round(amountInPaise) / 100;

const amountHeader = (unit: AmountUnit): string => (unit === "paise" ? "Amount (paise)" : "Amount (₹)");

const MODE_LABELS: Record<SaleMode, string> = { online: "Online", offline: "Offline", unknown: "Not recorded" };

const niceDate = (dateKey: string): string => dateKey || "—";

// ── Sheets ────────────────────────────────────────────────────────────────

const salesSheet = (lines: SaleLine[], options: FinanceExportOptions): SheetSpec => {
  const columns = options.columns.length > 0 ? options.columns : SALES_COLUMNS;
  const header = columns.map((column) => (column === "amount" ? amountHeader(options.amountUnit) : SALES_COLUMN_LABELS[column]));

  const cellFor = (line: SaleLine, column: SalesColumn): CellValue => {
    switch (column) {
      case "date": return niceDate(line.dateKey);
      case "category": return SALE_CATEGORY_LABELS[line.category];
      case "name": return line.name;
      case "buyer": return line.buyer || "—";
      case "phone": return line.buyerPhone || "—";
      case "email": return line.buyerEmail || "—";
      case "quantity": return line.quantity || 1;
      case "reference": return line.reference || "—";
      case "mode": return MODE_LABELS[line.mode];
      case "method": return line.methodLabel || "—";
      case "amount": return amountCell(line.amountInPaise, options.amountUnit);
      default: return "";
    }
  };

  const rows: CellValue[][] = lines.map((line) => columns.map((column) => cellFor(line, column)));

  if (options.includeTotals && columns.includes("amount")) {
    const totalInPaise = lines.reduce((sum, line) => sum + line.amountInPaise, 0);
    rows.push(columns.map((column, index) => {
      if (column === "amount") return amountCell(totalInPaise, options.amountUnit);
      return index === 0 ? `TOTAL (${lines.length} sale${lines.length === 1 ? "" : "s"})` : "";
    }));
  }

  return {
    name: "Sales",
    header,
    rows,
    moneyColumns: options.amountUnit === "rupees" ? [columns.indexOf("amount")].filter((index) => index >= 0) : [],
    widths: columns.map((column) => SALES_COLUMN_WIDTHS[column]),
  };
};

const simpleLedgerSheet = (
  name: string,
  entries: { title: string; category: string; dateKey: string; note: string; mode: string; amountInPaise: number }[],
  options: FinanceExportOptions,
): SheetSpec => {
  const rows: CellValue[][] = entries.map((entry) => [
    entry.dateKey || "—",
    entry.title,
    entry.category || "—",
    entry.mode,
    entry.note || "",
    amountCell(entry.amountInPaise, options.amountUnit),
  ]);
  if (options.includeTotals) {
    const total = entries.reduce((sum, entry) => sum + entry.amountInPaise, 0);
    rows.push([`TOTAL (${entries.length})`, "", "", "", "", amountCell(total, options.amountUnit)]);
  }
  return {
    name,
    header: ["Date", "Title", "Category", "Mode", "Note", amountHeader(options.amountUnit)],
    rows,
    moneyColumns: options.amountUnit === "rupees" ? [5] : [],
    widths: [12, 30, 18, 14, 30, 14],
  };
};

/**
 * The whole workbook, in the order the admin ticked the tabs. Sheets with no
 * rows are still written (an empty month is an answer too).
 */
export const buildFinanceSheets = (input: FinanceExportInput, options: FinanceExportOptions): SheetSpec[] => {
  const lines = filterSaleLines(input.lines, options);
  const expenses = filterExpenses(input.expenses, options);
  const otherIncome = filterOtherIncome(input.otherIncome, options);

  // Category income comes from the SAME filtered lines the Sales tab lists, so
  // the Summary tab and the Sales tab always add up to each other.
  const categoryTotals = lines.reduce<Record<SaleCategory, number>>((totals, line) => {
    totals[line.category] += line.amountInPaise;
    return totals;
  }, { product: 0, course: 0, class: 0, rental: 0, other: 0 });

  const summary = buildFinanceSummary({
    // Rentals are reported on their own line below, but they are still product-
    // side income as far as the profit total is concerned.
    productIncomeInPaise: categoryTotals.product + categoryTotals.rental,
    courseIncomeInPaise: categoryTotals.course,
    classIncomeInPaise: categoryTotals.class,
    otherIncomeInPaise: categoryTotals.other,
    expensesInPaise: expenses.reduce((sum, expense) => sum + Math.max(0, expense.amountInPaise || 0), 0),
  });

  const byMode = summarizeSalesByMode(lines);
  const money = (paise: number): number => amountCell(paise, options.amountUnit);

  const sheets: SheetSpec[] = [];

  for (const key of options.sheets) {
    if (key === "summary") {
      sheets.push({
        name: "Summary",
        header: ["Metric", amountHeader(options.amountUnit), "Detail"],
        rows: [
          ["Period", "", options.periodLabel || `${options.from || "start"} → ${options.to || "today"}`],
          ["Generated", "", new Date().toLocaleString("en-IN")],
          ["", "", ""],
          ["Product income", money(categoryTotals.product), `${lines.filter((line) => line.category === "product").length} sales`],
          ["Rental income", money(categoryTotals.rental), `${lines.filter((line) => line.category === "rental").length} rentals & late fees`],
          ["Course income", money(categoryTotals.course), `${lines.filter((line) => line.category === "course").length} sales`],
          ["Class fee income", money(categoryTotals.class), `${lines.filter((line) => line.category === "class").length} payments`],
          ["Other income", money(categoryTotals.other), `${lines.filter((line) => line.category === "other").length} entries`],
          ["Total income", money(summary.incomeInPaise), `${lines.length} sales in total`],
          ["", "", ""],
          ["Collected online", money(byMode.online.totalInPaise), `${byMode.online.count} sales`],
          ["Collected offline", money(byMode.offline.totalInPaise), `${byMode.offline.count} sales`],
          ["Mode not recorded", money(byMode.unknown.totalInPaise), `${byMode.unknown.count} sales`],
          ["", "", ""],
          ["Total expenses", money(summary.expensesInPaise), `${expenses.length} entries`],
          ["Net profit", money(summary.netProfitInPaise), "Income − Expenses"],
        ],
        moneyColumns: options.amountUnit === "rupees" ? [1] : [],
        widths: [26, 16, 34],
      });
    }

    // req 6: which product sells, how many sales, what it made, and to whom.
    if (key === "byItem") {
      const items = summarizeSalesByItem(lines);
      const rows: CellValue[][] = items.map((item) => [
        SALE_CATEGORY_LABELS[item.category],
        item.name,
        item.sales,
        item.units,
        money(item.totalInPaise),
        item.customerCount,
        item.customers.join(", "),
        item.firstSale || "—",
        item.lastSale || "—",
      ]);
      if (options.includeTotals) {
        rows.push([
          `TOTAL (${items.length} item${items.length === 1 ? "" : "s"})`,
          "",
          items.reduce((sum, item) => sum + item.sales, 0),
          items.reduce((sum, item) => sum + item.units, 0),
          money(items.reduce((sum, item) => sum + item.totalInPaise, 0)),
          "", "", "", "",
        ]);
      }
      sheets.push({
        name: "What sold",
        header: ["Category", "Item", "No. of sales", "Units", options.amountUnit === "paise" ? "Total (paise)" : "Total (₹)", "Customers", "Who bought it", "First sale", "Last sale"],
        rows,
        moneyColumns: options.amountUnit === "rupees" ? [4] : [],
        widths: [16, 36, 13, 10, 16, 12, 52, 12, 12],
      });
    }

    if (key === "sales") sheets.push(salesSheet(lines, options));

    if (key === "expenses") {
      sheets.push(simpleLedgerSheet("Expenses", expenses.map((expense) => ({
        title: expense.title || "Expense",
        category: expense.category || "",
        dateKey: expense.spentOn || "",
        note: expense.note || "",
        mode: "—",
        amountInPaise: Math.max(0, expense.amountInPaise || 0),
      })), options));
    }

    if (key === "otherIncome") {
      sheets.push(simpleLedgerSheet("Other income", otherIncome.map((entry) => ({
        title: entry.title || "Income",
        category: entry.category || "",
        dateKey: entry.receivedOn || "",
        note: entry.note || "",
        mode: entry.paymentMode === "online" ? "Online" : entry.paymentMode === "offline" ? "Offline" : "—",
        amountInPaise: Math.max(0, entry.amountInPaise || 0),
      })), options));
    }

    if (key === "partners") {
      const income = {
        classIncomeInPaise: categoryTotals.class,
        courseIncomeInPaise: categoryTotals.course,
        productIncomeInPaise: categoryTotals.product,
      };
      const rows: CellValue[][] = [];
      let payoutTotal = 0;
      for (const partner of input.partners || []) {
        const share = computePartnerCategoryShareInPaise(income, {
          classesPercent: partner.classesPercent,
          coursesPercent: partner.coursesPercent,
          productsPercent: partner.productsPercent,
        });
        if (share <= 0 && !partner.classesPercent && !partner.coursesPercent && !partner.productsPercent) continue;
        payoutTotal += share;
        rows.push([
          partner.name || partner.email || "Partner",
          partner.email || "—",
          partner.classesPercent || 0,
          partner.coursesPercent || 0,
          partner.productsPercent || 0,
          money(share),
        ]);
      }
      if (options.includeTotals) rows.push([`TOTAL (${rows.length})`, "", "", "", "", money(payoutTotal)]);
      sheets.push({
        name: "Partner payouts",
        header: ["Partner", "Email", "Classes %", "Courses %", "Products %", options.amountUnit === "paise" ? "Payout (paise)" : "Payout (₹)"],
        rows,
        moneyColumns: options.amountUnit === "rupees" ? [5] : [],
        widths: [26, 28, 12, 12, 12, 16],
      });
    }
  }

  return sheets;
};

/** How many rows the admin is about to download — shown live in the dialog. */
export const countExportRows = (input: FinanceExportInput, options: FinanceExportOptions): {
  sales: number; expenses: number; otherIncome: number;
} => ({
  sales: filterSaleLines(input.lines, options).length,
  expenses: filterExpenses(input.expenses, options).length,
  otherIncome: filterOtherIncome(input.otherIncome, options).length,
});

/** `javani-finance-2026-09-01_to_2026-09-08` — safe on every filesystem. */
export const buildExportFilename = (options: FinanceExportOptions, prefix = "javani-finance"): string => {
  const from = options.from || "start";
  const to = options.to || "today";
  return `${prefix}-${from}_to_${to}`.replace(/[^a-zA-Z0-9._-]/g, "-");
};
