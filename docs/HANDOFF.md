# Handoff: read this first

Javani Spiritual Hub (www.javanilife.com): a classical dance/music academy + shop. React 18 + Vite SPA, Firebase, Vercel (project `javani-sprirtual`), Razorpay.

Last updated: 2026-11-06 (SEO step 1 audit written)

## State

- **Branch and last commit:** `a55db98` (WhatsApp fee reminders). Nothing committed for SEO yet.
- **Done:** SEO audit → `docs/seo/SEO-2026-11-06.md` (ranked findings, keyword table, NEED list).
- **Unfinished or uncommitted work:** `docs/seo/`, `docs/HANDOFF.md` (new, untracked).
- **How to run and check it:** `npm run build`; Lighthouse via `npx -y lighthouse@12.6.0 <url> --form-factor=mobile` with `CHROME_PATH` = Playwright Chromium (the PSI API daily quota was exhausted).

## Next steps (in order)

| # | Step | Ultracode? | Effort |
|---|---|---|---|
| 1 | Wait for the user's OK on the audit, then SEO steps 2-5 in the order at the end of the SEO report | No | High |
| 2 | Step 7 Search Console + Bing in the "javani" Chrome (`07389126…`); logins and Allow screens are the user's | No | Medium |
| 3 | Step 8 live checks after the user's deploy yes | No | Medium |

**Message for the next chat:** `Read javanilife/docs/HANDOFF.md and docs/seo/SEO-2026-11-06.md, then do SEO step 2 onwards.`

## Waiting on the client or the user

- See the NEED list in `docs/seo/SEO-2026-11-06.md`.

## Decisions (and why)

- 2026-11-06: no new Vercel function for SEO. The sitemap and detail-page HTML go into `api/share-page.ts` via rewrites. Why: there are already 12 functions (the Hobby limit) until the plan is confirmed.

## Gotchas

- The SPA catch-all rewrite in `vercel.json` (`/((?!api/|…|.*\..*).*)` → `/`) must stay LAST; `/sitemap.xml` has a dot, so it is not caught, but it 404s until a rewrite is added above it.
- `TestimonialsSection` auto-writes sample testimonials into Firestore when the collection is empty.
- The `ss/` folder next to `javanilife/` is the old base copy; don't edit it.
