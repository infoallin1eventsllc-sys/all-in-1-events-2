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
| Rotate the owner passcode (#4) | Otis | Its shape was readable by anyone while `selfcheck` existed |
| A real postal address (#6) | Otis | **All marketing email is blocked.** Bookings and invoices still send |
| SendGrid (#7) | Otis | No email has ever left this system — a client books and hears nothing |
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
