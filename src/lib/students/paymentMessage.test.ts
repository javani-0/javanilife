import { describe, expect, it } from "vitest";
import { buildStudentBreakdown } from "./feeBreakdown";
import { buildPaymentLinkWhatsAppUrl, buildPaymentSplitLines, shouldItemiseSplit } from "./paymentMessage";
import type { StudentCourse } from "./types";

const course = (over: Partial<StudentCourse> = {}): StudentCourse => ({
  key: "k1",
  classId: "c1",
  className: "Bharatanatyam",
  inventory: { kit: false, books: false, uniform: false },
  status: "active",
  methods: { razorpay: false, qr: true, counter: true, emi: false },
  fees: {
    studentType: "new",
    track: "monthly",
    kitFeeInPaise: 0,
    booksFeeInPaise: 0,
    uniformFeeInPaise: 0,
    monthlyFeeInPaise: 0,
    termFeeInPaise: 0,
    discountInPaise: 0,
    firstMonthFree: false,
  },
  ...over,
});

const twoClasses = () => buildStudentBreakdown([
  course({
    key: "k1", classId: "c1", className: "Kuchipudi Diploma", slotLabel: "Mon & Wed · 6 PM",
    fees: { ...course().fees, track: "term", termFeeInPaise: 600000, kitFeeInPaise: 150000 },
  }),
  course({
    key: "k2", classId: "c2", className: "Nattuvangam",
    fees: { ...course().fees, monthlyFeeInPaise: 200000, discountInPaise: 50000 },
  }),
]);

const student = { name: "Samvidha", parentName: "Lakshmi", phone: "+91 90000 11111" };

describe("buildPaymentSplitLines", () => {
  it("names every class and gives each its own total (req: payment split-up)", () => {
    const lines = buildPaymentSplitLines(twoClasses());
    const text = lines.join("\n");

    expect(text).toContain("*Fee split-up (2 classes)*");
    expect(text).toContain("1) *Kuchipudi Diploma* (Mon & Wed · 6 PM)");
    expect(text).toContain("   • Kit fee: ₹1,500");
    expect(text).toContain("   • Course fee (full term): ₹6,000");
    expect(text).toContain("   *Class total: ₹7,500*");
    expect(text).toContain("2) *Nattuvangam*");
    expect(text).toContain("   • Pre-payment (first fee): ₹2,000");
    expect(text).toContain("   • Discount: −₹500");
    expect(text).toContain("   *Class total: ₹1,500*");
    expect(text).toContain("*TOTAL for 2 classes: ₹9,000*");
  });

  it("names the recurring monthly fee on the class it belongs to", () => {
    const text = buildPaymentSplitLines(twoClasses()).join("\n");
    expect(text).toContain("   (then ₹2,000 / month)");
    // The term class has no recurring fee, so only ONE such line exists.
    expect(text.match(/\/ month/g)).toHaveLength(1);
  });

  it("still splits a single-class link so the parent sees what they pay for", () => {
    const lines = buildPaymentSplitLines(buildStudentBreakdown([
      course({ fees: { ...course().fees, monthlyFeeInPaise: 200000 } }),
    ]));
    const text = lines.join("\n");
    expect(text).toContain("*Fee split-up*");
    expect(text).toContain("*Bharatanatyam*");
    expect(text).not.toContain("1) ");
    expect(text).toContain("*TOTAL: ₹2,000*");
  });

  it("compresses to one line per class when the itemised form would be too long", () => {
    const many = buildStudentBreakdown([1, 2, 3, 4, 5].map((n) => course({
      key: `k${n}`, classId: `c${n}`, className: `Class ${n}`,
      fees: { ...course().fees, monthlyFeeInPaise: 100000, kitFeeInPaise: 50000 },
    })));
    const text = buildPaymentSplitLines(many).join("\n");

    expect(shouldItemiseSplit(many.sections)).toBe(false);
    expect(text).not.toContain("• Kit fee");
    // Every class still carries its own amount — the split is compressed, never dropped.
    [1, 2, 3, 4, 5].forEach((n) => expect(text).toContain(`${n}) *Class ${n}*`));
    expect(text.match(/\*₹1,500\*/g)).toHaveLength(5);
    expect(text).toContain("*TOTAL for 5 classes: ₹7,500*");
  });

  it("returns nothing when there are no classes (never an empty heading)", () => {
    expect(buildPaymentSplitLines(buildStudentBreakdown([]))).toEqual([]);
  });

  it("shows the per-class amount payable now when EMI makes it differ", () => {
    const emi = buildStudentBreakdown([course({
      methods: { razorpay: false, qr: true, counter: true, emi: true },
      fees: {
        ...course().fees, track: "term", termFeeInPaise: 1000000,
        emiSplit: { upfrontPercentage: 40, installmentPercentages: [30, 30] },
      },
    })]);
    const text = buildPaymentSplitLines(emi).join("\n");
    expect(text).toContain("   *Class total: ₹10,000*");
    expect(text).toContain("Payable now for this class: *₹4,000*");
  });
});

describe("buildPaymentLinkWhatsAppUrl", () => {
  const decoded = (url: string) => decodeURIComponent(url.split("?text=")[1] || "");

  it("sends to the parent's number and carries the split-up + the link", () => {
    const url = buildPaymentLinkWhatsAppUrl(student, twoClasses(), "https://javani.example/pay/abc123");
    expect(url.startsWith("https://wa.me/919000011111?text=")).toBe(true);

    const text = decoded(url);
    expect(text).toContain("Dear Lakshmi,");
    expect(text).toContain("We're delighted to welcome *Samvidha* to our 2 classes.");
    expect(text).toContain("*Fee split-up (2 classes)*");
    expect(text).toContain("*Kuchipudi Diploma*");
    expect(text).toContain("*Nattuvangam*");
    expect(text).toContain("fee payment of *₹9,000*");
    expect(text).toContain("https://javani.example/pay/abc123");
  });

  it("asks for the first installment only on an EMI link, schedule included", () => {
    const breakdown = buildStudentBreakdown([course({
      className: "Kuchipudi Diploma",
      methods: { razorpay: false, qr: true, counter: true, emi: true },
      fees: {
        ...course().fees, track: "term", termFeeInPaise: 1000000,
        emiSplit: { upfrontPercentage: 40, installmentPercentages: [30, 30] },
      },
    })]);
    const installments = breakdown.sections[0].emiInstallments!;
    const text = decoded(buildPaymentLinkWhatsAppUrl(student, breakdown, "https://javani.example/pay/x", {
      totalInPaise: breakdown.grandTotalInPaise,
      installments,
    }));

    expect(text).toContain("*1st installment of ₹4,000*");
    expect(text).toContain("payable in *3 installments*");
    expect(text).toContain("Payment schedule:");
    expect(text).not.toContain("fee payment of *₹10,000*");
  });

  it("falls back to a generic wa.me link when the parent has no phone number", () => {
    const url = buildPaymentLinkWhatsAppUrl({ name: "Samvidha" }, twoClasses(), "https://javani.example/pay/x");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decoded(url)).toContain("Dear Parent,");
  });
});
