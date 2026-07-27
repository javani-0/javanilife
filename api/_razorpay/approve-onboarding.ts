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
  // Term course fee = one-time full payment, charged for new AND existing.
  // Monthly pre-payment (first advance) = new students only. Mirror of
  // src/lib/students/types.ts buildFeeBreakdown.
  if (track === "term" && clampPaise(fees.termFeeInPaise) > 0) rows.push({ label: "Course fee (full term)", amountInPaise: clampPaise(fees.termFeeInPaise) });
  if (studentType === "new" && track !== "term" && clampPaise(fees.monthlyFeeInPaise) > 0) rows.push({ label: "Pre-payment (first fee)", amountInPaise: clampPaise(fees.monthlyFeeInPaise) });
  const subtotal = rows.reduce((sum, row) => sum + row.amountInPaise, 0);
  const discount = Math.min(clampPaise(fees.discountInPaise), subtotal);
  if (discount > 0) rows.push({ label: "Discount", amountInPaise: -discount });
  return { rows, totalInPaise: Math.max(0, subtotal - discount) };
};

const ordinal = (n: number): string => {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
};

interface ServerCourse {
  key: string;
  classId: string;
  className: string;
  slotId: string;
  slotLabel: string;
  trainerName: string;
  joiningDate: string;
  nextChargeDate: string;
  fees: Record<string, unknown>;
  methods: Record<string, unknown>;
  enrollmentId: string;
  status: string;
}

/**
 * Server mirror of src/lib/students/types.ts normalizeCourses (req: one student
 * may take several classes). Prefers the stored `courses` array; falls back to
 * ONE course synthesised from the legacy flat fields so pre-multi-class
 * students still approve unchanged.
 */
const readCourses = (student: Record<string, unknown>): ServerCourse[] => {
  const toCourse = (raw: Record<string, unknown>, index: number): ServerCourse => ({
    key: getString(raw.key) || `course-${index + 1}`,
    classId: getString(raw.classId),
    className: getString(raw.className),
    slotId: getString(raw.slotId),
    slotLabel: getString(raw.slotLabel),
    trainerName: getString(raw.trainerName),
    joiningDate: getString(raw.joiningDate),
    nextChargeDate: getString(raw.nextChargeDate),
    fees: (raw.fees || {}) as Record<string, unknown>,
    methods: (raw.methods || {}) as Record<string, unknown>,
    enrollmentId: getString(raw.enrollmentId),
    status: getString(raw.status, "active"),
  });

  const stored = Array.isArray(student.courses) ? (student.courses as Record<string, unknown>[]) : [];
  if (stored.length > 0) return stored.map(toCourse);
  if (!getString(student.classId)) return [];
  return [toCourse({
    key: "legacy",
    classId: student.classId,
    className: student.className,
    slotId: student.slotId,
    slotLabel: student.slotLabel,
    trainerName: student.trainerName,
    joiningDate: student.joiningDate,
    nextChargeDate: student.nextChargeDate,
    fees: student.fees,
    methods: student.methods,
    enrollmentId: student.enrollmentId,
    status: "active",
  }, 0)];
};

interface OnboardingInstallment {
  installmentNumber: number;
  label: string;
  percentage: number;
  amountInPaise: number;
  dueDate: string;
}

/**
 * The EMI schedule for a term onboarding — mirror of buildFeeBreakdown's
 * emiInstallments in src/lib/students/types.ts, plus a due date per
 * installment (one month apart from the joining month). The last installment
 * absorbs the rounding remainder so the parts always sum to the total.
 *
 * Returns [] unless EMI is actually in force (term + emi method + a valid
 * split producing more than one part).
 */
const buildEmiSchedule = (
  fees: Record<string, unknown>,
  totalInPaise: number,
  joinMonthKey: string,
  billingDay: number,
): OnboardingInstallment[] => {
  const split = (fees.emiSplit || null) as Record<string, unknown> | null;
  if (!split || totalInPaise <= 0) return [];
  const upfrontPercentage = Math.round(toNumber(split.upfrontPercentage));
  const parts = Array.isArray(split.installmentPercentages)
    ? split.installmentPercentages.map((value) => Math.round(toNumber(value))).filter((value) => value > 0)
    : [];
  if (upfrontPercentage <= 0 || parts.length === 0) return [];

  const upfrontAmount = Math.round((totalInPaise * upfrontPercentage) / 100);
  const schedule: OnboardingInstallment[] = [{
    installmentNumber: 1,
    label: `Admission · 1st installment (${upfrontPercentage}%)`,
    percentage: upfrontPercentage,
    amountInPaise: upfrontAmount,
    dueDate: dueDateFor(joinMonthKey, billingDay),
  }];
  let remaining = totalInPaise - upfrontAmount;
  parts.forEach((percentage, index) => {
    const isLast = index === parts.length - 1;
    const amountInPaise = isLast ? remaining : Math.round((totalInPaise * percentage) / 100);
    remaining -= amountInPaise;
    schedule.push({
      installmentNumber: index + 2,
      label: `${ordinal(index + 2)} installment (${percentage}%)`,
      percentage,
      amountInPaise,
      dueDate: dueDateFor(addMonths(joinMonthKey, index + 1), billingDay),
    });
  });
  return schedule;
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

    const courses = readCourses(student);
    if (courses.length === 0) {
      sendError(response, 400, "The student has no class selected — edit the profile first.");
      return;
    }
    // Idempotency lives on the COURSE, not the student: re-approving an already
    // approved student who has just gained a class materialises ONLY that class.
    const pendingCourses = courses.filter((course) => !course.enrollmentId && course.status !== "dropped");
    const alreadyIssued = Boolean(getString(student.studentId) && getString(student.userUid));

    if (alreadyIssued && pendingCourses.length === 0) {
      sendJson(response, 200, {
        ok: true,
        alreadyApproved: true,
        studentId: getString(student.studentId),
        uid: getString(student.userUid),
        enrollmentId: getString(student.enrollmentId),
        enrollmentIds: courses.map((course) => course.enrollmentId).filter(Boolean),
        credentials: { email, password: getString(student.studentId), studentId: getString(student.studentId) },
      });
      return;
    }

    // 1. The roll number / student id. The admin's chosen number wins (req —
    //    e.g. reassigning a dropped student's number); a number still held by
    //    an ACTIVE approved student is rejected. Blank → next auto number via
    //    the counter transaction (never shared between two approvals).
    //
    //    Skipped entirely when the student is ALREADY approved and we are only
    //    adding a newly enrolled class — they keep their roll number and login.
    const counterRef = db.doc("counters/studentIds");
    const desiredId = getString(student.desiredStudentId).trim().toUpperCase();
    let studentId = getString(student.studentId);
    if (!alreadyIssued) {
    if (desiredId) {
      if (!/^[A-Z0-9-]{6,20}$/.test(desiredId)) {
        sendError(response, 400, "Roll number must be 6–20 letters/numbers (it becomes the login password).");
        return;
      }
      // Any other (non-deleted) student already carrying this student id blocks
      // reuse — active or inactive. Freeing it requires deleting that student
      // (req); deleted docs are gone, so they never conflict.
      const holders = await db.collection(STUDENTS).where("studentId", "==", desiredId).get();
      const holder = holders.docs.find((docSnap) => docSnap.id !== studentDocId);
      if (holder) {
        sendError(response, 409, `Roll number ${desiredId} already belongs to ${getString(holder.data()?.name) || "another student"}. Delete that student to free the number, or pick another.`);
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
    }
    const password = studentId; // req: password = the roll number / Student ID

    // 2. The login. Reuse an existing account for this email but never touch a
    //    privileged one; reset its password so the shared credentials work.
    const auth = getFirebaseAdminAuth();
    let uid = getString(student.userUid);
    let createdUser = false;
    if (!alreadyIssued) {
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
    }

    // 3. One EnrollmentDoc + one fee ledger PER CLASS (req: a student may take
    //    several classes). Each course is materialised independently so a
    //    single bad class can never lose the others — failures are collected as
    //    warnings and the admin re-runs Approve to retry just that class.
    const warnings: string[] = [];
    const createdEnrollmentIds: string[] = [];
    const courseUpdates = courses.map((course) => ({ ...course }));

    const paidVia = getString(student.paidVia);
    const paymentMethod = body.paymentMethod
      || (paidVia === "qr" ? "upi" : paidVia === "counter" ? "cash" : paidVia === "razorpay" ? "manual" : "cash");
    const paymentProofFields = {
      ...(getString(student.proofUrl) ? { upiProofUrl: getString(student.proofUrl) } : {}),
      ...(getString(student.upiRef) ? { upiRef: getString(student.upiRef) } : {}),
      ...(getString(student.razorpayPaymentId) ? { razorpayPaymentId: getString(student.razorpayPaymentId) } : {}),
    };

    for (const course of pendingCourses) {
      try {
        if (!course.classId) {
          warnings.push("Skipped a class row with no class selected.");
          continue;
        }
        const classSnap = await db.collection(CLASSES).doc(course.classId).get();
        if (!classSnap.exists) {
          warnings.push(`Skipped "${course.className || course.classId}" — that class no longer exists.`);
          continue;
        }
        const classData = classSnap.data() || {};
        const billingDay = clampBillingDay(toNumber(classData.billingDayOfMonth, 5));

        const fees = course.fees;
        const track = getString(fees.track, "monthly");
        const isTerm = track === "term";
        const courseStudentType = getString(fees.studentType, "new") === "existing" ? "existing" : "new";
        const methods = course.methods;

        // Admin-set joining date (YYYY-MM-DD) drives startMonthKey; default today.
        const joiningDate = /^\d{4}-\d{2}-\d{2}$/.test(course.joiningDate)
          ? course.joiningDate
          : new Date().toISOString().slice(0, 10);
        const joinMonthKey = joiningDate.slice(0, 7);
        // Admin-set next charge date — drives the reminder + the parent Pay
        // button. Blank falls back to the computed default below.
        const adminNextChargeDate = /^\d{4}-\d{2}-\d{2}$/.test(course.nextChargeDate) ? course.nextChargeDate : "";
        const monthlyFeeInPaise = clampPaise(fees.monthlyFeeInPaise);
        const termFeeInPaise = clampPaise(fees.termFeeInPaise);
        // Term with EMI selected → the installment plan; else full. Monthly → manual.
        const paymentPlan = isTerm ? (methods.emi === true ? "emi" : "full") : "manual";

        const { rows: breakdownRows, totalInPaise } = buildOnboardingBreakdown(fees);
        // EMI is only real when the admin enabled it on a TERM course AND the
        // split yields more than one part. Then the parent paid installment 1
        // only (req) and installments 2..n become pending dues.
        const emiSchedule = isTerm && methods.emi === true
          ? buildEmiSchedule(fees, totalInPaise, joinMonthKey, billingDay)
          : [];
        const isEmi = emiSchedule.length > 1;

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
          classId: course.classId,
          className: course.className || getString(classData.name),
          monthlyFeeInPaise: isTerm ? 0 : monthlyFeeInPaise,
          billingDayOfMonth: billingDay,
          startMonthKey: joinMonthKey,
          joiningDate,
          trainerName: course.trainerName || getString(classData.facultyName),
          status: "active",
          autopay: { enabled: false },
          paymentPlan,
          feeType: isTerm ? "term" : "monthly",
          studentStatus: courseStudentType,
          // The admin enabled the Razorpay option → invite the parent to complete
          // the autopay mandate from their portal (mandates need the payer).
          ...(methods.razorpay === true && !isTerm ? { autopayInvited: true } : {}),
          ...(course.slotId ? { slotId: course.slotId, slotLabel: course.slotLabel } : {}),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (isTerm) {
          enrollmentDoc.termFeeInPaise = termFeeInPaise;
          if (getString(classData.startDate)) enrollmentDoc.termStartDate = getString(classData.startDate);
          if (getString(classData.endDate)) enrollmentDoc.termEndDate = getString(classData.endDate);
          if (isEmi) {
            // Installment 1 is what the parent just paid; the rest are pending
            // and drive the portal Pay button + the fee reminders.
            enrollmentDoc.installmentPlan = {
              status: "active",
              totalInPaise,
              initialPaymentInPaise: emiSchedule[0].amountInPaise,
              remainingInPaise: totalInPaise - emiSchedule[0].amountInPaise,
              reminderDayOfMonth: billingDay,
              installments: emiSchedule.map((installment) => ({
                installmentNumber: installment.installmentNumber,
                label: installment.label,
                percentage: installment.percentage,
                amountInPaise: installment.amountInPaise,
                dueDate: installment.dueDate,
                status: installment.installmentNumber === 1 ? "paid" : "pending",
              })),
            };
            enrollmentDoc.nextChargeDate = adminNextChargeDate || emiSchedule[1].dueDate;
          }
        } else {
          // First collectible due: the admin next-charge date wins; else new
          // students (pre-payment structure) bill in arrears from next month,
          // existing students from the current month.
          const firstDueMonth = courseStudentType === "new" ? addMonths(joinMonthKey, 1) : joinMonthKey;
          enrollmentDoc.nextChargeDate = adminNextChargeDate || dueDateFor(firstDueMonth, billingDay);
        }

        const enrollmentRef = await db.collection(ENROLLMENTS_COLLECTION).add(enrollmentDoc);
        const enrollmentId = enrollmentRef.id;
        await countSlotSeatOnce(db, enrollmentId);
        createdEnrollmentIds.push(enrollmentId);

        const updateIndex = courseUpdates.findIndex((item) => item.key === course.key);
        if (updateIndex >= 0) courseUpdates[updateIndex].enrollmentId = enrollmentId;

        const enrollmentRecord: EnrollmentRecord = { id: enrollmentId, ...(enrollmentDoc as Omit<EnrollmentRecord, "id">) };

        // 4. Record this course onboarding payment as a PAID fee, carrying ITS
        //    OWN itemised breakdown (history + finance + admin).
        if (isEmi) {
          for (const installment of emiSchedule) {
            const isFirst = installment.installmentNumber === 1;
            const { id: feeId } = await ensureCustomFeePayment(db, enrollmentRecord, {
              suffix: `emi-${installment.installmentNumber}`,
              amountInPaise: installment.amountInPaise,
              periodLabel: installment.label,
              dueDate: installment.dueDate,
            });
            await db.collection(FEE_PAYMENTS_COLLECTION).doc(feeId).set({
              emiInstallmentNumber: installment.installmentNumber,
              ...(isFirst
                ? {
                    status: "paid",
                    paymentMethod,
                    breakdown: breakdownRows,
                    ...paymentProofFields,
                    approvedBy: decoded.uid,
                    approvedAt: FieldValue.serverTimestamp(),
                    paidAt: FieldValue.serverTimestamp(),
                  }
                : { status: "pending" }),
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
          }
        } else if (totalInPaise > 0) {
          const isPrepaymentStyle = !isTerm && courseStudentType === "new";
          const { id: feeId } = await ensureCustomFeePayment(db, enrollmentRecord, {
            suffix: "onboarding",
            amountInPaise: totalInPaise,
            periodLabel: isPrepaymentStyle
              ? "Admission · Pre-payment & items"
              : isTerm ? "Admission · Full course fee & items" : "Admission payment",
            dueDate: new Date().toISOString().slice(0, 10),
          });
          await db.collection(FEE_PAYMENTS_COLLECTION).doc(feeId).set({
            status: "paid",
            paymentMethod,
            breakdown: breakdownRows,
            ...(isPrepaymentStyle ? { prepayment: true } : {}),
            ...paymentProofFields,
            approvedBy: decoded.uid,
            approvedAt: FieldValue.serverTimestamp(),
            paidAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }

        // 5. First-month-free: pre-create that month fee doc as waived so the
        //    cron/self-heal never bill it (no billing-math changes needed).
        if (!isTerm && fees.firstMonthFree === true) {
          try {
            const freeMonthKey = courseStudentType === "new" ? addMonths(joinMonthKey, 1) : joinMonthKey;
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
            warnings.push(`Could not pre-waive the free month for ${course.className} — waive it manually in Fee Collections.`);
          }
        }

        // 5b. Next charge (monthly): the admin set an explicit next-charge date,
        //     so pre-create that month pending due with dueDate = that date.
        //     This is what the parent sees as a Pay button AND what the reminder
        //     cron nudges (req 7/8). Skipped if the month is already settled.
        if (!isTerm && adminNextChargeDate) {
          try {
            const dueMonthKey = adminNextChargeDate.slice(0, 7);
            const dueRef = db.collection(FEE_PAYMENTS_COLLECTION).doc(buildFeePaymentId(enrollmentId, dueMonthKey));
            if (!(await dueRef.get()).exists) {
              await dueRef.set({
                ...buildFeePaymentSeed(enrollmentRecord, dueMonthKey),
                dueDate: adminNextChargeDate,
                status: "pending",
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
              }, { merge: true });
            }
          } catch (dueError) {
            console.error("Onboarding: next-charge due creation failed", dueError);
            warnings.push(`Could not create the next-charge due for ${course.className} — add it from Fee Collections.`);
          }
        }
      } catch (courseError) {
        console.error("Onboarding: course approval failed", course.classId, courseError);
        warnings.push(`Could not set up "${course.className || course.classId}" — re-run Approve to retry just that class.`);
      }
    }

    if (createdEnrollmentIds.length === 0 && !alreadyIssued) {
      sendError(response, 500, `Could not set up any class for this student. ${warnings.join(" ")}`.trim());
      return;
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

    const allEnrollmentIds = courseUpdates.map((course) => course.enrollmentId).filter(Boolean);
    await studentRef.set({
      studentId,
      userUid: uid,
      // Every class, each carrying its own enrollment id.
      courses: courseUpdates,
      enrollmentIds: allEnrollmentIds,
      // Legacy singular mirror — courses[0] — so existing readers keep working.
      enrollmentId: courseUpdates[0]?.enrollmentId || "",
      // Whether approval CREATED this auth account (vs. reusing an existing
      // user) — the danger-zone delete uses it to decide if the login goes too.
      // Only written when this run actually touched the login: re-approving to
      // add a class must NOT flip a stored `true` back to false, or the delete
      // would leave the Auth account orphaned.
      ...(alreadyIssued ? {} : { authUserCreated: createdUser }),
      onboardingStatus: "approved",
      paidVia: paidVia || (paymentMethod === "cash" ? "counter" : paymentMethod === "upi" ? "qr" : "razorpay"),
      active: true,
      rejectReason: FieldValue.delete(),
      approvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    sendJson(response, 200, {
      ok: true,
      studentId,
      uid,
      enrollmentId: courseUpdates[0]?.enrollmentId || "",
      enrollmentIds: allEnrollmentIds,
      credentials,
      warnings,
    });
  } catch (error) {
    console.error("Unable to approve onboarding", error);
    const code = errorCode(error);
    if (code === "auth/email-already-exists") { sendError(response, 409, "That email is already in use by another account."); return; }
    if (code.startsWith("auth/")) { sendError(response, 401, "Authentication error while approving the onboarding."); return; }
    sendError(response, 500, error instanceof Error ? error.message : "Unable to approve the onboarding.");
  }
}
