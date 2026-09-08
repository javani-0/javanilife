import { describe, expect, it } from "vitest";
import {
  buildSheetXml,
  buildXlsx,
  columnLetter,
  crc32,
  escapeXml,
  sanitizeSheetName,
  sheetsToCsv,
  toCsv,
  zipStore,
} from "./xlsx";

const encoder = new TextEncoder();

describe("crc32", () => {
  it("matches the standard check value", () => {
    // The CRC-32 of "123456789" is the canonical test vector.
    expect(crc32(encoder.encode("123456789"))).toBe(0xCBF43926);
  });

  it("is zero for empty input", () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("columnLetter", () => {
  it("counts like a spreadsheet", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(51)).toBe("AZ");
    expect(columnLetter(52)).toBe("BA");
  });
});

describe("escapeXml", () => {
  it("escapes markup characters", () => {
    expect(escapeXml(`Tom & "Jerry" <b>`)).toBe("Tom &amp; &quot;Jerry&quot; &lt;b&gt;");
  });

  it("drops control characters Excel would reject", () => {
    expect(escapeXml("a\u0001b\u001Fc")).toBe("abc");
  });

  it("keeps tabs, newlines and rupee signs", () => {
    expect(escapeXml("₹1\n2")).toBe("₹1\n2");
  });
});

describe("sanitizeSheetName", () => {
  it("strips characters Excel forbids and caps the length", () => {
    expect(sanitizeSheetName("Sales/2026:Q1")).toBe("Sales 2026 Q1");
    expect(sanitizeSheetName("x".repeat(40))).toHaveLength(31);
    expect(sanitizeSheetName("   ", "Fallback")).toBe("Fallback");
  });
});

describe("buildSheetXml", () => {
  const xml = buildSheetXml({
    name: "Sales",
    header: ["Item", "Amount"],
    rows: [["Kurta & top", 1250.5], ["", null]],
    moneyColumns: [1],
  });

  it("writes numbers as numbers and text as inline strings", () => {
    expect(xml).toContain('<c r="B2" s="2"><v>1250.5</v></c>');
    expect(xml).toContain("Kurta &amp; top");
  });

  it("bolds the header row and freezes it", () => {
    expect(xml).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Item</t></is></c>');
    expect(xml).toContain('state="frozen"');
  });

  it("numbers rows from 1 including the header", () => {
    expect(xml).toContain('<row r="3">');
    expect(xml).not.toContain('<row r="4">');
  });
});

describe("zipStore", () => {
  it("produces a ZIP container with local + central records", () => {
    const bytes = zipStore([{ name: "a.txt", bytes: encoder.encode("hello") }]);
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4B, 0x03, 0x04]);
    // Central directory + end-of-central-directory signatures are both present.
    const asString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
    expect(asString).toContain("PK\u0001\u0002");
    expect(asString).toContain("PK\u0005\u0006");
    expect(asString).toContain("hello");
  });
});

describe("buildXlsx", () => {
  const bytes = buildXlsx([
    { name: "Summary", header: ["A"], rows: [["x"]] },
    { name: "Sales", header: ["B"], rows: [["y"]] },
  ]);
  const text = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

  it("is a zip holding every required OOXML part", () => {
    for (const part of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]) {
      expect(text).toContain(part);
    }
  });

  it("names both tabs", () => {
    expect(text).toContain('<sheet name="Summary"');
    expect(text).toContain('<sheet name="Sales"');
  });

  it("de-duplicates tab names Excel would reject", () => {
    const duplicated = buildXlsx([
      { name: "Sales", rows: [] },
      { name: "Sales", rows: [] },
    ]);
    const asText = Array.from(duplicated, (byte) => String.fromCharCode(byte)).join("");
    expect(asText).toContain('<sheet name="Sales"');
    expect(asText).toContain('<sheet name="Sales 2"');
  });
});

describe("csv", () => {
  it("quotes only what needs quoting", () => {
    expect(toCsv([["plain", 'has "quotes"', "a,b"], [1, null, undefined]]))
      .toBe('plain,"has ""quotes""","a,b"\r\n1,,');
  });

  it("labels each sheet in a multi-sheet csv", () => {
    const csv = sheetsToCsv([
      { name: "Summary", header: ["A"], rows: [["x"]] },
      { name: "Sales", header: ["B"], rows: [["y"]] },
    ]);
    expect(csv.split("\r\n")).toEqual(["Summary", "A", "x", "", "Sales", "B", "y"]);
  });
});
