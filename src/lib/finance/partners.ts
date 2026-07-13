import { collection, onSnapshot, type DocumentData } from "firebase/firestore";
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
