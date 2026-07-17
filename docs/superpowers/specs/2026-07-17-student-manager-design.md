# Student Manager, Onboarding Payment Links & Parent Portal — Design

Date: 2026-07-17
Status: self-verified (autonomous session — user asked for plan → verify → implement → browser-test loop)

## Goal

The admin (not the parent) onboards students: fills a full profile + class + fee
breakdown, picks which payment options the parent may use, sends a WhatsApp
payment link, approves the payment, and the system then auto-generates a
Student ID (STU001…), creates the login (email + password = Student ID), and
shows the credentials on the same link. Parents log in to the existing site to
see their class(es), join the live class, watch recordings, download PDFs, and
pay monthly fees themselves.

## Core architectural decision

**Approval materializes a normal `EnrollmentDoc`.** The existing fee engine
(feePayments ledger, cron reminders, Fee Collections page, My Classes payments,
UPI approval queue, prepayment/arrears rules) then works unchanged for every
admin-onboarded student. The Student Manager is a wrapper for profile +
onboarding + credentials — not a parallel fee system.

## Data model (all money in paise)

### `students/{id}` — admin-only (staff page key `students`)
Personal: name, age, gender, email (login, required), phone, parentName,
parentRelation (father|mother|guardian), address, mode (offline|online).
Class: classId, className, slotId, slotLabel, track (monthly|term).
Inventory: { uniform, kit, books } booleans (received toggles).
Fees: studentType (new|existing), kitFeeInPaise, booksFeeInPaise,
uniformFeeInPaise, recurring fee (monthlyFeeInPaise or termFeeInPaise),
discountInPaise, firstMonthFree (boolean, monthly only).
Payment methods enabled for the link: { razorpay, qr, counter }.
Onboarding: linkToken, onboardingStatus
(awaiting-payment | payment-submitted | counter-chosen | paid-online |
approved | rejected), proofUrl/upiRef, rejectReason.
Issued: studentId ("STU001"), userUid, enrollmentId, credentialsSharedAt.
Status: active (inactive keeps history; maps enrollment → paused).

### `onboardingLinks/{token}` — public GET by unguessable token, list denied
Display snapshot for the public page: studentName, className, slotLabel,
feeBreakdown rows, totalInPaise, methods, status, rejectReason, and — after
approval — credentials { email, password } + portal URL. Kept in sync by the
Student Manager on save; parent-side writes go through the server only.

### `studentCredentials/{studentDocId}` — staff-only (same model as
partner/managerCredentials, per user's earlier explicit plaintext choice):
email, password (= studentId), studentId, name, whatsapp.

### `counters/studentIds` — server-only transaction { next } → STU001, STU002…

### `classes/{id}` new content fields (Class Manager)
liveClassUrl, recordings: [{ id, title, url }], materials: [{ id, title, url }].
Public-read like the rest of the class doc (links are cohort-shared anyway);
surfaced only inside the logged-in portal.

## Flows

1. **Create student** (admin): form saves `students` doc + mirrors the link doc
   with a fresh random token. WhatsApp button opens wa.me with a professional
   message + `${origin}/pay/${token}`.
2. **Parent pays** at `/pay/:token` (no login): live onSnapshot of the link doc.
   Shows ONLY the admin-enabled methods:
   - **Pay Online (Razorpay)** → server `onboarding-order` (amount from link
     doc) → Razorpay checkout → `onboarding-verify` (HMAC) → status paid-online.
   - **Pay Now (UPI QR)** → existing paymentSettings QR/UPI id + screenshot
     upload (Cloudinary) → server `onboarding-submit` → payment-submitted.
   - **Pay at Counter** → server `onboarding-submit` (counter) → counter-chosen.
3. **Approve** (staff w/ `students`): server `approve-onboarding`:
   - next STU id (transaction), create/reuse Auth user (guard: never touch
     admin/manager/partner accounts), set password = studentId,
     users/{uid} role "user".
   - create EnrollmentDoc: paymentPlan "manual" (monthly) or "full" (term),
     studentStatus new/existing → the proven prepayment/arrears rules apply;
     `autopayInvited: true` when the admin enabled the Razorpay option (the
     mandate itself must be authorized by the parent post-login — RBI/UPI
     mandates can't be set up on someone else's behalf).
   - firstMonthFree → write the free month's fee doc as `waived` (idempotent,
     deterministic id) so cron/self-heal never re-bill it.
   - record the onboarding payment as a paid fee doc `${enrollmentId}_onboarding`
     (method upi/cash/manual, proof attached) → shows in Fee Collections,
     Finance income, and the parent's history.
   - store credentials (collection + link doc), student doc → approved.
   - Reject path: status → awaiting-payment + reason (parent sees it live).
4. **Link after approval** shows credentials + "Open portal" (requirement:
   "the temporary payment link now contains the credentials" — expiry of the
   *payment* function is status-driven).
5. **Parent portal**: My Classes gains an **Open class** button per enrolment →
   `/account/classes/:enrollmentId` (owner-checked): Join Live Class,
   Recordings, Study Materials + quick fee status. Monthly payments/history
   stay on My Classes (already realtime for both parent and admin). New:
   **Enable autopay** CTA (reuses createSubscription/confirmSubscription) for
   monthly non-autopay enrolments whose class offers autopay.

## Server endpoints (folded into api/razorpay.ts — Hobby 12-fn limit)
`api/_razorpay/onboarding.ts`: actions onboarding-submit / onboarding-order /
onboarding-verify (token-capability, no auth) and
`api/_razorpay/approve-onboarding.ts` (staff `students`).

## Rules
students + studentCredentials: staffAny(['students']) (creds admin+students
staff); onboardingLinks: `get` public, `list` false, write staffAny(['students']);
MANAGER_PAGES + VALID_PAGES gain "students". Deploy firestore.rules.

## Files
New: src/lib/students/{types,students,onboarding,index}.ts (+ test),
src/pages/admin/AdminStudents.tsx, src/pages/OnboardingPay.tsx,
src/pages/account/ClassRoom.tsx, api/_razorpay/{onboarding,approve-onboarding}.ts.
Edited: classes types/lib + AdminClasses (content section), App.tsx routes,
AdminLayout nav, adminPages.ts, create-manager-login VALID_PAGES,
api/razorpay.ts, firestore.rules, account/Classes.tsx.

## Added beyond the letter of the request (and why)
- **Existing students with nothing to pay**: "Create login directly" path
  (skip the payment link) — the requirement hides pre-payment for them, so a
  zero-total link would be an empty page.
- **Enable-autopay from the portal**: real UPI mandates must be authorized by
  the payer, so the link's "Autopay (Razorpay)" collects the onboarding total
  online and the mandate is completed by the parent after first login.
- **Free-month = waived fee doc**: zero changes to the shared billing math
  (client+server duplicated) — the safest way to make cron/self-heal skip it.
- **Reject-with-reason** on proof review, mirroring the existing UPI queue UX.
