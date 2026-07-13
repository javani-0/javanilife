import { collection, doc, deleteDoc, onSnapshot, type DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { FinancePartner } from "./types";

const pct = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
};

/** Read a `partners` doc into the finance-facing shape (per-category shares). */
export const normalizeFinancePartner = (id: string, data: DocumentData = {}): FinancePartner => ({
  id,
  name: typeof data.name === "string" ? data.name : "",
  email: typeof data.email === "string" ? data.email : "",
  partnerUid: typeof data.partnerUid === "string" ? data.partnerUid : "",
  classesPercent: pct(data.shareClassesPercent),
  coursesPercent: pct(data.shareCoursesPercent),
  productsPercent: pct(data.shareProductsPercent),
});

/** A partner "has financial access" once they've been granted a login (uid/email). */
export const hasFinancialAccess = (partner: FinancePartner): boolean =>
  Boolean(partner.partnerUid || partner.email);

/** Does this partner draw a share from at least one category? */
export const hasAnyShare = (partner: FinancePartner): boolean =>
  partner.classesPercent > 0 || partner.coursesPercent > 0 || partner.productsPercent > 0;

/** Subscribe to all partners that have financial-dashboard access. */
export const subscribeToFinancePartners = (
  onChange: (partners: FinancePartner[]) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  collection(db, "partners"),
  (snapshot) => {
    const list = snapshot.docs
      .map((docSnap) => normalizeFinancePartner(docSnap.id, docSnap.data()))
      .filter(hasFinancialAccess);
    onChange(list);
  },
  (error) => onError?.(error),
);

// ── Partner login (admin-created) ──────────────────────────────────────────

export interface PartnerCredential {
  partnerId: string;
  email: string;
  password: string;
  whatsapp?: string;
  partnerUid?: string;
}

export interface CreatePartnerLoginResult { ok: boolean; uid: string; created: boolean }

/**
 * Admin action: create (or reset) a partner's sign-in via the server (Admin SDK)
 * and stash the credentials in `partnerCredentials/{partnerId}` for re-sharing.
 */
export const createPartnerLogin = async (
  idToken: string,
  payload: { email: string; password: string; partnerId?: string; name?: string; whatsapp?: string },
): Promise<CreatePartnerLoginResult> => {
  const response = await fetch("/api/razorpay/create-partner-login", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.error === "string" && data.error.trim() ? data.error : "Could not create the partner login.");
  }
  return data as CreatePartnerLoginResult;
};

/** Admin: live map of stored partner credentials, keyed by partner doc id. */
export const subscribeToPartnerCredentials = (
  onChange: (credentials: Record<string, PartnerCredential>) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  collection(db, "partnerCredentials"),
  (snapshot) => {
    const map: Record<string, PartnerCredential> = {};
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() || {};
      map[docSnap.id] = {
        partnerId: docSnap.id,
        email: typeof data.email === "string" ? data.email : "",
        password: typeof data.password === "string" ? data.password : "",
        whatsapp: typeof data.whatsapp === "string" ? data.whatsapp : "",
        partnerUid: typeof data.partnerUid === "string" ? data.partnerUid : "",
      };
    }
    onChange(map);
  },
  (error) => onError?.(error),
);

/** Admin: remove stored credentials (e.g. when a partner is deleted). */
export const deletePartnerCredentials = async (partnerId: string): Promise<void> => {
  await deleteDoc(doc(db, "partnerCredentials", partnerId));
};

/** Build a wa.me link that shares the partner's login details on WhatsApp. */
export const buildPartnerLoginWhatsAppUrl = (credential: PartnerCredential, loginUrl: string): string => {
  const lines = [
    "Hello! Here are your Javani partner dashboard login details:",
    "",
    `Login: ${loginUrl}`,
    `Email: ${credential.email}`,
    `Password: ${credential.password}`,
    "",
    "You can sign in anytime to view your profit share. Please keep these details private.",
  ];
  const text = encodeURIComponent(lines.join("\n"));
  const number = (credential.whatsapp || "").replace(/\D/g, "");
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
};
