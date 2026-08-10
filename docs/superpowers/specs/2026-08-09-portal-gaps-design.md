# Student Portal gap closure — teacher access, academics reach, EMI mapping

Date: 2026-08-09 · Extends `2026-07-25-student-portal-design.md`

The client reported six problems with the Student Portal. This document records
what was actually wrong (verified against live production data before any code
was written) and the design that closes each gap.

## Verification (live Firestore, signed in as admin, 2026-08-09)

| # | Reported | Ground truth |
|---|---|---|
| 1 | No place to mark attendance | `/admin/attendance` exists and works. `attendance` = **0 docs**. There is **no teacher login**; the single manager account holds `fee-collections, gallery, coupons, orders, finance, students` — neither `attendance` nor `academics`. |
| 2 | Assignments don't reach students | Creation lives in `/admin/academics`, not Classes Manager. `assignments` = **0 docs**. Student page wiring is correct. |
| 3 | Exams empty | `/admin/academics` → Exams. `exams` = **0 docs**. |
| 4 | Certificates unclear | `/admin/academics` → Certificates. `certificates` = **0 docs**. |
| 5 | EMI tab empty / EMI on Classes tab | **Real code bug.** `/account/emi` queries only the e-commerce `orders` collection. Class EMI lives in `feePayments` as `${enrollmentId}_emi-N`. **6 enrolments** are on the EMI plan with 3–5 installment docs each; all render on the Classes tab. |
| 6 | Class resources invisible | Code path correct (writes both `classes` and `classContent`; reads fall back). **Data**: 3 of 5 classes have no content at all; **3 enrolments point at deleted class docs**. Fee lock is OFF (`siteSettings/portal` absent), so nothing is hidden by a lock. |

Firestore rules **are** deployed — every new collection read succeeded. The
collections are empty, not denied.

Two further latent bugs found while reading the code:

- `api/_razorpay/create-manager-login.ts` `VALID_PAGES` omits `attendance` and
  `academics`, so granting those to a manager is silently discarded server-side.
- Resources are only reachable via ClassRoom (`Open class`); the Classes list
  itself shows none of them, which is where the client looked.

## Decisions (user-approved)

1. **Teacher access** — a real `teacher` role with a focused portal, scoped to
   the classes assigned to that teacher. Not a bare manager grant.
2. **Academics placement** — class-scoped tabs *inside* Classes Manager **and**
   the existing cross-class pages, sharing one component set.
3. **Broken enrolments** — ship an admin repair tool; never guess a mapping.

## Phase 1 — EMI mapping and the Classes tab

`src/lib/portal/emi.ts` (new, pure, unit-tested) owns the installment rules
once: `emiInstallmentsOf(fees)` (the `_emi-N` docs in schedule order) and
`summarizeEmiPlan(fees)` → `{ installments, paidInPaise, totalInPaise,
remainingInPaise, paidCount, nextDue }`. Both `/account/emi` and
`/account/classes` read it, so the two views can never disagree.

**`/account/emi`** renders two sections:

1. *Class fee EMI* — one card per enrolment on an EMI plan, full installment
   list, Pay Now per pending row. Rail selection is unchanged from the Classes
   tab today: Razorpay when `enrollment.autopayInvited`, otherwise the manual
   UPI dialog.
2. *Course order EMI* — the existing `orders` query, unchanged.

The empty state appears only when both are empty.

**`/account/classes`** keeps ownership of enrolments and monthly fees. Its EMI
installment block collapses to a one-line summary with a link to
`/account/emi`, so exactly one screen can take an installment payment.

The enrolment card is restructured so the **course name is the headline** and
the student name a secondary pill. Schedule always renders: the enrolled slot
when present, else the class's weekly schedule via `resolveSchedule`, plus the
trainer. A **Class resources** strip shows Join Live / Recordings (n) /
Materials (n) inline, reading a new `contentByClassId` map added to
`StudentPortalContext` (one fetch per distinct class, alongside the class docs
it already loads).

## Phase 2 — Teacher role

`users/{uid}` gains `role: "teacher"` and `teacherClassIds: string[]`.

Teachers sign in through the existing `/admin/login`. `ProtectedRoute` gets a
teacher branch permitting only `/admin/attendance` and `/admin/academics`, and
`AdminLayout` renders a two-item nav with a "Teacher" badge. Every class picker
a teacher sees is filtered to `teacherClassIds`.

`api/_razorpay/create-manager-login.ts` is extended with `role`
(`manager` | `teacher`) and `classIds`, reusing its existing Auth-user
create/reset, admin guard and `managerCredentials` re-share path. Its
`VALID_PAGES` allowlist is corrected to include `attendance` and `academics`.

`firestore.rules` gains `isTeacher()` and `teacherOwnsClass(classId)`.
Teachers may read enrolments of their classes and write attendance,
assignments, submissions (review only), exams, certificates and progress
reports **only where the document's `classId` is one of theirs**. They get no
access to fees, students, finance or credentials.

## Phase 3 — Academics inside Classes Manager

`AdminAssignmentsPanel` and `AdminAttendancePanel` are extracted as
class-scoped components, matching the shape the Exams, Certificates and
Progress panels already have. `/admin/academics` and `/admin/attendance` become
thin wrappers: class picker plus panel.

Editing a class in Classes Manager exposes tabs — Details · Content ·
Attendance · Assignments · Exams · Certificates · Progress — with the class
already fixed, so a teacher never re-picks it. One component set, two entry
points; behaviour is identical in both.

## Phase 4 — Data repair

`findBrokenEnrollments(enrollments, classIds)` (pure, tested) drives an admin
banner listing enrolments whose `classId` has no class document. Each row gets
a class picker and, where the target class defines slots, a slot picker; saving
updates the enrolment and mirrors `classId`/`className` onto the student doc,
recorded in the activity log.

Classes Manager additionally warns per class when it has no live link, no
recordings and no materials — the actual reason three classes show nothing.

## Error handling

Every panel already degrades to an empty list on a denied or failed read
(`.catch(() => [])`). The teacher rules are additive, so an existing admin or
manager path cannot be narrowed by them. Firestore rejects `undefined`, so all
new optional fields are written with the `...(x ? { k: x } : {})` form.

## Testing

Pure modules (`emi.ts`, `findBrokenEnrollments`, teacher path helpers) get
Vitest coverage. The UI is verified in a real browser on `:8080` against
production Firebase. End-to-end proof of the assignment/exam/certificate
pipelines creates a record, confirms it in the student view, then deletes it.

## Deployment

`firestore.rules` must be redeployed after Phase 2 — teachers cannot write
anything until it is. Everything else is application code.
