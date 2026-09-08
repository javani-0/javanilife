// ---------------------------------------------------------------------------
// The SALES BEHIND THE TOTALS (req: partners and admin must see exactly which
// products, courses and classes made up a month's income and a partner's cut).
//
// Income has always been DERIVED from orders + paid class fees. This module
// derives the same money one line at a time instead of one number at a time, so
// every figure on the Finance page can be opened up into the sales that formed
// it. Reconciliation with the existing totals is asserted in the tests — the
// ledger must never disagree with the tiles above it.
//
// PURE + dependency-free (paise everywhere), mirroring src/lib/finance/income.ts.
// ---------------------------------------------------------------------------
import { orderCollectedInPaise, type OrderLineItem, type SplittableOrder } from "./income";

export type SaleCategory = "product" | "course" | "class" | "rental" | "other";

/** How the money arrived. `unknown` when the record simply doesn't say. */
export type SaleMode = "online" | "offline" | "unknown";

export interface SaleLine {
  id: string;
  category: SaleCategory;
  /** The product / course / class that was sold. */
  name: string;
  /** Who paid — customer or student. */
  buyer: string;
  /** How to reach them (req 6: "to whom we sold it, customer details"). */
  buyerPhone?: string;
  buyerEmail?: string;
  /** How many units this line covered — 1 for a class fee or a course seat. */
  quantity?: number;
  /** "YYYY-MM-DD", or "" when the record carries no usable date. */
  dateKey: string;
  amountInPaise: number;
  mode: SaleMode;
  /** Human label for the rail: "Razorpay", "Cash", "Autopay"… */
  methodLabel: string;
  /** Order number, fee period, etc. — how to find the record again. */
  reference: string;
}

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const str = (value: unknown): string => (typeof value === "string" ? value : "");

const pad = (value: number): string => String(value).padStart(2, "0");

const localDateKey = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/**
 * "YYYY-MM-DD" from a Firestore Timestamp, {seconds}, Date, or date string.
 * Empty string when there is no usable date.
 *
 * Timestamps are read in LOCAL time on purpose: a fee collected at 2 AM IST
 * belongs to that day's takings, not to the previous UTC day. Plain date
 * strings (an expense's `spentOn`) are already calendar dates — left as-is.
 */
export const dateKeyOf = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? localDateKey(parsed) : "";
  }
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? localDateKey(value) : "";
  const record = value as { toDate?: () => Date; seconds?: number };
  if (typeof record.toDate === "function") {
    const date = record.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? localDateKey(date) : "";
  }
  if (typeof record.seconds === "number") return localDateKey(new Date(record.seconds * 1000));
  return "";
};

// ── Orders ────────────────────────────────────────────────────────────────

export interface SaleOrder extends SplittableOrder {
  id?: string;
  orderNumber?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerWhatsAppNumber?: string;
  createdAt?: unknown;
  payment?: SplittableOrder["payment"] & { method?: string; paidAt?: unknown };
}

const ORDER_METHODS: Record<string, { mode: SaleMode; label: string }> = {
  razorpay: { mode: "online", label: "Razorpay" },
  upi: { mode: "online", label: "UPI" },
  card: { mode: "online", label: "Card" },
  cod: { mode: "offline", label: "Cash on delivery" },
  cash: { mode: "offline", label: "Cash" },
};

const orderMethod = (order: SaleOrder): { mode: SaleMode; label: string } => {
  // A COD order that has been collected is offline money however it was tagged.
  if (order.payment?.status === "cod-collected") return { mode: "offline", label: "Cash on delivery" };
  const known = ORDER_METHODS[str(order.payment?.method).toLowerCase()];
  return known || { mode: "unknown", label: str(order.payment?.method) || "—" };
};

const lineTotalOf = (item: OrderLineItem): number =>
  Math.max(0, Math.round(num(item.lineTotalInPaise ?? num(item.amountInPaise) * (num(item.quantity) || 1))));

/**
 * One line PER ITEM sold. A partly-paid (EMI) order apportions the money it has
 * actually collected across its items by line total, with the last item taking
 * the rounding remainder — so the lines always sum back to the order's
 * collected amount, and the ledger reconciles with `splitOrderIncomeInPaise`.
 */
export const orderSaleLines = (order: SaleOrder, index = 0): SaleLine[] => {
  const collected = orderCollectedInPaise(order);
  if (collected <= 0) return [];

  const orderId = order.id || order.orderNumber || `order-${index}`;
  const { mode, label } = orderMethod(order);
  const dateKey = dateKeyOf(order.payment?.paidAt || order.createdAt);
  const buyer = str(order.customerName);
  const buyerPhone = str(order.customerPhone) || str(order.customerWhatsAppNumber);
  const buyerEmail = str(order.customerEmail);
  const reference = str(order.orderNumber);

  const items = (order.items || []).filter((item) => lineTotalOf(item) > 0);
  const lineSum = items.reduce((sum, item) => sum + lineTotalOf(item), 0);

  // No identifiable items → the whole order counts as one product sale, exactly
  // as splitOrderIncomeInPaise treats it.
  if (items.length === 0 || lineSum <= 0) {
    return [{
      id: orderId,
      category: "product",
      name: reference ? `Order ${reference}` : "Order",
      buyer, buyerPhone, buyerEmail, quantity: 1,
      dateKey, amountInPaise: collected, mode, methodLabel: label, reference,
    }];
  }

  let remaining = collected;
  return items.map((item, itemIndex) => {
    const isLast = itemIndex === items.length - 1;
    const amountInPaise = isLast ? remaining : Math.round((collected * lineTotalOf(item)) / lineSum);
    remaining -= amountInPaise;
    const lineItem = item as OrderLineItem & { name?: string; rental?: { days?: number; dueAt?: string } };
    const category: SaleCategory = item.itemType === "course"
      ? "course"
      : item.itemType === "rental" ? "rental" : "product";
    return {
      id: `${orderId}:${itemIndex}`,
      category,
      name: str(lineItem.name) || "Item",
      buyer, buyerPhone, buyerEmail,
      quantity: Math.max(1, Math.round(num(item.quantity) || 1)),
      dateKey,
      amountInPaise,
      mode,
      methodLabel: label,
      // A rental's reference carries its term, so the sheet says what was hired
      // and for how long, not just that money arrived.
      reference: category === "rental" && lineItem.rental?.days
        ? `${reference ? `${reference} · ` : ""}${lineItem.rental.days} day${lineItem.rental.days === 1 ? "" : "s"}`
        : reference,
    };
  });
};

// ── Class fees ────────────────────────────────────────────────────────────

export interface SaleFee {
  id?: string;
  status?: string;
  className?: string;
  studentName?: string;
  parentPhone?: string;
  studentRollNo?: string;
  periodLabel?: string;
  amountInPaise?: number;
  paymentMethod?: string;
  paidAt?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
}

const FEE_METHODS: Record<string, { mode: SaleMode; label: string }> = {
  cash: { mode: "offline", label: "Cash / counter" },
  counter: { mode: "offline", label: "Cash / counter" },
  upi: { mode: "online", label: "UPI" },
  manual: { mode: "online", label: "Online" },
  autopay: { mode: "online", label: "Autopay" },
  razorpay: { mode: "online", label: "Razorpay" },
};

/** One line per COLLECTED class fee. Unpaid dues are not income and are skipped. */
export const feeSaleLines = (fees: SaleFee[]): SaleLine[] =>
  fees
    .filter((fee) => fee?.status === "paid")
    .map((fee, index) => {
      const method = FEE_METHODS[str(fee.paymentMethod).toLowerCase()] || { mode: "unknown" as SaleMode, label: "—" };
      return {
        id: fee.id || `fee-${index}`,
        category: "class" as SaleCategory,
        name: str(fee.className) || "Class fee",
        buyer: str(fee.studentName),
        buyerPhone: str(fee.parentPhone),
        quantity: 1,
        dateKey: dateKeyOf(fee.paidAt || fee.updatedAt || fee.createdAt),
        amountInPaise: Math.max(0, Math.round(num(fee.amountInPaise))),
        mode: method.mode,
        methodLabel: method.label,
        reference: str(fee.periodLabel),
      };
    });

// ── Manual ("other") income ───────────────────────────────────────────────

export interface SaleManualIncome {
  id?: string;
  title?: string;
  category?: string;
  amountInPaise?: number;
  receivedOn?: string;
  paymentMode?: string;
}

export const manualIncomeSaleLines = (entries: SaleManualIncome[]): SaleLine[] =>
  entries.map((entry, index) => {
    const mode: SaleMode = entry.paymentMode === "online" ? "online" : entry.paymentMode === "offline" ? "offline" : "unknown";
    return {
      id: entry.id || `income-${index}`,
      category: "other" as SaleCategory,
      name: str(entry.title) || "Other income",
      buyer: "",
      dateKey: dateKeyOf(entry.receivedOn),
      amountInPaise: Math.max(0, Math.round(num(entry.amountInPaise))),
      mode,
      methodLabel: mode === "online" ? "Online" : mode === "offline" ? "Cash / offline" : "—",
      reference: str(entry.category),
    };
  });

// ── Rental late fees ──────────────────────────────────────────────────────

export interface SaleRental {
  id?: string;
  productName?: string;
  customerName?: string;
  customerPhone?: string;
  orderNumber?: string;
  quantity?: number;
  overdueHours?: number;
  extraChargeInPaise?: number;
  extraChargeCollected?: boolean;
  returnedAt?: unknown;
  dueAt?: unknown;
}

/**
 * Money earned from LATE returns (req 3/6). The booking itself was already paid
 * through its order, so only the collected late fee is counted here — counting
 * the booking twice would inflate the month.
 */
export const rentalLateFeeSaleLines = (rentals: SaleRental[]): SaleLine[] =>
  (rentals || [])
    .filter((rental) => rental?.extraChargeCollected === true && num(rental.extraChargeInPaise) > 0)
    .map((rental, index) => ({
      id: rental.id ? `rental-late-${rental.id}` : `rental-late-${index}`,
      category: "rental" as SaleCategory,
      name: `${str(rental.productName) || "Rental"} — late return`,
      buyer: str(rental.customerName),
      buyerPhone: str(rental.customerPhone),
      quantity: Math.max(1, Math.round(num(rental.quantity) || 1)),
      dateKey: dateKeyOf(rental.returnedAt || rental.dueAt),
      amountInPaise: Math.max(0, Math.round(num(rental.extraChargeInPaise))),
      mode: "unknown" as SaleMode,
      methodLabel: "Late fee",
      reference: `${str(rental.orderNumber)}${rental.overdueHours ? ` · ${Math.round(num(rental.overdueHours))} h late` : ""}`.trim(),
    }));

/** Every sale behind the period's income, newest first. */
export const buildSaleLines = (input: {
  orders?: SaleOrder[];
  fees?: SaleFee[];
  manualIncome?: SaleManualIncome[];
  rentals?: SaleRental[];
}): SaleLine[] => [
  ...(input.orders || []).flatMap((order, index) => orderSaleLines(order, index)),
  ...feeSaleLines(input.fees || []),
  ...manualIncomeSaleLines(input.manualIncome || []),
  ...rentalLateFeeSaleLines(input.rentals || []),
].sort((a, b) => (b.dateKey || "").localeCompare(a.dateKey || ""));

export interface SalesTotal {
  count: number;
  totalInPaise: number;
}

export const SALE_CATEGORIES: SaleCategory[] = ["product", "course", "class", "rental", "other"];

export const SALE_CATEGORY_LABELS: Record<SaleCategory, string> = {
  product: "Product Income",
  course: "Course Income",
  class: "Classes Income",
  rental: "Rental Income",
  other: "Other Income",
};

/** Count + money per category — what the breakdown card shows. */
export const summarizeSalesByCategory = (lines: SaleLine[]): Record<SaleCategory, SalesTotal> => {
  const empty = (): SalesTotal => ({ count: 0, totalInPaise: 0 });
  const totals: Record<SaleCategory, SalesTotal> = {
    product: empty(), course: empty(), class: empty(), rental: empty(), other: empty(),
  };
  for (const line of lines) {
    totals[line.category].count += 1;
    totals[line.category].totalInPaise += line.amountInPaise;
  }
  return totals;
};

/** Online vs offline split of a set of sales — shown on the drill-down. */
export const summarizeSalesByMode = (lines: SaleLine[]): Record<SaleMode, SalesTotal> => {
  const empty = (): SalesTotal => ({ count: 0, totalInPaise: 0 });
  const totals: Record<SaleMode, SalesTotal> = { online: empty(), offline: empty(), unknown: empty() };
  for (const line of lines) {
    totals[line.mode].count += 1;
    totals[line.mode].totalInPaise += line.amountInPaise;
  }
  return totals;
};

// ── What actually sold (req 6) ────────────────────────────────────────────

export interface ItemSalesSummary {
  category: SaleCategory;
  name: string;
  /** How many separate sales — the "no. of sales". */
  sales: number;
  /** Units moved across those sales. */
  units: number;
  totalInPaise: number;
  /** Distinct buyers, and who they were. */
  customerCount: number;
  customers: string[];
  firstSale: string;
  lastSale: string;
}

/**
 * One row per thing sold — product, course, class or rental — with how often it
 * went, how much it made and who bought it. This is the answer to "which
 * product sells", and it reads off the same lines as every other total.
 */
export const summarizeSalesByItem = (lines: SaleLine[]): ItemSalesSummary[] => {
  const byKey = new Map<string, ItemSalesSummary & { buyers: Set<string> }>();

  for (const line of lines || []) {
    const key = `${line.category}::${line.name}`;
    const existing = byKey.get(key);
    const buyer = (line.buyer || "").trim();
    if (existing) {
      existing.sales += 1;
      existing.units += Math.max(1, Math.round(line.quantity || 1));
      existing.totalInPaise += line.amountInPaise;
      if (buyer) existing.buyers.add(buyer);
      if (line.dateKey) {
        if (!existing.firstSale || line.dateKey < existing.firstSale) existing.firstSale = line.dateKey;
        if (!existing.lastSale || line.dateKey > existing.lastSale) existing.lastSale = line.dateKey;
      }
      continue;
    }
    byKey.set(key, {
      category: line.category,
      name: line.name,
      sales: 1,
      units: Math.max(1, Math.round(line.quantity || 1)),
      totalInPaise: line.amountInPaise,
      customerCount: 0,
      customers: [],
      firstSale: line.dateKey || "",
      lastSale: line.dateKey || "",
      buyers: new Set(buyer ? [buyer] : []),
    });
  }

  return [...byKey.values()]
    .map(({ buyers, ...summary }) => ({
      ...summary,
      customerCount: buyers.size,
      customers: [...buyers].sort((a, b) => a.localeCompare(b)),
    }))
    // Best sellers first — that is the question this table is asked.
    .sort((a, b) => b.totalInPaise - a.totalInPaise);
};
