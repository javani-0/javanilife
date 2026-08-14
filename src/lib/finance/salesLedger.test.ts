import { describe, expect, it } from "vitest";
import { splitOrderIncomeInPaise, sumClassIncomeInPaise } from "./income";
import {
  buildSaleLines,
  dateKeyOf,
  feeSaleLines,
  manualIncomeSaleLines,
  orderSaleLines,
  summarizeSalesByCategory,
  summarizeSalesByMode,
  type SaleFee,
  type SaleOrder,
} from "./salesLedger";

const paidOrder = (over: Partial<SaleOrder> = {}): SaleOrder => ({
  id: "o1",
  orderNumber: "JAV-1",
  customerName: "Arjun",
  totalInPaise: 100000,
  payment: { status: "paid", method: "razorpay" },
  items: [{ itemType: "product", lineTotalInPaise: 100000, quantity: 1, name: "Practice saree" } as never],
  ...over,
});

describe("orderSaleLines", () => {
  it("emits one line per item, named, with the buyer and the rail", () => {
    const lines = orderSaleLines(paidOrder({
      totalInPaise: 150000,
      items: [
        { itemType: "product", lineTotalInPaise: 50000, quantity: 1, name: "Practice saree" },
        { itemType: "course", lineTotalInPaise: 100000, quantity: 1, name: "Kuchipudi masterclass" },
      ] as never,
    }));

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ category: "product", name: "Practice saree", amountInPaise: 50000, mode: "online", methodLabel: "Razorpay", buyer: "Arjun", reference: "JAV-1" });
    expect(lines[1]).toMatchObject({ category: "course", name: "Kuchipudi masterclass", amountInPaise: 100000 });
  });

  it("ignores money that was never collected", () => {
    expect(orderSaleLines(paidOrder({ payment: { status: "pending", method: "razorpay" } }))).toEqual([]);
    expect(orderSaleLines(paidOrder({ payment: { status: "cod-pending", method: "cod" } }))).toEqual([]);
  });

  it("marks a collected COD order as offline money", () => {
    const [line] = orderSaleLines(paidOrder({ payment: { status: "cod-collected", method: "cod" } }));
    expect(line.mode).toBe("offline");
    expect(line.methodLabel).toBe("Cash on delivery");
  });

  it("apportions a partly-paid order across its items and never invents money", () => {
    const lines = orderSaleLines(paidOrder({
      totalInPaise: 90000,
      payment: {
        status: "partially-paid",
        method: "razorpay",
        installmentPlan: { installments: [{ status: "paid", amountInPaise: 30001 }, { status: "pending", amountInPaise: 59999 }] },
      },
      items: [
        { itemType: "product", lineTotalInPaise: 30000, quantity: 1, name: "Saree" },
        { itemType: "course", lineTotalInPaise: 60000, quantity: 1, name: "Workshop" },
      ] as never,
    }));

    expect(lines.reduce((sum, line) => sum + line.amountInPaise, 0)).toBe(30001);
  });

  it("counts an order with no items as a single product sale", () => {
    const lines = orderSaleLines(paidOrder({ items: [] }));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ category: "product", name: "Order JAV-1", amountInPaise: 100000 });
  });

  it("reconciles EXACTLY with the product/course totals on the Finance tiles", () => {
    const orders: SaleOrder[] = [
      paidOrder({ id: "a" }),
      paidOrder({
        id: "b",
        totalInPaise: 89900,
        items: [{ itemType: "course", lineTotalInPaise: 89900, quantity: 1, name: "Masterclass" }] as never,
      }),
      paidOrder({
        id: "c",
        totalInPaise: 70000,
        payment: { status: "cod-collected", method: "cod" },
        items: [
          { itemType: "product", lineTotalInPaise: 30000, quantity: 1, name: "Saree" },
          { itemType: "course", lineTotalInPaise: 40000, quantity: 1, name: "Course" },
        ] as never,
      }),
      paidOrder({ id: "d", payment: { status: "pending", method: "razorpay" } }),
    ];
    const totals = summarizeSalesByCategory(orders.flatMap((order, i) => orderSaleLines(order, i)));
    const expected = splitOrderIncomeInPaise(orders as never);

    expect(totals.product.totalInPaise).toBe(expected.productIncomeInPaise);
    expect(totals.course.totalInPaise).toBe(expected.courseIncomeInPaise);
  });
});

describe("feeSaleLines", () => {
  const fees: SaleFee[] = [
    { id: "f1", status: "paid", className: "Kuchipudi Pregrade", studentName: "Siri", periodLabel: "June 2026", amountInPaise: 200000, paymentMethod: "manual", paidAt: "2026-06-06" },
    { id: "f2", status: "paid", className: "Kuchipudi Pregrade", studentName: "Trishitha", periodLabel: "May 2026", amountInPaise: 200000, paymentMethod: "cash", paidAt: "2026-05-04" },
    { id: "f3", status: "paid", className: "Nattuvangam", studentName: "Pooja", periodLabel: "June 2026", amountInPaise: 185000, paymentMethod: "autopay", paidAt: "2026-06-02" },
    { id: "f4", status: "pending", className: "Nattuvangam", amountInPaise: 999999 },
    { id: "f5", status: "paid", className: "Legacy", amountInPaise: 100000, paidAt: "2026-06-01" },
  ];

  it("keeps only collected fees and names the class, student and period", () => {
    const lines = feeSaleLines(fees);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatchObject({ category: "class", name: "Kuchipudi Pregrade", buyer: "Siri", reference: "June 2026", dateKey: "2026-06-06" });
  });

  it("calls cash offline and every other rail online", () => {
    const byMode = summarizeSalesByMode(feeSaleLines(fees));
    expect(byMode.offline.totalInPaise).toBe(200000);
    expect(byMode.online.totalInPaise).toBe(385000);
    // A fee with no recorded method is reported as unknown, never guessed.
    expect(byMode.unknown.count).toBe(1);
    expect(feeSaleLines(fees).find((line) => line.name === "Legacy")?.methodLabel).toBe("—");
  });

  it("reconciles with the class-income total on the Finance tile", () => {
    const total = feeSaleLines(fees).reduce((sum, line) => sum + line.amountInPaise, 0);
    expect(total).toBe(sumClassIncomeInPaise(fees as never));
  });
});

describe("manualIncomeSaleLines", () => {
  it("labels the recorded mode and leaves legacy entries unknown", () => {
    const lines = manualIncomeSaleLines([
      { id: "m1", title: "Weekend workshop", amountInPaise: 500000, receivedOn: "2026-08-02", paymentMode: "offline", category: "Workshop" },
      { id: "m2", title: "Donation", amountInPaise: 100000, receivedOn: "2026-08-03" },
    ]);
    expect(lines[0]).toMatchObject({ category: "other", mode: "offline", methodLabel: "Cash / offline", reference: "Workshop" });
    expect(lines[1]).toMatchObject({ mode: "unknown", methodLabel: "—" });
  });
});

describe("dateKeyOf", () => {
  it("passes plain calendar dates through untouched", () => {
    expect(dateKeyOf("2026-08-14")).toBe("2026-08-14");
    expect(dateKeyOf("")).toBe("");
    expect(dateKeyOf(undefined)).toBe("");
  });

  it("reads Firestore timestamps in LOCAL time, so a late-night payment keeps its day", () => {
    const lateNight = new Date(2026, 7, 14, 1, 30); // 14 Aug, 01:30 local
    expect(dateKeyOf({ seconds: Math.floor(lateNight.getTime() / 1000) })).toBe("2026-08-14");
    expect(dateKeyOf({ toDate: () => lateNight })).toBe("2026-08-14");
    expect(dateKeyOf(lateNight)).toBe("2026-08-14");
  });

  it("ignores unusable values instead of inventing a date", () => {
    expect(dateKeyOf("not a date")).toBe("");
    expect(dateKeyOf(new Date("nope"))).toBe("");
  });
});

describe("buildSaleLines", () => {
  it("merges every source, newest first", () => {
    const lines = buildSaleLines({
      orders: [paidOrder({ payment: { status: "paid", method: "razorpay", paidAt: "2026-08-01" } })],
      fees: [{ id: "f1", status: "paid", className: "Nattuvangam", amountInPaise: 100000, paymentMethod: "cash", paidAt: "2026-08-10" }],
      manualIncome: [{ id: "m1", title: "Donation", amountInPaise: 50000, receivedOn: "2026-08-05" }],
    });
    expect(lines.map((line) => line.dateKey)).toEqual(["2026-08-10", "2026-08-05", "2026-08-01"]);
    expect(lines.map((line) => line.category)).toEqual(["class", "other", "product"]);
  });

  it("is empty, not broken, when there is nothing to show", () => {
    expect(buildSaleLines({})).toEqual([]);
    expect(summarizeSalesByCategory([]).product).toEqual({ count: 0, totalInPaise: 0 });
  });
});
