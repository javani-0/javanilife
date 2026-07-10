# Payment & Classes Revamp — What Changed & How to Test

Date: 2026-07-08. All changes build cleanly (`npm run build`) and typecheck; unit tests pass (the 2 pre-existing failing test files — `course-installments.test.ts`, `delivery-flow-ui.test.tsx` — were already failing before this work and are unrelated).

> **Deploy first:** push the updated **`firestore.rules`** (a `manualIncome` collection was added). Then, as admin, open **Admin → Payment Settings** and enter your UPI ID and/or upload a QR — otherwise manual online payments show "not set up".

---

## 1. Payments — Razorpay only for auto-debit; manual UPI for the rest
Razorpay now handles **only Autopay (monthly mandate) and EMI (term installments)**. Every other online payment — **Pre-payment** (monthly advance), **Pay Full** (term one-shot), and monthly **Pay Now** — uses a **manual UPI flow**: the student scans your QR / pays your UPI ID, uploads a receipt screenshot, and an admin approves it.

- **New admin page:** Admin → **Payment Settings** (`/admin/payment-settings`) — UPI ID, payee name, optional uploaded QR image, instructions, enable/disable.
- **Student:** on paying, a dialog shows the QR (your uploaded image, or an auto-generated one from your UPI ID with the amount pre-filled), the UPI ID with a copy button, a "Pay in your UPI app" button (mobile), and a screenshot upload.
- **Admin approval:** Admin → **Fee Collections** shows a blue **"UPI payments to approve"** panel with the screenshot, student, amount, and **Approve / Reject**. Approve → marks paid, activates the enrolment, books the seat, notifies the parent. Reject → sends it back to the student with a reason to re-upload.

## 2. Coupons in class enrolment
A **coupon box** now appears on the class enrolment page when paying by **Pre-payment** or **Pay Full**. It uses the same coupon engine as the shop, shows the discount and new total, and the discount is **re-validated on the server** so it actually lowers the amount stored on the fee (a tampered client can't under-charge). Autopay/EMI/Cash don't take a coupon.

## 3. Pre-payment screen
- All user-facing **"Advance Payment / Advance Fee" wording is now "Pre-payment."**
- **Cash / Paid at Counter** option (already existed as the Cash rail) stays available.
- New **"New student vs Existing student"** switch. Picking **New** means the student is **not** defaulted into Autopay (they start with Pre-payment/Cash and can enable autopay later from My Classes). It's recorded on the enrolment.

## 4. Term fees (EMI)
- **"Pay Full" (pay in one shot)** already existed and stays.
- **EMI convenience fee:** admin sets a **flat ₹ amount per class** (Admin → Classes Manager → EMI split). It's added **once** to the term total when a student chooses EMI, and shown in the EMI schedule preview (student and admin).

## 5. Profiles, history & the "balance" bug
- **History is preserved:** enrolling in a new class/semester never deletes old enrolments or fee records — the profile lists them all. Admins can already edit/fix any enrolment in **Admin → Sign Up (Enrollments)**.
- **"Massive incorrect balances":** I audited every place that sums money (customer spend, finance totals, fee tiles). They all correctly use paise + `formatPaiseAsRupees`, and the finance math is unit-tested. **I could not reproduce a systematic balance bug from the code.** If you still see a wrong number, tell me the exact screen and value — it may be a single mis-entered record (e.g. an amount typed in rupees where paise was expected) rather than a formula bug.

## 6. Monthly "pay now" reminder
The reminder cron now sends a **daily countdown across the whole 5-days-before → due-day window** (instead of a single message at exactly 5 days), stopping once paid, with **at most one message per day** (`reminders.preDebitDateKey` guard). The web-push reads **"Pay in N days …"** and deep-links to My Classes' Pay button. (The WhatsApp message still uses the approved Meta template with the due date — its wording can't be changed from code without editing the Meta template.)

## 7. Enrolled student profile (My Classes)
Already shows full payment history + next charge date. Added:
- **"Pay {next month} in advance"** for monthly, non-autopay enrolments (pays a future month early via UPI).
- **"Switch to another class"** link.
- UPI receipts show **"Awaiting admin approval"** while pending and the **rejection reason** if rejected.

## 8. Income & Expense manager
The manager already existed (income auto-derived from orders + class fees; expenses with categories; partner share). Added a **"Other Income"** section in Admin → Finance to record **extra income** (donations, workshops, hall rentals, …). It's included in Total Income, Net Profit, the partner share, and the partner dashboard.

---

## How to test

### As Admin
1. **Payment Settings** — Admin → Payment Settings → enter a UPI ID (e.g. `test@okhdfcbank`) and/or upload a QR → Save. Check the live "Student preview" renders a QR.
2. **EMI surcharge** — Admin → Classes Manager → edit/create a **Term** class with EMI enabled → set "EMI convenience fee (₹)" e.g. 500 → the preview total should be term fee + 500.
3. **Finance income** — Admin → Finance → "Other Income" → add e.g. "Workshop / ₹2,000" → Total Income and Net Profit go up; delete it to confirm it drops.
4. **Approve a UPI payment** — after a student submits (below), Admin → Fee Collections → blue "UPI payments to approve" panel → open the screenshot → **Approve** → the fee flips to Paid and the enrolment becomes Active. Try **Reject** with a reason on another to see it bounce back.

### As User (student/parent)
5. **Pre-payment wording + new/existing switch** — open any monthly class → the option reads **"Pre-payment"**, and there's a **New/Existing student** switch; choosing **New** should not pre-select Autopay.
6. **Coupon** — pick **Pre-payment** or **Pay Full** → enter an active coupon code → the discount + reduced total appear.
7. **Pay by UPI** — complete enrolment with Pre-payment/Pay-Full → the UPI dialog shows the QR + amount → upload any screenshot → Submit → in **My Classes** the fee shows **"Awaiting admin approval"**.
8. **Pay in advance** — in My Classes, a monthly (non-autopay) enrolment shows **"Pay {month} in advance"** → opens the UPI dialog for the next month.
9. **EMI** — enrol in a term class by **EMI** → the schedule preview includes the convenience fee and the EMI total; the first installment still goes through Razorpay.

---

# Round 2 (2026-07-09)

## Why July showed only 5 payments vs 34 in June
July's fee rows are only created by (a) an autopay charge, or (b) the daily cron's roll-forward. The cron clearly isn't running — **check on Vercel that the `CRON_SECRET` environment variable is set and that the Cron Job `/api/cron/class-fee-reminders` (daily 4:00 UTC) is succeeding**. Without it: no monthly roll-forward AND no automatic WhatsApp reminders.

**Self-heal shipped:** opening Admin → Fee Collections now auto-creates the month's pending dues for every **active monthly** student (toast: "Generated N pending dues"). So Pending/Overdue and the reminder pipeline are correct even if the cron missed days. Use **Waive** (not Delete) to excuse a student's month — deleted rows regenerate on the next visit because an active student owes every month.

## What changed
1. **Fee Collections**: new **Total Students** tile (active monthly · term split), "Paid This Month — X of N students", auto-generated dues, and a **History** button on every card/row/popup showing that student's complete payment history (all months, amounts, methods, paid dates + total collected). User side already shows full history in My Classes.
2. **Coupons**: Admin → Coupons now supports classes — scope "Courses & classes only" and tap-to-add chips that limit a coupon to specific classes.
3. **Partner Access** (grant/revoke, profit share %) moved from Finance to **Partners Manager**; Finance keeps a pointer note.
4. **Finance**: period toggle — **This Month (default) / Today / All Time / calendar day picker**. Income (products, classes, other) and expenses are all filtered by the chosen period.
5. **WhatsApp reminder**: the approved `class_fee_reminder` template is reused unchanged — the due-date variable now carries the countdown, so the message reads "Due date: 10 Jul 2026 — pay in 3 days". Sent daily in the 5-day window by the cron (see CRON_SECRET above).
6. **Verified**: parents pay entirely from their profile (My Classes) — Pay Now, pay-in-advance, history — without visiting the public Classes page.

## Round-2 testing
- Admin → Fee Collections (July): expect a "Generated N pending dues" toast, Total Students tile, Pending no longer ₹0, and History on each card.
- Admin → Coupons: create a coupon scoped to a class via the chips; apply it in that class's enrolment as a user.
- Admin → Partners Manager: Partner Access card at top (grant/update/revoke).
- Admin → Finance: toggle This Month / Today / All Time / pick a date — tiles and lists follow.
- Vercel: confirm `CRON_SECRET` env + cron success; then reminders go out daily automatically.

---

# Round 3 (2026-07-10)

1. **Partners Manager — one section.** The duplicate "Partner Access" card is gone. A single **Add Partner** form takes the name, an optional logo (file/URL), and optional **financial access** (email + profit share %). Every partner appears once in the list with badges ("Website logo" / "Financial access · N%"), and can be **edited** (name, logo, email, share — clearing the email revokes access) or **deleted** (also revokes access). Only one partner can hold financial access at a time — granting it to another replaces the previous one. Finance-only partners (no logo) never appear on the public website.
2. **Fee Collections — tiles are filters.** Click **Paid This Month / Pending / Overdue** to filter the list (click again to clear); **Total Students** shows all. The active tile is highlighted. The Payment Status dropdown still works too.
3. **Overdue students now keep getting reminders (bug fix).** Previously, once a fee passed its due date and flipped to "overdue", the daily reminder loop skipped it forever. Now students are nudged daily from 5 days before the due date **through 7 days after it** ("Overdue by N days — pay now"), then it stops (use the Remind button for older cases). No WhatsApp template change needed.
4. **Testing:** production build ✓, typecheck ✓, 63 unit tests ✓ (including new overdue-window tests).

### Notes / not yet done
- One-click "switch class that auto-cancels the old enrolment" isn't built — the link sends you to browse classes; old history is retained.
- Paying more than one month ahead in a single action isn't built (advance pays the next uncovered month).
- Changing the WhatsApp reminder wording needs a Meta template edit (outside the code).
