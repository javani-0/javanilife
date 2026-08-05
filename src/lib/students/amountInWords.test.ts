import { describe, expect, it } from "vitest";
import { numberToIndianWords, rupeesInWords } from "./amountInWords";

describe("numberToIndianWords", () => {
  it("handles zero and the teens", () => {
    expect(numberToIndianWords(0)).toBe("Zero");
    expect(numberToIndianWords(7)).toBe("Seven");
    expect(numberToIndianWords(13)).toBe("Thirteen");
    expect(numberToIndianWords(19)).toBe("Nineteen");
  });

  it("handles tens and hundreds", () => {
    expect(numberToIndianWords(20)).toBe("Twenty");
    expect(numberToIndianWords(45)).toBe("Forty Five");
    expect(numberToIndianWords(100)).toBe("One Hundred");
    expect(numberToIndianWords(101)).toBe("One Hundred One");
    expect(numberToIndianWords(999)).toBe("Nine Hundred Ninety Nine");
  });

  // Indian grouping is the point: thousand, then LAKH, then CRORE.
  it("groups by thousand, lakh and crore", () => {
    expect(numberToIndianWords(1_000)).toBe("One Thousand");
    expect(numberToIndianWords(2_666)).toBe("Two Thousand Six Hundred Sixty Six");
    expect(numberToIndianWords(100_000)).toBe("One Lakh");
    expect(numberToIndianWords(1_234_567)).toBe("Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven");
    expect(numberToIndianWords(10_000_000)).toBe("One Crore");
    expect(numberToIndianWords(12_34_56_789)).toBe(
      "Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine",
    );
  });

  it("skips empty groups instead of saying 'Zero Thousand'", () => {
    expect(numberToIndianWords(1_000_000)).toBe("Ten Lakh");
    expect(numberToIndianWords(100_007)).toBe("One Lakh Seven");
  });
});

describe("rupeesInWords", () => {
  it("renders a whole-rupee amount", () => {
    expect(rupeesInWords(266_600)).toBe("Two Thousand Six Hundred Sixty Six Rupees Only");
  });

  it("includes paise when there are any", () => {
    expect(rupeesInWords(266_650)).toBe("Two Thousand Six Hundred Sixty Six Rupees and Fifty Paise Only");
  });

  it("uses the singular for exactly one rupee", () => {
    expect(rupeesInWords(100)).toBe("One Rupee Only");
  });

  it("handles zero", () => {
    expect(rupeesInWords(0)).toBe("Zero Rupees Only");
  });

  it("is safe on rubbish input", () => {
    expect(rupeesInWords(NaN)).toBe("Zero Rupees Only");
    expect(rupeesInWords(-500)).toBe("Zero Rupees Only");
  });

  // A GST-inclusive total is the usual case and rounds to whole paise.
  it("matches a realistic GST-inclusive total", () => {
    // Rs.2,666 + 18% = Rs.3,145.88
    expect(rupeesInWords(314_588)).toBe(
      "Three Thousand One Hundred Forty Five Rupees and Eighty Eight Paise Only",
    );
  });
});
