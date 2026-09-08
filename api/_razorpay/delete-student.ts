import { getFirebaseAdminAuth, getFirebaseAdminDb } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";

// ---------------------------------------------------------------------------
// POST /api/razorpay/delete-student   (ADMIN ONLY — danger zone)
// ---------------------------------------------------------------------------
// Permanently removes a student and EVERY trace of them (req 3): all of their
// enrolments — including ones the student profile has forgotten — plus the fee
// ledger, attendance, progress reports, assignment submissions, certificates,
// bills, the onboarding link, stored credentials, the users doc and the
// Firebase Auth login.
//
// "Only that student", strictly: records are found through this student's
// enrolments and, when the login belongs to them alone, through that uid. If a
// parent shares one login across two children, the uid sweeps are skipped and
// the sibling keeps everything, login included.
//
// Deliberately NOT available to managers. The auth account is only deleted when
// it is a plain "user" role (never an admin/manager/partner sharing an email).
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

// ---------------------------------------------------------------------------
// Everything a student leaves behind (req 3: "delete the student, delete their
// related content from anywhere — and only that student's").
//
// Two keys reach the same rows: the ENROLMENT id (how the academic records are
// filed) and the student's LOGIN uid (how the portal wrote anything before an
// enrolment existed). Both are swept, because a row missed here is exactly what
// turns into a ghost enrolment pointing at a deleted class later on.
// ---------------------------------------------------------------------------
const BY_ENROLLMENT: { collection: string; label: string }[] = [
  { collection: "feePayments", label: "fee record" },
  { collection: "attendance", label: "attendance day" },
  { collection: "progressReports", label: "progress report" },
  { collection: "assignmentSubmissions", label: "assignment submission" },
  { collection: "certificates", label: "certificate" },
  { collection: "bills", label: "bill" },
];

const BY_STUDENT_UID: { collection: string; field: string; label: string }[] = [
  { collection: "attendance", field: "studentUid", label: "attendance day" },
  { collection: "progressReports", field: "studentUid", label: "progress report" },
  { collection: "assignmentSubmissions", field: "studentUid", label: "assignment submission" },
  { collection: "certificates", field: "studentUid", label: "certificate" },
  { collection: "feePayments", field: "parentUserId", label: "fee record" },
];
// Push tokens and browsing history hang off the LOGIN, so they are cleared in
// step 3 instead — only when that login turns out to be a plain student account.

/** "3 fee records, 1 certificate" from a {label: count} tally. */
const describeTally = (tally: Record<string, number>): string[] =>
  Object.entries(tally)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${count} ${label}${count === 1 ? "" : "s"}`);

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
    const recordedIds = [
      getString(student.enrollmentId),
      ...(Array.isArray(student.enrollmentIds)
        ? (student.enrollmentIds as unknown[]).map((value) => getString(value))
        : []),
      ...(Array.isArray(student.courses)
        ? (student.courses as Record<string, unknown>[]).map((course) => getString(course.enrollmentId))
        : []),
    ].filter(Boolean);

    // Is this login this student's alone? A parent who enrolled two children
    // from one account shares it — and then anything found by uid belongs to a
    // sibling as much as to this student, so the uid sweeps are skipped and
    // only records tied to THIS student profile are removed (req 3: "only that
    // student").
    let uidIsExclusive = Boolean(uid);
    if (uid) {
      const sharing = await db.collection("students").where("userUid", "==", uid).get();
      uidIsExclusive = sharing.docs.every((docSnap) => docSnap.id === studentDocId);
    }
    const sweepUid = uidIsExclusive ? uid : "";

    // Enrolments the student doc has FORGOTTEN are the dangerous ones: they
    // survive the delete and later surface as "points at a deleted class" with
    // no student to re-link. Query for them by both keys an enrolment carries.
    const discovered: string[] = [];
    for (const [field, value] of [["studentDocId", studentDocId], ["parentUserId", sweepUid]] as [string, string][]) {
      if (!value) continue;
      const snapshot = await db.collection("enrollments").where(field, "==", value).get();
      for (const docSnap of snapshot.docs) discovered.push(docSnap.id);
    }

    const enrollmentIds = Array.from(new Set([...recordedIds, ...discovered]));
    const removed: string[] = [];
    const tally: Record<string, number> = {};

    // 1. Every class record — fees, attendance, progress, submissions,
    //    certificates and bills — then the enrolment itself, LAST, so a
    //    failure part-way still leaves the id that identifies the leftovers.
    for (const enrollmentId of enrollmentIds) {
      for (const linked of BY_ENROLLMENT) {
        tally[linked.label] = (tally[linked.label] || 0)
          + await deleteQueryDocs(db, linked.collection, "enrollmentId", enrollmentId);
      }
      await db.collection("enrollments").doc(enrollmentId).delete();
    }
    if (enrollmentIds.length > 0) {
      removed.push(`${enrollmentIds.length} enrollment${enrollmentIds.length > 1 ? "s" : ""}`);
    }

    // 1b. Anything the portal filed under the LOGIN rather than an enrolment —
    //     only when that login belongs to this student alone.
    if (sweepUid) {
      for (const linked of BY_STUDENT_UID) {
        tally[linked.label] = (tally[linked.label] || 0)
          + await deleteQueryDocs(db, linked.collection, linked.field, sweepUid);
      }
    } else if (uid) {
      removed.push("shared login — only this student's own records removed");
    }
    // Bills are also addressed by the student profile itself.
    tally.bill = (tally.bill || 0) + await deleteQueryDocs(db, "bills", "studentDocId", studentDocId);

    removed.push(...describeTally(tally));

    // 2. Onboarding link + stored credentials.
    if (linkToken) {
      await db.collection("onboardingLinks").doc(linkToken).delete();
      removed.push("payment link");
    }
    await db.collection("studentCredentials").doc(studentDocId).delete();

    // 3. The login: users doc (with subcollections) + push tokens + history +
    //    the Auth account itself — but never a privileged account.
    if (uid && !uidIsExclusive) {
      // Another student profile still signs in with this account — the login
      // and its history stay.
      removed.push("login kept (shared with another student)");
    } else if (uid) {
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
