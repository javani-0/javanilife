import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { PartnerSettings } from "./types";

// Single config doc holding the partner's identity + profit-share percentage.
export const FINANCE_SETTINGS_DOC = "finance/settings";

const settingsRef = () => doc(db, "finance", "settings");

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizePartnerSettings = (data: DocumentData = {}): PartnerSettings => ({
  partnerName: typeof data.partnerName === "string" ? data.partnerName : "",
  partnerEmail: typeof data.partnerEmail === "string" ? data.partnerEmail : "",
  partnerUid: typeof data.partnerUid === "string" ? data.partnerUid : "",
  profitSharePercent: Math.max(0, Math.min(100, toNumber(data.profitSharePercent))),
  updatedAt: data.updatedAt,
});

export const subscribeToPartnerSettings = (
  onChange: (settings: PartnerSettings) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  settingsRef(),
  (snapshot) => onChange(normalizePartnerSettings(snapshot.exists() ? snapshot.data() : {})),
  (error) => onError?.(error),
);

export const savePartnerSettings = async (patch: Partial<PartnerSettings>): Promise<void> => {
  const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.partnerName !== undefined) data.partnerName = patch.partnerName.trim();
  if (patch.partnerEmail !== undefined) data.partnerEmail = patch.partnerEmail.trim().toLowerCase();
  if (patch.partnerUid !== undefined) data.partnerUid = patch.partnerUid;
  if (patch.profitSharePercent !== undefined) data.profitSharePercent = Math.max(0, Math.min(100, toNumber(patch.profitSharePercent)));
  await setDoc(settingsRef(), data, { merge: true });
};

/**
 * Admin action: grant the "partner" role to the user with this email (they must
 * have signed up first). Returns the matched uid, or null if no user is found.
 */
export const grantPartnerRoleByEmail = async (email: string): Promise<string | null> => {
  const trimmed = email.trim();
  if (!trimmed) return null;
  // Signup stores the email as typed (not lowercased), so try the exact value
  // first and fall back to the lowercased variant for case mismatches.
  const candidates = Array.from(new Set([trimmed, trimmed.toLowerCase()]));
  for (const candidate of candidates) {
    const snapshot = await getDocs(query(collection(db, "users"), where("email", "==", candidate)));
    if (!snapshot.empty) {
      const userDoc = snapshot.docs[0];
      await updateDoc(doc(db, "users", userDoc.id), { role: "partner", updatedAt: serverTimestamp() });
      return userDoc.id;
    }
  }
  return null;
};

/** Admin action: revoke partner access (back to a normal user). */
export const revokePartnerRole = async (uid: string): Promise<void> => {
  if (!uid) return;
  await updateDoc(doc(db, "users", uid), { role: "user", updatedAt: serverTimestamp() });
};
