import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPORT_OPTIONS,
  amountCell,
  buildExportFilename,
  buildFinanceSheets,
  countExportRows,
  filterSaleLines,
  inDateRange,
  type FinanceExportInput,
  type FinanceExportOptions,
} from "./financeExport";
import type { SaleLine } from "./salesLedger";

const line = (over: Partial<SaleLine>): SaleLine => ({
  id: Math.random().toString(36).slice(2),
  category: "product",
  name: "Item",
  buyer: "Buyer",
  dateKey: "2026-09-05",
  amountInPaise: 100_00,
  mode: "online",
  methodLabel: "Razorpay",
  reference: "JV-1",
  ...over,
});

const input: FinanceExportInput = {
  lines: [
    line({ category: "product", amountInPaise: 100_00, dateKey: "2026-09-05" }),
    line({ category: "class", amountInPaise: 250_00, dateKey: "2026-09-06", mode: "offline", methodLabel: "Cash / counter" }),
    line({ category: "course", amountInPaise: 500_00, dateKey: "2026-08-20" }),
    line({ category: "other", amountInPaise: 75_00, dateKey: "", mode: "unknown" }),
  ],
  expenses: [
    { id: "e1", title: "Rent", category: "Rent", amountInPaise: 300_00, spentOn: "2026-09-01" },
    { id: "e2", title: "Old rent", category: "Rent", amountInPaise: 900_00, spentOn: "2026-07-01" },
  ],
  otherIncome: [
    { id: "i1", title: "Workshop", category: "Workshop", amountInPaise: 75_00, receivedOn: "2026-09-04", paymentMode: "offline" },
  ],
  partners: [
    { id: "p1", name: "Vanitha", email: "v@x.com", classesPercent: 50, coursesPercent: 0, productsPercent: 10 },
    { id: "p2", name: "Nobody", email: "n@x.com", classesPercent: 0, coursesPercent: 0, productsPercent: 0 },
  ],
};

const options = (over: Partial<FinanceExportOptions> = {}): FinanceExportOptions => ({
  ...DEFAULT_EXPORT_OPTIONS,
  from: "2026-09-01",
  to: "2026-09-30",
  ...over,
});

describe("inDateRange", () => {
  it("is inclusive on both ends", () => {
    expect(inDateRange("2026-09-01", "2026-09-01", "2026-09-30")).toBe(true);
    expect(inDateRange("2026-09-30", "2026-09-01", "2026-09-30")).toBe(true);
    expect(inDateRange("2026-08-31", "2026-09-01", "2026-09-30")).toBe(false);
    expect(inDateRange("2026-10-01", "2026-09-01", "2026-09-30")).toBe(false);
  });

  it("keeps everything, dateless records included, when no bound is set", () => {
    expect(inDateRange("", "", "")).toBe(true);
    expect(inDateRange("2020-01-01", "", "")).toBe(true);
  });

  it("drops undated records once a bound exists — they would inflate the period", () => {
    expect(inDateRange("", "2026-09-01", "")).toBe(false);
  });

  it("supports an open-ended range", () => {
    expect(inDateRange("2026-01-01", "", "2026-09-30")).toBe(true);
    expect(inDateRange("2027-01-01", "", "2026-09-30")).toBe(false);
  });
});

describe("filterSaleLines", () => {
  it("applies range, category and mode together", () => {
    expect(filterSaleLines(input.lines, options()).map((l) => l.category)).toEqual(["product", "class"]);
    expect(filterSaleLines(input.lines, options({ categories: ["class"] })).map((l) => l.category)).toEqual(["class"]);
    expect(filterSaleLines(input.lines, options({ mode: "offline" })).map((l) => l.category)).toEqual(["class"]);
    expect(filterSaleLines(input.lines, options({ from: "", to: "" }))).toHaveLength(4);
  });
});

describe("amountCell", () => {
  it("converts paise to rupees, or keeps paise when asked", () => {
    expect(amountCell(125_050, "rupees")).toBe(1250.5);
    expect(amountCell(125_050, "paise")).toBe(125050);
  });
});

describe("buildFinanceSheets", () => {
  it("writes only the tabs the admin ticked, in that order", () => {
    const sheets = buildFinanceSheets(input, options({ sheets: ["sales", "summary"] }));
    expect(sheets.map((sheet) => sheet.name)).toEqual(["Sales", "Summary"]);
  });

  it("summarises the SAME money the sales tab lists", () => {
    const [summary] = buildFinanceSheets(input, options({ sheets: ["summary"] }));
    const row = (label: string) => summary.rows.find((cells) => cells[0] === label);
    expect(row("Product income")?.[1]).toBe(100);
    expect(row("Class fee income")?.[1]).toBe(250);
    expect(row("Course income")?.[1]).toBe(0);   // August — outside the range
    expect(row("Total income")?.[1]).toBe(350);
    expect(row("Total expenses")?.[1]).toBe(300); // July expense excluded
    expect(row("Net profit")?.[1]).toBe(50);
    expect(row("Collected offline")?.[1]).toBe(250);
  });

  it("exports only the chosen columns, and totals the amount", () => {
    const [sales] = buildFinanceSheets(input, options({ sheets: ["sales"], columns: ["date", "name", "amount"] }));
    expect(sales.header).toEqual(["Date", "Item / class", "Amount (₹)"]);
    expect(sales.rows).toHaveLength(3); // 2 sales + totals row
    expect(sales.rows[2]).toEqual(["TOTAL (2 sales)", "", 350]);
  });

  it("can leave the totals row out", () => {
    const [sales] = buildFinanceSheets(input, options({ sheets: ["sales"], includeTotals: false }));
    expect(sales.rows).toHaveLength(2);
  });

  it("switches every amount to paise on request", () => {
    const [sales] = buildFinanceSheets(input, options({ sheets: ["sales"], amountUnit: "paise", includeTotals: false }));
    expect(sales.header?.at(-1)).toBe("Amount (paise)");
    expect(sales.rows[0].at(-1)).toBe(10000);
    expect(sales.moneyColumns).toEqual([]);
  });

  it("pays partners only from the categories they share, on the filtered income", () => {
    const [partners] = buildFinanceSheets(input, options({ sheets: ["partners"] }));
    // 50% of ₹250 class + 10% of ₹100 product = ₹135.
    expect(partners.rows[0][0]).toBe("Vanitha");
    expect(partners.rows[0][5]).toBe(135);
    // A partner with no share at all is not a payout row.
    expect(partners.rows.map((row) => row[0])).not.toContain("Nobody");
  });

  it("keeps expense and other-income tabs on their own dates", () => {
    const sheets = buildFinanceSheets(input, options({ sheets: ["expenses", "otherIncome"] }));
    expect(sheets[0].rows.map((row) => row[1])).toEqual(["Rent", ""]);
    expect(sheets[1].rows[0]).toEqual(["2026-09-04", "Workshop", "Workshop", "Offline", "", 75]);
  });
});

describe("countExportRows", () => {
  it("reports what the download will contain", () => {
    expect(countExportRows(input, options())).toEqual({ sales: 2, expenses: 1, otherIncome: 1 });
  });
});

describe("buildExportFilename", () => {
  it("names the file after the range", () => {
    expect(buildExportFilename(options())).toBe("javani-finance-2026-09-01_to_2026-09-30");
    expect(buildExportFilename(options({ from: "", to: "" }))).toBe("javani-finance-start_to_today");
  });
});

// ── "What sold" + rentals (req 6) ─────────────────────────────────────────

describe("the What sold sheet", () => {
  const withRentals: FinanceExportInput = {
    ...input,
    lines: [
      ...input.lines,
      line({ category: "rental", name: "Kuchipudi costume — 2 days rental", buyer: "Meera", amountInPaise: 100_00, dateKey: "2026-09-07", quantity: 1, buyerPhone: "98765", buyerEmail: "m@x.com" }),
      line({ category: "rental", name: "Kuchipudi costume — 2 days rental", buyer: "Anita", amountInPaise: 100_00, dateKey: "2026-09-08", quantity: 1 }),
    ],
  };

  it("lists every item with its sales count, units, money and buyers", () => {
    const [sheet] = buildFinanceSheets(withRentals, options({ sheets: ["byItem"] }));
    expect(sheet.name).toBe("What sold");
    const costume = sheet.rows.find((row) => String(row[1]).startsWith("Kuchipudi costume"));
    expect(costume?.[0]).toBe("Rental Income");
    expect(costume?.[2]).toBe(2);            // two sales
    expect(costume?.[3]).toBe(2);            // two units
    expect(costume?.[4]).toBe(200);          // ₹200
    expect(costume?.[5]).toBe(2);            // two customers
    expect(costume?.[6]).toBe("Anita, Meera");
  });

  it("totals the sheet when totals are on", () => {
    const [sheet] = buildFinanceSheets(withRentals, options({ sheets: ["byItem"] }));
    const total = sheet.rows[sheet.rows.length - 1];
    expect(String(total[0])).toContain("TOTAL");
    expect(total[4]).toBe(550);              // 100 product + 250 class + 200 rentals
  });

  it("reports rental income on the summary tab", () => {
    const [summary] = buildFinanceSheets(withRentals, options({ sheets: ["summary"] }));
    expect(summary.rows.find((row) => row[0] === "Rental income")?.[1]).toBe(200);
    expect(summary.rows.find((row) => row[0] === "Total income")?.[1]).toBe(550);
  });

  it("carries customer contact details onto the sales sheet", () => {
    const [sales] = buildFinanceSheets(withRentals, options({
      sheets: ["sales"], columns: ["name", "buyer", "phone", "email"], includeTotals: false,
    }));
    expect(sales.header).toEqual(["Item / class", "Paid by", "Phone", "Email"]);
    const row = sales.rows.find((cells) => String(cells[1]) === "Meera");
    expect(row).toEqual(["Kuchipudi costume — 2 days rental", "Meera", "98765", "m@x.com"]);
  });
});
