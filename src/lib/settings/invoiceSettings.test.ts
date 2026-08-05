import { describe, expect, it } from "vitest";
import { normalizeInvoiceSettings, splitTaxForDisplay } from "./invoiceSettings";

describe("splitTaxForDisplay", () => {
  it("splits an intra-state supply into equal CGST and SGST halves", () => {
    const lines = splitTaxForDisplay(36_000, 18, "cgst-sgst");
    expect(lines).toEqual([
      { label: "CGST @ 9%", amountInPaise: 18_000 },
      { label: "SGST @ 9%", amountInPaise: 18_000 },
    ]);
  });

  // The halves must add back to the stored tax exactly, or the invoice total
  // will not reconcile with the fee record.
  it("never loses a paisa on an odd amount", () => {
    const lines = splitTaxForDisplay(36_001, 18, "cgst-sgst");
    expect(lines[0].amountInPaise + lines[1].amountInPaise).toBe(36_001);
    expect(lines[0].amountInPaise).toBe(18_000);
    expect(lines[1].amountInPaise).toBe(18_001);
  });

  it("shows a single IGST line for an inter-state supply", () => {
    expect(splitTaxForDisplay(36_000, 18, "igst")).toEqual([
      { label: "IGST @ 18%", amountInPaise: 36_000 },
    ]);
  });

  it("halves a fractional rate correctly", () => {
    expect(splitTaxForDisplay(1_000, 5, "cgst-sgst").map((l) => l.label))
      .toEqual(["CGST @ 2.5%", "SGST @ 2.5%"]);
  });

  it("shows nothing when there is no tax", () => {
    expect(splitTaxForDisplay(0, 18, "cgst-sgst")).toEqual([]);
    expect(splitTaxForDisplay(36_000, 18, "none")).toEqual([]);
  });

  it("is safe on rubbish input", () => {
    expect(splitTaxForDisplay(-500, 18, "cgst-sgst")).toEqual([]);
    expect(splitTaxForDisplay(NaN, 18, "cgst-sgst")).toEqual([]);
  });
});

describe("normalizeInvoiceSettings", () => {
  it("falls back to sensible defaults", () => {
    const s = normalizeInvoiceSettings({});
    expect(s.legalName).toBe("Javani Spiritual Hub");
    expect(s.sacCode).toBe("999293");
    expect(s.taxMode).toBe("cgst-sgst");
    expect(s.termsLines.length).toBeGreaterThan(0);
  });

  it("upper-cases the GSTIN", () => {
    expect(normalizeInvoiceSettings({ gstin: "36abcde1234f1z5" }).gstin).toBe("36ABCDE1234F1Z5");
  });

  it("does not trust an unknown tax mode", () => {
    expect(normalizeInvoiceSettings({ taxMode: "vat" }).taxMode).toBe("cgst-sgst");
    expect(normalizeInvoiceSettings({ taxMode: "igst" }).taxMode).toBe("igst");
  });

  it("keeps only string address lines and drops blanks", () => {
    expect(normalizeInvoiceSettings({ addressLines: ["Road 4", "", 42, "Hyderabad"] }).addressLines)
      .toEqual(["Road 4", "Hyderabad"]);
  });
});
