# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three audiences, all in scope for design decisions:

- **Owner / manager** (roles `dueño`, `gerente`) of a restaurant or café, independent or small multi-branch. Sets up and brands the loyalty program in `/dashboard`, sends notifications and coupons, manages branches and team, and reviews the customer base.
- **Staff at the counter** (role `cajero`). Uses the scanner at `/escaner`, an installable PWA on any phone, to scan a card or coupon QR (or type the code / search by phone) and add stamps, points, or cashback or redeem rewards. Often mid-rush, one hand, no time to read.
- **End customer (diner).** Scans the business's QR, signs up at `/n/<negocio>`, gets a web card at `/tarjeta/<código>` with "Agregar a Apple Wallet / Google Wallet" buttons, and receives coupons (`/cupon/<código>`, `/promo/<token>`), balance updates, messages, and proximity alerts. Never installs an app.

Secondary: the platform operator (superadmin, `/admin`) who manages businesses, subscriptions, plans, and trials.

## Product Purpose

Lealt.io is a multi-tenant hosted SaaS that lets restaurants and cafés run a digital loyalty program living in their customers' phone wallets, so customers come back more often without installing an app or carrying a cardboard punch card. Success for the business is more frequent return visits plus a usable customer database; success for the diner is a card that works without friction; success for staff is a scan that takes seconds.

## Positioning

The card lives natively in Apple Wallet and Google Wallet: no app to download, no cardboard. Built for the Mexican food-and-beverage market, with Spanish-first copy, MXN pricing, self-serve sign-up with a free trial, and setup in minutes rather than a sales process.

## Operating Context

- Onboarding: the owner signs up with a free trial, picks a program type, uploads logo, colors, and strip image (with live preview), and is live in about five minutes (per site copy).
- Enrollment: diners scan a printed enrollment QR/poster in the venue, fill a short form (including promo consent), and save the pass. Without Apple/Google credentials configured, the web card + QR still works fully.
- Every visit: staff scan the pass from the scanner PWA; the balance updates in the wallet automatically.
- Ongoing: the owner sends notifications (all customers or a segment), creates QR coupons (manual, bulk, or automatic on sign-up, birthday, or inactivity), prints coupon posters, and can revoke coupons issued by mistake.
- Billing: monthly subscription through Stripe; 14-day free trial, no credit card required, cancel anytime (per site copy).

## Capabilities and Constraints

- Program types: **sellos/visitas** (stamps, default or custom stamp artwork), **puntos** (points with a rewards catalog), **monedero** (cashback balance), each with an optional welcome bonus.
- Apple Wallet `.pkpass` and Google Wallet passes for both cards and coupons; push updates to passes (APNs, Google messages).
- Branches with coordinates and a custom lock-screen message for proximity alerts.
- CRM: name, phone, email, birthday, promo consent, history, manual adjustments, search, CSV export, and deletion for ARCO rights (Mexican data-protection law).
- Team roles: dueño, gerente, cajero.
- Plans (MXN/month, per live site): **Básico** $399 (1 branch, 500 customers); **Pro** $899 (5 branches, 5,000 customers, push, proximity, automations); **Empresarial** $1,899 (10 branches, unlimited customers, white-label logo on panel and public pages without the platform credit, priority support). Plans also limit team users.
- Known limits that design and copy must not over-promise:
  - Proximity alerts are **passive**: the OS decides whether to show them and they need location permission; they are not guaranteed.
  - Google Wallet allows at most 3 notifications per pass per day and requires publishing approval.
  - "Saved to Google Wallet" is marked when the button is tapped, not confirmed by Google.
- Export is CSV, while the landing page says "exportación a Excel"; keep claims accurate to the file actually delivered.
- Legal pages (`/privacidad`, `/terminos`) are templates still pending review.
- Terminology to keep consistent: sucursal, sellos, puntos, monedero, tarjeta/pase, cupón, escanear, canje, cajero.

## Brand Commitments

- Name: **Lealt.io** (with the dot), configurable via `NEXT_PUBLIC_APP_NAME`. The README notes the logo and branding are still pending; the current star mark is not a committed asset.
- Language: Spanish (Mexico, `es-MX`), addressing the business owner as "tú".
- Voice on the live site: plain, warm, direct; short practical promises ("Listo en 5 minutos", "sin apps ni tarjetas de cartón").
- Each business's own logo and colors appear on its cards, enrollment page, and (on Empresarial) the panel, so platform styling must leave room for tenant branding.

## Evidence on Hand

- No paying customers, testimonials, metrics, or press yet. **Do not fabricate** any of them: no invented logos, quotes, member counts, or return-visit percentages.
- "Café La Esquina" on the landing page and `cafe-demo` in the seed data are demo businesses, not customers.
- The feature list in `README.md` and the pricing on the live site are the source of truth for claims; `docs/INVESTIGACION.md` holds background research.

## Product Principles

1. **Zero friction for the diner.** No app, no account, no password; anything that adds a step to enrollment or redemption needs a strong reason.
2. **Counter speed over completeness.** The scanner must work in seconds on any phone under pressure; secondary info stays out of its way.
3. **The owner is not technical.** Setup, campaigns, and data read as a small-business tool in plain Spanish, not a marketing platform.
4. **Honest claims.** Promise only what the product reliably does, including the Wallet platform limits above; earn trust with demos, not invented proof.
5. **The tenant's brand is on stage.** Cards and public pages carry the restaurant's identity; Lealt.io frames it without competing.
