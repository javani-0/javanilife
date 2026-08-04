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
| **Attendance** | Pick a class and a date, tap Present / Absent, save |
| **Academics → Assignments** | Set homework, read what students send in, give marks and feedback |
| **Academics → Progress** | Write a progress report that parents can see |
| **Academics → Exams** | Announce exams and release hall tickets |
| **Academics → Certificates** | Issue a certificate to a student (and revoke it if needed) |

### For parents and students

A **Dashboard** showing their classes, what they owe, and this week's class times — plus **Attendance**, **Assignments**, **Exams** (with a printable hall ticket) and **Certificates** to view.

### One important automatic behaviour

If a fee is **more than 3 days late**, that class's videos and materials are **hidden automatically**, and come back the moment you record the payment.

Paying is never blocked, and a parent who has already sent a payment screenshot is **not** locked out while you check it.

## How to check it — about 15 minutes

> Try this on a **phone as well as a computer**. Everything should fit the screen with no sideways scrolling.

### A. Add a student with two classes *(5 min)*

1. **Student Manager → Add Student**
2. Fill in the name and details, choose Class 1, then click **"+ Add another class"** and choose Class 2
3. ✅ You should see **both classes listed separately with their own prices**, then one total at the bottom
4. Tick **"Charge GST on this student's fees"** — ✅ a GST line appears and the total goes up
5. Save, then open the payment link — ✅ the parent sees **the same two classes and the same total**

### B. Mark attendance *(2 min)*

1. **Attendance** → pick a class and today's date
2. ✅ Your students appear, everyone already marked Present
3. Tap **Absent** for one student, then **Save**
4. Come back to the same date — ✅ it remembers, and shows *"Already marked — editing"*

### C. Write a progress report *(3 min)*

1. **Academics** → pick a class → **Progress** tab
2. Pick a student — ✅ their attendance % appears under their name
3. Add a grade, rate a skill, write a remark → **Publish**
4. ✅ It appears in the list underneath

### D. Make a bill *(2 min)*

1. **Student Manager** → a student → **Fees** → **Bill** on any payment
2. ✅ A proper bill opens, items listed, GST shown separately
3. Try **Print**, **Download PDF** and **Share**

### E. See what a parent sees *(3 min)*

1. Copy a student's **User ID** and **Password** from their card in Student Manager
2. Open a **private / incognito** window and sign in as them
3. ✅ Their Dashboard shows their classes and what they owe
4. If they owe money, ✅ a red *"Some class content is paused"* message appears — that is correct, it's the automatic lock

## Two things that still need a real-world test

1. **The "Join Live Class" button.** It only appears when a student is fully paid up **and** it is within 15 minutes of their class time. Please try it during an actual class with a paid-up student.
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
- Portal logic lives in `src/lib/portal/` (`schedule`, `access`, `attendance`, `assignments`, `exams`) and is pure + unit-tested.
- Design docs and implementation plans: `docs/superpowers/`.

## Deploying Firestore rules

New collections are denied by default until the rules ship:

```sh
npx firebase deploy --only firestore:rules
```

## Tech stack

Vite · TypeScript · React · shadcn-ui · Tailwind CSS · Firebase · Vercel
