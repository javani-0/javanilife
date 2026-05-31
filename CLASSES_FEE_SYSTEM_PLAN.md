# Classes — Monthly Fee Collection & Autopay System (Implementation Plan)

> **Purpose of this document:** A complete, codebase-grounded build plan for a new
> **"Classes"** module that collects **monthly tuition fees** with **autopay**, notifies
> parents + admin on every debit, sends a **5-day pre-debit reminder**, and gives the
> admin a clear **"who-paid-which-month / pending"** view.
>
> This file is written so another AI agent (or developer) can implement it phase by phase
> without re-discovering the codebase. Follow the phases in order.

---

## 1. Requirement summary (what we are building)

A school/academy runs **classes** that students attend and pay for **every month**.

1. A **parent** signs in, enrols a student, and provides:
   `student name, age, gender, parent name, phone number, address`.
2. The parent **pays the monthly fee** and can enable **autopay** — after a one-time
   mandate authorisation, the fee is **debited automatically each month**.
3. On **every successful debit**, the **parent and admin are both notified**
   (WhatsApp + web push).
4. **5 days before** the next due date, the **parent** receives a reminder
   ("On `<date>`, ₹`<amount>` will be auto-debited for `<student>`'s `<class>` fee").
5. The **admin** sees, per month, **who paid, who is pending, who failed/overdue**,
   total collected, and can **manually mark cash payments / waive a month**.

---

## 2. Key architectural decisions (recommended — confirm before building)

| # | Decision | Recommendation | Why |
|---|----------|----------------|-----|
| D1 | New module vs extend `Courses` | **New `Classes` module** (parallel to Courses) | Courses are *one-time / installment* purchases via the cart. Classes are *recurring monthly* with enrolment + autopay. Mixing them into the cart/order model would be messy. |
| D2 | Autopay engine | **Razorpay Subscriptions** (e-mandate / UPI AutoPay / card / eNACH) | This is the only proper "money debited automatically" flow in India. Razorpay auto-charges each cycle and fires a `subscription.charged` webhook. |
| D3 | Parent account required? | **Yes — parent must sign in** (reuse existing `AuthContext`) | Mirrors the existing orders flow; ties enrolments + autopay to a Firebase `uid`; lets parent manage/cancel autopay and view history. |
| D4 | Non-autopay parents | **Allow "Pay manually each month"** (one-time Razorpay order per month) | Some parents won't authorise a mandate. Same fee ledger handles both; UI shows a "Pay Now" button. |
| D5 | Fee ledger storage | **Top-level `feePayments` collection**, one doc per `(enrollment, month)` | Enables cross-student admin queries ("everyone pending in June") with composite indexes. Doc id `=` `${enrollmentId}_${monthKey}` for idempotency. |
| D6 | Notification channels | **WhatsApp template + FCM web push**, to parent **and** admin | Reuses the proven `api/orders/notify.ts` engine (`sendWhatsAppTemplate`, `sendWebPush`, `collectAdminTokens`). |

> ⚠️ **Compliance / Razorpay constraints to be aware of (D2):**
> - **Subscriptions/Recurring must be activated** on the Razorpay account (Dashboard → Subscriptions). Not on by default.
> - **RBI e-mandate auto-debit cap:** transactions **above ₹15,000** require an Additional Factor of Authentication (AFA / OTP) **on every charge** — so true "silent" autopay only works for fees **≤ ₹15,000/month**. Most class fees are well under this; surface a warning in admin if a class fee exceeds the cap.
> - **RBI pre-debit notification:** Razorpay **automatically** sends a mandatory pre-debit notice ~24h before each auto-charge. **Our 5-day reminder (requirement #4) is an *additional* business reminder we build ourselves** via cron — it does not replace Razorpay's.

---

## 3. Current codebase — what we reuse (reference map)

| Concern | Existing file to copy/extend | Notes |
|---------|------------------------------|-------|
| Firebase client | [src/lib/firebase.ts](src/lib/firebase.ts) | `db`, `auth`, messaging already exported. |
| Firebase Admin (server) | [api/_lib/firebase-admin.ts](api/_lib/firebase-admin.ts) | `getFirebaseAdminDb/Auth/Messaging`, `FieldValue`. |
| Razorpay server client + signature | [api/_lib/razorpay.ts](api/_lib/razorpay.ts) | `createRazorpayClient()`, `verifyRazorpaySignature()`. Add subscription/plan helpers here. |
| Create one-time order | [api/razorpay/create-order.ts](api/razorpay/create-order.ts) | Template for `create-fee-order.ts` (manual monthly pay). |
| Webhook (HMAC verify + raw body) | [api/razorpay/webhook.ts](api/razorpay/webhook.ts) | Extend to handle `subscription.*` events. **Critical: raw-body read pattern + idempotency are already solved here — copy them.** |
| HTTP helpers | [api/_lib/http.ts](api/_lib/http.ts) | `requirePost`, `getBearerToken`, `readJsonBody`, `sendJson`, `sendError`. |
| Notification engine (WA + push, parent+admin) | [api/orders/notify.ts](api/orders/notify.ts) | Reuse `collectUserTokens`, `collectAdminTokens`, `sendWebPush`, `getAdminWhatsAppNumber`, `createAbsoluteLink`. Factor shared bits into `api/_lib/notify.ts`. |
| WhatsApp Cloud API | [api/_lib/whatsapp.ts](api/_lib/whatsapp.ts) | `sendWhatsAppTemplate({ to, templateName, params, urlSuffix })`. |
| Cron auth + reminder loop | [api/cron/course-installments.ts](api/cron/course-installments.ts) | Template for `api/cron/class-fee-reminders.ts` (`CRON_SECRET`, poll limit, per-doc reminder marking). |
| Cron registration | [vercel.json](vercel.json) `crons[]` | Add the daily class-fee cron here. |
| Money formatting / parsing | [src/lib/ecommerce/pricing.ts](src/lib/ecommerce/pricing.ts) | `formatPaiseAsRupees`, `parsePriceToPaise`. **All amounts stored in paise (integers).** |
| Admin shell + nav | [src/components/admin/AdminLayout.tsx](src/components/admin/AdminLayout.tsx) | Add nav items; copy an existing admin page (e.g. [AdminOrders.tsx](src/pages/admin/AdminOrders.tsx)) for table/filter patterns. |
| Admin route protection | [src/components/admin/ProtectedRoute.tsx](src/components/admin/ProtectedRoute.tsx) + `App.tsx` | Add new admin routes under the existing `/admin` element. |
| Parent account pages | [src/pages/account/Orders.tsx](src/pages/account/Orders.tsx) + `AccountRoute` | Template for `/account/classes`. |
| Auth + role | [src/contexts/AuthContext.tsx](src/contexts/AuthContext.tsx) | `useAuth()` → `user`, `userProfile.role`. `user.getIdToken()` for API calls. |
| Firestore security | [firestore.rules](firestore.rules) | `isAdmin()`, `isOwner()`, owner-scoped collection rules — extend for new collections. |
| Indexes | [firestore.indexes.json](firestore.indexes.json) | Add composite indexes for `feePayments`. |
| Course catalog pattern | [src/lib/ecommerce/courses.ts](src/lib/ecommerce/courses.ts) + [AdminCourses.tsx](src/pages/admin/AdminCourses.tsx) | Template for `classes.ts` catalog + `AdminClasses.tsx`. |

> **House conventions to follow:** amounts in **paise** (integer); WhatsApp template names read via `getWhatsAppEnvValue("WHATSAPP_X", getWhatsAppEnvValue("VITE_WHATSAPP_X", "default"))`; server endpoints verify the Firebase ID token; webhooks/crons authenticate via shared secret; Firestore writes that touch money happen **server-side via Admin SDK** (which bypasses rules).

---

## 4. Data model (Firestore)

All new collections are top-level. **All money fields are integers in paise.**

### 4.1 `classes/{classId}` — class catalog (admin-managed)
```ts
interface ClassDoc {
  name: string;                 // "Carnatic Vocals — Level 1"
  description?: string;
  image?: string;
  category?: string;            // optional, reuse course categories if useful
  facultyId?: string;           // optional link to faculty collection
  facultyName?: string;
  schedule?: string;            // "Mon & Wed, 6–7 PM" (free text or structured later)
  ageGroup?: string;            // "8–14 yrs"
  monthlyFeeInPaise: number;    // e.g. 250000 = ₹2,500
  billingDayOfMonth: number;    // due day, e.g. 5  (1–28 to avoid month-length issues)
  active: boolean;
  razorpayPlanId?: string;      // created lazily when first needed (period=monthly)
  seatsTotal?: number;          // optional capacity
  seatsTaken?: number;          // optional, maintained on enrol
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 4.2 `enrollments/{enrollmentId}` — one student enrolled in one class
```ts
interface EnrollmentDoc {
  // --- student (requirement data) ---
  student: { name: string; age: number; gender: "male" | "female" | "other" };
  // --- parent (payer) ---
  parent: {
    name: string;
    phone: string;             // E.164-ish; sanitized to 91XXXXXXXXXX server-side
    whatsappNumber?: string;
    address: string;           // full address (free text or structured)
  };
  parentUserId: string;        // Firebase uid of the signed-in parent

  classId: string;
  className: string;           // denormalized
  monthlyFeeInPaise: number;   // snapshot at enrol time (so fee changes don't rewrite history)
  billingDayOfMonth: number;
  startMonthKey: string;       // "2026-06"

  status: "pending" | "active" | "paused" | "cancelled";

  autopay: {
    enabled: boolean;
    method?: "upi" | "card" | "emandate";
    razorpaySubscriptionId?: string;
    razorpayCustomerId?: string;
    mandateStatus?: "created" | "authenticated" | "active" | "halted" | "cancelled";
    nextChargeAt?: string;     // ISO; mirrored from Razorpay subscription
    authorizedAt?: Timestamp;
    shortUrl?: string;         // Razorpay-hosted auth page (fallback)
  };

  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 4.3 `feePayments/{enrollmentId}_{monthKey}` — the monthly ledger (one per student per month)
```ts
interface FeePaymentDoc {
  enrollmentId: string;
  classId: string;
  className: string;           // denormalized for admin table
  parentUserId: string;
  studentName: string;         // denormalized for admin table
  parentName: string;
  parentPhone: string;

  monthKey: string;            // "2026-06"  (sortable)
  periodLabel: string;         // "June 2026"
  amountInPaise: number;
  dueDate: string;             // ISO date (billingDayOfMonth of that month)

  status: "pending" | "processing" | "paid" | "overdue" | "failed" | "waived";
  paymentMethod?: "autopay" | "manual" | "cash";

  razorpaySubscriptionId?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  paidAt?: Timestamp;

  reminders?: { preDebitSentAt?: string; preDebitMonthKey?: string; count?: number };
  notifiedParentAt?: Timestamp;
  notifiedAdminAt?: Timestamp;
  adminNote?: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

> **Idempotency rule:** the doc id is **`${enrollmentId}_${monthKey}`**. The webhook and the
> cron both `set(..., { merge: true })` on this deterministic id, so a duplicate
> `subscription.charged` or a re-run cron can never create a second record or double-count.

### 4.4 Firestore composite indexes (add to `firestore.indexes.json`)
- `feePayments`: `(classId ASC, monthKey DESC)` — admin per-class monthly view
- `feePayments`: `(monthKey ASC, status ASC)` — "everyone pending in June"
- `feePayments`: `(parentUserId ASC, monthKey DESC)` — parent dashboard
- `feePayments`: `(status ASC, dueDate ASC)` — cron: find due/overdue
- `enrollments`: `(parentUserId ASC, createdAt DESC)` and `(status ASC, classId ASC)`

---

## 5. Payment & autopay flows

### 5.1 Enrolment + autopay setup (parent, one-time)
```
Parent (signed in)
  → /classes  → pick a class  → "Enrol" form (student + parent details)
  → choose: [Autopay (recommended)]  or  [Pay manually each month]
  → client creates enrollments/{id} (status: pending)         [Firestore, rules-checked]
  → if Autopay:
      POST /api/razorpay/create-subscription  (Bearer idToken, { enrollmentId })
        ↳ server: ensure class has a razorpayPlanId (create monthly Plan if missing)
        ↳ server: create Razorpay Customer (or reuse) + Subscription against plan
        ↳ server: write autopay.{razorpaySubscriptionId, customerId, shortUrl} to enrollment
        ↳ returns { subscriptionId, keyId }
      → client opens Razorpay Checkout with { subscription_id }  → parent authorises mandate
      → Razorpay fires subscription.authenticated / subscription.activated (webhook)
        ↳ enrollment.autopay.enabled = true, mandateStatus = active, status = active
      → first charge happens per Razorpay cycle → subscription.charged (see 5.3)
  → if Manual:
      enrollment.status = active; first month feePayment created as "pending";
      parent taps "Pay Now" → 5.2
```

### 5.2 Manual monthly payment (parent, each month)
```
Parent → /account/classes → sees a "pending" feePayment → "Pay Now"
  → POST /api/razorpay/create-fee-order (Bearer idToken, { feePaymentId })
      ↳ server validates the fee doc belongs to this parent + amount; creates Razorpay order
        with notes { feePaymentId, enrollmentId, kind: "class-fee" }
  → client opens Razorpay Checkout (one-time)  → pays
  → webhook payment.captured (notes.kind == "class-fee") → mark feePayment paid + notify (5.4)
```

### 5.3 Autopay recurring charge (automatic, monthly)
```
Razorpay auto-debits on the plan cycle
  → webhook subscription.charged
      ↳ derive monthKey from the charge period
      ↳ feePayments/{enrollmentId}_{monthKey}.set({ status: "paid", paymentMethod: "autopay",
         razorpayPaymentId, paidAt }, { merge: true })   ← idempotent
      ↳ enrollment.autopay.nextChargeAt = subscription.charge_at (from payload)
      ↳ trigger notifications (5.4)
  → webhook payment.failed / subscription.pending / subscription.halted
      ↳ mark feePayment "failed"; enrollment.autopay.mandateStatus = "halted"
      ↳ notify parent + admin (failure template)
```

### 5.4 Notifications (on every successful debit)
Reuse the `api/orders/notify.ts` engine. Because webhooks/crons have **no user idToken**,
factor the channel helpers into `api/_lib/notify.ts` and call them directly server-side.

- **Parent:** WhatsApp `class_fee_paid_parent` + web push → "₹2,500 received for Aarav's Carnatic Vocals (June 2026)."
- **Admin:** WhatsApp `class_fee_paid_admin` + web push (to all `users.role == "admin"` tokens) → "Aarav · Carnatic Vocals · ₹2,500 · June 2026 · paid by <parent>."

### 5.5 5-day pre-debit reminder (cron, daily)
```
api/cron/class-fee-reminders  (schedule: "0 4 * * *", Bearer CRON_SECRET)
  Step A — Roll the schedule forward:
    for each enrollment with status "active":
      ensure a feePayments doc exists for the current/next billing month
      (set with merge on deterministic id; never duplicates)
  Step B — Send 5-day reminders:
    query feePayments where status == "pending"/"processing"
      and dueDate is exactly 5 days from today and reminders.preDebitMonthKey != thisMonthKey
    → send WhatsApp class_fee_reminder + web push to parent
    → mark reminders.preDebitSentAt / preDebitMonthKey / count
  Step C — Mark overdue:
    feePayments where status == "pending" and dueDate < today  → status "overdue" → notify
```

---

## 6. Server endpoints to build (`api/`)

| File | Method | Auth | Responsibility |
|------|--------|------|----------------|
| `api/_lib/razorpay-subscriptions.ts` | — | — | `ensureClassPlan(classId)`, `createSubscription()`, `cancelSubscription()`, `pauseSubscription()`, `getSubscription()`. Wraps the `razorpay` SDK. |
| `api/_lib/notify.ts` | — | — | Extract `collectUserTokens`, `collectAdminTokens`, `sendWebPush`, `getAdminWhatsAppNumber`, `createAbsoluteLink` from `orders/notify.ts` so webhooks/crons can reuse them. Add `sendClassFeeNotifications({...})`. |
| `api/_lib/class-fees.ts` | — | — | Pure helpers: `monthKeyFor(date)`, `periodLabel(monthKey)`, `dueDateFor(monthKey, billingDay)`, `buildFeePaymentId(enrollmentId, monthKey)`, `collectDueReminders(docs, now)`. **Unit-test this (see §10).** |
| `api/razorpay/create-subscription.ts` | POST | Firebase idToken (parent) | Validate enrollment ownership; ensure plan; create customer + subscription; persist ids; return `{ subscriptionId, keyId }`. Model on `create-order.ts`. |
| `api/razorpay/create-fee-order.ts` | POST | Firebase idToken (parent) | Manual monthly pay: validate fee doc ownership + amount; create Razorpay order with `notes.kind="class-fee"`; return `{ orderId, keyId, amount }`. |
| `api/razorpay/cancel-subscription.ts` | POST | Firebase idToken (parent) **or** admin | Cancel/pause the mandate; update enrollment.autopay. |
| `api/razorpay/webhook.ts` (extend) | POST | HMAC `x-razorpay-signature` | Add `subscription.authenticated/activated/charged/pending/halted/cancelled` + extend `payment.captured` to detect `notes.kind=="class-fee"`. **Keep the existing raw-body read + `timingSafeEqual` verify.** |
| `api/classes/notify.ts` | POST | Firebase idToken (admin or owner) | Manual re-send / admin-triggered notification for a fee (optional but handy). |
| `api/cron/class-fee-reminders.ts` | GET/POST | `Bearer CRON_SECRET` | Roll schedule + 5-day reminders + overdue marking (see 5.5). Model on `cron/course-installments.ts`. |

> **Webhook event subscriptions** to enable in the Razorpay dashboard:
> `subscription.authenticated`, `subscription.activated`, `subscription.charged`,
> `subscription.pending`, `subscription.halted`, `subscription.cancelled`,
> plus existing `payment.captured`, `payment.failed`.

---

## 7. Client data layer (`src/lib/classes/`)

| File | Exports |
|------|---------|
| `src/lib/classes/types.ts` | `ClassDoc`, `EnrollmentDoc`, `FeePaymentDoc`, status unions, `monthKey` helpers (shared with `api/_lib/class-fees.ts` logic — keep them in sync). |
| `src/lib/classes/classes.ts` | `listActiveClasses()`, `getClass(id)`, admin `upsertClass()`, `setClassActive()`. Mirror `courses.ts`. |
| `src/lib/classes/enrollments.ts` | `createEnrollment(data)`, `listMyEnrollments(uid)`, `listEnrollmentsAdmin(filters)`, `pauseEnrollment()`, `cancelEnrollment()`. |
| `src/lib/classes/fees.ts` | `listMyFees(uid)`, `listFeesAdmin({ monthKey, classId, status })`, `markFeeCash(feeId)` (admin), `waiveFee(feeId)` (admin), formatting helpers. |
| `src/lib/classes/subscriptions.ts` | `createSubscription(idToken, enrollmentId)`, `openSubscriptionCheckout({ subscriptionId, keyId, prefill })`, `cancelSubscription(...)`. Reuse `loadRazorpayCheckout()` from [payments.ts](src/lib/ecommerce/payments.ts) (extract the script loader so both order + subscription checkout share it). |
| `src/lib/classes/notificationClient.ts` | thin POST wrapper to `/api/classes/notify` (model on [notificationClient.ts](src/lib/ecommerce/notificationClient.ts)). |

> Razorpay Checkout accepts `subscription_id` **instead of** `order_id` for mandate setup —
> extend the existing `RazorpayCheckoutOptions` type accordingly.

---

## 8. UI / pages & routes

### 8.1 Parent / public (add routes in `App.tsx`, eager or lazy)
| Route | Component | What it does |
|-------|-----------|--------------|
| `/classes` | `src/pages/Classes.tsx` | Browse active classes (cards: name, schedule, monthly fee, "Enrol"). Model on [Courses.tsx](src/pages/Courses.tsx). |
| `/classes/:id` | `src/pages/ClassDetail.tsx` | Class details + **Enrol form** (student name/age/gender, parent name/phone/whatsapp/address) + choice of **Autopay** or **Pay manually**. Use `react-hook-form` + `zod` (already in deps). Requires sign-in (redirect to `/login` like checkout). |
| `/account/classes` | `src/pages/account/Classes.tsx` (wrap in `AccountRoute`) | Parent dashboard: enrolled students, autopay status, **upcoming due** (with date + amount), **payment history** (paid/pending/overdue), **Pay Now** for pending, **Manage autopay** (cancel/pause). Model on [account/Orders.tsx](src/pages/account/Orders.tsx). |

Also add a **"Classes"** link to the public `Navbar` and a **"My Classes"** entry to the account menu.

### 8.2 Admin (add routes under existing `/admin` element in `App.tsx`; add nav in `AdminLayout.tsx`)
| Route | Component | What it does |
|-------|-----------|--------------|
| `/admin/classes` | `src/pages/admin/AdminClasses.tsx` | CRUD class catalog: name, fee, schedule, billing day, faculty, active. Warn if `monthlyFeeInPaise > ₹15,000` (autopay AFA caveat). Model on [AdminCourses.tsx](src/pages/admin/AdminCourses.tsx). |
| `/admin/enrollments` | `src/pages/admin/AdminEnrollments.tsx` | List all enrolled students: student, class, parent contact, autopay on/off + mandate status, monthly fee, status. Search/filter by class + status. Add/edit/pause/cancel. Open detail drawer. |
| `/admin/fee-collections` | `src/pages/admin/AdminFeeCollections.tsx` | **The core requirement view.** Month selector (default current). Table of students × payment status for that month (Paid / Pending / Overdue / Failed / Waived), with paid date + method. Filter by class & status. **Totals: collected / pending / overdue.** Actions: **Mark Cash Paid**, **Waive month**, **Re-send reminder**. CSV export. |

Suggested lucide icons (already used in repo): `GraduationCap` (Classes), `Users`/`UserCheck` (Enrollments), `Wallet`/`IndianRupee`/`CalendarCheck` (Fee Collections).

### 8.3 Admin dashboard tiles (optional, [AdminDashboard.tsx](src/pages/admin/AdminDashboard.tsx))
Add cards: **This month — collected vs pending**, **Active autopays**, **Overdue count**.

---

## 9. Firestore security rules (add to `firestore.rules`)

```
// Class catalog — public read, admin write
match /classes/{id} {
  allow read: if true;
  allow write: if isAdmin();
}

// Enrollments — parent owns their student records; admin full access
match /enrollments/{id} {
  allow read:   if isAdmin() || (signedIn() && resource.data.parentUserId == request.auth.uid);
  allow create: if signedIn() && request.resource.data.parentUserId == request.auth.uid;
  // parent may only edit a safe subset; status/autopay/fee transitions go through admin or server
  allow update: if isAdmin()
                || (signedIn() && resource.data.parentUserId == request.auth.uid
                    && request.resource.data.parentUserId == request.auth.uid);
  allow delete: if isAdmin();
}

// Fee ledger — parent reads own; ALL writes are server-side (Admin SDK) or admin console
match /feePayments/{id} {
  allow read:  if isAdmin() || (signedIn() && resource.data.parentUserId == request.auth.uid);
  allow write: if isAdmin();   // webhook/cron use Admin SDK which bypasses rules
}
```
> Deploy with the existing flow in [DEPLOY_FIRESTORE_RULES.md](DEPLOY_FIRESTORE_RULES.md).
> Money-bearing writes (`paid`, amounts) must **only** come from the server (webhook/cron via Admin SDK) or an authenticated admin — never trust a client write for payment status.

---

## 10. Environment variables (add to `.env.example` and Vercel)

```ini
# --- Classes / fee autopay (Razorpay Subscriptions reuse existing RAZORPAY_KEY_ID/SECRET) ---
RAZORPAY_WEBHOOK_SECRET=replace_me            # required for webhook (subscription + payment events)

# Class fee WhatsApp templates (create these in Meta Business Manager)
VITE_WHATSAPP_CLASS_FEE_REMINDER_TEMPLATE=class_fee_reminder
WHATSAPP_CLASS_FEE_REMINDER_TEMPLATE=class_fee_reminder
VITE_WHATSAPP_CLASS_FEE_PAID_PARENT_TEMPLATE=class_fee_paid_parent
WHATSAPP_CLASS_FEE_PAID_PARENT_TEMPLATE=class_fee_paid_parent
VITE_WHATSAPP_CLASS_FEE_PAID_ADMIN_TEMPLATE=class_fee_paid_admin
WHATSAPP_CLASS_FEE_PAID_ADMIN_TEMPLATE=class_fee_paid_admin
VITE_WHATSAPP_CLASS_FEE_FAILED_TEMPLATE=class_fee_failed
WHATSAPP_CLASS_FEE_FAILED_TEMPLATE=class_fee_failed

# Cron tuning
CLASS_FEE_REMINDER_DAYS=5                      # days before due date to remind
CLASS_FEE_REMINDER_LIMIT=100                   # max docs processed per cron run
# CRON_SECRET already exists and is reused.
```

**WhatsApp templates to create** (params are positional `{{1}}`, `{{2}}`, …; add a URL button that appends the fee/enrollment id, matching the existing `urlSuffix` pattern):
- `class_fee_reminder` → `parentFirstName, studentName, className, amount, dueDate`
- `class_fee_paid_parent` → `parentFirstName, studentName, className, amount, monthLabel`
- `class_fee_paid_admin` → `studentName, className, amount, monthLabel, parentName`
- `class_fee_failed` → `parentFirstName, studentName, className, amount, dueDate`

---

## 11. Cron registration (`vercel.json`)

Add to the existing `crons` array:
```json
{ "path": "/api/cron/class-fee-reminders", "schedule": "0 4 * * *" }
```
(Runs daily 04:00 UTC ≈ 09:30 IST — adjust as desired. It does roll-forward + 5-day reminders + overdue marking in one pass.)

---

## 12. Testing (match existing Vitest setup)

There are already `.test.ts` files (`installments.test.ts`, `paymentEligibility.test.ts`). Add:
- `api/_lib/class-fees.test.ts` — `monthKeyFor`, `dueDateFor`, `periodLabel`, `buildFeePaymentId`, and `collectDueReminders` (exactly-5-days-out logic, no duplicate after `preDebitMonthKey` set).
- `src/lib/classes/fees.test.ts` — status/format helpers, overdue derivation.
- Run with `npm run test`.

**Manual end-to-end (Razorpay test mode):**
1. Enable Subscriptions on a Razorpay **test** account; set `RAZORPAY_KEY_ID/SECRET` test keys + `RAZORPAY_WEBHOOK_SECRET`.
2. Enrol a student with autopay → authorise mandate with a Razorpay test card/UPI.
3. Use Razorpay's "charge now"/test cycle to trigger `subscription.charged`; confirm `feePayments` doc flips to `paid` and both notifications fire.
4. Trigger the cron manually (`curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/class-fee-reminders`) with a fee due in 5 days; confirm the reminder.
5. Simulate `payment.failed`; confirm overdue + failure notification.

---

## 13. Suggested build order (phases for the implementing agent)

> Ship in vertical slices; each phase is independently testable.

- **Phase 0 — Foundations:** add types (`src/lib/classes/types.ts`, `api/_lib/class-fees.ts`), Firestore rules, indexes, env vars. Write + pass `class-fees.test.ts`.
- **Phase 1 — Class catalog:** `classes.ts` + `AdminClasses.tsx` (+ nav/route). Admin can create classes with a monthly fee. Public `/classes` list.
- **Phase 2 — Enrolment (no payment yet):** `ClassDetail.tsx` enrol form + `enrollments.ts` + rules. `AdminEnrollments.tsx`. Student/parent data captured.
- **Phase 3 — Manual monthly pay:** `create-fee-order.ts`, extend webhook for `notes.kind="class-fee"`, fee ledger writes, `/account/classes` "Pay Now". Notifications on success (build `api/_lib/notify.ts` + `sendClassFeeNotifications`).
- **Phase 4 — Autopay (Subscriptions):** `razorpay-subscriptions.ts`, `create-subscription.ts`, subscription Checkout in client, webhook `subscription.*` handlers, autopay status in `/account/classes` + cancel/pause.
- **Phase 5 — Reminders + overdue:** `api/cron/class-fee-reminders.ts` + `vercel.json` cron. 5-day reminders, schedule roll-forward, overdue marking.
- **Phase 6 — Admin Fee Collections:** `AdminFeeCollections.tsx` (month matrix, filters, totals, mark-cash, waive, re-send, CSV export). Dashboard tiles.
- **Phase 7 — Hardening:** idempotency checks, amount validation, AFA (>₹15k) warning, refund/waiver paths, empty/edge states, accessibility, mobile.

---

## 14. Open questions to confirm with the business

1. **Fee range:** are any monthly class fees **above ₹15,000**? (If yes, autopay needs per-charge OTP — plan a manual-pay fallback for those classes.)
2. **Due day:** is the due date the **same calendar day every month** (e.g. the 5th), or **anniversary of enrolment**? (Affects `billingDayOfMonth` + plan cycle.)
3. **Proration:** if a student enrols mid-month, is the **first month prorated** or **full fee**?
4. **One parent, multiple students:** confirmed supported (one account → many enrollments). Any sibling discount?
5. **Cancellation policy:** can a parent cancel autopay anytime? Notice period? What happens to a pending month on cancel?
6. **Admin manual/cash entry:** should admins be able to record **offline cash** payments against a month (yes, included via "Mark Cash Paid")?
7. **Refunds:** who can refund a charged month, and through which UI?

---

### Appendix A — Why not reuse the existing course installment system?
The installment system ([installments.ts](src/lib/ecommerce/installments.ts)) is a **fixed 3-payment split (50/25/25) of a one-time course price** with **manual** payment + WhatsApp reminders. It is **not recurring** and has **no mandate/autopay**. Class fees are **open-ended monthly recurring** with **automatic debit**, which requires **Razorpay Subscriptions**. We reuse its *reminder-cron shape* and *notification plumbing*, but the domain model is new.

### Appendix B — Key Razorpay objects (mental model)
- **Plan** = a recurring price (period `monthly`, amount). One per class (created lazily, id stored on the class).
- **Subscription** = a parent's mandate against a plan. One per enrolment-with-autopay (id stored on the enrollment).
- **subscription.charged** = the monthly auto-debit succeeded → write a `paid` row in `feePayments` + notify.
- **Order** (existing) = used only for **manual** one-off monthly payments.
```
```

---

*Plan authored against the codebase as of branch `main`. All amounts in paise. Reuse existing Razorpay, WhatsApp, FCM, cron, and admin patterns wherever referenced above.*
