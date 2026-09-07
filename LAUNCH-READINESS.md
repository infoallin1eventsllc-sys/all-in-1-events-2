# Launch readiness — Meridian Interface

**Dated 7 Sep 2026. This is the current authority for "can this go public".**
It supersedes `PRE-LAUNCH-CHECKLIST.md` (a generic template) and
`system/PRELAUNCH.md` (an August fix list) for launch decisions.

Everything below was **verified against the live system**, not read from code,
unless it says otherwise. Where something could not be verified, it says so
rather than assuming.

**Verdict: not ready for a public domain yet.** The software is in better shape
than most sites at launch. What is missing is perimeter work — security,
legal, and two credentials — and it is roughly a day.

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

- [ ] **1. Retire the `dashboard` endpoint.** It serves the entire CRM —
      every contact's name, email and phone — to anyone holding a
      12-character passcode passed **in the URL query string**, with no rate
      limiting and a non-constant-time compare. URLs leak via history, server
      logs and referrer headers. The owner portal replaced it.
      *Fix: delete the function, or gate it behind the owner session token.*
- [ ] **2. Get the Anthropic key out of the database.** A live key sits in
      plaintext in `settings.anthropic.api_key` (108 chars) — readable by
      anything with service-role, and present in every backup.
      *Fix: set `ANTHROPIC_API_KEY` as an edge secret →
      `delete from settings where key='anthropic'` → **rotate the key**.*
- [ ] **3. Add security headers.** The website repo has no `vercel.json`, no
      `_headers`, nothing: no CSP, no HSTS, no `X-Frame-Options`. The invoice
      portal can be framed by another site (clickjacking).
      *Fix: one new `vercel.json` in `meridian-interface-website`.*
- [ ] **4. Remove the `selfcheck` passcode oracle.** `owner/index.ts:198-217`
      sits **above** the token gate and returns the passcode's length, first
      character, last character and whitespace shape to any caller.
      *Fix: move it below the gate or delete it, then rotate the passcode.*

---

## BLOCKER — legal (do before taking a client)

Not optional decoration. This is the cheapest thing to fix now and the most
expensive later. **Not legal advice — have someone qualified confirm.**

- [ ] **5. Publish a privacy policy and terms, linked in the footer.**
      Verified absent: nothing in `src/`, no legal links in `Footer.tsx`. You
      collect names, emails and phone numbers into a CRM and process them with
      AI. Stripe, SendGrid and every ad platform expect a published policy, and
      it is the first thing a client's lawyer looks for.
- [ ] **6. Add an unsubscribe link and a physical mailing address** to every
      non-transactional email. Verified absent: zero occurrences of
      "unsubscribe" anywhere in the sending path. The agent-written follow-ups
      are marketing under US CAN-SPAM rules; the booking acknowledgement is
      transactional and is broadly exempt. **Do this before SendGrid is turned
      on** — it is the step that risks a fine rather than embarrassment.

---

## BLOCKER — credentials (only Otis can do these)

- [ ] **7. SendGrid.** `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL` as Supabase
      edge secrets. **No email has ever left this system** — 6 drafts, 7 old
      failures, zero delivered. Until this exists a client books and hears
      nothing, which is worse than having no form. Highest-value single step.
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
