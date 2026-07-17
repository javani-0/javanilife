import { getFirebaseAdminAuth, getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";

// ---------------------------------------------------------------------------
// POST /api/razorpay/create-manager-login   (admin only)
// ---------------------------------------------------------------------------
// The admin creates (or resets) a MANAGER's sign-in (req): name, WhatsApp,
// email + password, plus the list of admin pages they may open. We create the
// Firebase Auth user (or update the password if the email exists), mark the
// user doc role="manager" with managerPages, and stash the credentials in the
// admin-only `managerCredentials/{uid}` doc for re-sharing on WhatsApp.
// ---------------------------------------------------------------------------

const VALID_PAGES = new Set([
  "enquiries", "courses", "classes", "students", "enrollments", "fee-collections",
  "payment-settings", "gallery", "products", "coupons", "delivery-settings",
  "orders", "customers", "finance", "site-settings",
]);

interface Body {
  email?: string;
  password?: string;
  name?: string;
  whatsapp?: string;
  pages?: string[];
}

const errorCode = (error: unknown): string =>
  typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requirePost(request, response)) return;

  try {
    const token = getBearerToken(request);
    if (!token) {
      sendError(response, 401, "Missing Firebase authentication token.");
      return;
    }

    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    const db = getFirebaseAdminDb();

    const callerSnap = await db.doc(`users/${decoded.uid}`).get();
    if (String(callerSnap.data()?.role || "") !== "admin") {
      sendError(response, 403, "Only an admin can create manager logins.");
      return;
    }

    const body = await readJsonBody<Body>(request);
    const email = (body.email || "").trim().toLowerCase();
    const password = (body.password || "").trim();
    const name = (body.name || "").trim();
    const whatsapp = (body.whatsapp || "").replace(/\D/g, "").slice(-15);
    const pages = (Array.isArray(body.pages) ? body.pages : []).filter((page) => VALID_PAGES.has(String(page)));

    if (!name) {
      sendError(response, 400, "Manager name is required.");
      return;
    }
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      sendError(response, 400, "A valid email is required.");
      return;
    }
    if (password.length < 6) {
      sendError(response, 400, "Password must be at least 6 characters.");
      return;
    }

    const auth = getFirebaseAdminAuth();

    let uid = "";
    let created = false;
    try {
      const existing = await auth.getUserByEmail(email);
      uid = existing.uid;
      // Never silently demote the admin's own account through this endpoint.
      if (uid === decoded.uid) {
        sendError(response, 400, "You cannot turn your own admin account into a manager.");
        return;
      }
      const existingRole = String((await db.doc(`users/${uid}`).get()).data()?.role || "");
      if (existingRole === "admin") {
        sendError(response, 400, "That email belongs to an admin account.");
        return;
      }
      await auth.updateUser(uid, { password, displayName: name });
    } catch (lookupError) {
      if (errorCode(lookupError) === "auth/user-not-found") {
        const newUser = await auth.createUser({ email, password, displayName: name, emailVerified: false });
        uid = newUser.uid;
        created = true;
      } else {
        throw lookupError;
      }
    }

    await db.doc(`users/${uid}`).set(
      {
        uid,
        email,
        username: name,
        ...(whatsapp ? { whatsappNumber: whatsapp } : {}),
        role: "manager",
        managerPages: pages,
        updatedAt: FieldValue.serverTimestamp(),
        ...(created ? { createdAt: FieldValue.serverTimestamp() } : {}),
      },
      { merge: true },
    );

    await db.doc(`managerCredentials/${uid}`).set(
      { managerUid: uid, email, password, name, whatsapp, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    sendJson(response, 200, { ok: true, uid, created });
  } catch (error) {
    console.error("Unable to create manager login", error);
    const code = errorCode(error);
    if (code === "auth/email-already-exists") { sendError(response, 409, "That email is already in use by another account."); return; }
    if (code === "auth/invalid-password") { sendError(response, 400, "Password is too weak — use at least 6 characters."); return; }
    if (code === "auth/invalid-email") { sendError(response, 400, "Please enter a valid email address."); return; }
    if (code.startsWith("auth/")) { sendError(response, 401, "Authentication error while creating the manager login."); return; }
    sendError(response, 500, error instanceof Error ? error.message : "Unable to create the manager login.");
  }
}
