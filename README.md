# N&D Nature Healthy Food

E-commerce, custom powder-processing and admin platform for **N&D Nature Healthy Food**: dehydrated fruit, vegetable and herbal powders.

**Stack:** Angular 22 (standalone components, signals, zoneless, SSR with `@angular/ssr`) · Express 5 API (same Node process) · TypeScript · Tailwind CSS 4 · GSAP + ScrollTrigger · Lucide · Supabase (Postgres, Auth phone OTP, Storage, RLS) · Razorpay · Resend email · optional WhatsApp Cloud API.

---

## What's included

| Area | Highlights |
|---|---|
| **Homepage** | One continuous, pinned, scroll-linked production story in 10 stages: fresh ingredients → washing → cutting & slicing → dehydration → dried collection → grinding → mixing → sieving & QC → packaging → ABC Powder showcase. The **same** 3 carrots, 2 amla and 2 beetroots travel through every stage: they are cut into slices, dried on trays, ground into separately coloured powders, blended, and packed. One GSAP master timeline is driven only by scroll position, so the story pauses when you stop and reverses when you scroll up. On mobile the camera is framed for portrait screens and lighter effects are used. With *reduced motion* turned on, it jumps between stages instead of animating. |
| **Shop** | Search, category filters, sorting, pack sizes from 100 g to 1 kg, sale and festival pricing with strike-through, a wishlist and a cart drawer. Shoppers can browse and fill a cart without logging in. |
| **Product pages** | Gallery and videos, pack-size selector with stock, ingredients, a nutrition table, and health / uses / preparation / storage / precautions / allergens sections. These sections are managed by admins and only appear after approval. Also: evidence labels on statements, the health disclaimer, reviews from verified buyers, related products and Product JSON-LD for search engines. |
| **Customer auth** | Mobile number + 6-digit SMS OTP (Supabase Phone Auth). New customers are registered automatically and asked for their name. Login is requested **only** at checkout (or when submitting a custom request), and the guest cart is kept and merged into the account. |
| **Checkout & payment** | Address book, Razorpay (UPI, cards, net banking, wallets) and optional Cash on Delivery. Totals are recalculated on the server. Payments are confirmed only after signature verification and an amount check against Razorpay, with a webhook as backup. Stock is committed atomically, and every order keeps a snapshot of its prices and discounts. |
| **Custom processing** | Request form with photos, an instant estimate, an admin quotation, customer accept/decline, online payment, and a 13-stage tracking timeline. |
| **Customer dashboard** | Profile, orders with a tracking timeline, custom requests, quotations, addresses, wishlist, payment history. |
| **Admin** (`/admin/login`) | OTP login for pre-authorised numbers only. Includes: dashboard with charts, products (details, pack sizes, prices, stock, images, video, health info, SEO), health-info review queue, categories, pricing & inventory grid with a stock ledger, orders (status, shipping, notifications), customers (block/unblock), custom requests & quotations, payments, reviews, festival offers & coupons, banners, reports with CSV export, settings, and admin/staff users. |
| **Security** | Row Level Security on every table and server-side role checks on every admin page and action. Also: rate limiting backed by Postgres, validated and type-sniffed uploads, Razorpay HMAC verification, security headers, and server-only secrets. |

---

## 1. Setup

### Prerequisites
* Node.js 20.9+ (tested on Node 26)
* A Supabase project (free tier works): <https://supabase.com>
* Optional: a Razorpay account, a Resend account, and the WhatsApp Cloud API

### Install
```bash
npm install
cp .env.example .env            # then fill in the values
```

### Database
Run the migrations **in order**, then the seed, using **either** of these:

* **Supabase dashboard → SQL Editor:** paste and run
  `supabase/migrations/20261123000001_schema.sql`, `…0002_functions.sql`, `…0003_rls.sql`, then `supabase/seed.sql`.
* **Supabase CLI:**
  ```bash
  npx supabase link --project-ref YOUR_REF
  npx supabase db push            # applies migrations
  npx supabase db reset --linked  # (fresh projects only) re-applies + runs seed.sql
  ```

The seed creates:
* 4 categories and 15 products, each with 5 pack sizes and prices.
* Starter health and usage content for each product.
* Default settings and processing rates.
* A sample Diwali offer, **inactive**.
* The **initial Super Admin: +91 90143 25025**.

> **Health content:** seeded statements are conservative and general. Statements about potential benefits are seeded **unapproved**: review them under **Admin → Health Information** before they go live. Nutrition values are left empty on purpose; add lab-tested values from your packs.

### Phone OTP (SMS)
Go to Supabase dashboard → **Authentication → Providers → Phone**:
1. Enable Phone sign-in.
2. Choose an SMS provider (Twilio, MessageBird, Vonage or Textlocal), or use the *Send SMS hook* with an Indian gateway such as MSG91 for DLT compliance.
3. Set **OTP length = 6** and **OTP expiry = 300 s**.

For testing without SMS, add a *Test phone number* with a fixed code in the same screen. That setting lives in Supabase, not in this code.

The app adds its own limits on top of Supabase's (configurable in `.env`):
* a resend cooldown
* a cap on codes per phone per hour
* a cap on codes per IP per hour
* a cap on verify attempts in a time window

OTPs are never generated, logged or shown by the app.

### Environment variables
Copy `.env.example` to `.env` (or `.env.local`). `src/server.ts` reads it **on the server only**, so none of these values are bundled into the browser app. Required:
* `SUPABASE_URL`
* `SUPABASE_ANON_KEY`
* `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS; used server-side only)
* `SITE_URL` (also used as the allowed host for SSR)

Everything else is optional, and the UI says so whenever an integration isn't configured:
* **Razorpay:** without it, online payment is disabled and checkout offers COD only, if enabled.
* **Resend / WhatsApp:** without them, notifications are stored in-app and marked `skipped`.

### Run
```bash
npm start            # ng serve with SSR + the /api routes → http://localhost:4200
npm run build        # production build → dist/NandD/{browser,server}
npm run serve:ssr    # run the production build (PORT env, default 4000)
```

---

## 2. Admin access

1. Open **`/admin/login`** and enter `9014325025`. An OTP is sent only to numbers on the `admin_allowlist`. Every other number is refused before any SMS goes out.
2. After the OTP is verified, the server grants the role from the allowlist and redirects to `/admin/dashboard`.
3. The Super Admin can add **Admin** or **Staff** numbers, and revoke them instantly, under **Admin → Admin Users**.

`INITIAL_SUPER_ADMIN_PHONE` in the environment re-creates the owner's allowlist entry if it is missing. A mobile number alone never grants access; a verified OTP is always required.

| Role | Can do |
|---|---|
| Super Admin | Everything, including managing admin users |
| Admin | Catalogue, prices, health info, offers, banners, orders, customers, quotations, reports, settings |
| Staff | Orders & shipping, custom requests (stages), stock updates; read-only products |

---

## 3. Razorpay

1. Dashboard → Settings → API Keys. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. The server sends only the public key id to the browser, at the moment of payment.
2. Dashboard → Webhooks → add `https://YOUR-DOMAIN/api/webhooks/razorpay` with the events `payment.captured`, `payment.failed` and `order.paid`. Set `RAZORPAY_WEBHOOK_SECRET`.
3. Use **Test Mode** keys first. Razorpay test cards and UPI ids (e.g. `success@razorpay`) let you run the full flow.

How payments are processed:
1. The server re-prices the cart.
2. It creates the order and a Razorpay order for the server-computed amount.
3. The customer pays in Razorpay Checkout.
4. The server verifies the HMAC signature, re-fetches the payment from Razorpay, and checks the amount and status.
5. A database function then commits stock atomically and confirms the order.

The webhook covers customers who close the browser right after paying. Refunds are issued from the Razorpay dashboard.

---

## 4. Testing

```bash
npm test            # Unit tests: pricing/discount engine, OTP phone validation, Razorpay signatures,
                    # upload sniffing, custom estimates, health-claim checks (31 tests)
npm run test:sql    # Runs all migrations + seed on embedded Postgres (PGlite) and checks RLS helpers,
                    # admin allowlist, rate limiting, atomic stock, COD + Razorpay confirmation
                    # idempotency, cancellations (20 checks)
npm run typecheck
npm run build
npm run screenshots # with the app running (BASE_URL=http://localhost:4000): captures the production story on 6 screen
                    # sizes (desktop, laptop, portrait tablet, landscape phone, phones); checks the same 7 ingredients / 24 slices persist,
                    # carrot is ground before beetroot, reverse scrolling, pause stability, no sideways overflow, console
                    # errors (uses Microsoft Edge via playwright-core; set PW_CHANNEL=chrome to use Chrome)
```

### Manual end-to-end checklist (needs a configured Supabase project)

**Customer**
1. Browse the shop as a guest, change pack sizes, add to the cart, and apply a coupon.
2. Click Checkout. You are sent to OTP login; after login the cart is still there.
3. Add an address and pay with a Razorpay test card or UPI. The success page appears, the order shows under My Orders, and stock drops.
4. Repeat with COD (enable it in Admin → Settings).
5. Submit a custom processing request with photos.

**Admin**
1. Log in with OTP at `/admin/login`.
2. Create a product: details → pack sizes & prices → images → health info → approve it → it appears on `/shop`.
3. Create a Diwali offer for all products (15%). The website shows discounted prices and the banner, and the offer expires automatically at its end date.
4. Move an order through Processing → Packed → Shipped (with tracking) → Delivered. The customer sees the timeline.
5. Send a quotation for a custom request. The customer accepts and pays; then move it through the processing stages.
6. Export orders as CSV from Reports.

---

## 5. Deployment (any Node 20+ host)

1. `npm ci && npm run build`
2. Set all variables from `.env.example` in the host's environment. Set `SITE_URL` to your public URL; SSR rejects requests for other host names.
3. Start the server with `PORT=8080 npm run serve:ssr`. It is a single Express process that serves the Angular SSR pages, the static browser files and `/api/*`. Put it behind HTTPS (a reverse proxy or the platform's load balancer).
4. In Supabase → Authentication → URL Configuration, set the Site URL to your domain.
5. Add the Razorpay webhook URL for your domain.

Public pages are rendered on the server per request, so price and offer changes show up immediately. Account, cart, checkout and admin pages render in the browser.

---

## 6. Project structure

```
src/
  server.ts                 Express entry: env, security headers, /api, robots/sitemap, Angular SSR
  server/                   Node-only code (never shipped to the browser)
    api/                    REST routes: auth (OTP), catalog, shop (cart/checkout), customer, admin-read/write,
                            reports (CSV), webhooks (Razorpay), seo
    auth.ts http.ts …       role guards, rate limiting, Razorpay, payments, notifications, uploads
  shared/                   pure TS shared by server and browser (pricing engine, money, phone, statuses)
  app/
    core/                   ApiService, AuthService, CartService (guest cart + merge), guards, SEO, toasts
    ui/                     icons, product art, cards, order components, pipes
    layout/                 store header, footer, cart drawer
    pages/home/story/       continuous production story:
      production-world.ts     SVG world (machines, the 7 ingredients built from slices)
      production-timeline.ts  the one GSAP master timeline (camera + every object's journey)
      production-story.ts     component: pinning, scroll scrub, text, stage rail, cleanup
    pages/store/            shop, product, cart, checkout, custom processing, login, content pages
    pages/account/          customer dashboard
    pages/admin/            admin login, shell and modules (role-guarded routes)
supabase/
  migrations/               schema, functions, RLS policies, storage buckets
  seed.sql                  catalogue, health content, settings, initial Super Admin
```

### Notes
* **Imagery:** the production story and product packs are hand-built vector illustrations, so they load fast and stay sharp on any screen. Upload real product photos per product in the admin; the story artwork lives in `src/app/pages/home/story/production-world.ts`, and its timing in `production-timeline.ts`.
* **Money:** all amounts are stored as integer paise. Product prices include GST by default (configurable).
* **Discount rules:** each item gets a single best discount: its sale price, the product's own discount %, or a live festival offer. A coupon is applied after that, and only to undiscounted items unless the offer is marked *combinable*. Only one coupon is allowed per order.
