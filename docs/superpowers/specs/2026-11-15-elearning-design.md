# E-Learning (online video courses): design + build plan

Date: 2026-11-15. Owner request: "admin uploads videos on Vimeo, puts links in the admin dashboard, creates a course; users purchase via QR scan or Razorpay; admin sets which payment mode. Best in class."

## 1. Scope (v1)

| Area | What ships |
|---|---|
| Public | `/learn` catalog, `/learn/:courseId` course page (trailer, what you'll learn, curriculum with free-preview lessons, instructor, sticky buy card) |
| Purchase | Per-course payment mode set by admin: Razorpay, QR (manual UPI + screenshot), or both. Razorpay unlocks instantly (server-verified + webhook backup). QR goes to admin approval |
| Student | `/account/learning` (My Learning: progress, pending/rejected states), `/learn/:courseId/watch/:lessonId?` player (Vimeo, sidebar curriculum, resume position, auto-complete at 90 %, next/prev, mark complete) |
| Admin | `/admin/elearning`: Courses tab (list + editor: details, pricing, payment mode, access days, curriculum builder with sections/lessons, Vimeo link paste with oEmbed auto-fill of title/duration/thumbnail, reorder, preview toggle, publish) and Purchases tab (pending QR approvals with screenshot zoom, approve/reject with reason, all purchases, grant/revoke access manually) |
| SEO | `/learn` in STATIC_PAGES + nav + footer, published courses in `/sitemap.xml`, server HTML for `/learn/:id` (title, description, canonical, `Course` JSON-LD with `offers`), never `aggregateRating` |
| Finance | Paid e-learning purchases appear in the Finance sales ledger if the ledger supports a new source cleanly |

Out of v1 (later): coupons, certificates of completion, quizzes, WhatsApp purchase notifications, course bundles, drip release.

## 2. Key decisions (and why)

1. **Separate from the existing `courses` collection.** `courses` = offline course fees sold through the cart with instalments. Mixing video access into it would touch the cart/instalment flow. New collections use the `elearn` prefix.
2. **No new Vercel function** (Hobby limit 12, all used). New server actions go into the `api/razorpay.ts` router as `elearn-*` actions, handlers in `api/_razorpay/elearn.ts`.
3. **Video links are private.** Public course doc holds the curriculum outline only (titles, durations, preview flag). Vimeo URLs of paid lessons live in `elearnContent/{courseId}`, readable only by staff or a user with an ACTIVE, unexpired enrollment (Firestore rule). Preview lessons' URLs are on the public doc (they are meant to be free). Admin also sets Vimeo privacy to "Hide from Vimeo" + embed only on javanilife.com (documented in the admin editor as a help note).
4. **Enrollment docs are server-written only** (admin SDK). The client can never grant itself access.
5. **Payment mode per course**: `paymentModes: { razorpay: boolean, upi: boolean }`, at least one true to publish. QR also requires the global UPI settings (`siteSettings/payment`, already exist, with `manualPaymentsEnabled`). If UPI isn't configured, the QR option is hidden and admin sees a warning.
6. **Doc id = slug** generated from the title at creation (`bharatanatyam-basics`, with `-2` on clash), immutable. Clean URLs for SEO.
7. **Vimeo player via `@vimeo/player`** (project dependency, lazy-loaded only on the watch page) for resume position and completion tracking.
8. **Public pages stay in the main bundle** (code's own rule: no Suspense flash). Watch page and admin page are lazy.

## 3. Data model (Firestore)

`elearnCourses/{courseId}` (public read if `status == "published"`, staff read all; write: staff `elearning`)
```
title, subtitle, description (plain text, paragraphs), coverImageUrl, trailerVimeoUrl,
category, level ("beginner"|"intermediate"|"advanced"|"all"), language,
instructorName, instructorBio, instructorPhotoUrl,
outcomes: string[], requirements: string[],
priceInPaise: number, compareAtInPaise?: number,
paymentModes: { razorpay: boolean, upi: boolean },
accessDays: number (0 = lifetime),
status: "draft" | "published", featured: boolean, sortOrder: number,
sections: [{ id, title, lessons: [{ id, title, durationSec, isPreview, previewVimeoUrl? }] }],
lessonCount, totalDurationSec,   // derived on save
createdAt, updatedAt
```
`elearnContent/{courseId}` (read: staff `elearning` OR active unexpired enrollment `elearnEnrollments/{uid}_{courseId}`; write: staff)
```
lessons: { [lessonId]: { vimeoUrl, resourceUrl?, notes? } }
```
`elearnEnrollments/{uid}_{courseId}` (read: owner or staff `elearning`; write: server only, `allow write: if false`)
```
uid, courseId, courseTitle, userName, userEmail, userPhone,
status: "awaiting-payment" | "processing" | "active" | "rejected" | "revoked",
method: "razorpay" | "upi" | "grant",
amountInPaise, razorpayOrderId?, razorpayPaymentId?, upiProofUrl?, upiRef?, rejectReason?,
submittedAt?, activatedAt?, expiresAt? (Timestamp, null = lifetime), reviewedBy?, createdAt, updatedAt
```
`elearnProgress/{uid}_{courseId}` (read/write: owner only, fields whitelisted)
```
uid, courseId, completedLessonIds: string[], lastLessonId, positions: { [lessonId]: seconds }, updatedAt
```

## 4. Server actions (all in `api/_razorpay/elearn.ts`, routed from `api/razorpay.ts`)

| Action | Who | Does |
|---|---|---|
| `elearn-order` | signed-in | Load course (published, razorpay on, price > 0). Refuse if enrollment already active. Create Razorpay order (amount = course price from DB, never from client; notes `{kind:"elearn", courseId, uid}`). Upsert enrollment `awaiting-payment` + `razorpayOrderId` (never downgrade an active one). Return order + key id |
| `elearn-verify` | signed-in owner | Verify signature (timing-safe), fetch payment, check order id, amount and currency match the enrollment, status captured/authorized. Activate (idempotent, transaction) with `expiresAt` from accessDays |
| webhook `payment.captured` with `notes.kind === "elearn"` | Razorpay | Same activation (idempotent), amount checked against the stored order |
| `elearn-submit-upi` | signed-in | Course published + upi mode on + global manual payments enabled. Proof URL must be https Cloudinary of our cloud. Set enrollment `processing` with proof, ref, amount = DB price. Refuse if active |
| `elearn-review` | staff `elearning` | `approve` (→ active), `reject` (reason → rejected, user can resubmit), `grant` (by user email/uid, method grant, amount 0), `revoke` |

Shared activation helper computes `expiresAt` and writes `activatedAt`. Pure helpers (price/expiry/Vimeo parsing/slug/progress %) live in `src/lib/elearning/` with unit tests; server imports the pure ones by copying into `api/_lib/elearn.ts` only if the API tsconfig can't import from `src` (check how `api/_lib/seo-pages.ts` is shared).

## 5. Vimeo link handling

Accept `vimeo.com/123`, `vimeo.com/123/abcdef` (unlisted hash), `player.vimeo.com/video/123?h=abcdef`, `vimeo.com/channels/x/123`. Parse to `{ id, hash }` → embed `https://player.vimeo.com/video/{id}?h={hash}&dnt=1&title=0&byline=0&portrait=0`. Invalid link = inline error in admin. On paste, fetch `https://vimeo.com/api/oembed.json?url=…` to auto-fill title (only if empty), duration, thumbnail; on failure keep manual entry.

## 6. UX notes (best-in-class bar)

- Brand: maroon `--primary`, gold, ivory background; Cormorant Garamond display, Inter body. Light theme (site has no dark mode).
- Course page: hero with cover + play-trailer button, title, subtitle, meta row (lessons, total hours, level, language, access), price with strike-through MRP only if `compareAtInPaise` set; sticky buy card on desktop, sticky bottom bar on mobile; "Already purchased → Continue learning"; "Payment under review" state; curriculum accordion with lock icons and a "Preview" pill that opens a modal player.
- Buy: one button. If both modes → a sheet with two choices (Pay online: UPI apps/cards via Razorpay; Scan QR & upload screenshot). QR sheet shows amount, QR (uploaded image, else generated from UPI id), copy UPI id, upload screenshot + optional UTR, submit → "We'll unlock within a few hours" state.
- Not signed in → login redirect back to the course.
- Player: 16:9 video, below it lesson title + Mark complete + Next; sidebar (desktop) / tab (mobile) with sections, ticks, durations, progress bar; keyboard reachable; resumes last lesson + position.
- Empty states and skeletons everywhere; prefers-reduced-motion respected; 4.5:1 contrast.
- No invented ratings, student counts or reviews.

## 7. Build order (agents)

1. **Foundation** (data layer, server actions, rules, routes + page stubs, nav keys, tests).
2. **Admin UI** (`/admin/elearning`).
3. **Public + student UI + SEO**.
4. Review of payment/security code (one reviewer).
5. Main session: build, tests, Playwright screenshots 390/1440, handoff.

## 8. Deploy needs (ask the owner first)

- `firebase deploy --only firestore:rules` (production rules).
- `git push` (Vercel auto-deploys `main`).
- Razorpay webhook already points at `/api/razorpay/webhook`; no change.
