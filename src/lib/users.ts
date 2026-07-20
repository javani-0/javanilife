import { collection, onSnapshot, query, where, type DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase";

// ---------------------------------------------------------------------------
// Users tab (req 3): every normal-user login — admin-created students and
// self-signups alike. Admin can deactivate/reactivate or delete via the
// server (Admin SDK). Admin/manager/partner accounts are excluded.
// ---------------------------------------------------------------------------

export interface AppUser {
  uid: string;
  username: string;
  email: string;
  phone?: string;
  whatsappNumber?: string;
  disabled: boolean;
  managedByAdmin: boolean;
  photoURL?: string;
  createdAt?: { seconds?: number };
}

const getString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);

const normalizeUser = (id: string, data: DocumentData = {}): AppUser => ({
  uid: id,
  username: getString(data.username) || getString(data.email) || "User",
  email: getString(data.email),
  phone: getString(data.phone) || undefined,
  whatsappNumber: getString(data.whatsappNumber) || undefined,
  disabled: data.disabled === true,
  managedByAdmin: data.managedByAdmin === true,
  photoURL: getString(data.photoURL) || undefined,
  createdAt: data.createdAt,
});

/** Admin: live list of all normal-user accounts (role == "user"). */
export const subscribeToAppUsers = (
  onChange: (users: AppUser[]) => void,
  onError?: (error: unknown) => void,
) => onSnapshot(
  query(collection(db, "users"), where("role", "==", "user")),
  (snapshot) => onChange(snapshot.docs.map((docSnap) => normalizeUser(docSnap.id, docSnap.data()))),
  (error) => onError?.(error),
);

export type ManageUserAction = "deactivate" | "activate" | "delete";

/** Admin: deactivate / reactivate / delete a user login (server, Admin SDK). */
export const manageUser = async (
  idToken: string,
  uid: string,
  action: ManageUserAction,
): Promise<{ ok: boolean; disabled?: boolean; removed?: string[] }> => {
  const response = await fetch("/api/razorpay/manage-user", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ uid, action }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data?.error === "string" && data.error.trim() ? data.error : "Could not manage the user.");
  return data;
};
