# Security & privacy checklist: meridianinterface.com

Everything a public business website needs to protect visitors' information and
the owner's. Status as checked on 16 Oct 2026.
✅ done · 🔲 to do (who) · 🔁 repeat on a schedule

## 1. The website itself
- ✅ HTTPS on every page (Vercel; insecure requests are upgraded automatically)
- ✅ Security headers: strict Content-Security-Policy, no framing by other sites, limited browser permissions (vercel.json, SECURITY.md)
- ✅ No secret keys in the website code (checked automatically before every update)
- ✅ Vulnerable-package scan before every update (2 demo-only packages have no fix yet; they never touch real data)
- ✅ Hosting on a business plan (Vercel Pro)
- ✅ Real "page not found" page; removed pages redirect home
- 🔲 (Otis) Vercel spend alert: Team Settings → Billing → Spend Management

## 2. The database (customers' information)
- ✅ Row security on all 24 tables, no public read or write access
- ✅ No database function callable from the public website
- ✅ Forms go through server checkpoints that validate input and limit submissions per visitor
- ✅ Visitor IP addresses are hashed, never stored readable
- ✅ Only the information needed is collected
- ✅ Nightly backups, 30 days kept
- 🔲 (Otis) Apply 0043 (backup covers every table): approve the prompt, or Supabase SQL Editor → run supabase/migrations/0043_snapshot_everything.sql
- 🔲 (Otis) Hide the stored-file list: Supabase SQL Editor → run supabase/migrations/0042_storage_no_listing.sql
- 🔲 (Otis) Weekly off-site backup to the Mac: cd system/backup && bash install-offsite-backup.sh (see BACKUPS.md)
- 🔲 (Later, when leads flow) Supabase Pro ($25/mo): managed daily backups, more capacity

## 3. Your accounts (the most likely way anyone gets in)
Turn on 2-step verification everywhere, save each account's recovery codes somewhere safe and offline.
- 🔲 Studio portal: Studio login → Security → Turn on 2-step (currently OFF)
- 🔲 Google / Gmail (otis@meridianinterface.com and infoallin1eventsllc@gmail.com)
- 🔲 GitHub (holds all the code)
- 🔲 Vercel (controls the live site)
- 🔲 Supabase (controls the database)
- 🔲 Domain registrar for meridianinterface.com (whoever you bought the domain from)
- 🔲 Anthropic Console, Higgsfield, PostHog, Stripe (when live)
- 🔲 Facebook, Instagram, TikTok, LinkedIn (set up 2-step when creating the business pages)
- 🔲 Use a password manager (Apple Passwords, 1Password or Bitwarden): a different strong password for every account
- 🔲 Domain: turn on auto-renew and registrar lock, so the domain can't expire or be moved without you
- Rule: never paste passwords or API keys into chat, email or texts. Keys go only into Supabase Edge Function secrets. If one is ever exposed, replace it the same day.

## 4. Your computer and phone
- 🔲 Mac: FileVault on, automatic updates on, screen lock after a few minutes
- 🔲 Phone: passcode/Face ID, automatic updates (it holds your 2-step codes)
- 🔲 Keep the "Meridian Backups" folder private; never upload it anywhere public

## 5. Monitoring (so you hear about problems first)
- ✅ Alert when a booking comes in
- ✅ Watch for repeated failed portal logins (every 5 minutes)
- ✅ System health checks every 15 minutes
- 🔲 (Otis) Deploy the security agents (watch + daily audit): from system/,
  supabase functions deploy orchestrator runner report media analyze compose-reply notify-owner security-agent mailcheck --project-ref glzodwhyavexpuusbqjy
- 🔲 (Optional, free) Uptime monitor, e.g. UptimeRobot, checking meridianinterface.com every 5 minutes and emailing you if it goes down

## 6. Payments
- ✅ Card numbers never touch your site or database: payments go through Stripe's own checkout page
- 🔲 Refund and cancellation policy on the site before Stripe goes live
- 🔲 2-step on the Stripe account; payouts to the business bank account only

## 7. Privacy and the law (plain-language summary; not legal advice)
- ✅ Privacy Policy and Terms of Use on the site
- ✅ Every marketing email has a working unsubscribe link (CAN-SPAM)
- 🔲 Text messages: only text people who gave written permission to receive marketing texts, and honor STOP immediately (TCPA). Required before any SMS marketing.
- 🔲 If a customer asks you to delete their information, delete it (ask Claude to do it from the CRM) and confirm to them in writing
- 🔲 Keep the Privacy Policy matching reality: if you add a new tool that receives visitor data (a new analytics, chat or email tool), add it to the policy
- If there is ever a breach: Texas law requires telling affected people without unreasonable delay and within 60 days, and telling the Texas Attorney General if 250+ Texans are affected. Call an attorney the same day.

## 8. What to do if something looks wrong
1. Change the password of the affected account and sign out everywhere (portal: Security → Sign out all devices).
2. Replace any key that might have leaked (Supabase secrets, Anthropic, Stripe).
3. Ask Claude: "check the security logs and the database for anything unusual".
4. If customer data may have been seen, see the breach line in section 7.

## 9. Routine
- 🔁 Monthly: glance at the security agent's report and Vercel/Supabase usage; confirm a recent backup exists
- 🔁 Every 3 months: ask Claude to run the full security review (database advisors, headers, package scan, login logs); review who has access to each account
- 🔁 Before every website update: the pre-launch checks (Claude runs these automatically)
- 🔁 Once a year: change the portal password; test restoring from a backup
