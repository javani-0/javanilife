import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// Manual-UPI payment configuration. Stored at siteSettings/payment (public read,
// admin write — see firestore.rules). The student pays to this UPI id / QR and
// uploads a screenshot that the admin approves.
export interface PaymentSettings {
  upiId: string;         // VPA, e.g. "javani@okhdfcbank"
  upiName: string;       // payee name shown in the UPI app
  upiNumber: string;     // UPI-linked payment number (copyable in the pay dialog)
  qrImageUrl: string;    // admin-uploaded static QR image (preferred if set)
  instructions: string;  // optional note shown to students on the pay screen
  manualPaymentsEnabled: boolean; // master switch for the manual-UPI flow
}

export const PAYMENT_SETTINGS_DOC = { collection: "siteSettings", id: "payment" } as const;

export const defaultPaymentSettings: PaymentSettings = {
  upiId: "",
  upiName: "Javani Spiritual Hub",
  upiNumber: "",
  qrImageUrl: "",
  instructions: "",
  manualPaymentsEnabled: true,
};

const getString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

export const normalizePaymentSettings = (data: DocumentData = {}): PaymentSettings => ({
  upiId: getString(data.upiId).trim(),
  upiName: getString(data.upiName, defaultPaymentSettings.upiName).trim() || defaultPaymentSettings.upiName,
  upiNumber: getString(data.upiNumber).trim(),
  qrImageUrl: getString(data.qrImageUrl).trim(),
  instructions: getString(data.instructions).trim(),
  manualPaymentsEnabled: data.manualPaymentsEnabled !== false,
});

export const getPaymentSettings = async (): Promise<PaymentSettings> => {
  const snapshot = await getDoc(doc(db, PAYMENT_SETTINGS_DOC.collection, PAYMENT_SETTINGS_DOC.id));
  return snapshot.exists() ? normalizePaymentSettings(snapshot.data()) : { ...defaultPaymentSettings };
};

export const subscribeToPaymentSettings = (
  onChange: (settings: PaymentSettings) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  doc(db, PAYMENT_SETTINGS_DOC.collection, PAYMENT_SETTINGS_DOC.id),
  (snapshot) => onChange(snapshot.exists() ? normalizePaymentSettings(snapshot.data()) : { ...defaultPaymentSettings }),
  (error) => onError?.(error),
);

export const savePaymentSettings = async (settings: Partial<PaymentSettings>): Promise<void> => {
  await setDoc(
    doc(db, PAYMENT_SETTINGS_DOC.collection, PAYMENT_SETTINGS_DOC.id),
    {
      ...(settings.upiId !== undefined ? { upiId: settings.upiId.trim() } : {}),
      ...(settings.upiName !== undefined ? { upiName: settings.upiName.trim() } : {}),
      ...(settings.upiNumber !== undefined ? { upiNumber: settings.upiNumber.trim() } : {}),
      ...(settings.qrImageUrl !== undefined ? { qrImageUrl: settings.qrImageUrl.trim() } : {}),
      ...(settings.instructions !== undefined ? { instructions: settings.instructions.trim() } : {}),
      ...(settings.manualPaymentsEnabled !== undefined ? { manualPaymentsEnabled: settings.manualPaymentsEnabled } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

/** True when at least one way to pay manually (UPI id or QR image) is configured. */
export const hasUsableUpi = (settings: Pick<PaymentSettings, "upiId" | "qrImageUrl">): boolean =>
  Boolean(settings.upiId.trim() || settings.qrImageUrl.trim());

/**
 * Build a UPI deep-link / intent URL (`upi://pay?...`). Used for the mobile
 * "Pay in your UPI app" button and as the value encoded into the fallback QR
 * when no QR image has been uploaded. Amount is optional (paise → rupees).
 */
export const buildUpiIntentUrl = ({
  upiId,
  name,
  amountInPaise,
  note,
}: {
  upiId: string;
  name?: string;
  amountInPaise?: number;
  note?: string;
}): string => {
  const params = new URLSearchParams();
  params.set("pa", upiId.trim());
  if (name && name.trim()) params.set("pn", name.trim());
  if (amountInPaise && amountInPaise > 0) params.set("am", (Math.round(amountInPaise) / 100).toFixed(2));
  params.set("cu", "INR");
  if (note && note.trim()) params.set("tn", note.trim().slice(0, 80));
  return `upi://pay?${params.toString()}`;
};
