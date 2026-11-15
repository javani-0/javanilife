# Handoff: read this first

Javani Spiritual Hub (www.javanilife.com): a classical dance/music academy + shop. React 18 + Vite SPA, Firebase, Vercel (project `javanilife`), Razorpay.

Last updated: 2026-11-15 (E-Learning built and committed locally, NOT deployed)

## State

- **E-Learning section is built** (commits 18ffa80 → latest on local `main`, not pushed):
  - Public: `/learn` catalog, `/learn/:slug` course page, buy dialog (Razorpay or UPI QR + screenshot + 12-digit UTR), `/learn/:slug/watch` Vimeo player with progress, `/account/learning`.
  - Admin: `/admin/elearning` (staff page access `elearning`): course builder (sections, lessons, Vimeo links), payment mode per course (Razorpay / UPI / both), purchases (approve/reject UPI proofs, grant, revoke).
  - Server: `elearn-*` actions inside `api/razorpay.ts` (handlers `api/_razorpay/elearn.ts`, logic `api/_lib/elearn.ts`, pure rules `api/_lib/elearn-core.ts`). Webhook `api/_razorpay/webhook.ts` also activates elearn, revokes on full refund, and now trusts only ORDER notes (also fixes an old class-fee/EMI forged-notes hole).
  - Security review done; all confirmed findings fixed (UTR/screenshot reuse blocked, races, revoked students, captured-only payments, proof URL guard, rules).
  - Dev preview without data: add `?demo` (dev only).
- **SEO is LIVE** (2026-11-06). `/learn` + course pages are in the sitemap/prerender once deployed. Details in `docs/seo/SEO-2026-11-06.md`.
- Checks 2026-11-15: api tsc clean; app tsc only the 7 old errors (CategoryManager, categories.ts); tests 624/629 (5 old failures: course-installments, delivery-flow-ui); build OK.

## Next steps (in order)

| # | Step | Effort |
|---|---|---|
| 1 | Deploy (needs the user's yes): `git push` (Vercel auto-deploys main) + `firebase deploy --only firestore:rules` | Low |
| 2 | Razorpay dashboard webhook: also tick `refund.processed` | Low |
| 3 | After deploy: create a real course in `/admin/elearning`, test one UPI buy + one Razorpay buy end to end, screenshot `/account/learning` and the watch page | Medium |
| 4 | SEO day 3/7/14/30 checks (report file) | Low |

**Message for the next chat:** `Read javanilife/docs/HANDOFF.md and do Next step 3 (live e-learning test).`

## Waiting on the client or the user

- Deploy permission (step 1).
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
- The `ss/` folder next to `javanilife/` is the old base copy; don't edit it.
