# Handoff: read this first

Javani Spiritual Hub (www.javanilife.com): a classical dance/music academy + shop. React 18 + Vite SPA, Firebase, Vercel (project `javanilife`), Razorpay.

Last updated: 2026-11-16 (all pushed; live e-learning test done; reload-flash fixes live)

## State

- **E-Learning is LIVE**, everything pushed (up to 01e30a0). Push with `GIT_TERMINAL_PROMPT=0 git push https://javani-0@github.com/javani-0/javanilife.git main`.
- **Live test 2026-11-16 (admin + visitor): PASS.** Pages /, /learn, /classes, /products, /contact, /cart, /courses at 390/1440 px: no console errors, no overflow. Logged-out Buy → login redirect; free preview opens the Vimeo modal; empty catalogue shows "coming soon". Test course "TEST Bharatanatyam Basics" (₹1) is back in DRAFT, admin test enrollment revoked. No real-money buy was made.
- Fixes 2026-11-16: b5e39aa (dim navbar under dialogs, wa.me digits-only, solid navbar on lesson player, My Learning back link), 7ece408 + 01e30a0 (reload flash: index.html boot splash = PageLoader's first frame, crawler text hidden; boot loader now stays until the first page is ready via `src/lib/bootGate.ts`, shared `AuthLoader`, so no cream spinner/text flash).
  - Public: `/learn` catalog, `/learn/:slug` course page, buy dialog (Razorpay or UPI QR + screenshot + 12-digit UTR), `/learn/:slug/watch` Vimeo player with progress, `/account/learning`.
  - Admin: `/admin/elearning` (staff page access `elearning`): course builder (sections, lessons, Vimeo links), payment mode per course (Razorpay / UPI / both), purchases (approve/reject UPI proofs, grant, revoke).
  - Server: `elearn-*` actions inside `api/razorpay.ts` (handlers `api/_razorpay/elearn.ts`, logic `api/_lib/elearn.ts`, pure rules `api/_lib/elearn-core.ts`). Webhook `api/_razorpay/webhook.ts` also activates elearn, revokes on full refund, and now trusts only ORDER notes (also fixes an old class-fee/EMI forged-notes hole).
  - Security review done; all confirmed findings fixed (UTR/screenshot reuse blocked, races, revoked students, captured-only payments, proof URL guard, rules).
  - Dev preview without data: add `?demo` (dev only).
- **Firestore rules LIVE (2026-11-15)**: the live DB was fully open (`allow read, write: if true` since 2026-05-05). Strict role-based rules (`firestore.rules`) published via the Firebase console (CLI has no access to javani-181d5 → 403). Verified: anonymous reads of users/orders/feePayments/elearnEnrollments → 403; public collections 200; site pages OK. 
- Rules tests: `firebase emulators:exec --only firestore --project demo-javani "npm run test:rules"` (config `vitest.rules.config.ts`). Known leftover: a manager with only the students page can't do the full student purge; StatsSection setDoc fails silently for visitors.
- Razorpay webhook `https://javanilife.com/api/webhook` already has all refund events incl. `refund.processed` (checked 2026-11-15, nothing changed).
- **SEO is LIVE** (2026-11-06). `/learn` + course pages are in the sitemap/prerender once deployed. Details in `docs/seo/SEO-2026-11-06.md`.
- Checks 2026-11-15: api tsc clean; app tsc only the 7 old errors (CategoryManager, categories.ts); tests 624/629 (5 old failures: course-installments, delivery-flow-ui); build OK.

## Next steps (in order)

| # | Step | Effort |
|---|---|---|
| 1 | When the client adds the first real course: one UPI buy (₹ real, client's own phone) + approve in admin; check `/account/learning` + watch page | Medium |
| 2 | Any later rules change: publish via the Firebase console in the javani Chrome (paste `firestore.rules`), run the emulator tests first | Low |
| 3 | SEO day 3/7/14/30 checks (report file) | Low |
| 4 | `useContactInfo` fallback whatsappNumber is still the placeholder 919876543210 (only used if Firestore contact info is missing); set the real number | Low |

**Message for the next chat:** `Read javanilife/docs/HANDOFF.md and do Next step 1 (first real course buy test).`

## Waiting on the client or the user

- Client setup: Vimeo videos set to "Hide from Vimeo" + embed only on javanilife.com; UPI ID/QR set in admin payment settings; give staff the `elearning` page access.
- The SEO [NEED] list in `docs/seo/SEO-2026-11-06.md`.

## Decisions (and why)

- 2026-11-15: no new Vercel function for e-learning; actions go through `api/razorpay.ts`. Why: 12-function Hobby limit.
- 2026-11-15: enrollments are written only by the server (Admin SDK transactions); rules let a student read their own and write progress only with active access.
- 2026-11-15: `@vimeo/player` lazy-loaded on the watch page only.
- 2026-11-06: public pages stay in the main bundle; only private pages are lazy.

## Gotchas

- `vercel.json`: the SPA catch-all → `/_seo/shell.html` (noindex) must stay LAST.
- SEO text per page: `api/_lib/seo.ts` (`STATIC_PAGES`); `src/test/seo.test.ts` enforces lengths.
- `vite preview` doesn't apply the Vercel rewrites.
- Git Bash turns `/learn` args into Windows paths: prefix `MSYS_NO_PATHCONV=1`. To catch first-paint flashes use raw CDP `Page.captureScreenshot` in a loop (Playwright `page.screenshot` waits for fonts and misses them). Port 4317 is taken by another local app.
- The `ss/` folder next to `javanilife/` is the old base copy; don't edit it.
