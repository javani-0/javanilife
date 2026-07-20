import { getFirebaseAdminAuth, getFirebaseAdminDb } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";

// ---------------------------------------------------------------------------
// POST /api/razorpay/manage-user   (ADMIN ONLY)
// ---------------------------------------------------------------------------
// The Users tab (req 3): deactivate / reactivate / delete a normal user login
// — whether the admin created it (managed student) or the person self-signed
// up. Only plain "user" accounts can be touched (never admin/manager/partner,
// never the caller). Deleting also removes any Student Manager record + fees +
// enrollment tied to that login so nothing is orphaned.
// ---------------------------------------------------------------------------

interface Body {
  uid?: string;
  action?: "deactivate" | "activate" | "delete";
}

const getString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);

const deleteQueryDocs = async (
  db: FirebaseFirestore.Firestore,
  collectionName: string,
  field: string,
  value: string,
): Promise<number> => {
  if (!value) return 0;
  const snapshot = await db.collection(collectionName).where(field, "==", value).get();
  let count = 0;
  for (const docSnap of snapshot.docs) { await docSnap.ref.delete(); count += 1; }
  return count;
};

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requirePost(request, response)) return;

  try {
    const token = getBearerToken(request);
    if (!token) { sendError(response, 401, "Missing Firebase authentication token."); return; }
    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    const db = getFirebaseAdminDb();

    const callerSnap = await db.doc(`users/${decoded.uid}`).get();
    if (getString(callerSnap.data()?.role) !== "admin") {
      sendError(response, 403, "Only an admin can manage users.");
      return;
    }

    const body = await readJsonBody<Body>(request);
    const uid = (body.uid || "").trim();
    const action = body.action;
    if (!uid) { sendError(response, 400, "uid is required."); return; }
    if (uid === decoded.uid) { sendError(response, 400, "You can't act on your own account here."); return; }
    if (!action || !["deactivate", "activate", "delete"].includes(action)) { sendError(response, 400, "Invalid action."); return; }

    const userRef = db.doc(`users/${uid}`);
    const role = getString((await userRef.get()).data()?.role, "user");
    if (role === "admin" || role === "manager" || role === "partner") {
      sendError(response, 400, `That account is a ${role} — manage it from its own page.`);
      return;
    }

    const auth = getFirebaseAdminAuth();

    if (action === "deactivate" || action === "activate") {
      const disabled = action === "deactivate";
      try { await auth.updateUser(uid, { disabled }); } catch (authError) {
        console.error("manage-user: auth disable toggle failed", authError);
      }
      await userRef.set({ disabled }, { merge: true });
      // Reflect on any linked student record + pause/resume its enrollment.
      const studentDocs = await db.collection("students").where("userUid", "==", uid).get();
      for (const studentDoc of studentDocs.docs) {
        await studentDoc.ref.set({ active: !disabled }, { merge: true });
        const enrollmentId = getString(studentDoc.data()?.enrollmentId);
        if (enrollmentId) {
          try { await db.doc(`enrollments/${enrollmentId}`).set({ status: disabled ? "paused" : "active" }, { merge: true }); } catch { /* best-effort */ }
        }
      }
      sendJson(response, 200, { ok: true, uid, disabled });
      return;
    }

    // delete — remove every trace of this login.
    const removed: string[] = [];
    // Linked Student Manager records (+ their fees/enrollment/link/creds).
    const studentDocs = await db.collection("students").where("userUid", "==", uid).get();
    for (const studentDoc of studentDocs.docs) {
      const data = studentDoc.data() || {};
      const enrollmentId = getString(data.enrollmentId);
      const linkToken = getString(data.linkToken);
      const feeCount = await deleteQueryDocs(db, "feePayments", "enrollmentId", enrollmentId);
      if (feeCount > 0) removed.push(`${feeCount} fee record${feeCount > 1 ? "s" : ""}`);
      if (enrollmentId) { await db.doc(`enrollments/${enrollmentId}`).delete(); removed.push("enrollment"); }
      if (linkToken) { try { await db.doc(`onboardingLinks/${linkToken}`).delete(); } catch { /* gone */ } }
      await db.doc(`studentCredentials/${studentDoc.id}`).delete().catch(() => undefined);
      await studentDoc.ref.delete();
      removed.push("student profile");
    }
    // Enrollments created by a self-signed-up parent (no student doc).
    if (studentDocs.empty) {
      const enrollments = await db.collection("enrollments").where("parentUserId", "==", uid).get();
      for (const enr of enrollments.docs) {
        await deleteQueryDocs(db, "feePayments", "enrollmentId", enr.id);
        await enr.ref.delete();
      }
      if (!enrollments.empty) removed.push("enrolments");
    }
    await deleteQueryDocs(db, "userTokens", "uid", uid);
    await deleteQueryDocs(db, "history", "uid", uid);
    try { await db.recursiveDelete(userRef); } catch { await userRef.delete().catch(() => undefined); }
    removed.push("profile");
    try { await auth.deleteUser(uid); removed.push("login"); } catch (authError) {
      console.error("manage-user: auth delete failed", authError);
    }

    sendJson(response, 200, { ok: true, uid, removed });
  } catch (error) {
    console.error("Unable to manage user", error);
    sendError(response, 500, error instanceof Error ? error.message : "Unable to manage the user.");
  }
}
