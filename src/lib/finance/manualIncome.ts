import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { IncomeDoc } from "./types";

// Manually-entered extra income (donations, workshops, hall rentals, …) that
// does not flow through a product order or a class fee. Admin-only write.
export const MANUAL_INCOME_COLLECTION = "manualIncome";

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizeIncome = (id: string, data: DocumentData = {}): IncomeDoc => ({
  id,
  title: typeof data.title === "string" ? data.title : "",
  category: typeof data.category === "string" ? data.category : "",
  amountInPaise: Math.max(0, Math.round(toNumber(data.amountInPaise))),
  note: typeof data.note === "string" ? data.note : "",
  receivedOn: typeof data.receivedOn === "string" ? data.receivedOn : "",
  createdBy: typeof data.createdBy === "string" ? data.createdBy : "",
  createdAt: data.createdAt,
  updatedAt: data.updatedAt,
});

export const subscribeToManualIncome = (
  onChange: (entries: IncomeDoc[]) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  query(collection(db, MANUAL_INCOME_COLLECTION), orderBy("receivedOn", "desc")),
  (snapshot) => onChange(snapshot.docs.map((entry) => normalizeIncome(entry.id, entry.data()))),
  (error) => onError?.(error),
);

export interface AddIncomeInput {
  title: string;
  category?: string;
  amountInPaise: number;
  note?: string;
  receivedOn?: string; // "YYYY-MM-DD"
  createdBy?: string;
}

export const addManualIncome = async (input: AddIncomeInput): Promise<string> => {
  const created = await addDoc(collection(db, MANUAL_INCOME_COLLECTION), {
    title: input.title.trim(),
    category: (input.category || "Other").trim(),
    amountInPaise: Math.max(0, Math.round(input.amountInPaise)),
    note: (input.note || "").trim(),
    receivedOn: input.receivedOn || new Date().toISOString().slice(0, 10),
    createdBy: input.createdBy || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return created.id;
};

export const deleteManualIncome = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, MANUAL_INCOME_COLLECTION, id));
};
