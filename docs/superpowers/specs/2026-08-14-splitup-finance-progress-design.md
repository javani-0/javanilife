# Payment split-up, Finance sales detail, Portal fixes — design

**Date:** 2026-08-14 · **Branch:** `feat/splitup-finance-progress`
Answers the client's three reports: (1) payment links/messages don't show how a
multi-class total is divided, (2) Finance has no per-sale detail behind the
totals and partner payouts, (3) three Student Portal changes.

## Live-data findings (audited against production first)

Signed in as the admin and read production Firestore before designing:

| Fact | Consequence |
|---|---|
| 2 real multi-class students exist (`SAMVIDHA CHANDRAS`, `SHAGANTI POOJA`) | Req 1 is reproducible on a live pay link. |
| `onboardingLinks.sections[]` already carries per-class rows + totals | The pay PAGE has the data; the **WhatsApp message never used it** — that is the actual gap. |
| `progressReports`: **1 doc, valid `studentUid`**, rules + query correct | Req 3c is **not** a data or permission bug: the report is simply buried inside the "Attendance" page, which nobody opens. Discoverability fix, not a data fix. |
| `certificates`: 1 doc, already `revoked` | The client hit the missing "delete" on exactly this record. |
| Orders: `payment.method` ∈ {razorpay, cod}, `payment.status` ∈ {paid, cod-collected, partially-paid, …}; items carry `name` + `itemType` | Online vs offline is derivable per sale; item names are already stored. |
| Fees: `paymentMethod` ∈ {manual, upi, autopay, cash, undefined(38)} | `cash` = offline, the rest = online, unknown when absent. Never invent a method. |
| `manualIncome`: 0 docs | Safe to add an optional online/offline field with no migration. |
| 2 attendance rows point at a uid with no `users` doc | Pre-existing data drift — report to the user, do not silently "fix". |

## Req 1 — Payment split-up

**Goal:** a parent paying for N classes can see, on the link *and* in the
WhatsApp message, exactly how much of the total belongs to each class.

- New **pure** module `src/lib/students/paymentMessage.ts` owns the message text
  (no Firestore import → unit-testable). `buildPaymentLinkWhatsAppUrl` moves
  there and now takes the whole `StudentBreakdown` instead of a bare number.
  `onboarding.ts` re-exports it, so no call site breaks.
- Message shape: a numbered block per class — class name, slot, its itemised
  rows, and `Class total: ₹X` — then `TOTAL PAYABLE`. Recurring monthly fees are
  named per class ("then ₹2,000/month").
- **Length guard:** wa.me is a URL. When the itemised form would be very long
  (> 14 rows or > 4 classes) the message degrades to one line per class
  (name + class total). The split is never dropped, only compressed.
- EMI (single-class only, by existing design) keeps its installment schedule and
  the "pay the 1st installment" ask.
- `/pay/:token`: every section now shows its class name + `Class total` — today
  the header only appears when there are 2+ classes, so a single-class parent
  sees an unlabelled list. Multi-class links get a "Fee split-up by class"
  caption and a per-class "Pay now" line whenever it differs from the class
  total. No data-model change: `sections[]` already has everything.

## Req 2 — Finance: what made up the money

**Goal:** behind every income figure and every partner payout, the exact sales.

- New **pure** module `src/lib/finance/salesLedger.ts` turns orders + paid class
  fees + manual income into a flat `SaleLine[]`:
  `{ id, category: product|course|class|other, name, buyer, dateKey,
  amountInPaise, mode: online|offline|unknown, methodLabel, reference }`.
  - An order contributes ONE LINE PER ITEM; a partly-paid (EMI) order
    apportions its collected amount across items by line total, so the ledger
    always reconciles to `splitOrderIncomeInPaise` — asserted in tests.
  - A paid fee = one line (class name + period + student).
  - Money stays in paise; nothing is re-derived in the UI.
- `AdminFinance` gains an **Income Breakdown** card: Products / Courses /
  Classes / Other, each with count + total and a "View sales" button opening
  `IncomeSalesDialog` — a searchable, Online/Offline-filterable table of
  name · date · amount · method, honouring the page's period filter.
- **Partner Shares** rows now show the arithmetic (`Products 60% of ₹X = ₹Y`)
  and each category chip opens the same dialog filtered to that category, so a
  payout traces to the exact items that generated it.
- `manualIncome` gains an optional `paymentMode` ("online"/"offline") on the
  entry form; legacy entries render as "—" rather than guessing.
- The partner-facing dashboard is deliberately unchanged (a locked earlier
  decision keeps it minimal). Admin can now answer any partner question.

## Req 3 — Student Portal

**3a. Attendance duplicated in the outer menu.** Attendance is a tab inside
Academics (`ClassAcademicsTabs`) *and* a standalone sidebar item. Remove the
sidebar item; the `/admin/attendance` route keeps working by URL (same pattern
as the previously hidden nav items). Academics opens on its Attendance tab, the
teacher landing path moves to `/admin/academics`, and `firestore.rules` lets an
`academics` manager write attendance (it previously required the `attendance`
key, which would now be unreachable from the nav). **Needs a rules deploy.**

The same complaint reads a second way — the *student's* outer menu also has a
standalone "Attendance". 3c resolves both: that item becomes "Progress".

**3b. Certificates need a permanent delete.** Add `deleteCertificate()` and a
type-to-confirm Delete button beside Revoke/Restore, with an activity-log entry.
Rules already permit `delete` for `academics` staff and the owning teacher.

**3c. Progress is invisible to students.** It exists but lives at the bottom of
`/account/attendance`. Give it its own identity:
- `/account/progress` (new page, "My Progress"): progress reports first — grade,
  skill bars, remarks — then the attendance record that backs them up.
- The student nav item "Attendance" becomes "Progress" → no standalone
  Attendance item remains in either outer menu.
- `/account/attendance` redirects to `/account/progress` (old links, WhatsApp
  history, bookmarks).
- The student dashboard gets a Progress card: attendance %, latest grade/period,
  and a link in — "its own separate category on the dashboard", as asked.

## Verification

Unit tests for both new pure modules (message split + ledger reconciliation);
`tsc -p tsconfig.app.json` and `-p api/tsconfig.json` (the root tsconfig checks
nothing); `npm test`; `npm run build`; then a real browser pass on the admin
console, a live multi-class pay link, and the student portal at 375px + desktop.
