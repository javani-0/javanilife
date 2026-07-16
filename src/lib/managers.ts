import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ---------------------------------------------------------------------------
// Managers (req): admin-created staff logins with per-page access. The manager
// signs in at /login and lands on their first allowed admin page. Credentials
// are stored (admin-only) so the admin can re-share them on WhatsApp — same
// model the user chose for partners.
// ---------------------------------------------------------------------------

export interface ManagerDoc {
  uid: string;
  name: string;
  email: string;
  whatsapp?: string;
  pages: string[];
}

export interface ManagerCredential {
  managerUid: string;
  email: string;
  password: string;
  whatsapp?: string;
  name?: string;
}

const normalizeManager = (id: string, data: DocumentData = {}): ManagerDoc => ({
  uid: id,
  name: typeof data.username === "string" ? data.username : "",
  email: typeof data.email === "string" ? data.email : "",
  whatsapp: typeof data.whatsappNumber === "string" ? data.whatsappNumber : "",
  pages: Array.isArray(data.managerPages) ? data.managerPages.filter((page: unknown) => typeof page === "string") : [],
});

/** Admin: live list of all managers (users with role == "manager"). */
export const subscribeToManagers = (
  onChange: (managers: ManagerDoc[]) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  query(collection(db, "users"), where("role", "==", "manager")),
  (snapshot) => onChange(snapshot.docs.map((docSnap) => normalizeManager(docSnap.id, docSnap.data()))),
  (error) => onError?.(error),
);

/** Admin: live map of stored manager credentials, keyed by uid. */
export const subscribeToManagerCredentials = (
  onChange: (credentials: Record<string, ManagerCredential>) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  collection(db, "managerCredentials"),
  (snapshot) => {
    const map: Record<string, ManagerCredential> = {};
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() || {};
      map[docSnap.id] = {
        managerUid: docSnap.id,
        email: typeof data.email === "string" ? data.email : "",
        password: typeof data.password === "string" ? data.password : "",
        whatsapp: typeof data.whatsapp === "string" ? data.whatsapp : "",
        name: typeof data.name === "string" ? data.name : "",
      };
    }
    onChange(map);
  },
  (error) => onError?.(error),
);

export interface CreateManagerLoginResult { ok: boolean; uid: string; created: boolean }

/** Admin: create (or reset) a manager's sign-in via the server (Admin SDK). */
export const createManagerLogin = async (
  idToken: string,
  payload: { email: string; password: string; name: string; whatsapp?: string; pages: string[] },
): Promise<CreateManagerLoginResult> => {
  const response = await fetch("/api/razorpay/create-manager-login", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.error === "string" && data.error.trim() ? data.error : "Could not create the manager login.");
  }
  return data as CreateManagerLoginResult;
};

/** Admin: toggle a manager's allowed pages (client write; rules allow admin). */
export const updateManagerPages = async (uid: string, pages: string[]): Promise<void> => {
  await updateDoc(doc(db, "users", uid), { managerPages: pages, updatedAt: serverTimestamp() });
};

/** Admin: remove manager access — back to a normal user, credentials deleted. */
export const revokeManager = async (uid: string): Promise<void> => {
  await updateDoc(doc(db, "users", uid), { role: "user", managerPages: deleteField(), updatedAt: serverTimestamp() });
  try { await deleteDoc(doc(db, "managerCredentials", uid)); } catch { /* creds doc may not exist */ }
};

/** Build a wa.me link that shares the manager's login details on WhatsApp. */
export const buildManagerLoginWhatsAppUrl = (credential: ManagerCredential, loginUrl: string): string => {
  const lines = [
    "Hello! Here are your Javani admin (manager) login details:",
    "",
    `Login: ${loginUrl}`,
    `Email: ${credential.email}`,
    `Password: ${credential.password}`,
    "",
    "Sign in and you'll be taken to the pages enabled for you. Please keep these details private.",
  ];
  const text = encodeURIComponent(lines.join("\n"));
  const number = (credential.whatsapp || "").replace(/\D/g, "");
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
};
