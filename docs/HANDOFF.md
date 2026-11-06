# Handoff: read this first

Javani Spiritual Hub (www.javanilife.com): a classical dance/music academy + shop. React 18 + Vite SPA, Firebase, Vercel (project `javani-sprirtual`), Razorpay.

Last updated: 2026-11-06 (SEO steps 2-5 built and committed; Search Console waiting on the GoDaddy step)

## State

- **Last commits:** `ec6febf` SEO (prerender, sitemap, JSON-LD, canonicals, WebP images, private routes lazy) and `6ffa564` (template-fetch host fix). Local only, NOT pushed or deployed.
- **Verified locally:** build OK; the prerender writes 10 pages + shell (1 title, 1 H1, canonical, valid JSON-LD each); 565/570 tests pass. The 5 failures (course-installments, delivery-flow-ui) also fail on the old HEAD, so they are older failures, not caused by this work. Lighthouse mobile on the local build: SEO 100, LCP 17.2 s → 5.1 s, performance 30 → 35 (TBT is noisy locally).
- **Search Console:** Domain property `javanilife.com` VERIFIED (GoDaddy DNS) in the "javani" Chrome (`07389126-21df…`, account javni.education@gmail.com).
- **Bing Webmaster:** site `https://javanilife.com/` imported from GSC (2026-11-06). No sitemap submitted yet anywhere: live /sitemap.xml is 404 until the deploy.
- **How to check:** `npm run build`; `npx vite preview --port 4173`; Lighthouse via `npx -y lighthouse@12.6.0 <url> --form-factor=mobile` with `CHROME_PATH` = Playwright Chromium.

## Next steps (in order)

| # | Step | Effort |
|---|---|---|
| 1 | ~~GSC verify + Bing import~~ done 2026-11-06 | — |
| 2 | User's deploy yes → push/deploy → step 8 live checks (curl every page head, /sitemap.xml, a /classes/:id page, Rich Results test) → submit the sitemap in GSC + Bing, request indexing | Medium |
| 3 | Step 6 local/off-site list + step 9 monitoring plan into `docs/seo/SEO-2026-11-06.md` | Medium |
| 4 | Optional speed work: the main JS is still 357 KB gzip (Firebase + React); the hero typing animation is the LCP element | High |

**Message for the next chat:** `Read javanilife/docs/HANDOFF.md and continue from Next step 2 (needs the user's deploy yes).`

## Waiting on the client or the user

- A deploy yes.
- Permission to delete the 48 sample testimonial docs in Firestore (the code already hides them).
- The hero stats "500+ Students / 15+ Courses / 12+ Years" need proof or removal. The rest of the NEED list is in `docs/seo/SEO-2026-11-06.md`.

## Decisions (and why)

- 2026-11-06: no new Vercel function for SEO. The sitemap and detail-page HTML go into `api/share-page.ts` via a `mode` param. Why: there are already 12 functions (the Hobby limit).
- 2026-11-06: public pages stay in the main bundle (the code's own rule: no Suspense flash); only private pages are lazy.
- 2026-11-06: the sample testimonials are filtered out by their exact text; the section hides when no real ones exist.

## Gotchas

- `vercel.json`: the SPA catch-all → `/_seo/shell.html` (noindex) must stay LAST.
- SEO text for each page lives in `api/_lib/seo.ts` (`STATIC_PAGES`); `src/test/seo.test.ts` enforces the lengths.
- `vite preview` doesn't apply the Vercel rewrites (every path shows the home HTML locally).
- The `ss/` folder next to `javanilife/` is the old base copy; don't edit it.
