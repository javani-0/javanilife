import { describe, expect, it } from "vitest";
import { normalizeOnboardingLink } from "./onboarding";

// ---------------------------------------------------------------------------
// The public /pay/:token snapshot. `dueNowInPaise` arrived with the EMI
// first-installment change, so link docs written earlier (or by an admin tab
// still running the old bundle) don't have it. Those parents were shown the
// FULL course fee as payable today — normalizeOnboardingLink has to recover
// the real "due now" from the installment rows the doc does carry.
// ---------------------------------------------------------------------------

const emiDoc = {
  studentDocId: "s1",
  studentName: "govardhan",
  className: "NATTUVANGAM ON KUCHIPUDI DIPLOMA 1st SEM",
  rows: [{ label: "Course fee (full term)", amountInPaise: 3400000 }],
  totalInPaise: 3400000, // ₹34,000
  methods: { razorpay: false, qr: true, counter: true, emi: true },
  emiInstallments: [
    { label: "Pay now (50%)", amountInPaise: 1700000 },
    { label: "2nd installment (25%)", amountInPaise: 850000 },
    { label: "3rd installment (25%)", amountInPaise: 850000 },
  ],
  status: "awaiting-payment",
};

describe("normalizeOnboardingLink · dueNowInPaise", () => {
  it("uses the stored value when the link doc has one", () => {
    const link = normalizeOnboardingLink("tok", { ...emiDoc, dueNowInPaise: 1700000 });
    expect(link.dueNowInPaise).toBe(1700000);
    expect(link.totalInPaise).toBe(3400000);
  });

  it("recovers the 1st installment from a link doc written before the field existed", () => {
    const link = normalizeOnboardingLink("tok", emiDoc);
    expect(link.dueNowInPaise).toBe(1700000);
    expect(link.totalInPaise).toBe(3400000);
  });

  it("falls back to the full total when EMI is not enabled", () => {
    const link = normalizeOnboardingLink("tok", { ...emiDoc, methods: { ...emiDoc.methods, emi: false } });
    expect(link.dueNowInPaise).toBe(3400000);
  });

  it("falls back to the full total when there is only one installment row", () => {
    const link = normalizeOnboardingLink("tok", { ...emiDoc, emiInstallments: [{ label: "Pay now (100%)", amountInPaise: 3400000 }] });
    expect(link.dueNowInPaise).toBe(3400000);
  });

  it("respects an explicit zero (a fully discounted link) rather than re-deriving", () => {
    const link = normalizeOnboardingLink("tok", { ...emiDoc, dueNowInPaise: 0 });
    expect(link.dueNowInPaise).toBe(0);
  });

  it("keeps a plain non-EMI link unchanged", () => {
    const link = normalizeOnboardingLink("tok", {
      totalInPaise: 250000,
      rows: [{ label: "Kit fee", amountInPaise: 50000 }, { label: "Pre-payment (first fee)", amountInPaise: 200000 }],
      methods: { razorpay: false, qr: true, counter: true, emi: false },
      status: "awaiting-payment",
    });
    expect(link.dueNowInPaise).toBe(250000);
    expect(link.emiInstallments).toBeUndefined();
    expect(link.rows).toHaveLength(2);
  });
});
