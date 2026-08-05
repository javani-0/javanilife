import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, type DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase";

// ---------------------------------------------------------------------------
// Invoice / bill identity (siteSettings/invoice). Public read, staff write via
// the existing siteSettings rule — no new collection, no rules deploy.
//
// These are the fields a printed Indian invoice is expected to carry: who is
// billing, their GSTIN, the SAC code for the service, and the tax treatment.
// ---------------------------------------------------------------------------

export const INVOICE_SETTINGS_DOC = "invoice";

/**
 * Intra-state supply is split CGST + SGST; inter-state is a single IGST line.
 * Most academies bill locally, so CGST/SGST is the default.
 */
export type TaxMode = "cgst-sgst" | "igst" | "none";

export interface InvoiceSettings {
  legalName: string;
  addressLines: string[];
  gstin: string;
  phone: string;
  email: string;
  website: string;
  /** State the supply is made from — printed as "Place of supply". */
  placeOfSupply: string;
  /** 999293 = commercial training & coaching services. */
  sacCode: string;
  taxMode: TaxMode;
  /** Printed under the totals. One line each. */
  termsLines: string[];
  signatoryName: string;
  signatoryTitle: string;
  /** Optional logo override; falls back to the bundled brand mark. */
  logoUrl: string;
}

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  legalName: "Javani Spiritual Hub",
  addressLines: [],
  gstin: "",
  phone: "",
  email: "",
  website: "",
  placeOfSupply: "",
  sacCode: "999293",
  taxMode: "cgst-sgst",
  termsLines: [
    "Fees once paid are non-refundable and non-transferable.",
    "Please quote the bill number for any payment query.",
  ],
  signatoryName: "",
  signatoryTitle: "Authorised Signatory",
  logoUrl: "",
};

const getString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const getLines = (value: unknown, fallback: string[]): string[] =>
  Array.isArray(value) ? (value as unknown[]).map((line) => getString(line)).filter(Boolean) : fallback;

export const normalizeInvoiceSettings = (data: DocumentData = {}): InvoiceSettings => ({
  legalName: getString(data.legalName) || DEFAULT_INVOICE_SETTINGS.legalName,
  addressLines: getLines(data.addressLines, DEFAULT_INVOICE_SETTINGS.addressLines),
  gstin: getString(data.gstin).toUpperCase(),
  phone: getString(data.phone),
  email: getString(data.email),
  website: getString(data.website),
  placeOfSupply: getString(data.placeOfSupply),
  sacCode: getString(data.sacCode) || DEFAULT_INVOICE_SETTINGS.sacCode,
  taxMode: data.taxMode === "igst" ? "igst" : data.taxMode === "none" ? "none" : "cgst-sgst",
  termsLines: getLines(data.termsLines, DEFAULT_INVOICE_SETTINGS.termsLines),
  signatoryName: getString(data.signatoryName),
  signatoryTitle: getString(data.signatoryTitle) || DEFAULT_INVOICE_SETTINGS.signatoryTitle,
  logoUrl: getString(data.logoUrl),
});

export const getInvoiceSettings = async (): Promise<InvoiceSettings> => {
  try {
    const snapshot = await getDoc(doc(db, "siteSettings", INVOICE_SETTINGS_DOC));
    return snapshot.exists() ? normalizeInvoiceSettings(snapshot.data()) : DEFAULT_INVOICE_SETTINGS;
  } catch {
    return DEFAULT_INVOICE_SETTINGS;
  }
};

export const subscribeToInvoiceSettings = (
  onChange: (settings: InvoiceSettings) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  doc(db, "siteSettings", INVOICE_SETTINGS_DOC),
  (snapshot) => onChange(snapshot.exists() ? normalizeInvoiceSettings(snapshot.data()) : DEFAULT_INVOICE_SETTINGS),
  (error) => { onChange(DEFAULT_INVOICE_SETTINGS); onError?.(error); },
);

export const saveInvoiceSettings = async (settings: InvoiceSettings): Promise<void> => {
  await setDoc(
    doc(db, "siteSettings", INVOICE_SETTINGS_DOC),
    { ...settings, gstin: settings.gstin.toUpperCase().trim(), updatedAt: serverTimestamp() },
    { merge: true },
  );
};

export interface TaxSplitLine {
  label: string;
  amountInPaise: number;
}

/**
 * How the tax is presented on the bill. A GST-registered intra-state supply
 * must show CGST and SGST separately at half the rate each; the halves are
 * derived so they always sum back to the stored tax to the last paisa.
 */
export const splitTaxForDisplay = (
  gstInPaise: number,
  gstPercent: number,
  mode: TaxMode,
): TaxSplitLine[] => {
  const total = Math.max(0, Math.round(gstInPaise || 0));
  if (total <= 0 || mode === "none") return [];
  if (mode === "igst") return [{ label: `IGST @ ${gstPercent}%`, amountInPaise: total }];

  const half = Math.floor(total / 2);
  return [
    { label: `CGST @ ${gstPercent / 2}%`, amountInPaise: half },
    // The second half absorbs an odd paisa so the two lines sum exactly.
    { label: `SGST @ ${gstPercent / 2}%`, amountInPaise: total - half },
  ];
};
