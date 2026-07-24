# JAVANI Student Portal — Design

**Date:** 2026-07-25
**Status:** Approved for implementation
**Supersedes nothing.** Extends `2026-07-17-student-manager-design.md`.

---

## 1. Goal

Two structural changes plus a full student portal:

1. **Multi-class enrollment** — one student may take several classes under one profile and one login.
2. **Transparent fee breakdown** — kit fee, book fee, uniform fee and every other line itemised in the final total, visible identically to admin and parent.
3. **Student portal** — dashboard, attendance & progress, live schedule & join links, fee-based access restriction, exam details & hall ticket, certificate viewing, assignment PDF submission.

### Locked decisions

| Decision | Choice |
|---|---|
| Multi-class billing | One login, one roll number; **per-class `EnrollmentDoc` + per-class fee ledger**; one combined pay link with per-class sections and one grand total |
| Access restriction | **Per-class lock** — only the defaulting class's content locks; fees/profile/dashboard/other classes stay open; auto-restores on payment; admin-configurable grace days (default 3) |
| Progress tracking | **Auto stats (attendance %, assignment completion) + staff-entered periodic progress reports** |
| Attendance / academics operator | **Admin + managers** via two new `MANAGER_PAGES` keys (`attendance`, `academics`). No new auth role. |

### Non-goals (explicitly out of scope)

- Exam **results**/marksheets — only exam details and hall tickets were requested.
- A separate Trainer/faculty auth role — `faculty` stays a website catalog (`src/lib/faculty.ts`).
- Cryptographic protection of certificates or recordings. View-only is UX friction, not DRM (§8.3).
- Merged/combined billing across classes; one-click class switching.

---

## 2. Current state (verified 2026-07-25)

- `students/{id}` is hard-bound to **one** class: `classId`, `className`, `slotId`, `slotLabel`, `trainerName`, `joiningDate`, `nextChargeDate`, `inventory`, `fees`, `methods`, `enrollmentId` are all singular (`src/lib/students/types.ts:80-116`).
- `api/_razorpay/approve-onboarding.ts:394` creates exactly one `EnrollmentDoc`; its idempotency guard is `studentId && userUid && enrollmentId` (line 205).
- Fee itemisation exists **only** on the admission fee doc (`FeePaymentDoc.breakdown[]`). Recurring monthly fees carry a bare `amountInPaise`.
- The admin student form has a live itemised "Payment link total" preview (`AdminStudents.tsx:1141-1172`) — rows, total, EMI schedule. It is **single-class only** and must become per-class sections plus a grand total.
- There is no faculty login role.
- `classes/{id}` is `allow read: if true` — `liveClassUrl`, `recordings` and `materials` are publicly readable.
- `AdminStudents.tsx` is 1189 lines.

---

## 3. Phase plan

Phases ship and are browser-tested in order. P0 is a prerequisite for everything.

| Phase | Scope |
|---|---|
| **P0** | Multi-class data model, N-enrollment approval, fee breakdown everywhere, admin form refactor |
| **P1** | Portal context, student dashboard, live schedule + gated join, per-class access lock |
| **P2** | Attendance + progress reports |
| **P3** | Assignments (PDF submit + staff review) |
| **P4** | Exams + hall tickets + certificates |

---

## 4. P0 — Multi-class enrollment

### 4.1 `StudentCourse`

New in `src/lib/students/types.ts`:

```ts
export type StudentCourseStatus = "active" | "dropped";

export interface StudentCourse {
  key: string;                 // stable local id; survives reorder/removal
  classId: string;
  className: string;
  slotId?: string;
  slotLabel?: string;
  trainerName?: string;
  joiningDate?: string;        // YYYY-MM-DD
  nextChargeDate?: string;     // YYYY-MM-DD
  inventory: StudentInventory; // kit/books/uniform, per class
  fees: StudentFeeSetup;       // per-class fee setup
  methods: StudentPaymentMethods;
  enrollmentId?: string;       // set when this course is approved
  status: StudentCourseStatus;
}
```

`StudentDoc` gains `courses: StudentCourse[]`, `enrollmentIds: string[]` and `accessOverrideUntil?: string` (YYYY-MM-DD — see §6.5). Every existing singular field is **retained**.

### 4.2 Backward compatibility (no migration script)

- `normalizeStudent` synthesises a single-entry `courses` array from the flat fields when `data.courses` is missing or empty. `key` for a synthesised entry is `"legacy"`.
- Every write mirrors `courses[0]` back into the flat fields (`classId`, `className`, `slotId`, `slotLabel`, `trainerName`, `joiningDate`, `nextChargeDate`, `inventory`, `fees`, `methods`, `enrollmentId`).
- `enrollmentIds` is the full list; `enrollmentId` stays `courses[0].enrollmentId`.

This keeps `StudentFeeCollections`, `AdminStudents` search/list, `adminLogs` captions, `setStudentActive` and `updateStudent`'s autopay/next-charge sync working unchanged. Consumers are migrated to `courses` incrementally, not in a big bang.

**Invariant:** `courses` is never empty for a valid student. Form validation requires at least one course.

### 4.3 Approval → N enrollments

`api/_razorpay/approve-onboarding.ts` changes:

- Read `student.courses` (server-side mirror of the same normalisation; single-entry fallback from flat fields).
- **Once per student:** roll number resolution, Auth user, `users/{uid}` doc, credentials, link publish.
- **Once per course** (loop, skipping any course with an existing `enrollmentId` or `status === "dropped"`):
  1. `EnrollmentDoc` — same shape as today, built from that course's fields.
  2. `countSlotSeatOnce`.
  3. Admission fee doc (`ensureCustomFeePayment`, suffix `onboarding`) marked paid, carrying **that course's** `breakdown[]`.
  4. EMI schedule → per-installment fee docs (term + emi), unchanged logic, scoped to the course.
  5. First-month-free waiver.
  6. Admin next-charge pending due.
- Write back `courses[i].enrollmentId` and `enrollmentIds`.
- Response returns `enrollmentIds: string[]` (keep `enrollmentId` = first, for existing callers).

**Idempotency moves from the student to the course.** Re-approving an already-approved student with a newly added course materialises only that course. This is the mechanism for adding a class later.

**Partial failure:** each course is materialised in its own try/catch; a failure pushes a `warnings[]` entry naming the class and leaves other courses intact. The admin re-runs approval to retry only the failed one.

### 4.4 Admin UI

`AdminStudents.tsx` (1189 lines) is decomposed — required, not optional, since a repeatable course editor would push it past 1500:

| New file | Responsibility |
|---|---|
| `src/components/admin/StudentForm.tsx` | Whole add/edit form: personal details, photo, roll number, course list, submit |
| `src/components/admin/StudentCourseEditor.tsx` | One course row — class picker, slot, track, fees, inventory, methods, dates. Add/Remove/Drop |
| `src/components/admin/StudentFeeSummary.tsx` | Breakdown preview (per-class sections + grand total). Shared render used by admin and pay link |

Behaviour:
- "Add another class" appends a course row; each row is independently collapsible.
- A course whose `enrollmentId` is set renders **read-only** for class/slot (changing the class of a live enrollment is not supported) with a "Drop class" action that sets `status: "dropped"` and pauses that enrollment.
- When an approved student has any course without an `enrollmentId`, the card shows **"Approve new classes (N)"**.
- The student list shows all class names (first + "+N more").

### 4.5 `delete-student.ts`

Must sweep **every** enrollment: query `feePayments` by each `enrollmentId`, delete each enrollment doc, then the link/credentials/users doc/Auth user/student doc as today.

---

## 5. P0 — Fee transparency

### 5.1 `src/lib/students/feeBreakdown.ts` (new, pure, unit-tested)

```ts
export interface CourseBreakdown {
  key: string;
  className: string;
  slotLabel?: string;
  rows: FeeBreakdownRow[];      // Kit fee / Books fee / Uniform fee / Course fee / Pre-payment / Discount
  subtotalInPaise: number;
  discountInPaise: number;
  totalInPaise: number;
  dueNowInPaise: number;        // EMI course → installment 1 only
  emiInstallments?: FeeBreakdownRow[];
  recurring?: { label: string; amountInPaise: number }; // "Then ₹X / month from <date>"
}

export interface StudentBreakdown {
  sections: CourseBreakdown[];
  grandTotalInPaise: number;
  dueNowInPaise: number;        // Σ section.dueNowInPaise
}

buildCourseBreakdown(course: StudentCourse): CourseBreakdown
buildStudentBreakdown(courses: StudentCourse[]): StudentBreakdown
```

Row-inclusion rules are carried over unchanged from the existing `buildFeeBreakdown` (kit/books/uniform always; term course fee for new **and** existing; monthly pre-payment for **new** only; discount clamped to subtotal). Only dropped courses are excluded. The existing `buildFeeBreakdown` is re-expressed in terms of `buildCourseBreakdown` so its 100+ existing tests keep passing.

The server mirror in `approve-onboarding.ts` (`buildOnboardingBreakdown`) is updated in lockstep — per project convention, client and server fee math are duplicated and **must be changed together**.

### 5.2 Where the breakdown appears

1. **Admin student form** — the existing single-class "Payment link total" block (`AdminStudents.tsx:1141-1172`) is replaced by `StudentFeeSummary`: one section per class, then a grand total and a "Due now" line when any course is on EMI. Existing behaviour retained — the zero-total note, the first-month-free note, and the EMI schedule (now per class).
2. **`/pay/:token`** — `OnboardingPay.tsx` renders `sections[]` instead of one flat `rows[]`; each class is a titled block with its own subtotal, then one grand total and one "Pay now" amount. `OnboardingLinkDoc` gains `sections: CourseBreakdown[]`; the existing `rows`/`totalInPaise` stay populated (flattened) for older links.
3. **Every `feePayments` doc** — `buildFeePaymentSeed` (server `api/_lib/fee-store.ts` + client mirror `src/lib/classes/fees.ts`) now writes a `breakdown[]` even for recurring monthly fees (single row, e.g. `"Monthly class fee — Bharatanatyam"`). This makes the parent's history and the admin ledger always render an itemised table rather than a bare number.
4. **Parent portal** — `account/Classes.tsx` history and the new dashboard fee card render `breakdown[]` for every fee, not just admission.

---

## 6. P1 — Portal shell

### 6.1 `StudentPortalContext`

`src/contexts/StudentPortalContext.tsx` — loads once for the signed-in uid and shares:

```ts
{
  loading: boolean;
  isStudent: boolean;              // has ≥1 enrollment
  enrollments: EnrollmentDoc[];
  classes: Record<string, ClassDoc>;
  feesByEnrollment: Record<string, FeePaymentDoc[]>;
  access: Record<string, ClassAccess>;   // keyed by enrollmentId
  refresh(): Promise<void>;
}
```

Six pages consume it, so none of them re-query. Enrollments are read with `where("parentUserId","==",uid)`; fees with `where("parentUserId","==",uid)` — both already permitted by existing rules.

### 6.2 Navigation

`AccountLayout`'s hardcoded `accountLinks` becomes dynamic. When `isStudent`, student links are shown **first**: Dashboard, My Classes, Attendance, Assignments, Exams, Certificates — followed by the existing shop links (Orders, Wishlist, Addresses), which stay because a parent may still buy products.

New routes (all `AccountRoute`-wrapped): `/account/dashboard`, `/account/attendance`, `/account/assignments`, `/account/exams`, `/account/exams/:examId/hall-ticket`, `/account/certificates`. `/account` redirects to `/account/dashboard` for students, `/account/profile` otherwise.

### 6.3 Dashboard (`src/pages/account/StudentDashboard.tsx`)

- Header: photo, name, roll number, parent, overall status chip.
- Access banner when any class is restricted.
- Stat tiles: Classes enrolled · Attendance % · Next fee due (amount, date, Pay) · Pending assignments · Next exam.
- **This week's schedule** strip — next sessions across all classes, each with its gated Join button.
- Per-class cards: name, trainer, slot, next session, fee-status chip, "Open class room", `LOCKED` badge when restricted.

### 6.4 Live schedule & join gating

`src/lib/portal/schedule.ts` (pure, unit-tested):

```ts
nextSessionsFor(cls: ClassDoc, slotLabel: string | undefined, from: Date, count: number): SessionOccurrence[]
isJoinOpen(session: SessionOccurrence, now: Date): boolean
```

Occurrences derive from the enrolled `slotLabel`'s days/times when the class defines `timeSlots`, else from `scheduleDays`/`scheduleStart`/`scheduleEnd`. Join opens **15 minutes before** start and closes **30 minutes after** end; outside that window the button is disabled and reads `Join opens at 6:00 PM`.

### 6.5 Access restriction

`src/lib/portal/access.ts` (pure, unit-tested):

```ts
computeClassAccess(input: {
  fees: FeePaymentDoc[]; enrollment: EnrollmentDoc;
  graceDays: number; today: string;
}): ClassAccess   // { locked, reason, overdueFee?, daysOverdue }
```

Rules:
- Locked when a fee for that enrollment has derived status `overdue`, **or** `pending` with `dueDate + graceDays < today`.
- **`waived`, `paid`, `failed` and `processing` never lock.** `processing` = UPI submitted, awaiting admin approval — locking there would punish a parent who has already paid.
- `paused`/`cancelled` enrollments are not locked by fees (they are simply inactive).
- Unlock is automatic: the fee flipping to `paid` clears it on next context load/refresh.

`graceDays` lives in `siteSettings/portal` (`accessGraceDays`, default 3), edited in Payment Settings. Admin override per student: `students/{id}.accessOverrideUntil` (YYYY-MM-DD) forces unlocked through that date.

Locked surfaces: class room content, assignments, exams/hall ticket, certificates for that class. Never locked: dashboard, fee payment, profile, other classes.

### 6.6 Content protection

`liveClassUrl`, `recordings` and `materials` move from the public `classes/{id}` doc into **`classContent/{classId}`** (`allow read: if signedIn()`, `allow write: if staffAny(['classes'])`). This stops anonymous scraping of the meet link from the public catalog. `AdminClasses` writes both docs; a read falls back to the legacy fields on `classes/{id}` when `classContent` is absent.

The **live join link** additionally resolves through a server action `class-join-link` on the existing `api/razorpay.ts` dispatcher (the repo is at the Vercel 12-function limit — no new top-level function files). It verifies the caller's enrollment and fee status server-side and returns the URL or `402`.

Recordings and materials remain client-gated only.

> **Stated limitation:** this is proportionate hardening, not airtight enforcement. A signed-in student under lock could still read `classContent` directly. Full per-student server enforcement (a server-maintained `studentAccess/{uid}` doc consulted by rules) was considered and rejected: it introduces a sync-consistency failure mode where a stale doc locks out a paying family, which is worse than the leak it prevents.

---

## 7. P2 — Attendance & progress

### 7.1 Collections

**`attendance/{enrollmentId}_{YYYY-MM-DD}`** — deterministic id prevents double-marking.

```
enrollmentId, classId, className, studentUid, studentName, studentId (roll),
date: "YYYY-MM-DD", status: "present"|"absent"|"late"|"excused",
sessionLabel?, note?, markedBy, markedAt
```

**`progressReports/{id}`**

```
enrollmentId, studentUid, classId, className, periodLabel ("July 2026" | "Term 1"),
grade?, skills: [{ name, rating 1-5 }], remarks, createdBy, publishedAt
```

Rules for both: `allow read: if staffAny(['attendance','academics','students']) || (signedIn() && resource.data.studentUid == request.auth.uid)`; `allow write: if staffAny(['attendance'])` (attendance) / `staffAny(['academics'])` (reports).

### 7.2 Admin — `/admin/attendance` (key `attendance`)

Pick class + slot + date → roster of active enrollments → Present/Absent/Late/Excused per student → **Save all** as one `writeBatch`. Re-opening a marked date loads and edits existing records. Secondary views: month grid per class, per-student history. All actions call `useAdminLog`.

### 7.3 Student — `/account/attendance`

Per-class attendance ring, month calendar of marked days, and the progress-report timeline.

`src/lib/portal/attendance.ts` (pure, unit-tested): `summarizeAttendance(records)` → `{ total, present, absent, late, excused, percent }`.

---

## 8. P3/P4 — Assignments, exams, certificates

### 8.1 Assignments

**`assignments/{id}`** — `classId, className, title, description, dueDate, attachmentUrl?, maxMarks?, active, createdBy, createdAt`. Read: `signedIn()`; write: `staffAny(['academics'])`. Assignment text is not sensitive; the student page filters to enrolled class ids.

**`assignmentSubmissions/{assignmentId}_{enrollmentId}`** — one submission per student per assignment; resubmit overwrites and resets `status` to `submitted`.

```
assignmentId, enrollmentId, studentUid, studentName, studentId, classId,
fileUrl, fileName, sizeBytes, submittedAt,
status: "submitted"|"reviewed"|"needs-revision",
marks?, feedback?, reviewedBy?, reviewedAt?
```

Rules — the student may create/update **only** their own row and **only** the submission fields:

```
allow read: if staffAny(['academics']) || (signedIn() && resource.data.studentUid == request.auth.uid);
allow create: if staffAny(['academics'])
  || (signedIn() && request.resource.data.studentUid == request.auth.uid
      && request.resource.data.status == 'submitted'
      && !request.resource.data.keys().hasAny(['marks','feedback','reviewedBy','reviewedAt']));
allow update: if staffAny(['academics'])
  || (signedIn() && resource.data.studentUid == request.auth.uid
      && request.resource.data.status == 'submitted'
      && request.resource.data.diff(resource.data).affectedKeys()
           .hasOnly(['fileUrl','fileName','sizeBytes','submittedAt','status','updatedAt']));
allow delete: if staffAny(['academics']);
```

Upload: **PDF only** (`file.type === "application/pdf"`), **≤ 10 MB**, Cloudinary `auto/upload` folder `assignments` — same helper pattern as `uploadPaymentProof`.

Student `/account/assignments`: Open / Submitted / Reviewed tabs, upload dialog, feedback + marks display. Locked classes hide their assignments behind the lock panel.

Admin `/admin/academics` → **Assignments** tab: create assignment, submission roster per assignment, open PDF, set status + marks + feedback.

### 8.2 Exams & hall tickets

**`exams/{id}`** — `classId, className, title, examDate, startTime, endTime, venue, mode: "online"|"offline", syllabus?, instructions: string[], hallTicketEnabled, createdBy, createdAt`. Read `signedIn()`; write `staffAny(['academics'])`.

No `examRegistrations` collection — eligibility is derived (active enrollment in the class + class not access-locked). The hall-ticket number is deterministic: `HT-{examId.slice(0,6).toUpperCase()}-{studentId}`.

`/account/exams` lists upcoming and past exams per class. `/account/exams/:examId/hall-ticket` renders a printable A4 layout — student photo, roll number, name, class, exam date/time/venue, instructions, and a QR of the ticket number via the existing `qrcode.react` dependency. **Download = `window.print()` → Save as PDF.** No new PDF dependency. Gated on `hallTicketEnabled && !locked`; otherwise an explanatory panel.

Admin `/admin/academics` → **Exams** tab: CRUD + a hall-ticket-enabled toggle.

### 8.3 Certificates

**`certificates/{enrollmentId}_{titleSlug}`** — `titleSlug` is the lowercased title with non-alphanumerics collapsed to `-` (e.g. `"Level 1 Completion"` → `level-1-completion`), so re-issuing the same certificate overwrites rather than duplicating.

```
enrollmentId, studentUid, classId, className, studentName, studentId,
title, issuedOn, certificateNumber, imageUrl, status: "issued"|"revoked",
issuedBy, createdAt
```

Read: `staffAny(['academics'])` or own `studentUid`. Write: `staffAny(['academics'])`.

`/account/certificates` — grid of issued certificates; click opens a **view-only modal**: image rendered, no download button, context menu suppressed, `user-select: none`, watermark overlay. Revoked certificates are hidden from the student.

Admin `/admin/academics` → **Certificates** tab: issue (Cloudinary upload, folder `certificates`), revoke.

> **Stated limitation:** view-only is friction, not protection. A screenshot or the browser network tab defeats it. This is documented rather than presented as a security control.

---

## 9. Cross-cutting

### 9.1 Manager pages

`src/lib/adminPages.ts` `MANAGER_PAGES` gains, after `students`:

```ts
{ key: "attendance", label: "Attendance",       path: "/admin/attendance" },
{ key: "academics",  label: "Exams & Academics", path: "/admin/academics" },
```

`AdminLayout` nav and `App.tsx` routes follow. No new role, no new rules helper — `staffAny()` and `ProtectedRoute` work as-is.

### 9.2 New pure modules (all with `.test.ts` siblings, per project convention)

- `src/lib/students/feeBreakdown.ts`
- `src/lib/portal/schedule.ts`
- `src/lib/portal/access.ts`
- `src/lib/portal/attendance.ts`

### 9.3 Firestore rules — **DEPLOY REQUIRED**

Seven new matches: `classContent`, `attendance`, `progressReports`, `assignments`, `assignmentSubmissions`, `exams`, `certificates`.

### 9.4 Conventions to honour

- Money in **paise**; format with `formatPaiseAsRupees`.
- Fee/finance math duplicated client (`src/lib`) + server (`api/_lib`) — **change both**.
- All confirms via `confirmDialog()`/`promptDialog()`, never `window.confirm`.
- All new admin mutations call `useAdminLog`.
- Mobile: `min-w-0` on grid children, `overflow-x-clip` (never `overflow-x-hidden`), scroll containers need `min-h-0` + `shrink-0` header.
- Measure overflow with `main.scrollWidth`, not `documentElement.scrollWidth`.

### 9.5 Verification per phase

`npm run build`, `npm run lint`, `npm test`, API `tsc`, then a real browser pass (Playwright) of the phase's flows at 375px and desktop. P0 additionally requires a full onboarding → approval → fee-ledger pass, because it touches the path every fee in the system hangs off.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| P0 touches the approval path all fees depend on | Additive model + `courses[0]` mirroring; per-course try/catch; full suite + live onboarding test before P1 |
| Client/server fee math drift | `feeBreakdown.ts` and `buildOnboardingBreakdown` changed in the same commit; shared test vectors |
| A parent locked out while their UPI proof is pending | `processing` and `waived` never lock; grace days; per-student `accessOverrideUntil` |
| `AdminStudents.tsx` growth | Decomposed into three components in P0 before course rows are added |
| Vercel 12-function limit | `class-join-link` routed through the existing `api/razorpay.ts` dispatcher; no new function files |
