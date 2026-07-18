import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ---------------------------------------------------------------------------
// Admin activity log (req): every admin/manager action is appended to the
// immutable `adminLogs` collection (create-only rules) and shown on
// /admin/activity. Write via the useAdminLog hook — fire-and-forget, an
// unlogged action must never break the action itself.
// ---------------------------------------------------------------------------

export const ADMIN_LOGS_COLLECTION = "adminLogs";

export interface AdminLogEntry {
  id: string;
  uid: string;
  email: string;
  name: string;
  role: string;    // "admin" | "manager"
  action: string;  // short label, e.g. "Recorded fee"
  details?: string; // the specifics, e.g. "Anaya (STU002) · July 2026 · ₹2,000 · cash"
  at?: Timestamp;
}

const getString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);

export const normalizeAdminLog = (id: string, data: DocumentData = {}): AdminLogEntry => ({
  id,
  uid: getString(data.uid),
  email: getString(data.email),
  name: getString(data.name),
  role: getString(data.role, "admin"),
  action: getString(data.action),
  details: getString(data.details) || undefined,
  at: data.at,
});

export interface AdminLogActor {
  uid: string;
  email: string;
  name?: string;
  role: string;
}

/** Append one log entry. Never throws — logging must not break the action. */
export const writeAdminLog = async (actor: AdminLogActor, action: string, details?: string): Promise<void> => {
  try {
    await addDoc(collection(db, ADMIN_LOGS_COLLECTION), {
      uid: actor.uid,
      email: actor.email,
      name: actor.name || "",
      role: actor.role,
      action: action.slice(0, 120),
      details: (details || "").slice(0, 500),
      at: serverTimestamp(),
    });
  } catch (error) {
    console.error("Admin log write failed", { action, error });
  }
};

/** Admin: live feed of the newest log entries (default 300). */
export const subscribeToAdminLogs = (
  onChange: (entries: AdminLogEntry[]) => void,
  onError?: (error: unknown) => void,
  max = 300,
) => onSnapshot(
  query(collection(db, ADMIN_LOGS_COLLECTION), orderBy("at", "desc"), limit(max)),
  (snapshot) => onChange(snapshot.docs.map((logDoc) => normalizeAdminLog(logDoc.id, logDoc.data()))),
  (error) => onError?.(error),
);
