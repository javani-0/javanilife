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
import type { ExpenseDoc } from "./types";

export const EXPENSES_COLLECTION = "expenses";

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizeExpense = (id: string, data: DocumentData = {}): ExpenseDoc => ({
  id,
  title: typeof data.title === "string" ? data.title : "",
  category: typeof data.category === "string" ? data.category : "",
  amountInPaise: Math.max(0, Math.round(toNumber(data.amountInPaise))),
  note: typeof data.note === "string" ? data.note : "",
  spentOn: typeof data.spentOn === "string" ? data.spentOn : "",
  createdBy: typeof data.createdBy === "string" ? data.createdBy : "",
  createdAt: data.createdAt,
  updatedAt: data.updatedAt,
});

export const subscribeToExpenses = (
  onChange: (expenses: ExpenseDoc[]) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  query(collection(db, EXPENSES_COLLECTION), orderBy("spentOn", "desc")),
  (snapshot) => onChange(snapshot.docs.map((expenseDoc) => normalizeExpense(expenseDoc.id, expenseDoc.data()))),
  (error) => onError?.(error),
);

export interface AddExpenseInput {
  title: string;
  category?: string;
  amountInPaise: number;
  note?: string;
  spentOn?: string; // "YYYY-MM-DD"
  createdBy?: string;
}

export const addExpense = async (input: AddExpenseInput): Promise<string> => {
  const created = await addDoc(collection(db, EXPENSES_COLLECTION), {
    title: input.title.trim(),
    category: (input.category || "Other").trim(),
    amountInPaise: Math.max(0, Math.round(input.amountInPaise)),
    note: (input.note || "").trim(),
    spentOn: input.spentOn || new Date().toISOString().slice(0, 10),
    createdBy: input.createdBy || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return created.id;
};

export const deleteExpense = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, EXPENSES_COLLECTION, id));
};
