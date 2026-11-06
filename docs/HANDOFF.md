# Handoff: read this first

Javani Spiritual Hub (www.javanilife.com): a classical dance/music academy + shop. React 18 + Vite SPA, Firebase, Vercel (project `javanilife`), Razorpay.

Last updated: 2026-11-06 (SEO deployed and verified live; GSC sitemap submitted)

## State

- **SEO is LIVE** (pushed `ae5bf53` to GitHub 2026-11-06; Vercel project **`javanilife`** in team "javani-0's projects" (Hobby) auto-deploys `main`. The local `.vercel/project.json` points to the old `javani-sprirtual` project; ignore it).
- Live curl checks pass: 10 pages (1 title, 1 H1, canonical, JSON-LD), `/sitemap.xml` 16 URLs, robots.txt, `/classes/:id` HTML, 404+noindex for missing items. Full results in `docs/seo/SEO-2026-11-06.md`.
- **Search Console** (javani Chrome `07389126…`, javni.education@gmail.com): verified, sitemap submitted (Success, 16), indexing requested for `/` and `/classes`.
- **Bing Webmaster:** site imported from GSC.
- Tests: 565/570 (the 5 failures are older: course-installments, delivery-flow-ui).

## Next steps (in order)

| # | Step | Effort |
|---|---|---|
| 1 | Request indexing in GSC for `/courses`, `/about`, `/contact`, `/products`, `/grading` (the tab froze during `/courses`); submit the sitemap in Bing too; Rich Results Test on `/` and one `/classes/:id` | Low |
| 2 | Act on the client's [NEED] answers (report file) | Medium |
| 3 | Day 3/7/14/30 checks from the monitoring plan in the report | Low |
| 4 | Optional speed work: main JS 357 KB gzip (Firebase + React); hero typing text is the LCP element | High |

**Message for the next chat:** `Read javanilife/docs/HANDOFF.md and do Next step 1.`

## Waiting on the client or the user

- The [NEED] list in `docs/seo/SEO-2026-11-06.md` (hero stats, social links, OG image, javanailife.store, delete 48 sample testimonials, apex 307→308).

## Decisions (and why)

- 2026-11-06: no new Vercel function for SEO. The sitemap and detail-page HTML go into `api/share-page.ts` via a `mode` param. Why: there are already 12 functions (the Hobby limit).
- 2026-11-06: public pages stay in the main bundle (the code's own rule: no Suspense flash); only private pages are lazy.
- 2026-11-06: the sample testimonials are filtered out by their exact text; the section hides when no real ones exist.

## Gotchas

- `vercel.json`: the SPA catch-all → `/_seo/shell.html` (noindex) must stay LAST.
- SEO text for each page lives in `api/_lib/seo.ts` (`STATIC_PAGES`); `src/test/seo.test.ts` enforces the lengths.
- `vite preview` doesn't apply the Vercel rewrites (every path shows the home HTML locally).
- The `ss/` folder next to `javanilife/` is the old base copy; don't edit it.
