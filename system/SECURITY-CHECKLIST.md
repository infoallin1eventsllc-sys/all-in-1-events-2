# Security & privacy checklist: meridianinterface.com

Everything a public business website needs to protect visitors' information and
the owner's. Status as checked on 16 Oct 2026.
✅ done · 🔲 to do (who) · 🔁 repeat on a schedule

## Otis's to-do list (everything Claude can't do for you)

Claude did everything on this checklist that can be done from here (16 Oct).
What is left needs your logins, your devices or your decision. In order of
importance:

**Today (about 30 minutes)**
1. **Domain lock.** Squarespace Domains → meridianinterface.com → turn ON
   *Transfer lock* (also called registrar lock) and *Auto-renew*. Checked 16 Oct:
   the lock is **off**; the domain expires 4 Aug 2027.
2. **2-step on the accounts that control everything:** Google (both
   addresses), Squarespace Domains, GitHub, Vercel, Supabase. Save each one's
   recovery codes in your password manager or on paper, offline.
3. **2-step on the studio portal:** Studio login → Security → Turn on 2-step
   (currently OFF).
4. **Three database updates, one sitting.** Supabase → SQL Editor → New query.
   For each file below, open it on GitHub (repo all-in-1-events-2, folder
   system/supabase/migrations), copy the whole file, paste, **Run**, look for
   "Success". Or: next time Claude sends them, tap **Allow** on the prompt.
   - `0042_storage_no_listing.sql`: stops anyone listing your stored files
   - `0043_snapshot_everything.sql`: nightly backup covers all 16 tables
   - `0044_sms_consent_guard.sql`: no marketing text without permission; STOP means stop

**This week**
5. Password manager (Apple Passwords is free and already on your Mac and
   iPhone): a different strong password for every account.
6. 2-step on Anthropic Console, Higgsfield, PostHog, Stripe, and each social
   account as you create the business pages.
7. Weekly Mac backup: from the repo, `cd system/backup && bash install-offsite-backup.sh` (BACKUPS.md, 5 minutes).
8. Mac: FileVault on, automatic updates on, screen lock. Phone: passcode/Face ID, auto-updates.
9. Vercel: Team Settings → Billing → confirm it says Pro, set a spend alert.
10. Deploy the security agents from system/ (command in section 5 below).

**Before taking payments or texting customers**
11. Refund policy: fill in the choices in `legal/REFUND-POLICY-DRAFT.md`, then
    ask Claude to put it on the site.
12. Only text people who agreed to marketing texts (the database now enforces
    it once 0044 is applied); keep the signed or ticked consent.
13. (Optional, free) UptimeRobot watching meridianinterface.com every 5 minutes.

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
- 🔲 (Otis) Text-message guard, written and tested by Claude 16 Oct: Supabase SQL Editor → run supabase/migrations/0044_sms_consent_guard.sql
- 🔲 (Otis) Weekly off-site backup to the Mac: cd system/backup && bash install-offsite-backup.sh (see BACKUPS.md)
- 🔲 (Later, when leads flow) Supabase Pro ($25/mo): managed daily backups, more capacity

## 3. Your accounts (the most likely way anyone gets in)
Turn on 2-step verification everywhere, save each account's recovery codes somewhere safe and offline.
- 🔲 Studio portal: Studio login → Security → Turn on 2-step (currently OFF)
- 🔲 Google / Gmail (otis@meridianinterface.com and infoallin1eventsllc@gmail.com)
- 🔲 GitHub (holds all the code)
- 🔲 Vercel (controls the live site)
- 🔲 Supabase (controls the database)
- 🔲 Squarespace Domains (the registrar for meridianinterface.com)
- 🔲 Anthropic Console, Higgsfield, PostHog, Stripe (when live)
- 🔲 Facebook, Instagram, TikTok, LinkedIn (set up 2-step when creating the business pages)
- 🔲 Use a password manager (Apple Passwords, 1Password or Bitwarden): a different strong password for every account
- 🔲 Domain: turn on auto-renew and transfer lock in Squarespace Domains, so the domain can't expire or be moved without you. Checked 16 Oct: lock OFF, expires 4 Aug 2027
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
- 🔲 (Otis) Refund and cancellation policy: draft ready for your choices in legal/REFUND-POLICY-DRAFT.md; goes on the site before Stripe goes live
- 🔲 2-step on the Stripe account; payouts to the business bank account only

## 7. Privacy and the law (plain-language summary; not legal advice)
- ✅ Privacy Policy and Terms of Use on the site
- ✅ Every marketing email has a working unsubscribe link (CAN-SPAM)
- ✅ Text messages (TCPA): the database refuses any marketing text to someone without permission on record, requires "Reply STOP" wording, and blocks every text to anyone who replied STOP (an incoming STOP is recorded automatically). Written and tested 16 Oct; live once 0044 is applied (see the to-do list)
- 🔲 (Otis) Collect and keep written permission before marking anyone as agreeing to marketing texts
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
