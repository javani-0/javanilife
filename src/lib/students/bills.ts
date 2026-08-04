import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { FeePaymentDoc } from "@/lib/classes";
import type { StudentDoc } from "./types";

// ---------------------------------------------------------------------------
// Bills / receipts (req: printable, downloadable, shareable URL).
//
// A bill is a SNAPSHOT, not a live view: it freezes the amounts as they were
// when issued, so a later fee edit can never silently rewrite a document the
// parent already has. It lives at bills/{token} with an unguessable token —
// the same capability-URL model as onboardingLinks/{token} — which keeps
// `feePayments` staff/owner-only while still giving the parent a public link.
// ---------------------------------------------------------------------------

export const BILLS_COLLECTION = "bills";

export interface BillLine {
  label: string;
  amountInPaise: number; // negative = discount
}

export interface BillDoc {
  token: string;
  billNumber: string;
  feeId: string;
  enrollmentId: string;
  studentDocId: string;
  // Frozen display copy.
  studentName: string;
  studentRollNo: string;
  parentName: string;
  parentPhone: string;
  address: string;
  className: string;
  slotLabel: string;
  periodLabel: string;
  lines: BillLine[];
  taxableInPaise: number;
  gstInPaise: number;
  gstPercent: number;
  totalInPaise: number;
  status: string;          // "paid" | "pending" | ...
  paymentMethod: string;
  paidOn: string;          // "YYYY-MM-DD", "" when unpaid
  issuedOn: string;        // "YYYY-MM-DD"
  issuedBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

const getString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** An unguessable bill token — the capability that opens /bill/:token. */
export const generateBillToken = (): string => {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const normalizeBill = (data: DocumentData = {}): BillDoc => ({
  token: getString(data.token),
  billNumber: getString(data.billNumber),
  feeId: getString(data.feeId),
  enrollmentId: getString(data.enrollmentId),
  studentDocId: getString(data.studentDocId),
  studentName: getString(data.studentName),
  studentRollNo: getString(data.studentRollNo),
  parentName: getString(data.parentName),
  parentPhone: getString(data.parentPhone),
  address: getString(data.address),
  className: getString(data.className),
  slotLabel: getString(data.slotLabel),
  periodLabel: getString(data.periodLabel),
  lines: Array.isArray(data.lines)
    ? (data.lines as DocumentData[])
        .map((line) => ({ label: getString(line?.label), amountInPaise: Math.round(toNumber(line?.amountInPaise)) }))
        .filter((line) => line.label)
    : [],
  taxableInPaise: Math.max(0, Math.round(toNumber(data.taxableInPaise))),
  gstInPaise: Math.max(0, Math.round(toNumber(data.gstInPaise))),
  gstPercent: Math.max(0, toNumber(data.gstPercent)),
  totalInPaise: Math.max(0, Math.round(toNumber(data.totalInPaise))),
  status: getString(data.status, "pending"),
  paymentMethod: getString(data.paymentMethod),
  paidOn: getString(data.paidOn),
  issuedOn: getString(data.issuedOn),
  issuedBy: getString(data.issuedBy),
  createdAt: data.createdAt,
  updatedAt: data.updatedAt,
});

/** Firestore Timestamp → "YYYY-MM-DD" (empty when absent). */
const toDateString = (value: unknown): string => {
  const stamp = value as { toDate?: () => Date } | undefined;
  const date = typeof stamp?.toDate === "function" ? stamp.toDate() : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * Split a fee's breakdown into taxable lines + the GST line. The GST row is
 * written by the fee builders as "GST @ 18%", so it is identified by prefix
 * rather than by a separate stored field (older fee docs have no GST at all).
 */
export const splitGstLines = (lines: BillLine[]): { taxableInPaise: number; gstInPaise: number; gstPercent: number } => {
  let gstInPaise = 0;
  let gstPercent = 0;
  let taxableInPaise = 0;
  for (const line of lines) {
    const match = /^GST\s*@\s*([\d.]+)%/i.exec(line.label);
    if (match) {
      gstInPaise += line.amountInPaise;
      gstPercent = Number(match[1]) || gstPercent;
    } else {
      taxableInPaise += line.amountInPaise;
    }
  }
  return { taxableInPaise, gstInPaise, gstPercent };
};

/**
 * "JAV/202607/STU001/K3QP" — stable and human-readable on a printed bill.
 *
 * The suffix comes from the ENROLMENT part of the fee id, not the raw tail:
 * fee ids are `${enrollmentId}_${monthKey}`, so the last characters are always
 * the month digits and would make every bill in a month share a suffix.
 */
export const buildBillNumber = (fee: FeePaymentDoc, rollNo: string, issuedOn: string): string => {
  const period = (fee.monthKey || issuedOn.slice(0, 7)).replace("-", "");
  const id = fee.id || "";
  const enrollmentPart = id.includes("_") ? id.slice(0, id.lastIndexOf("_")) : id;
  const suffix = (enrollmentPart || id).slice(-4).toUpperCase();
  return `JAV/${period}/${rollNo || "GUEST"}/${suffix}`;
};

export interface IssueBillInput {
  fee: FeePaymentDoc;
  student: StudentDoc;
  adminUid: string;
}

/**
 * Issue (or re-open) the bill for a fee. Idempotent per fee: an existing bill
 * keeps its token and number so a link already shared with a parent never dies,
 * but the amounts are refreshed to the fee's current state.
 */
export const issueBillForFee = async ({ fee, student, adminUid }: IssueBillInput): Promise<BillDoc> => {
  const existing = await findBillForFee(fee.id);
  const issuedOn = existing?.issuedOn || new Date().toISOString().slice(0, 10);
  const token = existing?.token || generateBillToken();
  const rollNo = student.studentId || student.desiredStudentId || "";

  // Prefer the fee's itemised breakdown; fall back to a single line so a bill
  // can still be issued for an old doc that predates itemisation.
  const lines: BillLine[] = (fee.breakdown && fee.breakdown.length > 0)
    ? fee.breakdown.map((row) => ({ label: row.label, amountInPaise: row.amountInPaise }))
    : [{ label: fee.periodLabel || "Class fee", amountInPaise: fee.amountInPaise }];
  const { taxableInPaise, gstInPaise, gstPercent } = splitGstLines(lines);

  const payload = {
    token,
    billNumber: existing?.billNumber || buildBillNumber(fee, rollNo, issuedOn),
    feeId: fee.id,
    enrollmentId: fee.enrollmentId,
    studentDocId: student.id,
    studentName: student.name,
    studentRollNo: rollNo,
    parentName: student.parentName,
    parentPhone: student.phone,
    address: student.address,
    className: fee.className,
    slotLabel: fee.slotLabel || "",
    periodLabel: fee.periodLabel,
    lines,
    taxableInPaise,
    gstInPaise,
    gstPercent,
    totalInPaise: fee.amountInPaise,
    status: fee.status,
    paymentMethod: fee.paymentMethod || "",
    paidOn: toDateString(fee.paidAt),
    issuedOn,
    issuedBy: adminUid,
    updatedAt: serverTimestamp(),
    ...(existing ? {} : { createdAt: serverTimestamp() }),
  };

  await setDoc(doc(db, BILLS_COLLECTION, token), payload, { merge: true });
  return normalizeBill(payload);
};

/** The bill already issued for this fee, if any. */
export const findBillForFee = async (feeId: string): Promise<BillDoc | null> => {
  if (!feeId) return null;
  const snapshot = await getDocs(query(collection(db, BILLS_COLLECTION), where("feeId", "==", feeId)));
  const first = snapshot.docs[0];
  return first ? normalizeBill(first.data()) : null;
};

/** Public: read one bill by its token (no login). */
export const getBill = async (token: string): Promise<BillDoc | null> => {
  if (!token) return null;
  const snapshot = await getDoc(doc(db, BILLS_COLLECTION, token));
  return snapshot.exists() ? normalizeBill(snapshot.data()) : null;
};

/** Public: live bill (so a re-issue reflects instantly on an open page). */
export const subscribeToBill = (
  token: string,
  onChange: (bill: BillDoc | null) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  doc(db, BILLS_COLLECTION, token),
  (snapshot) => onChange(snapshot.exists() ? normalizeBill(snapshot.data()) : null),
  (error) => onError?.(error),
);

/** The shareable bill URL. */
export const buildBillUrl = (token: string, origin: string = window.location.origin): string =>
  `${origin}/bill/${token}`;

/** A WhatsApp share for the bill. */
export const buildBillWhatsAppUrl = (bill: BillDoc, url: string): string => {
  const lines = [
    `*Javani Spiritual Hub — Bill*`,
    `Student: *${bill.studentName}*${bill.studentRollNo ? ` (${bill.studentRollNo})` : ""}`,
    `${bill.className} · ${bill.periodLabel}`,
    `Amount: *₹${(bill.totalInPaise / 100).toLocaleString("en-IN")}*`,
    bill.status === "paid" ? "Status: PAID — thank you!" : "Status: Payment pending",
    "",
    `View / download your bill: ${url}`,
  ];
  const phone = (bill.parentPhone || "").replace(/\D/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`;
};
