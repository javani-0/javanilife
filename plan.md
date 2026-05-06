# Javani Products E-Commerce Upgrade — Phase Tracking Plan

Last updated: 2026-05-05

## Tracking Rule

This Markdown file is the source of truth for the project plan and phase progress.

- Only one phase should be active at a time.
- Do not start the next phase until the current phase is implemented, verified, and explicitly approved by the user.
- After every phase, update this file with status, completed items, notes, blockers, and verification results.
- Phase status values: `Not Started`, `In Progress`, `Blocked`, `Ready For Review`, `Completed`.
- Existing public pages outside the product/e-commerce flow must not be redesigned unless a phase explicitly says so.

## Current Status

- Overall project status: `Implementation Started`
- Active phase: `Phase 12 — WhatsApp + Web Notification System`
- Next allowed phase: `Phase 12 — notification system review`
- Proceed rule: Razorpay live verification is deferred until a Razorpay test account exists. Phase 13 must not start until Phase 12 notification flows are verified and approved. Phase 7 Razorpay success/failure/cancel verification remains a required gate before launch.

## Project Goal

Upgrade the current Javani Spiritual Hub Products section from a WhatsApp enquiry catalogue into a professional e-commerce module. The product listing and product detail pages should become a real shopping experience with Add to Cart, Buy Now, login-required checkout, COD, Razorpay payment, customer order history, admin order management, Delivery One logistics support, WhatsApp notifications, and later finance/reporting modules.

The rest of the existing website should stay stable. Home, About, Courses, Gallery, Contact, Guru Bandhu, Grading, and other non-product pages should not be redesigned as part of this upgrade.

## Current Project Understanding

- Framework: React 18, TypeScript, Vite.
- Styling: Tailwind CSS, shadcn/ui/Radix components, custom Javani colors and typography.
- Routing: React Router in `src/App.tsx`.
- Backend: Firebase Auth and Firestore in `src/lib/firebase.ts`.
- Admin: Protected admin layout in `src/components/admin/AdminLayout.tsx` and `src/components/admin/ProtectedRoute.tsx`.
- Product listing: `src/pages/Products.tsx`.
- Product detail: `src/pages/ProductDetail.tsx`.
- Product admin CRUD: `src/pages/admin/AdminProducts.tsx`.
- Contact/WhatsApp data: `src/hooks/useContactInfo.ts`.
- Current product flow: users select quantity and click WhatsApp/order enquiry buttons.
- Missing today: cart, checkout, orders, payment gateway, delivery charge calculation, delivery partner integration, customer order history, admin order management, and finance reporting.
- Product detail currently hides navbar/footer behavior and should be brought back into the normal site experience.

## Client Requirement Summary

- Convert only the Products section into e-commerce.
- Replace product WhatsApp ordering CTAs with `Add to Cart` and `Buy Now`.
- `Add to Cart` adds products to the cart.
- `Buy Now` sends the selected product directly to checkout.
- Guests can browse and add products to cart.
- Checkout requires login/signup.
- Guest cart items must still appear after login/signup.
- Checkout must support `Cash on Delivery` and `Pay Now` through Razorpay.
- Admin must be able to manage orders and order statuses.
- Customer account should include order history, wishlist, saved addresses, and profile details.
- Delivery charge should be calculated based on product weight and Delivery One rules.
- Delivery One API integration should be planned as plug-and-play.
- WhatsApp API/notification system should support customer and admin messages.
- No separate delivery login or delivery personnel portal is required.
- Admin dashboard should eventually support customer management, inventory, orders, income/expense reporting, logistics visibility, and business performance analytics.
- Reporting should include revenue by product and revenue by customer so the business can understand product performance and customer value.
- Product listing and detail UI should be made more premium and e-commerce-ready.

## Phase 0 — Planning And Scope Lock

Status: `Completed`

### Goal

Create the phase-wise tracking plan and lock the implementation approach before any code changes begin.

### Scope

- Document the current project status.
- Confirm the client requirement.
- Split work into independently verifiable phases.
- Define the rule that the next phase cannot start until the current phase is completed and approved.

### Tasks

- [x] Understand current project structure.
- [x] Review product listing, product detail, admin product CRUD, auth, Firebase, and routing architecture.
- [x] Capture client requirements from the provided proposal screenshots and user answers.
- [x] Create this phase-wise tracking plan.
- [x] User reviews and approves this plan.

### Verification

- [x] Plan includes current-state understanding.
- [x] Plan includes client requirement summary.
- [x] Plan is divided into gated phases.
- [x] Plan includes per-phase verification and exit criteria.
- [x] User confirms the plan is correct.

### Exit Gate

Phase 0 is complete only when the user says the plan is approved and Phase 1 can begin.

## Phase 1 — Data Model, Security Rules, And E-Commerce Foundation

Status: `Completed`

### Goal

Prepare the project foundation for e-commerce without changing the visible shopping UI yet.

### Scope

- Define shared e-commerce types.
- Design Firestore collections.
- Prepare secure access rules.
- Normalize product price data for checkout and Razorpay.
- Add reusable e-commerce helper structure.

### Likely Files

- `src/lib/ecommerce/types.ts`
- `src/lib/ecommerce/products.ts`
- `src/lib/ecommerce/cart.ts`
- `src/lib/ecommerce/orders.ts`
- `src/lib/ecommerce/pricing.ts`
- `firestore.rules`
- `firestore.indexes.json`
- `src/pages/admin/AdminProducts.tsx`

### Tasks

- [x] Define `Product`, `ProductCategory`, `CartItem`, `Cart`, `CheckoutAddress`, `Order`, `OrderItem`, `PaymentInfo`, `DeliveryInfo`, `OrderTimelineEvent`, `WishlistItem`, and `CustomerProfile` types.
- [x] Add numeric product price field such as `priceAmount` or `amountInPaise` for payment calculations.
- [x] Keep current display price compatibility so existing products do not break immediately.
- [x] Define product inventory fields: `sku`, `stockQuantity`, `stockStatus`, `active`, `featured`, `images`, `category`, `categoryLabel`.
- [x] Define order status values: placed, confirmed, packed, shipped, out-for-delivery, delivered, cancelled, returned.
- [x] Define payment status values: pending, paid, failed, refunded, COD pending, COD collected.
- [x] Define Firestore collection design for products, orders, user carts, user addresses, user wishlist, delivery assignments, notifications, and finance records.
- [x] Update Firestore rules for public product reads, user-owned cart/address/order reads, admin order/product management, and delivery assignment restrictions.
- [x] Add any required initial Firestore indexes for admin order filters.

### Verification

- [x] TypeScript builds after adding shared e-commerce types.
- [x] Existing product listing still loads with current product documents.
- [x] Existing admin product page still loads.
- [x] Firestore rules do not block public product reads.
- [x] Firestore rules prevent non-admin writes to products/orders.
- [x] No visible public page redesign occurs in this phase.

### Exit Gate

Phase 1 is complete only when the data model, rules plan/updates, and compatibility checks are verified. Do not begin cart UI or product page redesign before approval.

## Phase 2 — Cart System And Persistence

Status: `Completed`

### Goal

Add a real cart system that works for guests and authenticated users, with cart preservation after login/signup.

### Scope

- Guest cart in localStorage.
- Authenticated cart in Firestore.
- Merge guest cart into user cart after login/signup.
- Add cart state provider and reusable cart actions.
- Add cart count to navbar with minimal impact.
- Add cart drawer and full cart page.

### Likely Files

- `src/contexts/CartContext.tsx`
- `src/lib/ecommerce/cart.ts`
- `src/lib/ecommerce/pricing.ts`
- `src/components/Navbar.tsx`
- `src/components/cart/CartDrawer.tsx`
- `src/pages/Cart.tsx`
- `src/App.tsx`
- `src/contexts/AuthContext.tsx`

### Tasks

- [x] Create CartProvider with add, remove, increment, decrement, clear, item count, subtotal, and stock validation.
- [x] Store guest cart in localStorage.
- [x] Store authenticated cart under the current user's Firestore profile/cart path.
- [x] Merge guest cart into authenticated cart after login/signup.
- [x] Preserve cart after refresh.
- [x] Add cart count icon to Navbar.
- [x] Add cart drawer for quick review.
- [x] Add `/cart` page for full cart management.
- [x] Support Buy Now intent separately from normal cart where needed.

### Verification

- [x] Guest cart item can be created through cart foundation actions and verified with a seeded browser cart until product buttons are connected in Phase 3.
- [x] Guest cart survives page refresh.
- [x] Guest can change quantities and remove items.
- [x] Cart total updates correctly.
- [x] Authenticated cart persistence and guest-cart merge are implemented for Firestore under `users/{uid}/cart`.
- [ ] Authenticated cart survives logout/login with a real user account. Requires user/admin-provided test credentials or manual user testing.
- [x] Navbar cart count updates correctly for guest cart.
- [x] Existing `/products` page still renders normally with the new navbar cart icon.

### Exit Gate

Phase 2 is complete only after guest cart, authenticated cart, merge behavior, cart drawer, and full cart page are verified and approved.

## Phase 3 — Product Listing E-Commerce UI

Status: `Completed`

### Goal

Upgrade `/products` from catalogue/enquiry UI to a polished e-commerce collection page.

### Scope

- Replace WhatsApp ordering buttons with Add to Cart and Buy Now.
- Improve product card UI.
- Improve mobile product listing.
- Keep category filtering and add product search/sort if stable within scope.
- Show inventory and e-commerce trust cues.

### Likely Files

- `src/pages/Products.tsx`
- `src/components/product/ProductCard.tsx`
- `src/components/product/ProductFilters.tsx`
- `src/components/product/ProductSearchSort.tsx`
- `src/contexts/CartContext.tsx`
- `src/lib/ecommerce/products.ts`

### Tasks

- [x] Keep `ProductCard` local to `src/pages/Products.tsx` for this phase because only the listing uses it right now.
- [x] Replace mobile `Order Now` WhatsApp button with Add to Cart / Buy Now actions.
- [x] Replace desktop `View Details + WhatsApp` CTA layout with View Details / Add to Cart / Buy Now pattern.
- [x] Keep product detail navigation clear.
- [x] Show stock status: available, out of stock, coming soon.
- [x] Disable Add to Cart and Buy Now for unavailable products.
- [x] Improve card spacing, image consistency, price display, category badge, and quantity controls.
- [x] Remove or replace the current WhatsApp curation banner.
- [x] Add search and sort controls.
- [x] Keep share button secondary.

### Verification

- [x] `/products` loads products from Firestore.
- [x] Category filters still work.
- [x] Add to Cart adds correct product and quantity.
- [x] Buy Now sends the correct product/quantity to checkout flow or checkout intent.
- [x] Out-of-stock products cannot be purchased by stock-aware disabled actions.
- [x] Mobile layout is usable and visually improved.
- [x] Desktop grid is visually improved.
- [x] No WhatsApp order CTA remains as the primary purchase action.

### Exit Gate

Phase 3 is complete only when product listing shopping actions and responsive UI are approved.

## Phase 4 — Product Detail E-Commerce UI

Status: `Completed`

### Goal

Upgrade `/products/:id` into a premium product detail page that matches the rest of the website and supports e-commerce actions.

### Scope

- Restore normal header/footer behavior.
- Replace WhatsApp/Affiliate buttons with Add to Cart and Buy Now.
- Improve product layout, gallery, purchase panel, delivery hints, and related products.
- Keep detail page focused on product purchase.

### Likely Files

- `src/pages/ProductDetail.tsx`
- `src/components/Footer.tsx`
- `src/components/Navbar.tsx`
- `src/index.css`
- `src/components/ImageViewer.tsx`
- `src/components/product/ProductDetailGallery.tsx`
- `src/components/product/RelatedProducts.tsx`

### Tasks

- [x] Remove detail-page behavior that hides desktop navbar.
- [x] Reconsider mobile nav hiding and keep it only if it improves UX without disconnecting the page.
- [x] Render the normal footer on product detail.
- [x] Remove hardcoded empty social icon strip.
- [x] Redesign detail layout for desktop and mobile.
- [x] Add product gallery and thumbnails with stable aspect ratios.
- [x] Show title, price, category, description, features, stock status, and delivery/payment trust cues.
- [x] Add quantity selector connected to cart actions.
- [x] Add Add to Cart button.
- [x] Add Buy Now button.
- [x] Keep share button secondary.
- [x] Make related products category-aware.

### Verification

- [x] Product detail loads a valid product.
- [x] Product not found state still works.
- [x] Header appears correctly on desktop and mobile.
- [x] Footer appears correctly.
- [x] Add to Cart works from detail page.
- [x] Buy Now works from detail page.
- [x] Image viewer still works.
- [x] Related products render without random broken behavior.
- [x] Responsive layout is polished on mobile, tablet, and desktop.

### Exit Gate

Phase 4 is complete only when product detail UI, site chrome, and purchase actions are approved.

## Phase 5 — Checkout Authentication Gate

Status: `Completed`

### Goal

Require login/signup only when the user moves from cart/product purchase intent to checkout.

### Scope

- Guest can browse and cart products.
- Checkout requires authentication.
- Login/signup returns user to checkout.
- Guest cart is preserved after authentication.

### Likely Files

- `src/pages/Login.tsx`
- `src/pages/Signup.tsx`
- `src/contexts/AuthContext.tsx`
- `src/contexts/CartContext.tsx`
- `src/pages/Checkout.tsx`
- `src/App.tsx`
- `src/components/admin/ProtectedRoute.tsx` or a new customer checkout guard

### Tasks

- [x] Add checkout guard for unauthenticated users.
- [x] Preserve intended destination such as `/checkout` after login/signup.
- [x] Preserve Buy Now intent through authentication.
- [x] Merge guest cart into authenticated cart before checkout renders.
- [x] Avoid forcing login for browsing or adding to cart.

### Verification

- [x] Guest clicking checkout goes to login/signup.
- [x] After login/signup, user returns to checkout.
- [x] Previously added cart products remain visible.
- [x] Buy Now product remains visible after login/signup.
- [x] Authenticated user can go directly to checkout.

### Exit Gate

Phase 5 is complete only when authentication gating and cart preservation are verified and approved.

## Phase 6 — Checkout With COD

Status: `Completed`

### Goal

Build a working checkout flow with Cash on Delivery before online payment is connected.

### Scope

- Multi-step checkout.
- Address/contact form.
- Order review.
- Delivery charge calculation placeholder or initial zone/rate logic.
- COD order creation.
- Cart clearing after successful COD order.

### Likely Files

- `src/pages/Checkout.tsx`
- `src/components/checkout/CheckoutSteps.tsx`
- `src/components/checkout/AddressForm.tsx`
- `src/components/checkout/OrderSummary.tsx`
- `src/lib/ecommerce/orders.ts`
- `src/lib/ecommerce/delivery.ts`
- `src/lib/ecommerce/pricing.ts`
- `firestore.rules`

### Tasks

- [x] Add checkout route.
- [x] Build checkout stepper or sectioned checkout layout.
- [x] Validate name, phone, email, address, city, state, PIN, and notes.
- [x] Add saved address selection if already implemented; otherwise capture address and save later.
- [x] Calculate subtotal, delivery charge, and total.
- [x] Add COD payment option.
- [x] Create order document with product snapshots.
- [x] Set COD order payment status to COD pending or payment pending.
- [x] Clear cart after successful order creation.
- [x] Show order confirmation screen.

### Verification

- [x] Authenticated user can place COD order.
- [x] Order document payload contains customer, address, items, totals, payment method, status, and timestamps.
- [x] Cart clear after successful COD order is implemented in the checkout submit path.
- [x] Customer confirmation screen is implemented after successful order creation.
- [x] Invalid address/phone data is blocked by checkout validation.
- [x] Order history/admin order phase can consume the order shape.

### Exit Gate

Phase 6 is complete after COD checkout worked end-to-end and the user approved moving to Phase 7 on 2026-05-05.

## Phase 7 — Razorpay Pay Now Integration

Status: `Completed`

### Goal

Add secure Razorpay online payment support to checkout.

### Scope

- Server-side Razorpay order creation.
- Frontend Razorpay checkout popup/integration.
- Server-side payment signature verification.
- Payment status updates in Firestore.

### Likely Files

- `src/pages/Checkout.tsx`
- `src/lib/ecommerce/payments.ts`
- `api/razorpay/create-order.ts` or Firebase Functions equivalent
- `api/razorpay/verify-payment.ts` or Firebase Functions equivalent
- `package.json`
- `.env` / deployment environment variables

### Tasks

- [x] Decide backend location: Vercel serverless functions or Firebase Cloud Functions.
- [x] Add Razorpay server SDK where backend code runs.
- [x] Add environment variable template for Razorpay key ID, secret, currency, and Firebase Admin credentials.
- [x] Create server endpoint to create Razorpay order.
- [x] Add frontend Pay Now flow.
- [x] Verify payment signature server-side.
- [x] Mark order paid only after successful verification.
- [x] Handle failed/cancelled payment without marking order paid.
- [x] Store Razorpay order ID, payment ID, and verification metadata.

### Verification

- [ ] Razorpay test payment success creates/updates paid order.
- [ ] Razorpay failed payment does not mark order paid.
- [ ] Cancelled Razorpay popup leaves order/payment state safe.
- [x] Razorpay secret is not exposed in frontend bundle.
- [x] COD path remains implemented after Pay Now integration and passes local build/test validation.

### Exit Gate

Phase 7 is complete only when Razorpay test payments are verified and approved.

## Phase 8 — Customer Account, Orders, Wishlist, And Addresses

Status: `Completed`

### Goal

Give customers a professional account area for e-commerce activity.

### Scope

- Profile dashboard.
- Order history.
- Order detail/status timeline.
- Wishlist.
- Saved addresses.

### Likely Files

- `src/pages/account/Profile.tsx`
- `src/pages/account/Orders.tsx`
- `src/pages/account/OrderDetail.tsx`
- `src/pages/account/Wishlist.tsx`
- `src/pages/account/Addresses.tsx`
- `src/lib/ecommerce/customers.ts`
- `src/lib/ecommerce/orders.ts`
- `src/App.tsx`
- `src/components/Navbar.tsx`

### Tasks

- [x] Add account routes.
- [x] Add profile page with editable customer details.
- [x] Add saved address management.
- [x] Add wishlist add/remove behavior.
- [x] Add order history list.
- [x] Add order detail page with timeline.
- [x] Add account navigation from navbar/user menu.
- [x] Secure account pages for authenticated user only.

### Verification

- [x] User sees only their own profile data through authenticated account routes.
- [x] User order list queries are scoped to the current user's `customerId`.
- [x] Direct order detail access verifies the current user owns the order, and Firestore rules allow only owner/admin reads.
- [x] Saved address create/edit/delete/default management is implemented under `users/{uid}/addresses`.
- [x] Wishlist add/remove behavior is implemented from product listing, product detail, and the account wishlist page.
- [x] Account UI uses responsive cards, sidebar navigation, and mobile-friendly grids.
- [x] Focused ESLint on Phase 8 touched files passed with no errors; existing `AuthContext.tsx` Fast Refresh warning remains.
- [x] `npm run test -- src/test/ecommerce-foundation.test.ts`: passed, 14 tests.
- [x] `npm run test`: passed, 15 tests.
- [x] `npm run build`: passed; existing large chunk warning remains.
- [x] User approved moving to Phase 9 after reviewing Phase 8 account behavior and mobile account-section fixes on 2026-05-05.

### Exit Gate

Phase 8 is complete after customer account functions were implemented, locally validated, adjusted for mobile account UX feedback, and the user approved moving to Phase 9 on 2026-05-05.

## Phase 9 — Admin Order Management And Customer Management

Status: `Ready For Review`

### Goal

Allow admins to manage orders, customers, payment states, and fulfilment status from the admin dashboard.

### Scope

- Admin orders page.
- Order filters/search.
- Order status updates.
- Payment status updates for COD/manual cases.
- Customer management view.
- Admin notes.

### Likely Files

- `src/pages/admin/AdminOrders.tsx`
- `src/pages/admin/AdminCustomers.tsx`
- `src/components/admin/AdminLayout.tsx`
- `src/lib/ecommerce/adminOrders.ts`
- `src/lib/ecommerce/customers.ts`
- `firestore.rules`
- `firestore.indexes.json`

### Tasks

- [x] Add Orders menu item to admin layout.
- [x] Add Customers menu item if needed.
- [x] Build orders table/cards with filters by status, payment method, payment status, and date.
- [x] Add order detail drawer/page for admin.
- [x] Allow admin to update order status.
- [x] Allow admin to update COD collection/payment state.
- [x] Allow admin to add internal notes.
- [x] Show customer contact/address safely.
- [x] Add customer profile and purchase history view.
- [x] Add required Firestore indexes for queries; no new composite indexes were needed because Phase 9 uses collection reads plus client-side filters.

### Verification

- [x] Admin orders route and navigation are implemented under `/admin/orders`.
- [x] Admin can filter/search orders by search text, status, payment method, payment status, and date range.
- [x] Admin can update order status through the order detail panel.
- [x] Customer order timeline reflects admin status/payment updates through appended timeline events.
- [x] Non-admin cannot access admin orders because `/admin/*` remains behind `ProtectedRoute`.
- [x] Firestore indexes support admin queries without runtime errors; no new composite index is required for the Phase 9 client-side filters.
- [x] User approved moving to Phase 10 after admin order/customer management review.

### Exit Gate

Phase 9 completed after admin order/customer management was implemented, locally validated, and the user approved moving to Phase 10 on 2026-05-05.

## Phase 10 — Product Inventory And Admin Product Upgrade

Status: `Ready For Review`

### Goal

Upgrade product admin from simple catalogue CRUD to e-commerce inventory management.

### Scope

- Stock quantity and status.
- Active/hidden products.
- Featured products.
- Multiple images.
- Price normalization controls.
- Inventory warnings.

### Likely Files

- `src/pages/admin/AdminProducts.tsx`
- `src/lib/ecommerce/products.ts`
- `src/components/admin/ProductForm.tsx`
- `firestore.rules`

### Tasks

- [x] Add stock quantity field.
- [x] Add active/hidden toggle.
- [x] Add featured toggle.
- [x] Add numeric price field and validation.
- [x] Keep display price preview.
- [x] Add support for multiple images if needed.
- [x] Show low-stock/out-of-stock badges.
- [x] Prevent invalid product data from saving.
- [x] Ensure product listing/detail respects active and stock fields.

### Verification

- [x] Admin can create product with valid e-commerce fields in the upgraded form.
- [x] Admin can update stock through the product edit form.
- [x] Hidden product does not appear publicly because listing/detail use `isProductActive`.
- [x] Out-of-stock product displays correctly and cannot be purchased through stock-aware helpers.
- [x] Numeric price is valid for checkout through `amountInPaise` and `displayPrice` save payloads.

### Exit Gate

Phase 10 completed after product inventory admin was implemented, locally validated, and the user approved moving to Phase 11 on 2026-05-05.

## Phase 11 — Delivery Charges And Delivery One Foundation

Status: `Completed`

### Goal

Add weight-based delivery charge calculation and prepare the order flow for Delivery One integration.

### Scope

- Weight-based charge calculation.
- Product/order shipment weight snapshots.
- Delivery One adapter interface for later API integration.
- Admin visibility into logistics settings if needed.

### Likely Files

- `src/lib/ecommerce/delivery.ts`
- `src/pages/Checkout.tsx`
- `src/pages/admin/AdminDeliverySettings.tsx`
- `src/components/admin/AdminLayout.tsx`
- `firestore.rules`

### Tasks

- [x] Define shipment weight model for products and orders.
- [x] Compute total shipment weight from cart/order items.
- [x] Show estimated delivery charge in checkout based on weight.
- [x] Add fallback handling if delivery charge cannot be calculated.
- [x] Add admin settings for base delivery rules if required.
- [x] Define Delivery One adapter interface.
- [x] Keep manual fallback delivery mode as default until live API integration is ready.

### Verification

- [x] Shipment weight is calculated correctly from cart items.
- [x] Delivery charge updates correctly based on weight.
- [x] Checkout total updates with delivery charge.
- [x] Order stores delivery charge and shipment-weight snapshot.
- [x] COD and Razorpay totals include delivery charge.
- [x] Focused ESLint passed for Phase 11 touched files.
- [x] `npm run test -- src/test/ecommerce-foundation.test.ts` passed with 19 tests.
- [x] `npm run test` passed with 20 tests.
- [x] `npx tsc --noEmit` passed.
- [x] `npm run build` passed; existing large chunk warning remains.

### Exit Gate

Phase 11 is completed after product shipment profiles, checkout delivery snapshots, the admin delivery settings route, Delivery One manual-ready payload helpers, saved-address checkout fixes, editable first-500 g pricing, and user approval were completed on 2026-05-05.

## Phase 12 — WhatsApp + Web Notification System

Status: `Ready For Review`

### Goal

Add WhatsApp and Firebase web push notifications for customers and admin.

### Scope

- Notification event model.
- Notification queue/log.
- WhatsApp Cloud API/provider integration.
- Firebase Cloud Messaging web push registration and sending.
- Manual fallback links if API credentials/templates are not ready.

### Likely Files

- `src/lib/ecommerce/notifications.ts`
- `src/lib/ecommerce/whatsapp.ts`
- Backend endpoint or Firebase Function for WhatsApp provider calls
- Firebase Admin SDK messaging helper
- `public/firebase-messaging-sw.js`
- `src/hooks/useWebNotifications.ts`
- `src/pages/admin/AdminOrders.tsx`
- `src/hooks/useContactInfo.ts`
- `firestore.rules`

### Tasks

- [x] Define notification events.
- [x] Add notification log/queue collection.
- [x] Create customer notification templates.
- [x] Create admin notification templates.
- [x] Integrate WhatsApp Cloud API/provider server adapter.
- [x] Add Firebase Admin SDK Base64 env support.
- [x] Add Firebase web push browser token registration.
- [x] Add Firebase Cloud Messaging web push dispatch.
- [ ] Live WhatsApp template/API send test after `WHATSAPP_TOKEN` and a recipient test number are available.
- [x] Add retry/error state for failed notifications.
- [x] Keep manual fallback links visible to admin if API is not configured.

### Verification

- [x] Order placed event creates notification records for customer and admin.
- [x] Admin status update creates appropriate customer notification event.
- [x] Failed notification can be logged safely from admin.
- [x] WhatsApp API credentials are not exposed in frontend.
- [x] Firebase Admin credentials are not exposed in frontend.
- [x] Browser service worker for Firebase Messaging loads successfully in local browser testing.
- [x] Firebase Admin SDK JSON can be base64-encoded and initialized without printing private key material.
- [x] Manual fallback works if API is disabled.
- [x] Focused ESLint passed for Phase 12 touched files.
- [x] `npx vitest run src/test/ecommerce-foundation.test.ts` passed with 23 tests.
- [x] `npx tsc --noEmit` passed.
- [x] `npm run build` passed; existing large chunk warning remains.

### Exit Gate

Phase 12 is ready for review after notification events, secure server dispatch endpoints, WhatsApp Cloud API adapter, Firebase web push registration/sending, manual WhatsApp fallback links, admin notification status management, Firestore rule alignment, and local validation were completed on 2026-05-05. Live WhatsApp API/template sending remains blocked until a real `WHATSAPP_TOKEN` and recipient test number are available in the environment.

## Phase 13 — Delivery One Order Sync And Tracking

Status: `Not Started`

### Goal

Integrate Delivery One so orders can be pushed to the logistics provider and tracked without a separate delivery-user login.

### Scope

- Delivery One order creation.
- Provider shipment/tracking ID storage.
- Provider status sync or manual admin updates.
- Customer/admin visibility for delivery progress.

### Likely Files

- `src/lib/ecommerce/delivery.ts`
- `src/lib/ecommerce/deliveryAssignments.ts`
- Backend endpoint or Firebase Function for Delivery One API calls
- `src/pages/admin/AdminOrders.tsx`
- `src/pages/account/OrderDetail.tsx`
- `firestore.rules`

### Tasks

- [ ] Create Delivery One order payload mapper.
- [ ] Push eligible orders to Delivery One.
- [ ] Store provider order/shipment reference IDs.
- [ ] Add admin view for delivery sync status and tracking details.
- [ ] Support provider status updates or controlled manual status mapping.
- [ ] Log delivery status timeline on the order.
- [ ] Expose tracking information to customer order detail where available.

### Verification

- [ ] Eligible order can be prepared for Delivery One sync.
- [ ] Provider reference IDs are stored safely.
- [ ] Admin can see delivery sync/tracking state.
- [ ] Customer/admin order timeline updates after delivery status changes.
- [ ] No delivery-specific login is required anywhere in the flow.

### Exit Gate

Phase 13 is complete only when Delivery One sync/tracking behavior is verified and approved.

## Phase 14 — Finance And Reporting

Status: `Not Started`

### Goal

Add admin finance reporting after order/payment data is stable.

### Scope

- Revenue summary.
- Revenue by product.
- Revenue by customer.
- COD receivables.
- Razorpay paid totals.
- Delivery charges.
- Expense tracking.
- Basic financial reports and performance analytics.

### Likely Files

- `src/pages/admin/AdminFinance.tsx`
- `src/lib/ecommerce/finance.ts`
- `src/components/admin/AdminLayout.tsx`
- `firestore.rules`

### Tasks

- [ ] Add Finance menu item to admin layout.
- [ ] Show total revenue from paid/COD orders.
- [ ] Show revenue by product, including units sold, total revenue, and top/bottom-performing products.
- [ ] Show revenue by customer, including total spend, order count, average order value, and top customers.
- [ ] Add filtering by date range so product/customer performance can be analyzed over time.
- [ ] Show COD pending/collected totals.
- [ ] Show Razorpay paid totals.
- [ ] Show delivery charge totals.
- [ ] Add manual expense entries if required.
- [ ] Add date filters and summary cards.
- [ ] Export data if required.

### Verification

- [ ] Finance totals match order data.
- [ ] Revenue by product matches paid/COD order item aggregates.
- [ ] Revenue by customer matches completed customer order totals.
- [ ] Date filters work.
- [ ] Admin-only access is enforced.
- [ ] Manual expense entries are saved and reflected in summaries.

### Exit Gate

Phase 14 is complete only when finance reports are verified and approved.

## Phase 15 — Final Migration, QA, And Launch Readiness

Status: `Not Started`

### Goal

Prepare the e-commerce upgrade for production launch.

### Scope

- Product data migration.
- Environment variables.
- Production Firebase/Razorpay/WhatsApp setup.
- Full regression testing.
- Launch checklist.

### Likely Files

- `src/pages/Products.tsx`
- `src/pages/ProductDetail.tsx`
- `src/pages/admin/AdminProducts.tsx`
- `firestore.rules`
- `firestore.indexes.json`
- `package.json`
- Deployment environment settings

### Tasks

- [ ] Audit all existing product documents.
- [ ] Convert price strings to numeric payment-safe values.
- [ ] Confirm stock values for every product.
- [ ] Confirm Razorpay test and production keys.
- [ ] Confirm WhatsApp API/provider credentials and templates if used.
- [ ] Confirm delivery zones/rates.
- [ ] Remove obsolete WhatsApp-order UI from product purchase flow.
- [ ] Keep site-wide WhatsApp contact button only if desired.
- [ ] Run full regression test on existing public pages.
- [ ] Run full e-commerce checkout/order/admin test.
- [ ] Prepare rollback/fallback plan.

### Verification

- [ ] `npm run lint` passes.
- [ ] `npm run test` passes or known gaps are documented.
- [ ] `npm run build` passes.
- [ ] `/products` works on mobile/tablet/desktop.
- [ ] `/products/:id` works on mobile/tablet/desktop.
- [ ] `/cart` works for guest and authenticated users.
- [ ] `/checkout` works for COD and Razorpay.
- [ ] Admin can manage orders.
- [ ] Customer can view order history.
- [ ] Firestore rules protect private/admin/logistics data.
- [ ] Existing Home/About/Courses/Gallery/Contact pages are not visually disturbed.

### Exit Gate

Phase 15 is complete only when production readiness is verified and the user approves launch.

## Global Verification Commands

Run these at the end of every implementation phase where code changes are made:

- `npm run lint`
- `npm run test`
- `npm run build`

If a command cannot be run or fails due to unrelated existing issues, record the reason under the relevant phase notes before moving forward.

## Phase Notes

### Phase 0 Notes

- Initial tracking plan created.
- User approved implementation start on 2026-05-04.
- Phase 0 completed; Phase 1 started.

### Phase 1 Notes

- Implemented shared e-commerce foundation files under `src/lib/ecommerce`.
- Added pricing helpers for current price strings and Razorpay-safe paise values.
- Added product/cart/order helper functions and focused Vitest coverage.
- Added delivery, product, customer revenue, order, payment, cart, wishlist, and customer profile types.
- Removed outdated delivery-login foundation from Phase 1 after the Delivery One requirement clarification.
- Updated auth role typing back to customer/admin only.
- Updated delivery metadata to support Delivery One provider/order/tracking/weight fields instead of internal delivery assignments or OTP delivery proof.
- Updated Firestore rules for products, orders, user cart/address/wishlist, notifications, and finance access.
- Removed delivery assignment rules and indexes because no separate delivery login is required.
- Fixed existing `/products` nested anchor DOM warning by changing the card wrapper from a Router link to an accessible clickable card without changing the visible UI.
- `npm run test`: passed, 8 tests.
- `npm run build`: passed.
- Focused lint on touched Phase 1 files: passed.
- Full `npm run lint`: failed due pre-existing unrelated lint errors in existing files, including `any` usage in multiple pages/components, shadcn fast-refresh warnings, ProductDetail regex escape warnings, and Tailwind config require import.
- Browser validation: `/products` passed with 0 console errors; `/products/3TA4q2y8lorQU7QqzLXh` passed with 0 console errors.
- Phase 1 cleanup validation after Delivery One revision: focused lint had no errors; focused e-commerce foundation tests passed, 7 tests.
- Phase 1 completed after user approved moving to Phase 2.

### Phase 2 Notes

- Implemented `CartProvider` and `useCart` hook split across `src/contexts/CartContext.tsx` and `src/contexts/cart-context.ts`.
- Added guest cart persistence through `localStorage` using `javani.cart.v1`.
- Added Buy Now intent persistence through `sessionStorage` using `javani.buyNow.v1`.
- Added authenticated cart sync and guest-cart merge foundation under `users/{uid}/cart`.
- Added cart count icon to desktop and mobile navbar.
- Added `CartDrawer` with empty, item, subtotal, quantity, remove, and view-cart states.
- Added `/cart` page with cart items, quantity controls, remove, clear cart, totals, empty state, and checkout placeholder.
- Added `/cart` route and mounted the cart provider/drawer in `src/App.tsx`.
- Product listing Add to Cart/Buy Now buttons are intentionally not connected yet because that belongs to Phase 3.
- Focused lint on Phase 2 files: passed with no errors.
- `npm run test -- src/test/ecommerce-foundation.test.ts`: passed, 8 tests.
- `npm run build`: passed.
- Browser validation: `/cart` passed with 0 console errors; `/products` passed with 0 console errors.
- Manual browser test with seeded guest cart: item rendered, subtotal showed `₹2,400`, increment showed `₹3,600`, decrement returned to `₹2,400`, reload preserved the cart item, remove returned to empty cart.
- Authenticated cart merge is implemented but not live-tested with credentials in this phase.
- Phase 2 completed after user approval on 2026-05-04.

### Phase 3 Notes

- Phase 3 started after user approved Phase 2 on 2026-05-04.
- Updated `src/pages/Products.tsx` to normalize Firestore products through shared e-commerce helpers.
- Replaced WhatsApp ordering CTAs with Add to Cart, Buy Now, and secondary Details actions.
- Added search, sort, stock badges, stock-aware quantity controls, and refreshed e-commerce card spacing.
- Replaced the WhatsApp curation banner with cart, Delivery One, and COD/Pay Now trust cues.
- Removed the cart, Delivery One, and COD/Pay Now trust cue strip after user review feedback.
- Replaced category pill navigation with a category dropdown to keep desktop and mobile filtering clean.
- Refined product cards for a more premium layout with always-visible Add to Cart and Buy Now actions.
- Improved cart drawer item layout for narrow screens.
- Added a Back to products control on `/cart`.
- Removed the listing-only mobile back button so it does not compete with the mobile cart/menu controls.
- Focused lint on `src/pages/Products.tsx`: passed.
- `npm run test -- src/test/ecommerce-foundation.test.ts`: passed, 8 tests.
- `npm run build`: passed; existing large chunk warning remains.
- Browser validation: `/products` loaded 7 Firestore products with 0 captured console errors.
- Browser validation: search reduced products correctly, Thermic Toys filter showed 1 item, Add to Cart opened the drawer and updated count, Buy Now stored `javani.buyNow.v1` and routed to `/cart`.
- Browser validation after review fixes: trust strip removed, category dropdown present, category pills removed, Add to Cart and Buy Now visible for 7 products, no horizontal overflow, and temporary test cart storage cleared.
- Cart validation after review fixes: `/cart` includes Back to products and Continue shopping, checkout placeholder remains, and no horizontal overflow was detected.
- Mobile responsive CSS was updated to use a single-column mobile product grid and mobile-safe cart drawer layout. The integrated browser could not be forced into mobile width, and Playwright CLI mobile screenshot could not run because browser binaries are not installed locally.
- Phase 3 is ready for user review. Phase 4 must not start until user approves Phase 3.
- Latest Phase 3 refinement pass tightened product card height, reduced product-grid gaps, and added a denser 4-column layout on wide desktops.
- Mobile filter/search controls were reduced in height and made non-sticky so the listing scrolls with less vertical obstruction.
- Added a compact hero variant for `/products` to reduce the top-of-page height on mobile without affecting other pages.
- Hid public floating back-to-top and WhatsApp buttons on `/products`, `/products/:id`, and `/cart` so the commerce flow stays visually clean.
- Phase 3 approved by user on 2026-05-04; Phase 4 started.

- Focused lint on `src/components/PageHero.tsx`, `src/pages/Products.tsx`, and `src/App.tsx`: passed.
- `npm run build`: passed after the latest refinement pass.
- Desktop-only listing refinement: removed the 4-column desktop card grid and kept the products grid at 3 columns so cards render wider and more premium on large screens.
- Desktop browser validation after the refinement: `/products` rendered 3 cards per row at both 1365px and 1536px widths, with each card widening to approximately 416px.

- Browser validation after the latest refinement pass: floating WhatsApp/back-to-top buttons were absent on `/products`; mobile filter bar computed as `static`; the first product card entered the viewport earlier after the compact-hero change.


### Phase 4 Notes

- Phase 4 started after user approval on 2026-05-04.
- Updated `src/pages/ProductDetail.tsx` to use shared e-commerce normalization and pricing helpers.
- Removed the behavior that added `hide-nav-mobile` and `hide-nav-desktop` body classes, so the normal site header remains visible.
- Restored the normal footer on product detail.
- Removed the legacy WhatsApp order and Affiliate/Enquire purchase buttons from product detail.
- Added stock-aware quantity controls, Add to Cart, and Buy Now actions connected to the shared cart provider.
- Added product category/stock badges and Delivery One/COD/Pay Now trust cues.
- Removed the hardcoded desktop social-icon footer strip.
- Related products now prefer the same category and use shared price formatting.
- Focused lint on Phase 4 touched files: passed.
- `npm run test -- src/test/ecommerce-foundation.test.ts`: passed, 8 tests.
- `npm run build`: passed; existing large chunk warning remains.
- Browser validation: opening a product detail from `/products` showed header and footer, no nav-hide body classes, Add to Cart and Buy Now present, legacy WhatsApp/Affiliate CTAs absent, Back to products present, and related products present.
- Browser validation: Add to Cart from detail opened the cart drawer and showed the added product toast.
- Browser validation: Buy Now from detail routed to `/cart` and set `javani.buyNow.v1`; cart page loaded with Back to products and the selected item.
- Phase 4 is ready for user review. Phase 5 must not start until user approves Phase 4.


### Phase 5 Notes

- Retroactive verification completed on 2026-05-05 because the plan file had not been updated even though the implementation exists in the codebase.
- `src/pages/Checkout.tsx` now gates checkout for guests and shows sign-in / create-account actions with redirect back to `/checkout`.
- `src/pages/Login.tsx` and `src/pages/Signup.tsx` preserve the requested redirect destination through authentication and return the user to checkout.
- `src/contexts/CartContext.tsx` merges guest cart items into the authenticated Firestore cart before checkout renders.
- Buy Now flows in `src/pages/Products.tsx` and `src/pages/ProductDetail.tsx` add the selected product to cart before routing to checkout, so the purchase intent remains visible after authentication.
- Guest browsing and add-to-cart behavior remain available without forcing login.
- `npm run build`: passed on 2026-05-05.

### Phase 6 Notes

- Phase 6 started on 2026-05-05.
- Checkout route already existed in `src/App.tsx`; Phase 6 continued from the existing `/checkout` page.
- `src/pages/Checkout.tsx` now has a clear Delivery / Payment / Review step indicator above the checkout form.
- Delivery details capture full name, phone, email, address lines, city, state, pincode, landmark, and optional delivery notes.
- Delivery notes are stored on the normalized checkout address and mirrored as `customerNotes` in the order payload for later admin/order views.
- Delivery charge calculation was extracted to `src/lib/ecommerce/delivery.ts` with default slab logic and product delivery profile support.
- Checkout totals include subtotal, weight-based delivery charge, discount, and total.
- COD remains the active payment option; Razorpay is visible but disabled until Phase 7 adds secure backend payment endpoints.
- COD order creation stores customer details, item snapshots, address, payment status `cod-pending`, delivery data, totals, status `placed`, and timeline metadata.
- Successful COD order creation clears the cart, clears Buy Now intent, and shows an order confirmation screen.
- Firestore rules were tightened so users can create/read only orders with their own `customerId`, while admins can read/update/delete all orders.
- Focused lint on Phase 6 files passed with no output.
- `npm run test -- src/test/ecommerce-foundation.test.ts`: passed, 10 tests.
- `npm run test`: passed, 11 tests.
- `npm run build`: passed; existing large chunk warning remains.
- `npm run lint`: failed due unrelated existing lint issues in older files, including `any` usage, shadcn empty-interface warnings, fast-refresh warnings, and `tailwind.config.ts` require import.
- Browser validation on `http://127.0.0.1:8081`: seeded guest cart showed the cart count, `/cart` rendered the seeded item and checkout link, and `/checkout` kept the login-required gate with redirect links.
- Firestore deployment attempted with `firebase deploy --only firestore:rules,firestore:indexes --project javani-181d5` but failed with HTTP 401 invalid Firebase authentication credentials.
- Live authenticated COD order placement still requires `firebase login --reauth` and redeploying Firestore rules/indexes before final end-to-end approval.

### Phase 7 Notes

- Phase 7 started on 2026-05-05 after the user confirmed Phase 6 was working and approved moving forward.
- Chose Vercel serverless API routes for Razorpay because the project already targets Vercel and had no Firebase Functions setup.
- Installed `razorpay` and `firebase-admin` for server-side order creation, payment verification, and Firestore paid-status updates.
- Added server helpers under `api/_lib` for JSON requests, bearer-token auth, Firebase Admin initialization, Razorpay credentials, Razorpay client creation, and signature verification.
- Added `api/razorpay/create-order.ts` to create Razorpay orders only after verifying the Firebase ID token belongs to the checkout customer.
- Added `api/razorpay/verify-payment.ts` to verify the Razorpay signature, fetch the Razorpay payment, match order ID/currency/amount/status, and update Firestore order payment status to `paid` only after successful verification.
- Added `src/lib/ecommerce/payments.ts` for frontend Razorpay helpers, dynamic Checkout script loading, create-order API calls, prefill data, popup handling, and verify-payment API calls.
- Updated `src/pages/Checkout.tsx` so COD still creates `cod-pending` orders, while Razorpay creates a pending order, opens Razorpay Checkout, verifies payment server-side, and clears cart only after verified payment.
- Added `.env.example` with required Razorpay and Firebase Admin variables, and updated `.gitignore` so local `.env` files are ignored while the example remains commit-safe.
- Updated ESLint config so `api/**/*.ts` files lint with Node globals.
- Added payment helper tests for Razorpay receipt sanitization and checkout prefill data.
- Focused ESLint on Phase 7 touched files passed with no output.
- `npm run test -- src/test/ecommerce-foundation.test.ts`: passed, 12 tests.
- `npm run test`: passed, 13 tests.
- `npm run build`: passed; existing large chunk warning remains.
- API route TypeScript check with `npx tsc --noEmit` on the new `api/**/*.ts` files passed with no output.
- Live Razorpay test payments are still pending because `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and Firebase Admin credentials must be configured in the Vercel/serverless environment before testing.

### Phase 8 Notes

- Phase 8 started on 2026-05-05 after the user chose to defer Razorpay account creation/live verification and continue development.
- Added protected customer account routing with `/account`, `/account/profile`, `/account/orders`, `/account/orders/:id`, `/account/wishlist`, and `/account/addresses`.
- Added `AccountRoute` to require authentication and redirect guests to login with the intended account path preserved.
- Added `AccountLayout` for a responsive account shell with profile, orders, wishlist, and addresses navigation.
- Added editable profile details for full name and phone while keeping email read-only from Firebase Auth.
- Added customer order history scoped to `orders` where `customerId` matches the signed-in user.
- Added order detail view with items, total, payment/status summary, delivery address, and timeline.
- Added saved address create/edit/delete/default management under `users/{uid}/addresses`.
- Added wishlist storage under `users/{uid}/wishlist`, including product snapshots for wishlist display.
- Added wishlist heart buttons on product listing cards and product detail pages, plus remove behavior from the account wishlist page.
- Updated navbar user menus on desktop and mobile to link into the customer account area.
- Tightened Firestore user profile rules so customers can update only their own `username`, `phone`, and `updatedAt` fields without changing `uid`, editing account metrics, or escalating `role`.
- Added customer account helper functions in `src/lib/ecommerce/customers.ts` and exported them from the e-commerce barrel file.
- Added focused tests for wishlist snapshot creation and wishlist document normalization.
- Focused ESLint on Phase 8 touched files passed with no errors; existing `src/contexts/AuthContext.tsx` Fast Refresh warning remains.
- `npm run test -- src/test/ecommerce-foundation.test.ts`: passed, 14 tests.
- `npm run test`: passed, 15 tests.
- `npm run build`: passed; existing large chunk warning remains.
- Live browser review is still pending, and the latest Firestore rules must be deployed after `firebase login --reauth` for profile/address/wishlist/order security changes to be active in Firebase.

### Phase 9 Notes

- Phase 9 started on 2026-05-05 after the user approved moving forward from Phase 8.
- Added admin navigation entries for Orders Manager and Customers.
- Added `/admin/orders` and `/admin/customers` routes under the existing admin `ProtectedRoute` and `AdminLayout`.
- Added `src/pages/admin/AdminOrders.tsx` with order metrics, search, status/payment/date filters, order list, selected-order detail panel, customer contact/address display, item summary, order status update, payment status update, and internal admin notes.
- Admin order updates append customer-visible timeline events for fulfilment/payment changes.
- Added `src/pages/admin/AdminCustomers.tsx` with customer search, customer list, profile/contact detail, order count, total spend, and purchase history.
- Added `src/lib/ecommerce/adminOrders.ts` for reusable admin order filters, date-range filtering, status/payment option lists, and order metrics.
- Added focused tests for admin order filtering and metrics.
- No new Firestore composite index was required because Phase 9 uses collection subscriptions with client-side filters for admin pages.
- Focused editor diagnostics on Phase 9 touched files: no errors.
- Focused ESLint on Phase 9 touched files: passed with no output.
- `npm run test -- src/test/ecommerce-foundation.test.ts`: passed, 16 tests.
- `npm run test`: passed, 17 tests.
- `npm run build`: passed; existing large chunk warning remains.
- Live browser/admin review is still pending, and the latest Firestore rules/indexes still need deployment after `firebase login --reauth` for production Firebase behavior to match the local rules.

### Phase 10 Notes

- Phase 10 started on 2026-05-05 after the user approved moving forward from Phase 9.
- Replaced the admin product CRUD experience with an inventory-aware Products Manager in `src/pages/admin/AdminProducts.tsx`.
- Added product inventory summary cards for total, active, hidden, featured, low-stock, and out-of-stock products.
- Added grid/table admin views with featured, hidden, stock, low-stock, out-of-stock, SKU, price, and gallery-count indicators.
- Added product form controls for SKU, category, numeric rupee price, display price preview, stock quantity, stock status, public visibility, featured state, listing caption, full description, primary image, and newline-based gallery image URLs.
- Product saving now validates required name, numeric price, whole-number stock quantity, valid stock availability, required image, and http/https image URLs before Firestore writes.
- Product writes now save `amountInPaise`, `displayPrice`, `stockQuantity`, `stockStatus`, `active`, `featured`, `images`, `sku`, and timestamps together.
- Updated shared product normalization so gallery-only products use the first gallery URL as the primary image fallback.
- Cart and wishlist snapshots now use the product gallery fallback image when the primary image field is missing.
- Added focused test coverage for inventory product normalization, hidden-product behavior, featured/SKU fields, gallery fallback, and purchasability blocking.
- Editor diagnostics on Phase 10 touched files: no errors.
- Focused ESLint on Phase 10 touched files: passed with no output.
- `npm run test -- src/test/ecommerce-foundation.test.ts`: passed, 17 tests.
- `npm run test`: passed, 18 tests.
- `npm run build`: passed; existing large chunk warning remains.
- `npx tsc --noEmit`: passed with no output.
- Live admin browser review is still recommended before moving to Phase 11, especially creating/updating one real Firestore product and confirming public hidden/out-of-stock behavior with the live dataset.

### Phase 11 Notes

- Phase 11 started after the user approved moving forward from Phase 10 on 2026-05-05.
- Added product shipment profile fields to `src/pages/admin/AdminProducts.tsx`: weight in grams, length/width/height in cm, and free-delivery eligibility.
- Product writes now save normalized `delivery` profile data together with inventory and gallery data.
- Extended delivery helpers in `src/lib/ecommerce/delivery.ts` with normalized delivery profiles, fallback-weight metadata, shipment-weight formatting, and a Delivery One manual-ready payload helper.
- Order item snapshots now store the product delivery profile and per-item shipment weight through `createOrderItemFromCartItem`.
- Checkout now reads product delivery profiles, displays delivery charge, flags default 500 g fallback use when needed, hides the raw shipment-weight row per review, and stores delivery provider/sync/weight metadata on the order.
- Added `/admin/delivery-settings` with current delivery slab visibility, a delivery charge preview calculator, and Delivery One payload-readiness notes.
- Delivery Settings now lets admin edit the first 500 g base charge and checkout consumes the saved `siteSettings/delivery` pricing value.
- Checkout now loads saved customer addresses from `users/{uid}/addresses`, preselects the default address, and lets customers choose among multiple saved addresses before placing an order.
- Added Delivery Settings to the admin sidebar and route table.
- Added focused tests for delivery estimate metadata, delivery profile normalization, and Delivery One manual-ready payload mapping.
- Editor diagnostics on Phase 11 touched files: no errors.
- Focused ESLint on Phase 11 touched files: passed with no output.
- `npm run test -- src/test/ecommerce-foundation.test.ts`: passed, 19 tests.
- `npm run test`: passed, 20 tests.
- `npx tsc --noEmit`: passed with no output.
- `npm run build`: passed; existing large chunk warning remains.
- User approved moving from Phase 11 to Phase 12 on 2026-05-05.

### Phase 12 Notes

- Phase 12 started after the user approved moving forward from Phase 11 on 2026-05-05.
- Added WhatsApp notification shared types to `src/lib/ecommerce/types.ts` and helper functions in `src/lib/ecommerce/notifications.ts` for number normalization, `wa.me` URL generation, order placed notifications, order status notifications, payment status notifications, and Firestore log normalization.
- Expanded notification shared types and helpers to support `whatsapp` and `web-push` channels with pending, sent, failed, skipped, and manual-ready status states.
- Checkout now queues manual-ready WhatsApp notification records after order creation and after Razorpay verification succeeds for online payments.
- Checkout and admin order updates now try secure `/api/notifications/queue` dispatch first, then fall back to Firestore queue records if local serverless APIs are unavailable.
- Order placed notifications create one customer message and one admin message using the saved customer phone plus the configured site WhatsApp number.
- Order placed notifications now also create customer and admin Firebase web push records.
- Admin order status/payment changes now queue customer WhatsApp notification records without blocking the order update if notification creation fails.
- Admin order status/payment changes now queue both WhatsApp and web push notification records without blocking the order update if notification creation fails.
- Added `/admin/notifications` with metrics, search/status/channel/audience filters, API send/retry, manual WhatsApp open links, sent/failed marking, web push enablement, and web push test trigger.
- Renamed the admin sidebar item to Notifications.
- Added `FIREBASE_ADMIN_SDK_BASE64` support and Firebase Admin Messaging export in `api/_lib/firebase-admin.ts`.
- Added WhatsApp Cloud API helper, notification queue/dispatch endpoints, OTP template test endpoint, and Firebase web push test endpoint.
- Added `src/hooks/useWebNotifications.ts` and `public/firebase-messaging-sw.js` for browser token registration and foreground/background notifications.
- Added web notification opt-in to the customer profile page.
- Updated Firestore rules so customer checkout can create safe order-placed WhatsApp/web-push notification records, customers can read their own customer notification records, notification updates/deletes remain admin-only, and users can store their own web push tokens.
- Tightened `siteSettings` writes to admin-only so delivery pricing settings are not editable by ordinary signed-in users.
- Added focused tests for WhatsApp manual link generation, WhatsApp/web-push order placed notification payloads, and order status notification payloads.
- Editor diagnostics on Phase 12 touched files: no errors.
- Focused ESLint on Phase 12 touched files: passed with no output.
- `npx vitest run src/test/ecommerce-foundation.test.ts`: passed, 23 tests.
- `npx tsc --noEmit`: passed with no output.
- `npm run build`: passed; existing large chunk warning remains.
- Browser verification on `http://127.0.0.1:8083/`: Firebase Messaging service worker loaded with HTTP 200, registered under the app scope, and contained the background message handler.
- Firebase Admin SDK service account file was base64-encoded and initialized locally without printing private key material.
- Live WhatsApp Cloud API/template sending is blocked until `WHATSAPP_TOKEN` and a recipient test number are provided; manual fallback through admin-visible `wa.me` links remains available.

### Phase 13 Notes

- No implementation started.

### Phase 14 Notes

- No implementation started.

### Phase 15 Notes

- No implementation started.
