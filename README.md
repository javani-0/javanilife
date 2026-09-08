# Javani Spiritual Hub

Website, shop and student portal for Javani Spiritual Hub.

- **[Student Portal — What's New & How to Check It](#javani-student-portal--whats-new--how-to-check-it)** — plain-English guide for the office. Start here.
- [For developers](#for-developers) — setup, commands, gotchas.

---

# Javani Student Portal — What's New & How to Check It

*Written for a non-technical reader. Nothing in the checks below can break anything — you're only looking.*

## What has been built

### For you (the office)

| Screen | What it does |
|---|---|
| **Student Manager** | Add one student to **several classes at once**. Every fee is itemised — kit, books, uniform — so nothing is hidden. Optional **GST** per student (18% by default, you can change it). |
| **Student Manager → Fee Collections** | Shows exactly who owes money right now, across all their classes |
| **Bill** button (on any fee) | Creates a proper bill you can print, save as PDF, or send by WhatsApp |
| **Classes Manager → Academics** *(new)* | Open any class and get **everything for that class in one place** — attendance, assignments, exams, certificates and progress. No hunting for the class on another page. |
| **Managers → Teachers** *(new)* | Create a **teacher login**. A teacher sees **only Attendance and Academics**, and only for the classes you assign them. They cannot see fees, student records or finance. |
| **Academics → Attendance** | Pick a class and a date, tap Present / Absent, save. (The old standalone **Attendance** sidebar item is gone — it was the same screen twice. The URL `/admin/attendance` still works.) |
| **Academics → Assignments** | Set homework, read what students send in, give marks and feedback |
| **Academics → Progress** | Write a progress report that parents can see |
| **Academics → Exams** | Announce exams and release hall tickets |
| **Academics → Certificates** | Issue a certificate to a student, **revoke** it (reversible, hides it from the parent) or **delete** it permanently (for one issued by mistake) |

### For parents and students

A **Dashboard** showing their classes, what they owe, this week's class times and a **Progress** card — plus **Progress** (the teacher's reports, grades and skill ratings, with the attendance record underneath), **Assignments**, **Exams** (with a printable hall ticket) and **Certificates** to view.

- **My Classes** leads with the **course name**, its **timing** and the **trainer**, and shows that class's **live link, recordings and materials right on the card**.
- **EMI Payments** shows **class fee installments** — how much is paid, what's left, and a Pay button on each pending one.

### Two automatic behaviours worth knowing

**The late-fee lock is currently OFF.** If you switch it on (Payment Settings), a class's videos and materials hide while that class's fee is overdue past the grace period, and come back the moment you record the payment. Paying is never blocked, and a parent who has already sent a payment screenshot is **not** locked out while you check it.

**The Join Live Class button is always available** once you've added a live link to the class. Session times are shown as information, not as a gate.

## How to check it — about 15 minutes

> Try this on a **phone as well as a computer**. Everything should fit the screen with no sideways scrolling.

### A. Add a student with two classes *(5 min)*

1. **Student Manager → Add Student**
2. Fill in the name and details, choose Class 1, then click **"+ Add another class"** and choose Class 2
3. ✅ You should see **both classes listed separately with their own prices**, then one total at the bottom
4. Tick **"Charge GST on this student's fees"** — ✅ a GST line appears and the total goes up
5. Save, then open the payment link — ✅ the parent sees **the same two classes and the same total**

### A2. Check the payment split-up *(2 min)* — new

1. **Student Manager** → a student in **more than one class** → **Send link**
2. ✅ Before you send it, read the WhatsApp draft: each class is listed **by name with its own charges and its own class total**, then the combined total, then what is payable today
3. Open the link itself — ✅ **Fee split-up · N classes**, one boxed section per class with **Class total**, and the amount due today shown separately from the full total

### B. Mark attendance *(2 min)*

Two ways in — use whichever suits you:

- **Classes Manager** → the class → **Academics** → **Attendance** tab, or
- **Attendance** in the sidebar → pick a class

1. Pick today's date
2. ✅ Your students appear, everyone already marked Present
3. Tap **Absent** for one student, then **Save**
4. Come back to the same date — ✅ it remembers, and shows *"Already marked — editing"*

### B2. Create a teacher login *(3 min)* — new

1. **Managers → Teachers** tab → fill in name, email and a password
2. Tick the classes that teacher handles → **Create Teacher**
3. **Share login** sends their details on WhatsApp
4. Sign in as them in a **private / incognito** window — ✅ they see **only Attendance and Academics**, and only their classes. No fees, no student records, no finance.

### C. Write a progress report *(3 min)*

1. **Academics** → pick a class → **Progress** tab
2. Pick a student — ✅ their attendance % appears under their name
3. Add a grade, rate a skill, write a remark → **Publish**
4. ✅ It appears in the list underneath

### C2. See which sales made the money *(3 min)* — new

1. **Finance** → pick a period (**This Month**, **Today**, **All Time** or a specific day)
2. ✅ **Income Breakdown** shows **Product / Course / Classes / Other** income, each with how many sales it came from
3. Tap a category — ✅ every sale is listed: **what was sold, the date, the buyer, the amount**, and an **Online / Offline** tag with the actual method (Razorpay, UPI, Autopay, Cash…)
4. Search a name, or filter to **Online** / **Offline** only
5. Under **Partner Shares**, tap a partner's category line — ✅ the same list opens, showing exactly which sales earned that payout

### D. Make a bill *(2 min)*

1. **Student Manager** → a student → **Fees** → **Bill** on any payment
2. ✅ A proper bill opens, items listed, GST shown separately
3. Try **Print**, **Download PDF** and **Share**

### E. See what a parent sees *(3 min)*

1. Copy a student's **User ID** and **Password** from their card in Student Manager
2. Open a **private / incognito** window and sign in as them
3. ✅ Their Dashboard shows their classes, what they owe, and a **Progress card** with their attendance % and latest report
4. **Progress** in the menu — ✅ the teacher's report opens first (grade, skill bars, remarks), with the **attendance record** underneath. (Attendance no longer has its own menu item; `/account/attendance` redirects here.)
5. **My Classes** — ✅ the **course name** is the heading, with the **timing** and **trainer** under it, and a **Class resources** strip showing the live link, recordings and materials
5. **EMI Payments** — ✅ for a student on an installment plan, their **class fee installments** are listed with paid/remaining and a Pay button on each pending one

### C3. Download Finance as Excel *(2 min)* — new

1. **Finance** → **Export to Excel** (top right)
2. Choose **any date range** — the quick buttons (This month / Last month / This year / All time) or your own **From** and **To**
3. Tick the **sheets** you want (Summary, Sales, Expenses, Other income, Partner payouts), the **sale categories**, **online / offline**, and the **columns** on the sales sheet
4. Choose **Excel (.xlsx)** or **CSV**, amounts in **₹** or **paise**, totals row on or off, and a file name
5. ✅ The footer counts what you're about to download; press **Download** and it lands in your Downloads folder
6. ✅ Opening it in Excel gives one tab per sheet, a bold frozen header, ₹ formatting, and a TOTAL row that matches the Finance page exactly
7. ✅ The **What sold** tab answers "which product sells": every product, course, class and rental with
   **how many sales**, units, what it made, **how many customers** and **who bought it**
8. ✅ The **Sales** tab now carries the customer's **phone and email** on every line

### C5. Download students, or the whole catalogue *(2 min)* — new

- **Student Manager → Export Excel** — pick a **class or course** (each shows its live student count),
  choose **one row per class** (the register: batch, trainer, fee, joining date) or **one row per student**
  (the address book), tick the columns, download. ✅ Picking one class exports only that class's students.
- **Products Manager → Export Excel** — filter by category, stock and visibility, tick the columns
  (price, stock, rentable, 24-hour rent price, weight, dimensions…), download.
- **Rental Desk → Export Excel** — everything that is out or has been returned, with the live late charges.

### F. Fix — or clear — a student who can't see their class *(2 min)*

If a class was ever deleted, the students attached to it are stranded — they can't see a live link, recordings or materials because their class no longer exists.

1. Open **Student Manager** (or **Classes Manager**)
2. ✅ If any exist, an amber banner lists them: *"N enrolments point at a deleted class"*
3. If the student is still with you → pick the correct class (and batch) → **Re-link**, and they have access immediately
4. If the row is marked **Student profile deleted**, there is nobody to re-link — press **Delete** on that row (or **Delete all N**). ✅ It asks twice, then gives you **5 seconds to Undo**; after that the enrolment and its fee records, attendance, progress reports, submissions, certificates and bills are removed
5. ✅ Once the last one is handled the banner is gone for good. **Hide for now** also sticks — it only comes back if a *new* enrolment breaks

### C4. VESTRA — buy or rent *(4 min)* — new

**Setting a piece up:** **Products Manager** → add or edit a product → the gold **VESTRA & rentals** box:
tick **Show in VESTRA**, tick **Can be rented**, and type what **24 hours** costs. That single price
drives everything — the screen immediately shows you the matching per-hour rate for late returns.
Optionally cap the days per booking, say how many pieces you own, and add your terms.

**What the customer sees:** **VESTRA** in the top menu → two tabs, **Buy** and **Rent**.
1. On **Rent**, each piece shows its 24-hour price and the per-hour late rate
2. **Rent this** → pick the date and time they need it, and how many days → ✅ the total and the exact
   *"Back by…"* moment appear before anything is added
3. It goes through the normal cart and checkout, where they choose **store pickup** or **delivery**

**Running it:** **Rental Desk** in the sidebar.
1. ✅ Tiles show what is out, what is overdue, and the late fees still to collect
2. **Mark collected** when the piece leaves — the clock starts then, not at the booked hour
3. While it is out you see a live countdown; once late, the row turns red and shows the maths:
   *"49 hours past the return time at ₹20.83/hour = ₹1,020.67"*
4. **Mark returned** freezes that amount, and **Late fee collected** records the payment (it then
   appears in Finance as Rental income)
5. **WhatsApp customer** on any late row opens the message ready to send from your phone;
   **Chase N overdue** sends it to everyone late at once, and the nightly job does it automatically

### G. Deleting things safely *(2 min)* — new

Every delete now asks twice and then waits five seconds, with an **Undo** button at the bottom of the screen. Nothing is written until the countdown ends.

1. **Classes Manager** → delete a class → ✅ it tells you **how many students are still enrolled** and makes you type DELETE before it will go ahead
2. **Student Manager** → a draft student → 🗑 → ✅ confirm, then **Undo** within 5 seconds and the student is still there
3. **Student Manager** → **Delete completely** (admin only) → removes the student **and everything of theirs**: login, enrolments, fee history, attendance, progress reports, submissions, certificates, bills and payment link. Nobody else's records are touched — if a parent shares one login between two children, the sibling keeps everything

### H. A delivery was missed — re-manifest it *(1 min)* — new

Once an order was manifested there was no way to send it again; the button just handed back the old
waybill. Now:

1. **Orders Manager** → open the order → **Delivery One**
2. ✅ **Manifest Order** reads **Manifested** and is greyed out once a waybill exists
3. **Re-manifest** → say why (missed delivery, courier lost it…) → ✅ a **brand-new** Delhivery shipment
   is booked. The old waybill is archived on the order under **Replaced shipments** with your reason, and
   the old label and pickup are cleared so nobody prints the dead one
4. If Delhivery refuses the new shipment, nothing changes — the existing waybill stays live and the
   error is written to the order timeline

## Two things that still need a real-world test

1. **A live class join.** Please try the **Join Live Class** button during an actual class with a real student.
2. **Sending something to a real family.** Uploading a real assignment or issuing a real certificate hasn't been done, because it would show up in a real parent's portal. The screens work — the first real one should be yours.

If anything doesn't match what's written above, note **which step** and **what you saw**, and send that over.

---

# For developers

## Setup

```sh
npm i
npm run dev     # http://localhost:8080
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on **:8080** |
| `npm run build` | Production build |
| `npm test` | Vitest suite |
| `npm run lint` | ESLint |
| `npx tsc --noEmit -p tsconfig.app.json` | **Real** client typecheck |
| `npx tsc --noEmit -p api/tsconfig.json` | Server (`api/`) typecheck |
| `npx tsc --noEmit -p tsconfig.node.json` | Build-config typecheck (vite + tailwind config) |

## Gotchas that will waste your time

- **`tsc -p tsconfig.json` checks NOTHING.** The root config has `"files": []` and only project references, so it always exits 0. Use `tsconfig.app.json` / `api/tsconfig.json` / `tsconfig.node.json` as above.
- **`npm run build` does not typecheck** — it is plain `vite build`.
- **`vite dev` does not run the `api/` functions.** Every `/api/*` route 404s locally. Use `vercel dev` or a preview deploy to exercise them.
- **Firestore rejects `undefined`.** `src/lib/firebase.ts` does not set `ignoreUndefinedProperties`, so one `undefined` field makes the whole write throw. Build optional fields with `...(x ? { k: x } : {})`.
- **Writing a field is only half the job.** The `normalize*` functions map documents field by field — a new field is silently dropped on read until you add it there too.
- **Money is in paise** (integers) everywhere. Format with `formatPaiseAsRupees`.
- **Fee/finance maths is duplicated** client (`src/lib`) and server (`api/_lib`, `api/_razorpay`) — change both.
- **Mobile layout:** flex/grid children default to `min-width: auto`, so an `<input>` keeps its intrinsic `size=20` width and pushes the row past the viewport. Add `min-w-0` (and `w-full`) to the child. Measure with `main.scrollWidth`, never `documentElement.scrollWidth` (`html { overflow-x: clip }` clamps it and hides real overflow).
- **Playwright:** never use `wait_until="networkidle"` here — Firebase `onSnapshot` holds a long-lived connection so it never idles. Use `domcontentloaded` plus a settle.

## Architecture

- **Vite + React 18 + TypeScript + Tailwind (shadcn/ui)**, Firebase (Firestore/Auth), Vercel serverless in `api/`.
- `api/` is at Vercel's **12-function limit** — new server actions are routed through `api/razorpay.ts`, not added as new files.
- Portal logic lives in `src/lib/portal/` (`schedule`, `access`, `attendance`, `assignments`, `exams`, `emi`) and is pure + unit-tested.
- **Two unrelated EMI systems.** Class fee EMI is `feePayments/${enrollmentId}_emi-N` (see `src/lib/portal/emi.ts`); course order EMI is `orders/{id}.payment.installmentPlan`. `/account/emi` shows both. Reading only the second is what made the EMI tab look empty.
- **Roles** are `admin | manager | partner | teacher | user` on `users/{uid}`. A **manager** gets page keys (`managerPages`, see `src/lib/adminPages.ts`); a **teacher** gets a fixed Attendance + Academics console scoped by `teacherClassIds`. Class pickers go through `useStaffClasses`, which fails closed.
- **Academic panels are class-scoped components** (`AdminAttendancePanel`, `AdminAssignmentsPanel`, `AdminExamsPanel`, `AdminCertificatesPanel`, `AdminProgressPanel`) composed by `ClassAcademicsTabs`, mounted both in Classes Manager and on the standalone pages. Add new academic tools there once, not per page.
- Design docs and implementation plans: `docs/superpowers/`.

## Deploying Firestore rules

New collections — and new **roles** — are denied by default until the rules ship:

```sh
npx firebase deploy --only firestore:rules
```

⚠️ **Pending deploy: the `teacher` role.** Teacher logins can be created and will sign in, but every write they attempt (attendance, assignments, exams, certificates) is denied until `firestore.rules` is deployed. Admins and managers are unaffected.

⚠️ **Pending deploy: the `rentals` collection.** VESTRA rentals work against production today only
because the deployed rules are older than this file and allow an admin to write a collection they do
not declare. Deploy the rules to keep the Rental Desk working once they ship — and to close that gap.

⚠️ **Pending deploy: attendance for `academics` managers.** Marking attendance used to require the `attendance` page key. Now that attendance lives on the Academics tab, the rule accepts `academics` too — until the rules are deployed, a manager who holds **only** Academics can open the tab but not save. Admins and teachers are unaffected.

## Tech stack

Vite · TypeScript · React · shadcn-ui · Tailwind CSS · Firebase · Vercel
