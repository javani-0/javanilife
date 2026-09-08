# VESTRA, rentals, three more exports, and re-manifest

**Date:** 2026-09-08 (second round of the day)
**Requests:** students-by-class export · a VESTRA section · rentals priced by 24 hours with hourly
overtime and a WhatsApp warning · Buy/Rent tabs · a products export · a finance breakdown by
product / class / course / rental with customer details · re-manifest a missed delivery.

---

## 1 · VESTRA and rentals (reqs 2, 3, 4)

### Decisions taken with the client

| Question | Answer |
|---|---|
| Where VESTRA lives | Its own page `/vestra` with **Buy \| Rent** tabs |
| Overtime pricing | **Per hour after the first 24 h**, at a 24th of the day rate |
| Who is warned when it runs late | **The customer** |
| How a rental is collected | **Store pickup or delivery, chosen at checkout** |

### The one number

The admin types what **24 hours** costs. `src/lib/ecommerce/rentals.ts` derives the rest — the booked
amount (`days × price × units`), the due moment (`start + days × 24 h`), the hourly rate
(`price ÷ 24`) and the late charge (**started** hours × hourly rate × units). It is pure and takes
`now` as an argument, so the customer's card, the Rental Desk, the return receipt and the overdue job
cannot drift apart. 18 tests.

### Rentals ride the existing checkout

A rental is a third `itemType` on the cart line, namespaced `rent:<productId>:<startAt>` exactly as
courses already use `course:<id>`. That buys the whole shop for free: totals, coupons, payment rails,
store-pickup vs delivery, order records, and — with `splitOrderIncomeInPaise` extended — finance.

What an order *cannot* express is the life of the item after the sale, so every rental line also
writes a `rentals/{orderId}_{lineIndex}` document: out, due, returned, late hours, late charge. The
Rental Desk (`/admin/rentals`) works those rows and recomputes the live charge every minute.

**Marking it collected restarts the clock** at that moment rather than the booked hour — a customer
who arrives two hours late should not lose two hours. **Marking it returned freezes** the charge, so a
returned item never keeps accruing while nobody is looking.

### The overdue message

`api/_lib/rental-overdue.ts` finds everything still out past its hour, writes the live figures back,
and messages the customer: one notice when it first goes late, then at most one more every 12 hours.
It runs three ways: on the existing daily cron (Vercel Hobby caps both cron entries and the 12
serverless functions, and this project is at 12 — the sweep rides along on `class-fee-reminders`),
from **Chase N overdue** on the desk, and per row as a `wa.me` link the admin sends themselves. The
wording is identical on every route.

---

## 2 · The exports (reqs 1, 5, 6)

`DataExportDialog` is the shared shell — columns, Excel/CSV, filename — and each caller supplies its
own filters and column definitions. All of it writes through the dependency-free `.xlsx` writer added
this morning.

- **Students** (`/admin/students → Export Excel`): filter by **class or course** with live counts, then
  choose **one row per class** (the register — batch, trainer, fee, joining date) or **one row per
  student** (the address book). A class filter also excludes students who do not attend it.
- **Products** (`/admin/products → Export Excel`): category, stock and visibility filters; columns for
  price, stock, rentable, the 24-hour rent price, weight and dimensions.
- **Finance** gains a **What sold** tab — one row per product / course / class / rental with **number of
  sales**, units, revenue, customer count and the buyers' names — and the itemised **Sales** tab now
  carries each buyer's **phone and email**. Rentals are their own income category throughout (booked
  hires from orders, plus late fees once collected). Partner payouts deliberately still count rentals
  inside the products share, so nobody's cut moved.

---

## 3 · Re-manifest (req 7)

`action: "re-manifest"` on `/api/orders/sync-delivery` books a **fresh** shipment for an order that was
already manifested. The old waybill is archived to `delivery.previousShipments` with the reason,
label and pickup fields are cleared, and Delhivery is given a new reference (`JV-1234-R2`) because it
rejects one it has seen. On failure nothing is cleared — the existing waybill stays live and the error
lands on the timeline. "Manifest Order" now greys out to **Manifested** once a waybill exists.

---

## Verification

- 515 unit tests pass (the same 5 pre-existing failures); both typechecks and `vite build` clean.
- Browser, live data: VESTRA tabs and the booking panel (₹500/24 h → ₹20.83/h, 3 days = ₹1,500, the
  7-day cap holds); rental added to the cart; **a real COD order placed end to end** → the order line
  kept `itemType: "rental"` with its terms and the booking appeared on the desk as *Booked · 2 days ·
  store pickup*; an overdue fixture showed *49 hours past the return time at ₹20.83/hour = ₹1,020.67*,
  matched by the return dialog, the frozen charge, the export and the WhatsApp text; the late fee, once
  marked collected, appeared as Rental income on the Finance tile, in **What sold** and on the Sales tab
  with the customer's phone. Students export filtered to one class (11 rows); products exported;
  re-manifest confirmed enabled on a manifested order and its prompt names the waybill it replaces.
- Every fixture was removed afterwards and production swept clean.

### Bug found and fixed in testing

The first real checkout produced an order line of `itemType: "product"` with **no rental terms** — the
hire had silently become an outright sale. `CartContext` normalises and persists cart items field by
field, and neither `normalizeStoredCartItem` nor `cartItemToFirestore` knew about `rental`. Both now
carry it, and the re-run produced a correct rental line and booking. (This is the repo's standing
gotcha: writing a new field is only half of it.)

## Not verified locally

`/api/*` does not run under `vite dev`, so **re-manifest** and the **server-side overdue sweep** are
typechecked and reviewed but need a preview deploy. The per-row WhatsApp button (a `wa.me` link) works
today regardless, and its text was verified.

## Firestore rules

`firestore.rules` gains a `rentals` block: staff read and write, a customer reads their own bookings
and may create the row their own checkout produces, and only staff can mark an item returned or clear
a late fee.

Rentals already work against production **without** deploying it, because the rules currently live in
production are older than this file and allow a signed-in admin to write a collection they do not
declare (verified by probing an undeclared collection). Deploying is what keeps rentals working once
the repo's stricter rules ship, and closes that gap:

```sh
npx firebase deploy --only firestore:rules
```
