import { getFirebaseAdminAuth, getFirebaseAdminDb, FieldValue } from "../_lib/firebase-admin.js";
import { getBearerToken, readJsonBody, requirePost, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { addMonths, buildFeePaymentId, clampBillingDay, dueDateFor, monthKeyFor } from "../_lib/class-fees.js";
import {
  buildFeePaymentSeed,
  countSlotSeatOnce,
  ENROLLMENTS_COLLECTION,
  ensureCustomFeePayment,
  FEE_PAYMENTS_COLLECTION,
  type EnrollmentRecord,
} from "../_lib/fee-store.js";
import { isStaffForPage } from "../_lib/staff.js";

// ---------------------------------------------------------------------------
// POST /api/razorpay/approve-onboarding   (staff with the `students` page)
// ---------------------------------------------------------------------------
// Approving a student onboarding (req 2):
//   1. next STU id (transaction on counters/studentIds)
//   2. Firebase Auth login — email = user id, password = the student id
//   3. a REAL EnrollmentDoc, so the existing fee engine/portal work unchanged
//   4. the onboarding payment recorded as a paid fee (visible in history/finance)
//   5. "first month free" → that month's fee doc pre-created as waived
//   6. credentials stored (staff-only) + published onto the public link doc
// Rejecting sends the link back to awaiting-payment with a reason.
// ---------------------------------------------------------------------------

const STUDENTS = "students";
const ONBOARDING_LINKS = "onboardingLinks";
const STUDENT_CREDENTIALS = "studentCredentials";
const CLASSES = "classes";
const USERS = "users";

interface ApproveBody {
  studentDocId?: string;
  approve?: boolean;
  paymentMethod?: "upi" | "cash" | "manual";
  rejectReason?: string;
}

const getString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clampPaise = (value: unknown): number => Math.max(0, Math.round(toNumber(value)));
const errorCode = (error: unknown): string =>
  typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";

const formatStudentId = (sequence: number): string => `STU${String(Math.max(1, Math.round(sequence))).padStart(3, "0")}`;

/**
 * Rebuild the onboarding breakdown + total server-side (mirror of
 * src/lib/students/types.ts buildFeeBreakdown). The rows are stored on the fee
 * doc so the parent's payment history shows the same itemized split the admin
 * saw (req), not just one total.
 */
const buildOnboardingBreakdown = (fees: Record<string, unknown>): { rows: Array<{ label: string; amountInPaise: number }>; totalInPaise: number } => {
  const studentType = getString(fees.studentType, "new");
  const track = getString(fees.track, "monthly");
  const rows: Array<{ label: string; amountInPaise: number }> = [];
  if (clampPaise(fees.kitFeeInPaise) > 0) rows.push({ label: "Kit fee", amountInPaise: clampPaise(fees.kitFeeInPaise) });
  if (clampPaise(fees.booksFeeInPaise) > 0) rows.push({ label: "Books fee", amountInPaise: clampPaise(fees.booksFeeInPaise) });
  if (clampPaise(fees.uniformFeeInPaise) > 0) rows.push({ label: "Uniform fee", amountInPaise: clampPaise(fees.uniformFeeInPaise) });
  if (studentType === "new") {
    if (track === "term" && clampPaise(fees.termFeeInPaise) > 0) rows.push({ label: "Course fee (full term)", amountInPaise: clampPaise(fees.termFeeInPaise) });
    if (track !== "term" && clampPaise(fees.monthlyFeeInPaise) > 0) rows.push({ label: "Pre-payment (first fee)", amountInPaise: clampPaise(fees.monthlyFeeInPaise) });
  }
  const subtotal = rows.reduce((sum, row) => sum + row.amountInPaise, 0);
  const discount = Math.min(clampPaise(fees.discountInPaise), subtotal);
  if (discount > 0) rows.push({ label: "Discount", amountInPaise: -discount });
  return { rows, totalInPaise: Math.max(0, subtotal - discount) };
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

    const callerSnap = await db.doc(`${USERS}/${decoded.uid}`).get();
    if (!isStaffForPage(callerSnap.data(), "students")) {
      sendError(response, 403, "Only an admin (or a manager with Student Manager access) can approve onboardings.");
      return;
    }

    const body = await readJsonBody<ApproveBody>(request);
    const studentDocId = (body.studentDocId || "").trim();
    if (!studentDocId) {
      sendError(response, 400, "studentDocId is required.");
      return;
    }

    const studentRef = db.collection(STUDENTS).doc(studentDocId);
    const studentSnap = await studentRef.get();
    if (!studentSnap.exists) {
      sendError(response, 404, "Student record was not found.");
      return;
    }
    const student = studentSnap.data() || {};
    const linkToken = getString(student.linkToken);
    const linkRef = linkToken ? db.collection(ONBOARDING_LINKS).doc(linkToken) : null;

    // ── Reject: back to awaiting-payment with the reason (parent sees it live) ──
    if (body.approve === false) {
      const rejectReason = (body.rejectReason || "").trim().slice(0, 300)
        || "We could not verify the payment. Please pay again or contact us.";
      await studentRef.set({
        onboardingStatus: "awaiting-payment",
        rejectReason,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (linkRef) {
        await linkRef.set({ status: "awaiting-payment", rejectReason, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      sendJson(response, 200, { ok: true, status: "awaiting-payment" });
      return;
    }

    // ── Approve ──
    const email = getString(student.email).trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      sendError(response, 400, "The student has no valid login email — edit the profile first.");
      return;
    }
    const studentName = getString(student.name) || "Student";
    const phone = getString(student.phone).replace(/\D/g, "").slice(-15);
    const fees = (student.fees || {}) as Record<string, unknown>;
    const track = getString(fees.track, "monthly");
    const studentType = getString(fees.studentType, "new") === "existing" ? "existing" : "new";
    const classId = getString(student.classId);
    if (!classId) {
      sendError(response, 400, "The student has no class selected — edit the profile first.");
      return;
    }

    // Idempotency: a second click just re-returns the issued credentials.
    if (getString(student.studentId) && getString(student.userUid) && getString(student.enrollmentId)) {
      sendJson(response, 200, {
        ok: true,
        alreadyApproved: true,
        studentId: getString(student.studentId),
        uid: getString(student.userUid),
        enrollmentId: getString(student.enrollmentId),
        credentials: { email, password: getString(student.studentId), studentId: getString(student.studentId) },
      });
      return;
    }

    const classSnap = await db.collection(CLASSES).doc(classId).get();
    if (!classSnap.exists) {
      sendError(response, 400, "The selected class no longer exists — pick another class first.");
      return;
    }
    const classData = classSnap.data() || {};
    const billingDay = clampBillingDay(toNumber(classData.billingDayOfMonth, 5));

    // 1. The roll number / student id. The admin's chosen number wins (req —
    //    e.g. reassigning a dropped student's number); a number still held by
    //    an ACTIVE approved student is rejected. Blank → next auto number via
    //    the counter transaction (never shared between two approvals).
    const counterRef = db.doc("counters/studentIds");
    const desiredId = getString(student.desiredStudentId).trim().toUpperCase();
    let studentId = "";
    if (desiredId) {
      if (!/^[A-Z0-9-]{6,20}$/.test(desiredId)) {
        sendError(response, 400, "Roll number must be 6–20 letters/numbers (it becomes the login password).");
        return;
      }
      const holders = await db.collection(STUDENTS).where("studentId", "==", desiredId).get();
      const activeHolder = holders.docs.find((docSnap) =>
        docSnap.id !== studentDocId
        && docSnap.data()?.active !== false
        && getString(docSnap.data()?.onboardingStatus) === "approved");
      if (activeHolder) {
        sendError(response, 409, `Roll number ${desiredId} already belongs to an active student (${getString(activeHolder.data()?.name) || "unnamed"}). Mark them inactive first or pick another number.`);
        return;
      }
      studentId = desiredId;
      // Keep the auto-suggestion ahead of manually assigned numeric ids.
      const numeric = /(\d+)$/.exec(desiredId);
      if (numeric) {
        const used = Number(numeric[1]);
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(counterRef);
          const next = Math.max(1, Math.round(toNumber(snap.data()?.next, 1)));
          if (used + 1 > next) tx.set(counterRef, { next: used + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        });
      }
    } else {
      const sequence = await db.runTransaction(async (tx) => {
        const snap = await tx.get(counterRef);
        const next = Math.max(1, Math.round(toNumber(snap.data()?.next, 1)));
        tx.set(counterRef, { next: next + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return next;
      });
      studentId = formatStudentId(sequence);
    }
    const password = studentId; // req: password = the roll number / Student ID

    // 2. The login. Reuse an existing account for this email but never touch a
    //    privileged one; reset its password so the shared credentials work.
    const auth = getFirebaseAdminAuth();
    let uid = "";
    let createdUser = false;
    try {
      const existing = await auth.getUserByEmail(email);
      uid = existing.uid;
      const existingRole = getString((await db.doc(`${USERS}/${uid}`).get()).data()?.role);
      if (existingRole === "admin" || existingRole === "manager" || existingRole === "partner") {
        sendError(response, 400, `That email belongs to a ${existingRole} account — use the parent's own email.`);
        return;
      }
      await auth.updateUser(uid, { password, displayName: studentName });
    } catch (lookupError) {
      if (errorCode(lookupError) === "auth/user-not-found") {
        const created = await auth.createUser({ email, password, displayName: studentName, emailVerified: false });
        uid = created.uid;
        createdUser = true;
      } else {
        throw lookupError;
      }
    }

    await db.doc(`${USERS}/${uid}`).set({
      uid,
      email,
      username: getString(student.parentName) || studentName,
      ...(phone ? { whatsappNumber: phone, phone } : {}),
      role: "user",
      // Admin-created accounts are managed by the admin: the parent portal
      // hides self-editing and rules block it — the parent asks the admin for
      // changes so the Student Manager record stays the source of truth (req).
      managedByAdmin: true,
      ...(getString(student.photoUrl) ? { photoURL: getString(student.photoUrl) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
      ...(createdUser ? { createdAt: FieldValue.serverTimestamp() } : {}),
    }, { merge: true });

    // 3. The real enrollment — the whole existing fee engine hangs off this.
    const joinMonthKey = monthKeyFor(new Date());
    const isTerm = track === "term";
    const monthlyFeeInPaise = clampPaise(fees.monthlyFeeInPaise);
    const termFeeInPaise = clampPaise(fees.termFeeInPaise);
    const paymentPlan = isTerm ? "full" : "manual";
    const enrollmentDoc: Record<string, unknown> = {
      student: {
        name: studentName,
        age: Math.max(0, Math.round(toNumber(student.age))),
        gender: ["male", "female", "other"].includes(getString(student.gender)) ? getString(student.gender) : "other",
      },
      parent: {
        name: getString(student.parentName) || studentName,
        phone: getString(student.phone),
        whatsappNumber: getString(student.phone),
        address: getString(student.address),
      },
      parentUserId: uid,
      classId,
      className: getString(student.className) || getString(classData.name),
      monthlyFeeInPaise: isTerm ? 0 : monthlyFeeInPaise,
      billingDayOfMonth: billingDay,
      startMonthKey: joinMonthKey,
      status: "active",
      autopay: { enabled: false },
      paymentPlan,
      feeType: isTerm ? "term" : "monthly",
      studentStatus: studentType,
      // The admin enabled the Razorpay option → invite the parent to complete
      // the autopay mandate from their portal (mandates need the payer).
      ...(((student.methods || {}) as Record<string, unknown>).razorpay === true && !isTerm ? { autopayInvited: true } : {}),
      ...(getString(student.slotId) ? { slotId: getString(student.slotId), slotLabel: getString(student.slotLabel) } : {}),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (isTerm) {
      enrollmentDoc.termFeeInPaise = termFeeInPaise;
      if (getString(classData.startDate)) enrollmentDoc.termStartDate = getString(classData.startDate);
      if (getString(classData.endDate)) enrollmentDoc.termEndDate = getString(classData.endDate);
    } else {
      // First collectible due: new students (pre-payment structure) bill in
      // arrears from next month; existing students from the current month.
      const firstDueMonth = studentType === "new" ? addMonths(joinMonthKey, 1) : joinMonthKey;
      enrollmentDoc.nextChargeDate = dueDateFor(firstDueMonth, billingDay);
    }

    const enrollmentRef = await db.collection(ENROLLMENTS_COLLECTION).add(enrollmentDoc);
    const enrollmentId = enrollmentRef.id;
    await countSlotSeatOnce(db, enrollmentId);

    const enrollmentRecord: EnrollmentRecord = { id: enrollmentId, ...(enrollmentDoc as Omit<EnrollmentRecord, "id">) };

    // 4. Record the onboarding payment as a PAID fee (history + finance + admin).
    const warnings: string[] = [];
    const { rows: breakdownRows, totalInPaise } = buildOnboardingBreakdown(fees);
    const paidVia = getString(student.paidVia);
    const paymentMethod = body.paymentMethod
      || (paidVia === "qr" ? "upi" : paidVia === "counter" ? "cash" : paidVia === "razorpay" ? "manual" : "cash");
    if (totalInPaise > 0) {
      const isPrepaymentStyle = !isTerm && studentType === "new";
      const { id: feeId } = await ensureCustomFeePayment(db, enrollmentRecord, {
        suffix: "onboarding",
        amountInPaise: totalInPaise,
        periodLabel: isPrepaymentStyle ? "Admission · Pre-payment & items" : isTerm ? "Admission · Full course fee & items" : "Admission payment",
        dueDate: new Date().toISOString().slice(0, 10),
      });
      await db.collection(FEE_PAYMENTS_COLLECTION).doc(feeId).set({
        status: "paid",
        paymentMethod,
        breakdown: breakdownRows,
        ...(isPrepaymentStyle ? { prepayment: true } : {}),
        ...(getString(student.proofUrl) ? { upiProofUrl: getString(student.proofUrl) } : {}),
        ...(getString(student.upiRef) ? { upiRef: getString(student.upiRef) } : {}),
        ...(getString(student.razorpayPaymentId) ? { razorpayPaymentId: getString(student.razorpayPaymentId) } : {}),
        approvedBy: decoded.uid,
        approvedAt: FieldValue.serverTimestamp(),
        paidAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    // 5. First-month-free: pre-create that month's fee doc as waived so the
    //    cron/self-heal never bill it (no billing-math changes needed).
    if (!isTerm && fees.firstMonthFree === true) {
      try {
        const freeMonthKey = studentType === "new" ? addMonths(joinMonthKey, 1) : joinMonthKey;
        const freeFeeRef = db.collection(FEE_PAYMENTS_COLLECTION).doc(buildFeePaymentId(enrollmentId, freeMonthKey));
        if (!(await freeFeeRef.get()).exists) {
          await freeFeeRef.set({
            ...buildFeePaymentSeed(enrollmentRecord, freeMonthKey),
            status: "waived",
            adminNote: "First month free (onboarding offer)",
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }
      } catch (waiveError) {
        console.error("Onboarding: free-month waiver failed", waiveError);
        warnings.push("Could not pre-waive the free month — waive it manually in Fee Collections.");
      }
    }

    // 6. Store credentials (staff-only) + publish them on the link (req: the
    //    same link now shows the login details).
    const credentials = { email, password, studentId };
    await db.collection(STUDENT_CREDENTIALS).doc(studentDocId).set({
      studentDocId,
      studentId,
      email,
      password,
      name: studentName,
      whatsapp: phone,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (linkRef) {
      await linkRef.set({
        status: "approved",
        credentials,
        rejectReason: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await studentRef.set({
      studentId,
      userUid: uid,
      enrollmentId,
      // Whether approval CREATED this auth account (vs. reusing an existing
      // user) — the danger-zone delete uses it to decide if the login goes too.
      authUserCreated: createdUser,
      onboardingStatus: "approved",
      paidVia: paidVia || (paymentMethod === "cash" ? "counter" : paymentMethod === "upi" ? "qr" : "razorpay"),
      active: true,
      rejectReason: FieldValue.delete(),
      approvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    sendJson(response, 200, { ok: true, studentId, uid, enrollmentId, credentials, warnings });
  } catch (error) {
    console.error("Unable to approve onboarding", error);
    const code = errorCode(error);
    if (code === "auth/email-already-exists") { sendError(response, 409, "That email is already in use by another account."); return; }
    if (code.startsWith("auth/")) { sendError(response, 401, "Authentication error while approving the onboarding."); return; }
    sendError(response, 500, error instanceof Error ? error.message : "Unable to approve the onboarding.");
  }
}
