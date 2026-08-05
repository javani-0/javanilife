import { getFirebaseAdminAuth, getFirebaseAdminDb } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";

// ---------------------------------------------------------------------------
// POST /api/razorpay/class-join-link   (signed-in student/parent)
// ---------------------------------------------------------------------------
// Hands out a class's LIVE join URL only to someone who is actually enrolled
// and not fee-locked. This is the part of the access restriction that is real
// enforcement rather than UI: the URL never reaches the browser of a student
// who shouldn't have it.
//
// Mirrors src/lib/portal/access.ts — keep the lock rules in sync.
// ---------------------------------------------------------------------------

const ENROLLMENTS = "enrollments";
const FEE_PAYMENTS = "feePayments";
const CLASS_CONTENT = "classContent";
const CLASSES = "classes";
const SITE_SETTINGS = "siteSettings";

/** Days past the due date before a class locks. Mirrors DEFAULT_ACCESS_GRACE_DAYS. */
const GRACE_DAYS = 3;
/** Statuses that still count as money owed. `processing` = paid, awaiting approval. */
const OWES = new Set(["pending", "overdue", "failed"]);

const getString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);

const todayIso = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const daysLate = (dueDate: string, today: string): number => {
  const due = Date.parse(`${dueDate}T00:00:00`);
  const now = Date.parse(`${today}T00:00:00`);
  if (Number.isNaN(due) || Number.isNaN(now)) return 0;
  return Math.round((now - due) / 86_400_000);
};

interface JoinBody { enrollmentId?: string }

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requirePost(request, response)) return;

  try {
    const token = getBearerToken(request);
    if (!token) { sendError(response, 401, "Please sign in to join the class."); return; }
    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    const db = getFirebaseAdminDb();

    const body = await readJsonBody<JoinBody>(request);
    const enrollmentId = (body.enrollmentId || "").trim();
    if (!enrollmentId) { sendError(response, 400, "enrollmentId is required."); return; }

    const enrollmentSnap = await db.collection(ENROLLMENTS).doc(enrollmentId).get();
    if (!enrollmentSnap.exists) { sendError(response, 404, "That class enrolment no longer exists."); return; }
    const enrollment = enrollmentSnap.data() || {};

    // 1. Ownership — never hand a link to someone else's enrolment.
    if (getString(enrollment.parentUserId) !== decoded.uid) {
      sendError(response, 403, "This class isn't linked to your account.");
      return;
    }

    // 2. The enrolment must be live.
    const status = getString(enrollment.status);
    if (status === "cancelled") { sendError(response, 403, "This enrolment has been cancelled."); return; }

    // 3. Fee lock — the same rule the portal shows, enforced here. It is OPT-IN
    //    (siteSettings/portal.accessLockEnabled): it shipped on by default and
    //    locked paying families out of content they had bought, so it must now
    //    be switched on deliberately. Mirrors src/lib/portal/access.ts.
    const settingsSnap = await db.collection(SITE_SETTINGS).doc("portal").get();
    const settings = settingsSnap.data() || {};
    const lockEnabled = settings.accessLockEnabled === true;
    const graceDays = Number.isFinite(Number(settings.accessGraceDays))
      ? Math.max(0, Math.round(Number(settings.accessGraceDays)))
      : GRACE_DAYS;

    const today = todayIso();
    const feesSnap = await db.collection(FEE_PAYMENTS).where("enrollmentId", "==", enrollmentId).get();
    let worstLate = 0;
    let worstLabel = "";
    for (const feeDoc of lockEnabled ? feesSnap.docs : []) {
      const fee = feeDoc.data() || {};
      if (!OWES.has(getString(fee.status))) continue;
      const dueDate = getString(fee.dueDate);
      if (!dueDate) continue;
      // A zero-rupee due is a bookkeeping artefact, never a lock reason.
      if (!(Number(fee.amountInPaise) > 0)) continue;
      const late = daysLate(dueDate, today);
      if (late > graceDays && late > worstLate) {
        worstLate = late;
        worstLabel = getString(fee.periodLabel) || dueDate;
      }
    }
    if (worstLate > 0) {
      sendError(response, 402, `Access is paused — the ${worstLabel} fee is ${worstLate} days overdue. It unlocks as soon as the payment is recorded.`);
      return;
    }

    // 4. The link itself: private classContent doc, falling back to the legacy
    //    field on the class doc for classes not migrated yet.
    const classId = getString(enrollment.classId);
    const [contentSnap, classSnap] = await Promise.all([
      db.collection(CLASS_CONTENT).doc(classId).get(),
      db.collection(CLASSES).doc(classId).get(),
    ]);
    const liveClassUrl = getString(contentSnap.data()?.liveClassUrl)
      || getString(classSnap.data()?.liveClassUrl);

    if (!liveClassUrl) { sendError(response, 404, "The live link hasn't been set up for this class yet."); return; }

    sendJson(response, 200, { ok: true, liveClassUrl });
  } catch (error) {
    console.error("Unable to resolve the class join link", error);
    sendError(response, 500, error instanceof Error ? error.message : "Unable to get the join link.");
  }
}
