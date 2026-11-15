# Putting Servd online (GitHub → Vercel, database on Neon)

The app is ready for Vercel: live updates, photos, background jobs and the database setup all work there.
Tested on 15 Nov 2026: 146 automatic checks pass on the production build, and in a real browser a new order reaches
the staff screen in about 1.7 seconds.

## What you need

| Piece | Service | Cost* |
|---|---|---|
| Code | **GitHub** (private repository) | Free |
| App | **Vercel** | Free (Hobby) for testing. Vercel says Hobby is for non-commercial use, so check whether paying venues need **Pro**. |
| Database | **Neon**, created from inside Vercel | Free plan to start. It doesn't expire; the monthly *usage allowance* resets. |
| OTP emails | **Your Gmail** (servd.orders@gmail.com) with an App Password | Free, about 500 emails a day |
| Web address | Any domain registrar | ₹500–1,000/year (optional at first; Vercel gives a free `….vercel.app` address) |

\* Prices and plan rules change. Check vercel.com/pricing and neon.tech/pricing.

## Step 1. Gmail App Password (5 minutes, once)

Gmail only lets apps send mail with a special 16-letter "App password", not your normal password.

1. Sign in to **servd.orders@gmail.com** → open **myaccount.google.com** → **Security**.
2. Turn on **2-Step Verification** (required for app passwords).
3. Search for **App passwords** at the top of the page → create one named "Servd".
4. Copy the 16-letter password. You'll paste it into Vercel as `EMAIL_PASSWORD`. Keep it private; if it leaks, delete it there and make a new one.

## Step 2. Put the code on GitHub

Create a **private** repository named `servd-platform` on github.com, then in a terminal:

```bash
cd "C:\Users\MADHU GOUD\Desktop\Cini Order\servd-platform"
git init
git add .
git commit -m "Servd platform"
git branch -M main
git remote add origin https://github.com/<your-username>/servd-platform.git
git push -u origin main
```

`.gitignore` already keeps out the secrets (`.env`), the local database (`.data`) and build folders.
Before pushing, `git status` must **not** list `.env`.

## Step 3. Create the project on Vercel

1. vercel.com → **Add New → Project** → import `servd-platform` from GitHub.
2. Framework: **Next.js** (detected). Leave the build settings alone: `vercel.json` already sets the build command and the **Singapore** region.
3. **Don't deploy yet.** First add the database and settings (steps 4–5).

## Step 4. Create the database (Neon) inside Vercel

1. In the project: **Storage → Create Database → Neon (Postgres)** → region **Singapore (ap-southeast-1)** → connect it to the project.
2. Vercel adds `DATABASE_URL` for you. Nothing to copy by hand, and it never needs changing.

## Step 5. Settings (Project → Settings → Environment Variables)

| Name | Value |
|---|---|
| `SEED_DEMO` | `false`  ← **important**: no demo venues on the live site |
| `ADMIN_PHONE` | your mobile number (10 digits): your platform admin login |
| `ADMIN_PIN` | a 6-digit PIN you choose (not 123456 / 111111) |
| `ADMIN_NAME` | your name |
| `EMAIL_PROVIDER` | `gmail` |
| `EMAIL_FROM` | `servd.orders@gmail.com` |
| `EMAIL_PASSWORD` | the 16-letter App password from step 1 |
| `EMAIL_FROM_NAME` | `Servd` (or your final brand) |
| `APP_SECRET` | any long random text (e.g. 40 random letters and numbers) |
| `CRON_SECRET` | another long random text (for the optional timer below) |
| `PUBLIC_BASE_URL` | your address, e.g. `https://servd-platform.vercel.app` or your domain. **QR stickers use this.** |
| `PLATFORM_CONTACT_PHONE` | your WhatsApp number: shows "Talk to us on WhatsApp" on the home page |
| `PLATFORM_CONTACT_EMAIL` | contact email for the home page |
| `PLATFORM_LEGAL_NAME`, `PLATFORM_ADDRESS`, `PLATFORM_GSTIN`, `PLATFORM_UPI_ID` | your company details for the monthly bills you send vendors |

## Step 6. Deploy

Press **Deploy**. Each deploy first updates the database tables, then builds the app. The first deploy also creates
**only your admin login**: no sample vendors, no test data. If the build log says
"set ADMIN_PHONE and ADMIN_PIN", add them (step 5) and redeploy.

## Step 7. Check it works (10 minutes)

1. `https://<your-address>/api/health` shows `"ok": true`.
2. The home page shows the Servd landing page, **not** a list of venues.
3. `/staff/login` with your mobile + PIN opens the platform admin.
4. Onboard a test vendor → log in as that owner → add 3 menu items, a QR code and a UPI ID → **Go live**.
5. Print one QR (it must show your real address), scan it with your phone, log in (the OTP arrives by **email**),
   order, and watch it appear on the staff screen. Confirm the payment and open the GST bill.
6. When done, **suspend** the test vendor in the admin (don't delete; bills keep their numbers).

## Optional: outside timer

Unpaid orders auto-cancel and interval orders go to the kitchen whenever any venue screen is open, which is
always the case while a venue is working. For extra safety, add a free timer at **cron-job.org** that opens
`https://<your-address>/api/cron/jobs?key=<CRON_SECRET>` every minute.

## Updating later

Push to GitHub and Vercel redeploys in about 2 minutes. Database changes apply automatically during the deploy.

## Your own domain

Vercel → Project → Settings → **Domains** → add `yourdomain.in`, then add the DNS records Vercel shows at your registrar.
HTTPS is automatic. Then set `PUBLIC_BASE_URL` to `https://yourdomain.in` and redeploy **before printing stickers**.
