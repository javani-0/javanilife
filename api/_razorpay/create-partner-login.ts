import { getFirebaseAdminAuth, getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";

// ---------------------------------------------------------------------------
// POST /api/razorpay/create-partner-login   (admin only)
// ---------------------------------------------------------------------------
// The admin creates (or resets) a partner's sign-in directly — no self-signup
// needed. We create the Firebase Auth user (or update the password if the email
// already exists), mark their user doc role="partner", and stash the email +
// password in an admin-only `partnerCredentials/{partnerId}` doc so the admin
// can re-share them on WhatsApp anytime (req 4).
// ---------------------------------------------------------------------------

interface Body {
  email?: string;
  password?: string;
  partnerId?: string;
  name?: string;
  whatsapp?: string;
}

const isFirebaseAuthError = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  return code.startsWith("auth/");
};

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

    // Admin-only.
    const callerSnap = await db.doc(`users/${decoded.uid}`).get();
    if (String(callerSnap.data()?.role || "") !== "admin") {
      sendError(response, 403, "Only an admin can create partner logins.");
      return;
    }

    const body = await readJsonBody<Body>(request);
    const email = (body.email || "").trim().toLowerCase();
    const password = (body.password || "").trim();
    const partnerId = (body.partnerId || "").trim();
    const name = (body.name || "").trim();
    const whatsapp = (body.whatsapp || "").replace(/\D/g, "").slice(-15);

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      sendError(response, 400, "A valid email is required.");
      return;
    }
    if (password.length < 6) {
      sendError(response, 400, "Password must be at least 6 characters.");
      return;
    }

    const auth = getFirebaseAdminAuth();

    // Create the account, or reset the password if the email already exists.
    let uid = "";
    let created = false;
    try {
      const existing = await auth.getUserByEmail(email);
      uid = existing.uid;
      await auth.updateUser(uid, { password, displayName: name || existing.displayName || undefined });
    } catch (lookupError) {
      if (errorCode(lookupError) === "auth/user-not-found") {
        const newUser = await auth.createUser({ email, password, displayName: name || undefined, emailVerified: false });
        uid = newUser.uid;
        created = true;
      } else {
        throw lookupError;
      }
    }

    // Give them the partner role (merge so an existing user keeps their fields).
    await db.doc(`users/${uid}`).set(
      {
        uid,
        email,
        username: name || email,
        role: "partner",
        updatedAt: FieldValue.serverTimestamp(),
        ...(created ? { createdAt: FieldValue.serverTimestamp() } : {}),
      },
      { merge: true },
    );

    // Stash credentials for the admin to re-share (admin-only collection).
    if (partnerId) {
      await db.doc(`partnerCredentials/${partnerId}`).set(
        { partnerUid: uid, email, password, name, whatsapp, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }

    sendJson(response, 200, { ok: true, uid, created });
  } catch (error) {
    console.error("Unable to create partner login", error);
    if (isFirebaseAuthError(error)) {
      const code = errorCode(error);
      if (code === "auth/email-already-exists") { sendError(response, 409, "That email is already in use by another account."); return; }
      if (code === "auth/invalid-password") { sendError(response, 400, "Password is too weak — use at least 6 characters."); return; }
      if (code === "auth/invalid-email") { sendError(response, 400, "Please enter a valid email address."); return; }
      sendError(response, 401, "Authentication error while creating the partner login.");
      return;
    }
    sendError(response, 500, error instanceof Error ? error.message : "Unable to create the partner login.");
  }
}
