# Cini Order Platform: plan for theaters, restaurants and cafés

Status: draft for review · 15 Nov 2026
Scope now: **ordering inside the venue** (seat, table, counter).
Scope later: delivery and takeaway through Zomato / Swiggy (section 10).

---

## 0. Who is who: the account tree (decided 15 Nov)

```
Super admin (us, the platform)
 │   approves venues, sets each venue's plan/commission, can see every venue,
 │   handles support, can switch a venue off, sees platform-wide numbers
 │
 └── Business / Vendor (owner)            e.g. "Aurora Cinemas", "Chai Point Café"
      │   their own logo, colors, GST details, bill format
      │
      └── Venue (one or many branches)    e.g. "Aurora Cinemas, Kukatpally"
           ├── Staff: Manager, Cashier, Station (kitchen/stall), Captain/Waiter, Runner
           └── Customers: phone-number login, the same account works at every venue on the platform
```

**Each vendor's own brand (white-label look)**
- The customer menu, order tracking page, KOT slip and bill/receipt all show **the vendor's logo, name and brand color**, not ours.
- We only appear as a small "Powered by <our name>" in the footer.
- The vendor uploads their logo and picks a brand color in Settings.
  The app builds the full theme from that one color (buttons, highlights, cart bar) and checks it stays readable.
- The bill shows the vendor's legal name, address, GSTIN, FSSAI number and their own invoice numbering.

## 1. One platform, not three apps

All three venues follow the same pattern. Only a few rules change.

```
Business (owner account)
 └── Venue            e.g. "Aurora Cinemas, Kukatpally"     type: theater | restaurant | cafe
      ├── Areas       Screen 1 / Ground floor / Terrace / Counter zone
      │    └── Spots  Seat F14 / Table 7 / Counter 2      ← each spot has its own QR + NFC
      ├── Menu        categories → items → options (size, add-ons)
      ├── Stations    Popcorn counter / Hot kitchen / Beverages / Bar   ← where KOTs print
      ├── Staff       Owner, Manager, Cashier, Station, Captain/Waiter, Runner
      └── Offers      coupons, scratch cards
```

When the owner picks a **venue type** during setup, the right defaults are filled in.
Every default can still be changed, venue by venue and even area by area.
The setting that matters most is the **service mode**:

| Service mode | Who it's for | How food reaches the customer | When they pay |
|---|---|---|---|
| **Seat delivery** | Theaters, stadiums, auditoriums | Runner brings it to the seat | Before the order goes to the kitchen |
| **Table service: pay per order** | Cafés that serve, quick-service restaurants | Staff serve it at the table | Before each order |
| **Table service: running bill** | Full-service restaurants | Staff serve each round at the table | Once, at the end ("Request bill") |
| **Counter pickup (token)** | Self-service cafés, food courts, stalls | Customer collects when their token number is called | Before the order |
| **Single shop QR** (new) | Food stalls, small cafés, theater snack counters | One QR for the whole shop. Customer pays to the shop's own UPI QR / soundbox, gets a **KOT number**, and collects at the counter | Before collecting (UPI to the shop) |

A café can be "table service, pay per order" or "counter pickup", and some cafés serve to the table.
It's a setting, not a separate product. A venue can also mix modes, e.g. a restaurant with a self-service counter area.

---

## 2. Process: Theater (seat delivery)

**Before the show (setup, once)**
1. Owner adds the screens, the seat layout (rows A–J, 14 per row) and the show times, including when the interval starts.
2. Owner prints one QR sticker for each seat, and optionally fits an NFC tag too.
3. Owner assigns each menu item to a station, e.g. popcorn and drinks to the Popcorn counter, puffs and burgers to the Hot kitchen.

**Customer**
1. Scans the QR on the seat. The page shows the theater, screen, seat, movie, show time and "Interval in 32 min".
2. Browses the menu and adds items.
3. Chooses **"Bring it now"** or **"Bring at interval"**.
4. Applies a coupon, logs in with phone + OTP (only the first time on that phone), and pays online.
5. Sees live status: Received → Preparing → Ready → On the way → Delivered.
6. Can order again anytime during the show from the same page.

**Kitchen & staff**
1. Payment confirmed → the order splits into **one KOT per station**: the popcorn counter gets popcorn + cola, the hot kitchen gets the burger.
2. Each station taps **Start** and then **Ready**.
3. The order becomes "Ready for pickup" only when **all** of its stations are done.
4. The runner's phone lists ready orders sorted by screen → row → seat.
   The runner taps **Picked up**, walks to the seat, checks the order number on the customer's screen, and taps **Delivered**.
5. "At interval" orders are held. They go to the kitchen about 15 minutes before the interval, so they arrive fresh.

**When ordering is allowed**
- From 30 minutes before the show starts until the show ends (configurable).
- Outside that window, the seat page shows "No show running at this seat right now".
- Ordering pauses automatically for the last 20 minutes of the movie (configurable), so runners don't disturb the climax.

---

## 3. Process: Restaurant (dine-in, table service)

**Setup:** floors/sections → tables (T1…T30), one QR per table. Stations: Kitchen, Tandoor, Bar, Desserts.

**Customer: the most common flow (running bill)**
1. Scans the table QR. This **opens a table session** ("Table 7 · Session started 7:42 PM").
2. Friends at the same table scan the same QR and **join the same session**. Everyone can add to the shared cart; each item shows who added it.
3. Anyone taps **Send to kitchen**. That is "Round 1". **No payment yet.**
4. The food is served. Later, they add more: "Round 2", "Round 3"…
5. Buttons always available: **Call waiter**, **Ask for water / cutlery**, **Request bill**.
6. **Request bill** shows the whole table's bill, with options to:
   - pay it in full
   - split it equally
   - pay only for my items
   - pay at the counter (cash or card), which the cashier marks as paid
7. Once fully paid → the session closes, and the table shows as free on the staff floor map.

**Variant: pay per order** (set by the owner): each round is paid before it goes to the kitchen. Good for cafés and quick-service places.

**Captain / waiter app**
- Live floor map of tables: free · ordering · food served · bill requested · paid.
- Can **take an order for a guest who doesn't want to use their phone**. It goes into the same table session and the same KOT flow.
- Gets "Call waiter" alerts, and can move a session to another table or merge two tables.

**Kitchen:** KOT per station, per round. Each KOT shows the table number, round number and time.
Food runners or waiters see "Ready" items with the table number.

**The edge case that matters most here: an unpaid running bill.**
If the guests leave without paying, the waiter or cashier closes the session as "Paid at counter" or "Walked out".
That's the same risk restaurants already have. Pay-per-order mode removes it.

---

## 4. Process: Café

Cafés differ, so the owner picks one of two modes.
**Decided:** a café can choose **pay first** or **open bill**. With an open bill, customers keep adding items to the same bill and pay at the end.
Every addition goes to the stations as a new KOT, notifies staff, and shows on the customer's live bill, the same as restaurant rounds.

**A. Counter pickup (self-service)**
1. Customer scans a QR on the table, on the counter or on a standee. (Counter QRs aren't tied to a table.)
2. Orders and pays.
3. Gets a **token number** ("Token 42") with live status.
4. When the order is ready: the customer's phone shows "Token 42 is ready, collect at counter", and an optional **token display screen** (a TV at the counter) shows the ready tokens.
5. Counter staff hand it over and tap **Collected**.

**B. Table service (café staff serve to the table)**
Same as the restaurant flow in **pay-per-order** mode: scan the table QR → order → pay → staff serve to the table.

---

## 4a. Process: Single shop QR + pay to the shop's own UPI (testing phase, decided 15 Nov)

There's no payment gateway in the testing phase. **The money goes straight to the shop's own UPI**,
the same scanner and soundbox they already use. One QR is stuck at the counter, on the menu board or on standees.

**Customer**
1. Scans the shop QR → the shop's branded menu → adds items → enters phone + OTP.
2. Taps **Place order** → gets a **KOT number** (e.g. **KOT 42**) and the amount to pay, **₹460**.
3. Pays the shop, either way:
   - **"Pay ₹460 with UPI app":** opens GPay / PhonePe / Paytm with the shop's UPI ID, the **exact amount** and the note **"KOT 42"** already filled in, so there's nothing to type.
     This works best with a business/merchant UPI ID; some apps show warnings or limits for personal UPI IDs.
   - **Or scans the shop's printed UPI QR** at the counter and pays ₹460.
4. Taps **"I've paid"** and can optionally enter the last 4 digits of the UPI reference (UTR).
   The order screen then shows **"Waiting for the shop to confirm your payment"**.
5. When confirmed: "Payment confirmed · Being prepared" → **"Ready, show KOT 42 at the counter"**.

**Shop staff**
1. A new order appears with a sound: **KOT 42 · ₹460 · Payment pending**.
2. The soundbox says "₹460 received". Staff tap **Payment received** → popup "Confirm you received ₹460 for KOT 42?" → **Confirm**.
   - **Screenshots are never accepted as proof.** The order only moves when staff confirm it after hearing the soundbox or seeing the money in the bank app.
   - If the customer entered UTR digits, staff can match them in the bank app.
3. The KOT goes to the kitchen/stall → **Ready** → the customer gets "Ready" on their phone.
4. The customer comes to the counter and shows KOT 42.
   Staff **type 42 in the "Enter KOT number" box** → the order appears → **Mark delivered** (one tap; it's the normal flow).
5. No payment within X minutes (default 10) → the order auto-cancels and the KOT number is freed.

**Owner settings for this mode**
- Shop UPI ID and name, plus an upload of the shop's printed UPI QR (shown to customers).
- "Start preparing **before** payment is confirmed" (off by default; turn it on for very busy stalls that trust their regulars).
- KOT numbers restart every day (1, 2, 3…) so they are easy to call out.

**The same pay-to-shop-UPI option also works in the other modes** during testing:
- **Theater seat:** orders are confirmed by the counter. For cash or unverified UPI, the order is counter pickup only (section 8b).
- **Restaurant / café open bill:** at the end, "Request bill" → pay the venue's UPI → the cashier confirms → the table closes.

**Tracking:** every order records **UPI (shop)**, **Cash**, or later **Gateway**, plus who confirmed it and when,
so daily and weekly reports split online vs cash cleanly.

## 5. Stopping orders from home or from the wrong place

A QR code never changes, so anyone can keep the link or take a photo of it.
So the rules about **when** an order is accepted are what keep this safe. Every scan or NFC tap starts a **visit session**:

| Venue | A session opens when… | A session ends when… | An order is rejected if… |
|---|---|---|---|
| Theater | the seat is scanned during a valid show window | the show ends, or after 4 h | there's no show on that screen right now |
| Restaurant | the table is scanned (first scan opens, others join) | the bill is paid, or staff clear the table | the table session was closed by staff |
| Café (counter) | a counter or table QR is scanned during opening hours | 2 h of no activity | the venue is closed |

**Extra rules, on top of the table above**
- **Fresh scan required:** if the last scan was more than X minutes ago (default 90), the customer has to scan or tap again before the next order.
- **"Are you still at the venue?" checks** (owner can switch each one on or off):
  - on the venue's Wi-Fi (public IP matches)
  - phone location within ~300 m. This is optional because it needs a permission prompt, so it's only used when the first check fails.
- **Safety net:**
  - every order is paid and tied to a phone number
  - the customer can **cancel within 60 seconds**
  - staff can **reject** an order (e.g. "Seat empty"), which starts an automatic refund
  - a phone number that keeps getting rejected is flagged
- **Restaurants with a running bill:** staff can see every guest who joined the session, and can remove someone who isn't at the table.

---

## 6. Logins and roles

Every staff member gets their own login: phone + OTP, or a 4–6 digit PIN on a shared station tablet.
Everything they do is logged with their name.

| Role | What they see / do |
|---|---|
| **Owner** | All venues, sales and analytics, menu, prices, staff, payouts, settings |
| **Manager** | One venue: live orders, menu availability, refunds, coupons, staff on shift |
| **Cashier / counter** | Bills, "paid at counter" (cash or card), token handover, reprint receipts |
| **Station** (popcorn counter, kitchen, bar…) | **Only that station's KOTs**, with Start → Ready and a print button. Can mark its own items sold out |
| **Captain / waiter** | Floor map, take orders for guests, waiter calls, serve, request bill |
| **Runner** (theaters) | Ready orders sorted by seat, Picked up → Delivered |

**How KOTs are split by station:** each menu item belongs to one station.
An order with popcorn, cola and a burger becomes KOT-A (Popcorn counter: popcorn, cola) and KOT-B (Hot kitchen: burger).
Each station prints its own KOT on its own thermal printer.
The order is ready only when all of its KOTs are ready.

---

## 7. Customer app: clean, Zomato / Swiggy / Blinkit style

**Design direction**
- White background, one brand accent color, real food photos, bold prices, generous spacing.
- Rounded cards, bottom sheets for choices, and no decorative clutter.
- It follows the familiar patterns of those apps but uses **our own brand**: no copying their logos, colors or illustrations.

**Menu screen**
- **Header:** venue name, the spot ("Screen 1 · Seat F14" / "Table 7" / "Counter"), and for theaters the show + interval countdown.
- **Search bar** plus a **Veg only** toggle.
- **Offers strip:** horizontal coupon cards ("Flat ₹50 off above ₹299").
- **"Most ordered here"** carousel, built from real sales at this venue.
- **Category sections** with item cards:
  - photo
  - veg/non-veg mark
  - name, price
  - short description
  - tags like *Bestseller*, *Must try*, *New*
  - **ADD** button that turns into a − 1 + stepper
- **Floating "Menu" button** at the bottom (like Zomato): opens a list of every category with its item count, and tapping one jumps there.
- **Item options sheet:** size (Regular / Large), add-ons (extra cheese ₹30), and "Repeat last / Customise" when adding the same item again.
- **Sticky cart bar:** "2 items · ₹460 · View cart".

**Cart screen**
- Items with steppers, and "Add cooking instructions".
- **"Complete your meal"** suggestions (frequently bought together, e.g. popcorn → cola).
- **Coupons:**
  - the best coupon is suggested automatically: "Save ₹50 with FIRST50 · Apply"
  - "Add ₹80 more to unlock COMBO10"
  - "View all coupons"
- **Under the coupons, suggestions:** "Most ordered with this", plus offer nudges.
- Bill details: item total, discount, taxes, total.
- Delivery choice (theater: now / interval; café counter: "Pickup at counter").
- Pay button.

**Account (log in anytime; ordering still needs a QR scan)**
- Profile: name, phone, email.
- **My orders:** across all venues, with reorder ("Add these items again"), invoice download and rating.
- Coupons & rewards: scratch cards, saved coupons.
- **Help & support:**
  - report a problem on a specific order (missing item, wrong item, late, refund status)
  - chat or a call request with the venue
  - FAQs
- Settings: notifications, language (English / Telugu / Hindi…), log out, delete account.
- Without a fresh QR scan, the order button says **"Scan the QR at your seat or table to order"**.

---

## 8. Owner and staff apps

- **Owner dashboard:**
  - switch between venues
  - sales, best sellers, slow movers, hourly peaks, average order, repeat customers
  - coupon ROI and scratch-card funnel
  - station performance (average prep time per station)
  - per-spot heatmap (which seats or tables order most)
- **Setup wizard:**
  1. venue type
  2. areas & spots
  3. stations
  4. menu (with photos, options, station per item)
  5. staff invites
  6. print QR stickers
- **Menu manager:** categories, items, photos, options/add-ons, availability schedule (breakfast only…), sold-out switch, station mapping.
- **Live ops:** order board, station KOT screens, captain floor map, runner list, token display screen.
- **Finance:** daily settlement report, refunds, GST invoice numbering, export to Excel/Tally.

---

## 8a. Live / off switches and confirmation popups (decided)

- **Every menu item has a Live / Off switch.** When the popcorn runs out, the station or manager switches it off.
  It disappears from customers' menus within a second (shown as "Sold out"), and switching it back on restores it.
  Stations can switch off their own items. Managers can switch off anything, including a whole category or a whole station ("Bar closed").
- **Customers who already have that item in their cart** see "Caramel Popcorn just sold out" and the item is removed before they pay.
- **Every action that changes something important asks for confirmation first**, with a popup that says exactly what will happen:

| Action | Popup text (example) |
|---|---|
| Item off | "Turn off Caramel Popcorn? Customers can't order it until you turn it back on." [Cancel] [Turn off] |
| Item back on | "Turn Caramel Popcorn back on?" |
| Reject / cancel an order | "Reject order #1043? ₹460 will be refunded to the customer." + reason |
| Mark cash received | "Confirm you received ₹460 in cash for order #1043?" |
| Close a table / bill | "Close Table 7? The bill of ₹2,340 is marked paid at counter." |
| Replace a seat QR code | "The old sticker on F14 stops working immediately." |
| Delete item / coupon / staff | "Delete … ? This can't be undone." |
| Price change | "Change price of Cheese Popcorn from ₹260 to ₹280?" |

  Popups are reserved for actions that matter. Simple moves like "Start preparing" stay one tap, so the kitchen isn't slowed down.
  Every confirmed action is written to the **audit log**: who, what, when, old value → new value.

## 8b. Payments, cash and settlement (decided: two ways, chosen per venue)

### Way 1: Customer pays online, the money comes through us, we settle to the venue
- The customer pays by UPI or card through **our payment gateway**. We pay the venue **weekly**, or **within 24–48 h when they request it**.
  The settlement report shows each order, our commission, gateway fees and the net payout.
- **Important (compliance):** in India, collecting money for other businesses and paying it out later is a regulated activity.
  RBI requires Payment Aggregator authorisation for that. The usual way for a startup is to **use the gateway's "split / marketplace" product**:
  Razorpay Route, Cashfree Easy Split or PayU Split Settlements.
  - Each venue is onboarded with its own KYC as a "linked account".
  - The gateway holds and splits the money and settles to the venue on our schedule (T+1, weekly, on request).
  - Our commission is deducted automatically.
  - The money never sits in our own bank account, so we don't need our own licence.
  Confirm the exact setup with the gateway and a CA before launch.
- Fake payment screenshots are impossible here: an order is only marked paid when the **gateway's server confirms it**.

### Way 2: Payment goes straight to the venue
- **2a. Venue's own payment gateway account:** we connect their gateway keys. Payment confirmation is still automatic (webhook), so there's no fake-screenshot risk.
  We bill our commission or subscription to the venue monthly.
- **2b. Venue's own UPI** (a static QR at the counter plus their soundbox) for places without a gateway:
  - The order goes in as **"Awaiting payment"**.
  - The cashier confirms only after **hearing the soundbox / seeing the amount in their bank app**, using the confirmation popup.
  - Screenshots are **never** accepted as proof.
  - It's the weakest option, so it's only for small cafés. Upgrade them to 2a or Way 1.

### Cash (allowed per venue; theaters: counter pickup only)
- The customer picks **"Pay cash at counter"**. The order is created with the status **"Cash due"** and a **pickup code**.
  For theaters, cash orders are **counter pickup only**: no seat delivery for unpaid orders.
- The kitchen starts only after the cashier marks **"Cash received ₹460"** (with a confirmation popup). For restaurants with a running bill, cash is collected at the end.
- **Every order records how it was paid:** online (our gateway), online (venue gateway), venue UPI, or cash. It also records which staff member confirmed it.

### Reconciliation and settlement report (per venue, per day / week)

| | Orders | Amount | Who holds the money |
|---|---|---|---|
| Online, via us | 412 | ₹1,86,400 | Us → settled to venue |
| Online, venue gateway / UPI | 38 | ₹14,900 | Venue |
| Cash | 95 | ₹31,250 | Venue (cashier) |
| **Our commission (all orders)** | | ₹11,628 | Taken from the online payout; if the payout is smaller than the commission, the venue is invoiced for the rest |

- Each cashier shift closes with **"cash expected ₹X vs cash counted ₹Y"**, so differences show up the same day.
- Phase 1 builds all of this with **simulated payments**. A real gateway is plugged in during Phase 2, once the gateway account (and its split/marketplace product) is approved.

## 9. Technical plan (decided 15 Nov: React / Next.js + Node + PostgreSQL for now, MongoDB possibly later)

| Part | Choice | Why |
|---|---|---|
| Customer, staff and owner apps | **Next.js (React, TypeScript)**, installable as a web app (PWA) | Opens instantly from a QR with no download, and can be installed on staff tablets. |
| API | **Node.js (TypeScript)**: Express or NestJS | Same language end to end. |
| Database | **PostgreSQL** for now (decided 15 Nov), through an ORM so the data layer stays in one place. MongoDB may come later; the owner deferred it. | Every record carries `vendorId` / `venueId`, so many businesses share one system safely. Money updates (payments, cash confirmations, settlements, coupon limits) run in database transactions. |
| Realtime | **Socket.IO + Redis** | Live KOTs and order status that keep working when we run several servers. |
| Payments | **Razorpay or Cashfree** (UPI, cards, split payments), webhooks, automatic refunds | The order is confirmed by the gateway server-to-server, so closing the tab can't lose it. |
| OTP | **Email for now** (Brevo, free tier), decided 15 Nov. SMS later via MSG91 or 2Factor (needs DLT registration). | Email is free; SMS costs about ₹0.15–0.30 per message. |
| Images | S3 or Cloudflare R2 + CDN | Food photos load fast on 4G. |
| Printing | ESC/POS thermal printers through a small print agent on the station PC, or Bluetooth printers from the tablet | Many kitchens already have these printers. |
| Hosting | One cloud region in India (AWS Mumbai / GCP Mumbai), Docker | Low latency and data stays in India. |

**Local development:** PostgreSQL is not installed on this computer, and neither is Docker.
The project will start a local PostgreSQL automatically with `npm run dev`, using an npm-packaged Postgres, so nothing has to be installed by hand.
Data is saved in a folder inside the project.
When deploying, point `DATABASE_URL` at a managed Postgres (Neon, Supabase or AWS RDS, Mumbai region). That's the only change.

**Main database tables:**
- `businesses`, `venues`, `areas`, `spots`, `spot_keys` (secret QR codes)
- `shows` (theaters)
- `stations`, `menu_categories`, `menu_items`, `item_options`, `item_station`
- `staff`, `staff_roles`, `customers`, `visit_sessions`
- `orders`, `order_items`, `kots`, `kot_items`
- `payments`, `refunds`, `coupons`, `coupon_redemptions`, `scratch_campaigns`, `scratch_cards`
- `support_tickets`, `audit_log`

---

## 10. Later: delivery & takeaway (not now)

Delivery is a different business: addresses, riders, delivery fees, and aggregator commission.
When restaurants and cafés ask for it:
- **Zomato / Swiggy orders inside our kitchen system:** connect through an aggregator integration partner (POS integrators such as UrbanPiper offer this; the options and terms need to be checked then).
  Aggregator orders then appear as KOTs at the same stations, so the kitchen uses one screen for everything.
- **Our own takeaway ("order ahead, pick up")** is easy to add, because it is just counter-pickup mode without a QR scan.
- **Our own delivery** (own riders or Dunzo-style partners) only if venues really want it.

---

## 11. Build phases

| Phase | What's built | How we test it |
|---|---|---|
| **1. Core platform** | PostgreSQL, super admin → vendor → venue → staff, vendor branding (logo/colors on menu, KOT, bill), all 5 service modes incl. single shop QR, visit sessions, staff roles & station KOTs, Live/Off switches + confirmation popups, pay-to-shop-UPI + cash with staff confirmation, KOT-number lookup → delivered, new customer UI (menu, cart, coupons, suggestions, floating Menu button), owner dashboard with online vs cash. OTP still shown on screen. | Demo for owners of each venue type |
| **2. Pilot essentials** (built 15 Nov, deploy pending) | OTP by email (SMS later), **platform admin: leads, vendors, onboarding wizard, go-live checklist, monthly vendor billing**, auto-print KOTs, GST bills + GST report, help & support, customer account pages, deploy prep (`docs/DEPLOY.md`) | **Pilot: 1 theater + 1 restaurant + 1 café/stall**, payments to their own UPI |
| **2b. Payment gateway** (only if the pilot succeeds) | Gateway with split settlement (section 8b), refunds, settlement payouts | Venues that want "money through us" |
| **3. Operations polish** | Captain app floor map, token display screen, split bills, item options/add-ons, availability schedules, reports & exports | Pilot feedback |
| **4. Growth** | Loyalty & scratch cards across venues, ratings, WhatsApp order updates, multi-language, setup wizard for self-signup | More venues |
| **5. Later** | Takeaway pre-order, Zomato/Swiggy integration, Android/iOS apps if needed | — |

**What to measure in pilots:**
- orders per show/table/day
- average order value compared with counter sales
- time from payment to served
- refund/reject rate
- share of repeat customers

---

## 12. Decisions

**Decided (15 Nov 2026), fifth round**
- Phase 2 built: platform admin (leads, vendors, onboarding wizard, billing, support, activity), vendor stage setting up → live with an owner checklist, GST bills numbered per vendor per financial year with a monthly GST report, auto-print KOTs. Deploy guide in `docs/DEPLOY.md` (GitHub + Neon + Render).
- Free trial: no commission and no monthly fee during the trial; the monthly fee starts the month a vendor goes live.

**Decided (15 Nov 2026), fourth round**
- **Customer login: mobile number + OTP sent to email** (free). Email asked once on first login; returning customers type only their number. SMS OTP later. Email service: Brevo (free tier).

**Decided (15 Nov 2026), third round**
- **Database: PostgreSQL for now**, started automatically on this computer. MongoDB later, if wanted.

**Decided (15 Nov 2026), second round**
- **Testing phase = no payment gateway.** Customers pay the venue's own UPI QR / soundbox (or cash). Staff confirm payment. The gateway comes later, if the pilot succeeds.
- **Multi-vendor, white-label:** each vendor's logo, colors and details on the menu, tracking page, KOT and bill. **Super admin (us) → vendors → venues → staff**, with customers on top.
- **New mode: single shop QR** with a KOT number. Staff enter the KOT number to mark it delivered (section 4a).

**Decided (15 Nov 2026)**
- Stack: React / Next.js + Node. Database first chosen as MongoDB, **changed to PostgreSQL in the third round** (above). Deployment target to be chosen later (see note below).
- Restaurants: **running bill, pay at the end**.
- Cafés: **pay first or open bill**, the venue's choice. Customers can add to the same open bill, and staff are notified each time.
- **Live / Off switch** for every item, **confirmation popups** for every important action (section 8a).
- Payments: **through us (split settlement)** or **straight to the venue**, plus **cash**, which is counter pickup only for theaters. Full online/cash tracking and settlement (section 8b).

**Deployment note:** PostgreSQL is easy to deploy using a managed service (Neon, Supabase or AWS RDS), and so is MongoDB (Atlas).
Nothing has to be installed on a server.
Sensible defaults when the time comes:
- Next.js apps on **Vercel**
- the Node API + Socket.IO on **Render, Railway or AWS (Mumbai)**
- **Managed PostgreSQL** (Neon or Supabase, Mumbai/Singapore region; free tiers are enough for the pilot)
- **Upstash Redis**
- **Cloudflare R2** for images

**Still open**
1. **Theaters:** should ordering pause in the last 20 minutes of the movie?
2. **Pricing to venues:** % per order, a monthly fee per screen/table, or both?
3. **Brand name:** see the shortlist in the chat. Check domain and trademark (IP India) availability before deciding.
