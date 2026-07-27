import { getFirebaseAdminAuth, getFirebaseAdminDb } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";

// ---------------------------------------------------------------------------
// POST /api/razorpay/delete-student   (ADMIN ONLY — danger zone)
// ---------------------------------------------------------------------------
// Permanently removes every trace of an admin-created student (req — used for
// test logins etc.): the fee ledger, enrollment, onboarding link, credentials,
// student profile, users doc and the Firebase Auth login. Deliberately NOT
// available to managers. The auth account is only deleted when it's a plain
// "user" role (never an admin/manager/partner that happened to share an email).
// ---------------------------------------------------------------------------

interface DeleteBody {
  studentDocId?: string;
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
  for (const docSnap of snapshot.docs) {
    await docSnap.ref.delete();
    count += 1;
  }
  return count;
};

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
    if (getString(callerSnap.data()?.role) !== "admin") {
      sendError(response, 403, "Only an admin can permanently delete a student.");
      return;
    }

    const body = await readJsonBody<DeleteBody>(request);
    const studentDocId = (body.studentDocId || "").trim();
    if (!studentDocId) {
      sendError(response, 400, "studentDocId is required.");
      return;
    }

    const studentRef = db.collection("students").doc(studentDocId);
    const studentSnap = await studentRef.get();
    if (!studentSnap.exists) {
      sendError(response, 404, "Student record was not found.");
      return;
    }
    const student = studentSnap.data() || {};
    const linkToken = getString(student.linkToken);
    const uid = getString(student.userUid);
    // EVERY class this student took (req: a student may hold several). Collects
    // the legacy singular id, the enrollmentIds array, and any id still only on
    // a course row — deduped, so nothing is left orphaned.
    const enrollmentIds = Array.from(new Set([
      getString(student.enrollmentId),
      ...(Array.isArray(student.enrollmentIds)
        ? (student.enrollmentIds as unknown[]).map((value) => getString(value))
        : []),
      ...(Array.isArray(student.courses)
        ? (student.courses as Record<string, unknown>[]).map((course) => getString(course.enrollmentId))
        : []),
    ].filter(Boolean)));
    const removed: string[] = [];

    // 1. Fee ledger + enrollments — one set per class.
    let feeCount = 0;
    for (const enrollmentId of enrollmentIds) {
      feeCount += await deleteQueryDocs(db, "feePayments", "enrollmentId", enrollmentId);
      await db.collection("enrollments").doc(enrollmentId).delete();
    }
    if (feeCount > 0) removed.push(`${feeCount} fee record${feeCount > 1 ? "s" : ""}`);
    if (enrollmentIds.length > 0) {
      removed.push(`${enrollmentIds.length} enrollment${enrollmentIds.length > 1 ? "s" : ""}`);
    }

    // 2. Onboarding link + stored credentials.
    if (linkToken) {
      await db.collection("onboardingLinks").doc(linkToken).delete();
      removed.push("payment link");
    }
    await db.collection("studentCredentials").doc(studentDocId).delete();

    // 3. The login: users doc (with subcollections) + push tokens + history +
    //    the Auth account itself — but never a privileged account.
    if (uid) {
      const userSnap = await db.doc(`users/${uid}`).get();
      const role = getString(userSnap.data()?.role, "user");
      if (role === "user") {
        await deleteQueryDocs(db, "userTokens", "uid", uid);
        await deleteQueryDocs(db, "history", "uid", uid);
        try {
          await db.recursiveDelete(db.doc(`users/${uid}`));
        } catch (recursiveError) {
          console.error("delete-student: users doc recursive delete failed", recursiveError);
          await db.doc(`users/${uid}`).delete();
        }
        try {
          await getFirebaseAdminAuth().deleteUser(uid);
          removed.push("login account");
        } catch (authError) {
          console.error("delete-student: auth user delete failed", authError);
        }
      } else {
        removed.push(`login kept (role: ${role})`);
      }
    }

    // 4. The student profile itself.
    await studentRef.delete();
    removed.push("student profile");

    sendJson(response, 200, { ok: true, removed });
  } catch (error) {
    console.error("Unable to delete student", error);
    sendError(response, 500, error instanceof Error ? error.message : "Unable to delete the student.");
  }
}
