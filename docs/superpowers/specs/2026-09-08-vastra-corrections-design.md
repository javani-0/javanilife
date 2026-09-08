# VASTRA on the product page, sizes, and a real date-range filter

**Date:** 2026-09-08 (third round)
**Requests:** (1) the name is **VASTRA**, and renting belongs on the existing product page — a
full-width *Rent This* button under Add to Cart / Buy Now that opens a popup asking From, To and
pieces — not a page of its own. (2) VASTRA pieces are dresses, so the admin sets the **sizes** they
come in. (3) Wherever an admin screen filters by date, offer a **From–To range** — and in Finance a
**month picker** as well.

---

## 1 · The rent flow moved onto the product page

`/vestra` is gone: the page, the route and the nav link. `src/components/RentProductDialog.tsx` now
carries the whole booking panel and opens from the product page, where the customer already is.

The button sits **below Add to Cart and Buy Now at full width** (measured 780 px against the 385 px
buy buttons) and reads *"Rent This — ₹500 / 24 hours"*, so the price is visible before the popup.

The popup asks **From** and **To** rather than a bare day count, because that is how a customer thinks
about a hire. Days are whole 24-hour blocks (`rentalDaysBetween`, tested): part of a day is a day,
which is what "per 24 hours" has to mean. The Days stepper moves the To date, the To date moves the
day count, and the total and *"Return by…"* follow both.

Renamed throughout: the product flag is now `vastra`. The normaliser still reads the old `vestra`
spelling, so nothing an admin ticked in the previous hour was lost.

## 2 · Sizes

`Product.sizes: string[]`. The admin taps the common sizes (XS…XXL, Free size) or types their own
("36", "5-6 yrs"); one size is as valid as five, and none means the piece has no sizes.

The customer sees the sizes as buttons on the product page, and **Add to Cart, Buy Now and Rent This
all refuse to proceed without one** when the piece has sizes. The chosen size travels the whole way:

- the cart line is keyed by it, so S and M are two lines, not one confused one;
- the name reads "Kurta (M)" everywhere a name is shown;
- it lands on the order item, and on the rental booking, so the Rental Desk knows which size went out.

Both halves of the cart round trip carry it — `normalizeStoredCartItem` **and**
`cartItemToFirestore` — which is the exact gap that dropped the rental terms last round. Product cards
in the shop now show "Sizes: S · M · L — also on rent".

## 3 · One date filter, everywhere

`src/lib/finance/period.ts` is the whole model: `all · month · today · day · range`, with
`periodBounds`, `isInPeriod` and `describePeriod`. Pure, `today` injected, 15 tests — including a
backwards range being read the way it was meant, month ends across leap years, and undated records
being excluded from every bounded period.

`PeriodFilter` renders it: **This Month · Today · All Time**, a **month box for any month**, a single
day, and a **From / To** pair with Apply and Reset, above a line that always says what is on screen.
Finance uses it, and the export dialog opens on whatever period the page is showing. Orders Manager
gets the same From–To pair (plus **Clear dates**) next to its existing filter, with the matching
logic in `filterAdminOrders`.

---

## Verification

- 534 unit tests pass (+19 this round; the same 5 pre-existing failures); typechecks and build clean.
- Browser, live data: the Rent This button is full width and below the buy buttons; Add to Cart is
  blocked with "Choose a size first" until a size is picked; the popup's To date moved to +2 days
  turned into "3 days × ₹500 → ₹1,500" and the cart line read
  *"ZZ AUTOMATED TEST vastra (M) — 3 days rental"*; Finance switched to **July 2026** (₹41,718) and
  then to the range **1–15 Aug 2026** (₹3,52,811.25) with every tile following, and the export opened
  on exactly that range; Orders narrowed from 53 to 1 for an August range. Checked at 390 px too —
  the popup is portalled and fits.
- The fixture product, its cart line and every earlier test record were deleted; production swept clean.
