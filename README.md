# Servd platform (Phase 1 + Phase 2 + POS)

QR ordering for **theaters, restaurants, cafés and food stalls**: one platform, each vendor with their own brand.
The working name "Servd" is not final.

## Run it

```bash
npm install        # first time only
npm run dev        # http://localhost:3001 (port set in .env)
```

The first start sets up a **local PostgreSQL automatically**, with nothing to install, and loads demo data.
Stop with **Ctrl+C**.

| Command | What it does |
|---|---|
| `npm run dev` | Run for testing (auto-reloads when code changes) |
| `npm run db:reset` | Delete local data. The next `npm run dev` starts with fresh demo data (stop the server first) |
| `npm run build` then `npm start` | Production build and run |
| `npm run typecheck` | Check the code for type errors |
| `npm run db:generate` | After changing `src/db/schema.ts`: create a new database migration |
| `npm run test:e2e` | Full end-to-end test, 147 checks: every route, live updates, security. Needs testing mode: start the app with `EMAIL_PROVIDER=off npm start` (after `npm run build`) |
| `npm run db:migrate` | Update database tables (Vercel runs this automatically on every deploy) |
| `npm run test:login` | Customer email-OTP login test, 18 checks |
| `npm run test:demo` | Demo-for-pitches test, 28 checks: create / refresh / remove the demo vendors, PIN rules, kept out of totals and billing, Demo marks. Ends with a fresh demo (PIN 1234) |
| `npm run test:scroll` | Opens every screen of every role (and super admin) in Edge at laptop and phone sizes and checks nothing is cut off or stuck. Report in `.data/scroll-audit/` |
| `npm run test:pos` | Billing (POS) + admin modules test, 101 checks: billing screen, sizes/add-ons, tables, split payment, discounts, cancellations, cash drawer, inventory, reports. Uses the demo restaurant; same testing mode as above |

**On your phone:** connect it to the same Wi-Fi and open the address printed at start-up (e.g. `http://192.168.1.7:3001`).
QR codes point to that address. Before printing real stickers, set `PUBLIC_BASE_URL` in `.env` to your real web address.

## Demo logins (PIN 1234)

| Who | Phone |
|---|---|
| Super admin (us) | 9000000000 |
| Aurora Cinemas: owner / cashier / popcorn station / kitchen station / runner | 9000000001 / 9000000011 / 9000000012 / 9000000013 / 9000000014 |
| Spice Route Kitchen (restaurant): owner / captain / kitchen / tandoor / cashier | 9000000002 / 9000000021 / 9000000022 / 9000000023 / 9000000024 |
| Brew Bay Café: owner / coffee bar / café kitchen / counter | 9000000003 / 9000000031 / 9000000033 / 9000000032 |
| Chaat Corner (stall): owner / counter | 9000000004 / 9000000041 |

Customers log in with their **mobile number**, and the **OTP goes to their email** (asked once, the first time). They can also choose "Log in with email instead".
In **testing mode** (no email service in `.env`) the OTP is also shown on screen. See "Switch on real OTP emails" below.
The home page has a link that opens each demo venue exactly as a QR scan would.

## What Phase 1 includes

- **Account tree:** super admin → vendor (owner) → venues → staff. Customers have one login across every venue.
- **White-label:** each vendor's logo, brand color, GSTIN and FSSAI number on the menu, tracking page, KOT and bill.
- **5 ordering modes:**
  - seat delivery (theater, now or at the interval)
  - table running bill (restaurant, pay at the end)
  - table pay-first (café that serves)
  - counter pickup
  - single shop QR (stall, KOT number)
- **No ordering from home:** a QR scan opens a visit that only works during the show, while the table's bill is open, or during opening hours.
  An old link must be scanned again. A closed bill ends everyone's visit.
- **Secret QR codes** per seat or table (the seat number is not in the link). Codes can be replaced, and any QR can be switched off.
- **Payments (testing):**
  - UPI to the venue's own account: the "Pay with UPI app" button pre-fills the amount and "KOT n"
  - or cash
  - staff confirm every payment (never from screenshots)
  - unpaid orders auto-cancel
- **Kitchen:** one KOT per station. Each station login sees only its own tickets. The order is ready when every station is ready. KOT printing on 80 mm printers.
- **Live/Off switch** for items, categories and whole stations. Customers see "Sold out" within a second.
- **Confirmation popup** before every important action. Every action is recorded in the **activity log**.
- **Customer app** (Zomato/Swiggy style):
  - search and veg-only filter
  - offers and "Most ordered here"
  - floating **Menu** button
  - cart with best-coupon suggestion and "add ₹X more" hints, "Complete your meal" and "Most ordered" below the coupons
  - live tracking
  - account with orders from every venue, help & support, and profile
- **Staff app:**
  - orders & payments board, with lookup by KOT number
  - kitchen display
  - tables floor view with waiter calls and closing bills
  - seat-delivery runner list
  - menu manager with photos
  - QR manager with seat map, per-seat QR, PNG download and sticker printing
  - dashboard with online vs cash and commission, by hour and by day, best sellers, slow movers and kitchen speed
  - coupons, staff logins, customer help, settings & brand
- **Super admin:** all vendors and venues, sales, commission, onboarding new vendors, suspending a vendor.

## What Phase 2 adds

- **Platform admin** (`/admin`, super admin login):
  - Overview with sales, our earnings, and a "Needs your attention" list (follow-ups due, vendors stuck in setup, trials ending, unanswered complaints, quiet venues, unpaid bills)
  - **Leads**: sales pipeline with stages, follow-up dates, call/WhatsApp buttons, and one-click "Onboard"
  - **Vendors**: list + full vendor page (venues, setup checklist, business details, logins with PIN reset, plan & trial, internal notes, activity), add branches, suspend, mark live
  - **Onboarding wizard** in 5 steps, ending with a ready-to-send WhatsApp message containing the owner's login
  - **Billing**: what each vendor owes us per month (commission + fee, trials respected), record bills, mark paid with reference, printable bill
  - **Customers** search, **Support** desk across all venues, platform-wide **Activity log**
- **Owner "Get started"** checklist until the venue goes live (business details, UPI, menu, QR codes, logo, staff, test order) and a **Go live** button
- **GST bills**: a numbered bill (`PREFIX/2627/00001`, per vendor per financial year) for every paid order and every closed table; CGST/SGST split, SAC code, amount in words; cancelled if a paid order is rejected. Customers open it from their order; staff print it from the order card. Owners get a monthly **GST report** with an Excel (CSV) download.
- **Customer login by email OTP** (see below), "Quick answers" in Help, "Call venue" on the order page
- **Automatic KOT printing** per kitchen screen
- **Ready for Vercel**: live mode without demo data, public landing page, live updates without websockets, photos in the database, database setup on every deploy, health check. See `docs/DEPLOY.md`.

## What the POS adds (17 Nov 2026, see `docs/POS_PLAN.md`)

Everything a restaurant expects from billing software like Petpooja, next to the guest QR ordering:
- **Billing** tab: dine-in (table), takeaway, delivery, and Zomato / Swiggy orders typed in with their order ID. Categories, search (press `/`), notes for the kitchen, guest name and phone, discount with a reason. **Send KOT**, or **KOT & pay**.
- **Payment**: cash (shows the change to return), UPI, card, paid online, or **split** across several (with an equal-share helper). Unpaid takeaways are settled from Orders & payments.
- **Tables**: tap a free table to order; tap a running table to add items, set guests, give a discount, **move**, **merge**, **cancel an item** (reason required), print the bill and settle.
- **Sizes and add-ons** (Half / Full, Extra cheese): in the menu editor, billing screen, guest menu, KOT and bill.
- **Day-end reports**: sales, GST, payment modes, order sources, items, categories, discounts, cancellations, staff, guests. **Print the Z report** or download CSV.
- **Cash drawer**: open with the cash in the drawer, record cash in / out / expenses, close by counting the notes; shortage or extra is recorded.
- **Inventory**: materials, recipes per dish (and per size), stock goes down with every order and comes back on cancellation; purchases, wastage, counts, low-stock warning, days left, food cost %.
- **Customers** list (visits, spend, favourite, CSV) and **menu upload from Excel** (CSV, with a template).
- **Round-off** to the rupee (Settings). Commission applies only to orders guests place by QR.
- **Super admin** (18 Nov): commission is calculated on guest QR orders only (Billing shows the "Guest QR" base, the monthly bill explains it); **modules per vendor** (Billing & cash drawer, Inventory, Customers) can be switched on/off in the vendor's Plan tab or during onboarding, and the staff app and API follow; each venue shows **usage** (share of guest QR / counter / Zomato-Swiggy orders, last order, stock, cash drawer); Overview shows sales **by order source** and warns when a live venue gets few guest QR orders.
- Roles: captains can order and take payment; discounts and item cancellations are for owner / manager / cashier; Inventory and Customers for owner / manager.

## Demo venues for pitches (18 Nov 2026)

Super admin → **Demo for pitches**: create, **refresh** or remove four sample vendors (theater, restaurant, café, food stall) with menus, staff logins and two weeks of orders (guest QR, counter and Zomato, cash / UPI / card). Works on the live site too:
- choose a 6-digit PIN for all demo logins (the live site refuses easy PINs); on this PC 1234 is fine
- each venue shows a QR to scan with your phone, a guest-menu link, its staff screens and its logins
- **refresh before every pitch**: sample orders run up to today and orders placed during earlier pitches are cleared (takes about 1–2 s here; allowed up to 60 s on Vercel)
- demo vendors are flagged `isDemo`: a "Demo" badge in admin, a banner on every staff screen, a "Demo" label on the guest menu, "SAMPLE BILL (DEMO) – NOT A VALID TAX INVOICE" on bills, "DEMO" on KOTs and the Z report
- they are left out of the Overview (switch "Include demo vendors" to see them), never billed, and removing them deletes all their data and sample customers; real vendors are untouched
- they use staff numbers 9000000001–9000000041, so those numbers can't be real logins

## Automatic KOT printing

Kitchen screen → turn on **Auto-print**. Every new ticket for that screen prints once on that device.
To print without the print dialog popping up each time, start Chrome or Edge on the kitchen PC like this (set the thermal printer as the default printer first):

```
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk-printing https://your-domain.in/staff
```

Turn Auto-print on for **one device per station only**, or tickets print twice.

## Not built yet (planned)

- SMS OTP (later; for now the OTP goes by email)
- Bluetooth / network printers without a PC (for now: a PC or tablet with the browser, see "Automatic KOT printing" above)
- Payment gateway with split settlement (Phase 2b)
- Separate GST bills per person when splitting by item, loyalty points, Tally format, token display screen
- Works-offline mode and automatic Zomato / Swiggy import (needs a partner such as UrbanPiper)

Details are in `docs/PLATFORM_PLAN.md`.

## Code map

```
server.ts            Starts PostgreSQL (if needed), runs migrations, seeds demo data, serves Next.js + realtime
src/db/schema.ts     All tables (money is stored in paise)
src/db/seed.ts       Demo vendors, menus, staff, 2 weeks of past orders
src/lib/visit.ts     When ordering is allowed (shows, table sessions, hours)
src/lib/orders.ts    Pricing, coupons, KOT split, payments, table bills, suggestions
src/lib/invoices.ts  GST bills: numbering per financial year, table bills, cancellation, amount in words
src/lib/setup.ts     Go-live checklist per venue
src/lib/admin.ts     Monthly dues (commission + fee + trials), "what counts as a sale"
src/lib/email.ts     OTP emails from our Gmail (or SMTP / Brevo / Resend); testing mode without them
src/lib/realtime.ts  Live updates: events saved in the database, screens check every 1.5 s (works on Vercel)
src/lib/mode.ts      Demo mode (this PC) vs live site (SEED_DEMO=false)
scripts/migrate.ts   Database setup that runs before every Vercel build
src/app/api/**       API (customer, staff, admin)
src/app/print/**     KOT, GST bill, table bill, QR stickers, our monthly bill to vendors
src/components/customer  Menu, cart, tracking, account
src/components/staff     Staff app sections (incl. Get started, GST bills)
src/components/admin     Platform admin console (overview, leads, vendors, onboarding, billing, customers, support, activity)
tests/               e2e.ts (134 checks), login-email-otp.sh (18 checks)
```

## Switch on real OTP emails (from our own Gmail)

1. In **servd.orders@gmail.com**: Google Account → **Security** → turn on **2-Step Verification**, then create an **App password** ("Servd").
2. Put it in `.env` (on Vercel: Project → Settings → Environment Variables) and restart:
   ```
   EMAIL_PROVIDER=gmail
   EMAIL_FROM=servd.orders@gmail.com
   EMAIL_PASSWORD=abcd efgh ijkl mnop
   EMAIL_FROM_NAME=Servd
   ```
Gmail allows about 500 emails a day, plenty for a pilot. Brevo / Resend / any SMTP server also work (see `src/lib/email.ts`).
Never share the App password or put it in screenshots.

## Putting it online

See `docs/DEPLOY.md` (GitHub → Vercel → Neon). On the live site set `SEED_DEMO=false`: the home page becomes the public
landing page, no demo venues or secret QR links are shown, and only your admin login is created.

Login test (testing mode, app running): `bash tests/login-email-otp.sh`
