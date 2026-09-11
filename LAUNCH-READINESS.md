# Launch readiness — Meridian Interface

**Written 7 Sep 2026, updated 8 Sep. This is the current authority for "can
this go public".** It supersedes `PRE-LAUNCH-CHECKLIST.md` (a generic template)
and `system/PRELAUNCH.md` (an August fix list) for launch decisions.

Everything below was **verified against the live system**, not read from code,
unless it says otherwise. Where something could not be verified, it says so
rather than assuming.

**Verdict, 8 Sep: still not ready, but the list is shorter and the shape of it
has changed.** Everything that was mine to fix is fixed — the four security
blockers, the privacy policy, the terms, and the opt-out machinery. What is
left is almost entirely **credentials and one address, and only Otis can
supply them**:

| Still open | Who | Effect until done |
|---|---|---|
| A real postal address (#6) | Otis | **All marketing email is blocked.** Bookings and invoices still send |
| Stripe (#8) | Otis | No invoice can be paid |

The deploy itself is also still pending: the security headers and the
`/unsubscribe` page are committed but only take effect on the next Vercel
build.

---

## Already good (verified, no action)

- **Design and mobile.** 390px and 768px both render with no horizontal
  overflow and no page errors. Bottom nav, hero and CTA all correct.
- **Booking → CRM, end to end.** A live submission produced: contact (with
  consent flags and attribution), deal (`quoted`, amount parsed from the budget
  range, event date), activity logged, follow-up task queued, and a real
  Claude-written reply draft.
- **Instant booking acknowledgement** (intake v21) — deduped, and honest: it is
  only marked `sent` when a provider actually accepted it.
- **Database isolation.** RLS enabled with zero policies on all 21 tables:
  deny-by-default, service-role only.
- **Payment integrity.** Amounts are read from the invoice row server-side and
  never accepted from the browser. Stripe signatures verified over raw bytes
  with a 300s replay window and event-id idempotency.
- **Secrets hygiene.** Nothing sensitive in git; `.env` ignored; 0 npm
  vulnerabilities; session token in `sessionStorage`, not `localStorage`.
- **Consent is enforced** before any automatic send (`runner/index.ts:453`).

---

## BLOCKER — security (do before a domain points here)

Two of these are live risks **today**, not only at launch.

- [x] **1. Retire the `dashboard` endpoint.** DONE 8 Sep. Replaced with a 410
      stub holding no database client and no credentials, and
      `settings.dashboard.passcode` deleted so older copies fail closed.
      *Was:* It serves the entire CRM —
      every contact's name, email and phone — to anyone holding a
      12-character passcode passed **in the URL query string**, with no rate
      limiting and a non-constant-time compare. URLs leak via history, server
      logs and referrer headers. The owner portal replaced it.
      *Fix: delete the function, or gate it behind the owner session token.*
- [x] **2b. Revoke the last two Anthropic keys. DONE 11 Sep.** `Anthropic API key`
      and `Anthropic courses` deleted. The live key was proven working before and
      after by running `report`, which makes a real Claude call — `mocked: false`
      both times, so the right key survived.
      *This took a detour worth recording. The keys were not in the account Otis
      was signed into. Anthropic accounts are per-email, and signing in with
      `otis@meridianinterface.com` had silently created a second, empty
      organisation — its workspace was timestamped 10:27 AM the same morning.
      The real account, and every key, is on the Gmail address. Both the
      workspace key list and the org-level key list showed zero in the new
      account, which is what finally made it obvious.*
      *Two things this surfaced, neither on the original list:*
      *— the Claude account is on "Evaluation access" with $0.00 credits, which
      is what the Stack Planner and the weekly report currently run on;*
      *— there is now an empty second Anthropic org on the business email, worth
      deleting or consolidating before it confuses someone in six months.*

- [x] **2. Get the Anthropic key out of the database.** DONE 8 Sep, by Otis and
      verified live. The `ANTHROPIC_API_KEY` secret now holds a real key
      (ends `kwAA`, authenticates against Anthropic); the plaintext copy in
      `settings.anthropic` has been deleted; and the four live keys that were
      pasted as Supabase secret *names*, plus the junk entries
      (`otis williams`, `otiswilliams`, `MERIDIAN INTERFACE`), are gone. The
      Secrets page now holds exactly three entries, all of them real.
      *What the code reads, for whoever comes next: `ANTHROPIC_API_KEY` first
      and only if the value looks like a key, then `settings.anthropic.api_key`
      as a fallback. Nothing scans other secret names — that is why four live
      keys could sit there powering nothing.*
      *The console turned out to hold far more than the four: **seventeen live
      keys**, fifteen of them named "Otis Williams API key" — one per attempt at
      fixing a setup that was never going to work, none ever cleaned up. That,
      not the four, was the real exposure. Otis deleted fourteen on 8 Sep, and
      the key in use (`kwAA`) was re-verified live immediately afterwards: it
      authenticates and returns real model output. Three keys remain — `kwAA`
      (in use), "Anthropic API key" and "Anthropic courses", both left pending a
      check of what still depends on them.*
      *Worth keeping in mind: deleting a key from Supabase removes our copy, it
      does not revoke the string. Only the Anthropic console does that, and once
      a key is out of Supabase I can no longer test it — so revocation is
      confirmed in the console, not from here.*

- [x] **3. Add security headers.** DONE 8 Sep. `vercel.json` now carries a CSP
      (`script-src 'self'` — no inline or eval, verified against index.html and
      all nine demos), HSTS, `X-Frame-Options: DENY`, nosniff, Referrer-Policy
      and Permissions-Policy. `frame-ancestors 'none'` closes the clickjacking
      route into the invoice portal. Takes effect on the next Vercel deploy.
- [x] **4b. Rotate the owner passcode. DONE 11 Sep.** Replaced with a 24-character
      random value generated on Otis's own machine, straight into a password
      manager — never displayed, never pasted anywhere it could be read back.
      Verified two ways: `{"action":"status"}` reports `configured: true`, and
      Otis signed into the portal with the new value.
      *Worth knowing for next time: rotating the passcode does NOT end sessions
      already signed in. Tokens are signed with `OWNER_SESSION_SECRET`, not the
      passcode, and last 8 hours. Rotation closes the front door; it does not
      evict anyone already inside.*

- [x] **4. Remove the `selfcheck` passcode oracle.** DONE 8 Sep. Deleted, with
      a comment in its place saying why it must not come back. `status`
      (configured or not) is what remains.
      *Otis still owes one step: **rotate the owner passcode**, since its shape
      was reachable by anyone for as long as that action existed.*

---

## BLOCKER — legal (do before taking a client)

Not optional decoration. This is the cheapest thing to fix now and the most
expensive later. **Not legal advice — have someone qualified confirm.**

- [x] **5. Publish a privacy policy and terms, linked in the footer.** DONE
      8 Sep (`917ef40`). One page, both documents, Privacy and Terms links in
      the footer. Written from what the system actually does and checked against
      the code — the intake path, the AI drafting with a human approving every
      message, and the fact that card numbers never touch this site because
      Stripe hosts the checkout. It says plainly that it is not legal advice;
      have someone qualified read it before it does real work.
- [x] **6. Add an unsubscribe link and a physical mailing address** to every
      non-transactional email. BUILT 8 Sep, and it now **refuses to send**
      rather than sending non-compliant mail.
      A signed opt-out link (HMAC over the contact id, no expiry), an
      `unsubscribe` endpoint that is safe for mail scanners to prefetch and
      never answers someone with an error, an `/unsubscribe` page on the site
      that does the work on arrival, and a footer appended on approval.
      Enforced twice: in `owner.message_send`, and in the database
      (migration 0023) so the runner is covered too if autonomy is ever
      flipped to `auto`. Nine cases verified against the live schema.
      **One thing is still missing and it is Otis's:** there is no postal
      address on file, only "Houston, Texas". Until
      `settings.business_profile.postal_address` holds a real mailing address,
      **every marketing email is blocked** — which is the intended state.
      Booking confirmations and invoices are transactional and still go out.
      *Fix: `update settings set value = value || '{"postal_address":"<the real
      address>"}'::jsonb where key='business_profile';`*
      *Not yet proven end to end: a real token from a real email flipping the
      flag. The signing key is the service-role key, which is not reachable
      from a tooling session, so the link's positive path needs one real click
      once SendGrid is on. Both halves either side of it are tested.*

---

## Closed since — the Stack Planner's spend ceiling

The planner is a public sales tool: its front end is downloadable by anyone and
its endpoint accepts any origin, both on purpose. The per-address hourly
allowance bounded what one visitor could cost but not the total, so a copy of
that front end pointed back at the endpoint could have spent Meridian's Anthropic
credit without limit — the per-address cap only asks an abuser to rotate
addresses.

A ceiling on model calls in any rolling 24 hours now sits in front of that,
default 60 (roughly $6 a day at the very top, and only reachable under abuse).
Rolling rather than calendar-day so there is no midnight anyone can straddle to
spend it twice. The number is `settings.planner_budget`, changeable with one
UPDATE and no redeploy.

Two details that make it behave properly, both verified against the live
endpoint rather than reasoned about:

* **Sending a plan is never blocked.** It calls no model, and turning away the
  most qualified lead the studio gets in order to save six cents is the wrong
  trade. Tested at a ceiling of zero: the advisor refused, the send succeeded.
* **A refusal is not recorded.** The ceiling is checked *before* the per-address
  check, which records the call it permits — the other order would have let
  refusals count against the budget and drain it on their own. Confirmed: after
  a refused call, `planner_requests` held no row for it.

When the ceiling is reached the planner reports itself the same way it does with
no key at all, so the page already renders it correctly with no client change.

Two more since, completing the set:

**An origin allow-list.** A browser will not let a page forge its Origin header,
so this genuinely stops someone hosting a copy of the planner's front end and
having their visitors' browsers spend Meridian's credit. It stops nothing else —
a script simply omits the header, and requests with no Origin are allowed through
on purpose so monitoring and the studio's own tooling keep working. The ceiling
is what bounds a determined copier; this closes the lazy path. The list is
`settings.planner_origins`, and it defaults to the live domain, every Vercel
preview build and localhost, so pointing a domain at the site cannot lock Otis
out of his own planner. Seven cases checked against the live endpoint: no Origin,
the Vercel site, the apex domain, www, the dev server on a port, an unrelated
copy, and the lookalike `meridianinterface.com.evil.net` — the first five allowed,
the last two refused.

**The ceiling now reports itself** (migration 0025). System Health raises `info`
past 60% of the allowance and `warning` when it is gone, each clearing the other
and both clearing when usage drops back. The warning carries the exact statement
that raises the ceiling. It is a separate function from `check_system_health()`
deliberately — that one is ninety lines of working code and rewriting all of it
to append twenty would have risked the ninety for the twenty; the existing
fifteen-minute cron entry runs both. Verified at three ceilings: spent, busy, and
all clear.

Usage to date: 8 real calls, all from testing on 4 Sep. All of this is a
precaution, not a response to abuse.

---

## BLOCKER — credentials (only Otis can do these)

- [x] **7. SendGrid. DONE 11 Sep — email is on and proven end to end.**
      Domain authentication on `meridianinterface.com` (not single-sender), six
      DNS records at Squarespace, `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL`
      (`otis@meridianinterface.com`) set as edge secrets. `mailcheck` reports
      `key_valid`, `can_send`, and the From address usable via the authenticated
      domain; a real test message was accepted (202) and **arrived in the
      inbox**. Before today, zero email had ever left this system.
      *Two things bit us and are worth knowing if this is ever redone: the
      Squarespace NAME field auto-appends the domain, so records take the short
      form (`em8387`, not `em8387.meridianinterface.com`); and a secret whose
      Name is a description rather than the exact variable name is invisible to
      the function, which reads as "not set" with no other clue.*
      *Account is on a trial ending 7 Nov 2026; the plan allows 100 emails a
      day, which is ample for booking confirmations and invoices.*
      *Prepared 8 Sep so the credential is the only thing left:*
      *`SENDGRID-SETUP.md` walks the SendGrid side, including sender
      verification — the step that is easy to miss and that makes a perfectly
      good key fail with a 403 on every message.*
      *A `mailcheck` function reports whether the key authenticates, whether it
      carries Mail Send, and whether the From address is actually usable, and
      will send one real test email on request. It never prints the key.*
      *`_shared/email.ts` gained a 10s timeout (it runs on the booking hot path,
      where a hanging SendGrid meant a spinning form), handles network failure
      as a failed send rather than an exception, and translates 401/403/429 into
      words rather than storing a bare status code.*
      *Migration 0024 fixed a bug that would have surfaced on the day the key
      was pasted in and not one day earlier: `intake` records the booking
      acknowledgement as `sent` once a provider accepts it, and 0016 refused any
      outbound message reaching `sent` without an owner stamp — which an
      automatic acknowledgement does not have and should not have. The refusal
      was swallowed by the try/catch that keeps a mail outage from failing a
      booking, so the client would have received the email with no record of it
      kept. The duplicate guard reads that same record, so a double-submitted
      form would have sent two. Verified against the live schema before and
      after, including that the approval rule still refuses everything else.*
      *The booking path was re-run end to end through the deployed function on
      8 Sep: contact, deal (budget parsed), activity, follow-up task and an
      acknowledgement recorded honestly as a draft that says why it was not
      sent.*
- [ ] **8. Stripe.** `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, with the
      webhook pointed at the `pay-webhook` URL. `pay` is now deployed and
      reports `configured: false` until these exist. Check the `mode` badge: a
      real client sent to a **test** checkout pays fake money and it looks
      identical to a real payment.

---

## Could not be verified from here — check these yourself

- **The domain.** This sandbox cannot reach it; its current state is unknown.
- **That the videos play.** Files serve correctly (206, `video/mp4`, range
  requests, year-long cache) but were never watched — this sandbox is blocked
  from the storage domain.
- **Cross-browser.** Chromium only. No Safari or Firefox, and Safari is most
  mobile traffic.
- **Backups.** No backup or restore plan exists in this repo and the Supabase
  plan is not visible. **If the database were lost tomorrow, it is not known
  what could be recovered.** Confirm PITR/retention, then write the restore
  steps down.
- **Accessibility** beyond basic labels, and **no load testing.**

---

## Should fix soon, not blocking

- Invoice PII cached in `localStorage` is **not cleared on sign-out**
  (`ownerStore.ts:56-58`).
- Owner sessions cannot be revoked; changing the passcode does not invalidate
  live 8-hour tokens.
- `intake` is fully public unless `WEBHOOK_SECRET` is set, and stores the entire
  raw request body unbounded.
- No staging environment — migrations and deploys go straight to production.
- Alerts fire but reach nobody: a `critical` alert has `seen_count` in the 90s
  with `notified_at` null.
- Brute-force throttle is per-IP-hash only; rotating IPs bypasses it.

---

## Social publishing — not launch-blocking, but broken as written

- **TikTok will reject every video.** The adapter uses `PULL_FROM_URL`, which
  requires TikTok to have verified the URL's domain. Ours is `*.supabase.co`,
  which cannot be verified by us. *Fix: switch to `FILE_UPLOAD`.*
- **Meta and LinkedIn tokens expire (~60 days) with no refresh.** Only TikTok
  refreshes. Posting will work, then silently stop.
- **Aspect ratio is a preference, not a constraint** — a landscape reel can be
  chosen for Reels and be rejected or cropped.
- The **generic webhook adapter** needs no platform approval and is the fastest
  route to posting today.

---

## Also outstanding

- The runner is still **v37**; the committed `sceneSetProblem` guard is not
  deployed. The database half (migration 0022) is live and covers the failure
  that actually happened.

## Suggested order

1. Items 1–4 — one focused session, about two hours.
2. Items 5–6 — the writing is the work; the wiring is small.
3. Items 7–8 — Otis, whenever.
4. Launch, then watch it for a week before promoting it anywhere.
