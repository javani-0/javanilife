# Finance export, broken-enrolment deletes, and a real cascade delete

**Date:** 2026-09-08
**Round:** three requests from the admin — (1) an Excel export on Finance with full control, (2) a way to clear the "3 enrolments point at a deleted class" banner that could not be dismissed, (3) deleting a student must remove that student's content everywhere.

---

## 1. Finance → Export to Excel

### Decision: write the .xlsx by hand, no dependency

An `.xlsx` is a ZIP of small XML parts. `src/lib/export/xlsx.ts` writes that ZIP directly
(stored entries, CRC-32 computed in-file), so the app gains a real Excel workbook with **no
new npm package** — SheetJS on npm is a stale build with advisories, and an HTML table saved
as `.xls` makes Excel warn on every open. Verified against `openpyxl`: tabs, bold frozen
header, `"₹"#,##0.00` number format, numbers stored as numbers.

Byte chunks are concatenated with `Uint8Array.set`, never `push(...bytes)` — a spread of a
megabyte-sized array blows the call stack.

### "Full control" concretely

`FinanceExportDialog` is handed the **unfiltered** records and owns its own filtering, so the
export is not limited to whatever period the page is showing:

| Control | Effect |
|---|---|
| From / To (+ quick ranges) | Any range; both bounds inclusive. Undated records drop out once a bound is set — including them would inflate the period |
| Sheets | Summary · Sales (itemised) · Expenses · Other income · Partner payouts, in the ticked order |
| Categories, Online/Offline | Filters the Sales tab **and every total derived from it** |
| Columns | Eight columns on the sales tab, individually |
| Format | `.xlsx` or `.csv`; ₹ or paise; totals row on/off; file name |

`buildFinanceSheets` reuses `buildFinanceSummary` and
`computePartnerCategoryShareInPaise` — the same functions the page's tiles use — so an export
can never disagree with what the admin was looking at.

Tests: `src/lib/export/xlsx.test.ts` (16), `src/lib/finance/financeExport.test.ts` (15).

---

## 2. The banner that could not be cleared

The three flagged enrolments belonged to students who had **already been deleted**, so
"re-link them" was advice nobody could act on.

- `findBrokenEnrollments` now takes a `StudentClaimIndex` and marks each row `studentDeleted`
  when no live student profile claims it (by enrolment id, or by the parent's login).
  Rows carry a **Student profile deleted** badge, and a **Delete all N** action appears.
- The banner subscribes to students itself when the host page doesn't pass them, so it works
  the same on Classes Manager.
- **Hide for now** is remembered in `localStorage` against the *set* of broken ids — it stays
  hidden and only returns if a genuinely new enrolment breaks.

### Delete: two steps, then five seconds

1. **Delete** on the row arms an inline *"Delete this? Yes, continue"*.
2. A dialog names the student, the missing class and everything that goes with it.
3. `useUndoableDelete` hides the row and holds the write for 5 s behind an **Undo** bar.

The hook keeps a row hidden *after* the timer fires too, until the write lands — otherwise it
flashes back for the second Firestore takes to confirm, which reads as a failed delete. If the
write really fails the row returns and the error toast explains why. On unmount, confirmed
deletes are flushed, never silently dropped.

The same treatment now covers the student draft delete, "Delete completely", and class delete.

---

## 3. Cascade delete — "and only that student"

`src/lib/students/purge.ts` (client, for one enrolment) and
`api/_razorpay/delete-student.ts` (server, for a whole student) clear the six collections that
file rows under an enrolment: `feePayments`, `attendance`, `progressReports`,
`assignmentSubmissions`, `certificates`, `bills`. The enrolment doc goes **last**, so a
part-way failure still leaves the id that identifies the leftovers.

Two hardenings on the server:

- **Forgotten enrolments** are searched for, not just the ids the student doc remembers
  (`studentDocId`, and `parentUserId`). A missed one is exactly what becomes a ghost enrolment
  pointing at a deleted class. New enrolments now record `studentDocId` at approval.
- **Shared logins.** If another student profile signs in with the same uid (a parent with two
  children), every uid-based sweep is skipped and the login is kept — that sibling keeps
  everything.

### Root cause closed

Deleting a class is what creates broken enrolments. Classes Manager now counts the enrolments
first, tells the admin how many students lose access, requires typing DELETE when there are
any, and offers the same 5-second undo.

---

## Verification

- 486 unit tests pass (the 5 pre-existing failures in `course-installments` and
  `delivery-flow-ui` are unchanged); `tsc -p tsconfig.app.json` and `-p api/tsconfig.json`
  clean; `vite build` succeeds.
- Browser (Playwright, real admin login, live data): export dialog downloads a 91 KB workbook
  of 97 real sales that `openpyxl` reads back correctly; two-step confirm, cancel at each step,
  5-second countdown, undo, and persistent hide all verified; a seeded throwaway enrolment
  with four dependent records was deleted through the UI and every trace confirmed gone with
  no collateral damage; the class-delete dialog correctly reported 11 enrolled students.
- Mobile (390 px): the export dialog was landing **off-screen** — a `fixed` overlay inside the
  admin shell positions against a transformed ancestor, not the viewport. Both Finance dialogs
  are now portalled to `<body>`.

## Not verified locally

`/api/*` does not run under `vite dev`, so the extended **delete-student** endpoint (the
whole-student cascade) is code-reviewed and typechecked but needs a preview deploy to exercise.
The single-enrolment purge, which runs client-side, was fully exercised.
