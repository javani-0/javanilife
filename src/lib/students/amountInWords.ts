// ---------------------------------------------------------------------------
// Rupees in words, Indian numbering (thousand / lakh / crore).
//
// Every printed Indian invoice carries the amount in words — it is the line a
// reader checks the figures against. PURE + unit-tested.
// ---------------------------------------------------------------------------

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** 0–99 → words. */
const twoDigits = (n: number): string => {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const rest = n % 10;
  return rest ? `${tens} ${ONES[rest]}` : tens;
};

/** 0–999 → words. */
const threeDigits = (n: number): string => {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(" ");
};

/**
 * A whole number in the Indian system: crore, lakh, thousand, then 0–999.
 * Returns "Zero" for 0.
 */
export const numberToIndianWords = (value: number): string => {
  const n = Math.floor(Math.abs(Number(value) || 0));
  if (n === 0) return "Zero";

  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1_000);
  const rest = n % 1_000;

  const parts: string[] = [];
  // Crores above 99 are read as a plain number of crores ("One Hundred Crore").
  if (crore) parts.push(`${crore > 999 ? numberToIndianWords(crore) : threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(" ");
};

/**
 * A paise amount as an invoice-ready sentence:
 *   1234567_89 → "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven
 *                 Rupees and Eighty Nine Paise Only"
 */
export const rupeesInWords = (amountInPaise: number): string => {
  const paise = Math.max(0, Math.round(Number(amountInPaise) || 0));
  const rupees = Math.floor(paise / 100);
  const remainder = paise % 100;

  const rupeeWords = `${numberToIndianWords(rupees)} Rupee${rupees === 1 ? "" : "s"}`;
  if (!remainder) return `${rupeeWords} Only`;
  return `${rupeeWords} and ${twoDigits(remainder)} Paise Only`;
};
