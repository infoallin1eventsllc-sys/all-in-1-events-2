# Pre-launch fix list

> **Status Aug 20 (evening):** the website is now **deployed to Vercel
> production** (PR #1 merged, deploy green). These items are therefore live-site
> items, not pre-deploy ones. Item 3 (RUN_SECRET) is still the one that turns
> into a real spend risk the moment an API key is configured.

Things to fix **before** deploying the website or Key Router. Nothing here
blocks development; all of it is worth closing before the first real visitor or
the first real API key.

Working branch: `claude/marketing-system-tech-stack-uds0mp` (restarted from
`main` after PR #2 merged). Fixes land here and ship as one PR.

---

## 1. Mock-mode weekly report prints the wrong copy

**Where:** `system/supabase/functions/_shared/claude.ts` → `mockFor()`

**What happens:** The `report` function's prompt ("Write the owner summary…")
matches the mock's `/write a|content|post|caption/i` branch before it reaches
anything summary-shaped, so the weekly report body renders an Instagram caption
instead of a summary. The `metrics` on the same report row are correct — it is
only the prose.

**Why it matters:** Invisible in production (it disappears the moment a real
key is set), but it makes the demo look broken to anyone shown the dashboard
before go-live.

**Fix:** Add a summary branch to `mockFor()` ahead of the content branch,
keyed on something the report prompt actually contains (e.g. `owner summary`
or `week's numbers`). Requires redeploying `report`.

**Status: FIXED** (Aug 21). A summary branch keyed on `owner summary` /
`week's numbers` now sits ahead of the content branch. Shipped with the
`report` redeploy that added the run-secret gate, so it cost nothing extra.

---

## 2. Website photography is hotlinked from a third party

> **The hero is now settled.** Aug 20: replaced with Adobe Stock 337907436,
> licensed to the Meridian account (free collection), and self-hosted along
> with the video loop derived from it. The previous hero was a CG render of
> unknown provenance that shipped with the Google AI Studio export.
> Provenance for everything is recorded in
> `meridian-interface-website/public/images/CREDITS.md`.
> What remains below is the *rest* of the site's imagery.

**Where:** `meridian-interface-website`, 24 images from `images.unsplash.com`

**What happens:** The site's visual identity is served by a host we do not
control. It works today; it breaks silently if Unsplash changes a URL, rate
limits, or goes down — and it leaks visitor traffic to a third party.

**Fix:** Download the 24 images, optimise them, commit under `public/images/`,
and update the references. Fonts are already self-hosted, so this is the last
external dependency.

**Status:** open. Flagged during the pre-deploy audit; Otis's call.

---

## 3. The scheduled functions are callable by anyone with the anon key

**Where:** `orchestrator`, `runner`, `report` edge functions

**What happens:** They verify a JWT, but the public anon key satisfies that.
Anyone who reads it out of a browser bundle can trigger a run.

**Why it matters:** Today they only burn idempotent work. **Once a real
Anthropic key or Key Router URL is configured, every unsolicited call spends
money.** This should be closed before step 3 of go-live, not after.

**Fix:** Require a `RUN_SECRET` header. `public.invoke_edge()` already
centralises the cron-side call, so the change is one header there plus one
check in each function.

**Status: DONE** (Aug 21). Closed *before* any key exists, and before the
publish adapters went in — the order that matters, since publishing is the
first thing that made an uninvited run cost something.

The secret is a settings row (`run_secret`, service-role only), not an env
secret, so rotating it is one UPDATE with no redeploy and there is exactly one
copy shared by the SQL and TypeScript sides. `public.invoke_edge()` sends it as
`x-run-secret`; each function checks it via `_shared/runauth.ts`. A service-role
JWT is also accepted, for the operator CLI. An absent secret leaves the gate
open on purpose, so no seeding order can lock the system out of itself.

**Verified live against the deployed runner:** anon key alone → `unauthorized`;
anon key + correct secret → runs; anon key + wrong secret → `unauthorized`.

---

## 4. Logo is still an SVG monogram, not the real mark

**Where:** `marketing-system.html`, `system/supabase/functions/_shared/card.ts`,
the Key Router console header

**What happens:** Everything renders a hand-built "M" monogram. The page header
already auto-swaps to `assets/meridian-logo.png` when that file exists; the
generated social cards and the console do not.

**Fix:** Drop the real logo at `assets/meridian-logo.png`, then update the card
generator and the console mark to match.

**Status:** open, waiting on the asset.

---

## 5. Owner invoices live in the browser, not on a server

**Where:** `meridian-interface-website` → `OwnerInvoiceView.tsx`

**What happens:** The Internal Invoice & Pricing Manager stores invoices in
`localStorage`, and its passcode is checked in the browser. That means:

- The data exists only in whichever browser created it. Clearing site data, or
  switching to a phone or another machine, loses it. There is no backup.
- The passcode is a privacy screen, not security. Anyone using the device, or
  reading the site's JavaScript, can reach the records.

The portal now says this on screen, so it is at least not a surprise. But it is
a decision to make **before real client pricing goes in**, not after.

**Fix:** Move invoices to the Supabase backend that already exists — a table
plus RLS, reusing the same service-role pattern as the CRM. The portal keeps
working; it just stops being the only copy.

**Status: BUILT, awaiting one secret.** Aug 20: `owner_invoices` table created
behind deny-by-default RLS; `owner` edge function (v1, verify_jwt=false)
deployed. The passcode is now compared server-side against a Supabase secret
using a constant-time comparison; a successful login returns an HMAC-signed
token with an 8h expiry held in sessionStorage. Failures throttle at 8 per 15
minutes, keyed by a salted hash of the caller IP. Website side is
`src/lib/ownerStore.ts` + the rewired `OwnerInvoiceView`, on branch
`claude/owner-portal-server-auth`.

**Verified live:** login with no passcode configured -> 503 `not_configured`;
list/save/delete without a token -> 401; a forged token -> 401. RLS proven by
canary: a service-role row is invisible to anon reads, anon INSERT is rejected
(42501), and an anon DELETE returns 204 having matched nothing — the canary
survived. Canaries removed afterwards.

**DONE.** `OWNER_PASSCODE` is set and login is confirmed working end to end
(token issued). PR #2 merged; the live site uses the server-side gate.

One bug surfaced during setup and is fixed in `owner` v7: the stored secret was
compared untrimmed while the submitted passcode was trimmed. Supabase's secret
Value field is a multi-line textarea, so a trailing newline saves easily by
accident — and the mismatch surfaced as "Incorrect passcode", pointing the
blame at the operator instead of the whitespace. Both sides are trimmed now.

Added a `selfcheck` action that reports the stored secret's SHAPE without
disclosing it: length, whether stray whitespace was saved around it, whether it
contains inner whitespace, and its first and last character. Enough to spot a
paste mishap in one call; far too little to reconstruct the value. This is what
diagnosed the above.

**Remaining for Otis:**
1. **Rotate the passcode.** The one in use came from an example in the session
   transcript, so it is not private. Not urgent — it guards invoices, not money,
   and the throttle blocks brute force — but it should not stay.
2. Delete `VITE_OWNER_PASSCODE` from the Vercel project. Inert, but dead
   credentials should not linger.

---

## 6. Invoice manager diagnostic — four defects, all fixed

**Where:** `meridian-interface-website` → `OwnerInvoiceView.tsx`, `index.css`

Otis reported that some of the invoice pricing components did not work. A full
diagnostic found four separate faults. Three of them presented identically — the
Save button doing nothing at all, with no message, no console error, and correct
figures still on screen.

1. **Decimal tax and discount were rejected.** The percentage inputs are
   `type="number"` with no `step`, so `step` defaults to `1` and the browser
   refuses to submit a form containing `8.25` — the Texas rate. The Grand Total
   recalculated correctly throughout, which is why the arithmetic always looked
   right and the invoice simply never filed.
2. **Line rates carried `step="50"`,** so any custom quote that was not a
   multiple of fifty — $2,875 — blocked the submit the same way.
   Both failures surfaced only as a native tooltip pinned to a field that is
   usually scrolled out of sight. The form is `noValidate` now and validates in
   `handleSaveInvoice`, showing every rejection beside the button pressed.
3. **Invoice numbers collided after a delete.** The id came from
   `invoices.length + 1`, so deleting one of three made the next invoice reuse an
   existing number — and since saving upserts by id, it **overwrote the invoice
   already filed under it**, silently. Numbers now come from the highest in use.
4. **The printable invoice trapped the owner inside it.** `.animate-fadeIn` used
   fill-mode `both`, leaving a permanent `transform` on every page container. An
   element with a transform becomes the containing block for its `fixed`
   descendants, so **no overlay on the site was anchored to the window**. On a
   long invoice the action bar — Print / Save PDF and Close — sat 596px above a
   scroll area already at `scrollTop: 0`. Measured, not inferred. Escape now
   closes the preview too, so it never has only one exit.

**Status: FIXED and pushed to `main`** (commit `8fa7292`), so the live site has
it. Verified by a 26-check diagnostic — every catalogue add path, the discount
and tax arithmetic, the save/edit round trip with deliverables intact, and a
regression that deletes the middle invoice and proves nothing is overwritten —
plus a 10-check site-wide pass confirming overlay anchoring and that the header
and bottom nav stay pinned on every view. 26/26 and 9/10.

**The one open item from that pass:** the header search overlay closes on a
backdrop click but not on Escape. Minor, outside the invoice work, noted here so
it is not lost.

---

## 7. Client Answers — built, timelines need Otis's eye

**Where:** `meridian-interface-website` → `src/data/clientExplainers.ts`,
`src/components/ClientExplainers.tsx`

Otis asked for a place to copy-paste an in-depth explanation when a client asks
what a line on the invoice actually buys. Built as a **Client Answers** tab in
the owner portal: the written answer for all ten catalogue services — what is
included and why each piece matters, what it does for their business, what the
price does **not** cover, typical timeline, and what the studio needs from them.
Two copy formats (full email text, and three sentences for a text message), plus
the same answer one click from the invoice line itself, carrying the rate
actually billed.

**Status: SHIPPED** to `main`, 17/17 diagnostic.

**Open — needs Otis, not code:**
- **The timelines are drafted, not confirmed.** "2 to 3 weeks" for a landing
  page, "10 to 16 weeks" for a web app, and so on. These are reasonable but they
  are mine. Anything pasted into a client email reads as a commitment, so he
  should check each one against what he actually delivers and tell me what to
  change. The tab carries an on-screen reminder to check before sending.

---

## 8. Old invoices predate the itemisation

Any invoice created before the itemisation work shipped carries the old studio
shorthand in its descriptions and has no deliverable bullets — the printable
view therefore shows a bare one-line description where it should show what the
client receives. Nothing is broken; the data simply predates the feature.

**Fix:** rebuild those invoices from the catalogue. New ones carry deliverables
automatically.

**Status:** open, Otis's call — it only matters for invoices he intends to send.

---

## 9. Publishing channels — built, with the ad platforms deliberately left out

**Where:** `system/supabase/functions/_shared/channels.ts`, `system/CHANNELS.md`

Publishing was a stub that marked every item published without sending
anything. It is now real: a **generic outbound webhook** (Make / Zapier / n8n),
**Facebook Page**, **Instagram**, and **LinkedIn**, each behind its own
credentials, each falling back to the honest mock stub when unconfigured. No
redeploy to switch one on — credentials are a `settings` row read per publish.

The webhook adapter is the one that matters short-term: it reaches TikTok,
YouTube, WordPress and Google Business Profile **today**, through a tool that
already holds those connections, instead of waiting weeks on each platform's
API approval.

Also fixed on the way through: `content_items.channel` is a foreign key to
`channels(key)`, and `facebook` and `linkedin` were never registered — a
LinkedIn draft would have failed at the database before any adapter ran.

**Deliberately NOT built: Google Ads and Meta Ads.** Publishing a post costs
nothing; an ads API spends money on a schedule with no person in the loop.
That belongs behind its own approval flow and its own spend caps. Both stay in
the `channels` table as known-but-disabled so the omission reads as a decision.

**Status: SHIPPED** (runner v14). All three routing branches verified live —
real 200 → `published`; real 400 → `failed` with the error stored verbatim and
a backoff retry; unconfigured → stub. Test rows removed.

**Open for Otis:** nothing is switched on. Setup for each channel is in
`system/CHANNELS.md`; the webhook route takes minutes, the platform ones need
their own approvals.

---

## 10. The loop is closed — measurement now reaches the next plan

**Where:** `system/supabase/functions/analyze/`, `_shared/context.ts`,
migration `0007`

The system could plan, write and publish, but its only output about results was
a weekly report written for a human. Nothing it learned ever reached the next
plan, so every cycle began from the same standing instructions.

`analyze` closes that. It aggregates real outcomes per channel from the CRM,
writes them to `settings.performance`, and the shared context layer renders
them into every planning and writing prompt. Scheduled at 12:30 UTC daily —
half an hour before the orchestrator plans, so each plan is made with the
latest numbers already in front of it.

**On cost-per-acquisition.** The reference architecture computes CAC by
channel. CAC needs ad spend, and there is none here by deliberate decision.
Rather than divide by zero or invent a number, `settings.ad_spend` is an empty
seam: enter real spend and CAC becomes real. The one genuine cost that *is*
measurable — what the AI itself burns — is computed from `agent_runs` token
counts against `settings.model_rates`, and reads $0.00 while in mock mode.

**The discipline that makes it worth having:** every claim is gated on sample
size. Fewer than 10 attributable leads and it refuses to rank channels; fewer
than 3 published posts and a channel is not judged at all. `leads_per_post` is
`null`, not a flattering zero, when nothing has been published. Leads whose
source is not one of the system's channels are excluded from its performance
and reported separately, so the numbers can never take credit for the website.

**Its first real finding was uncomfortable and correct:** nine drafts, nothing
ever published, and all four leads in the window came from outside the system.
The guidance it wrote back was *"do not plan more content volume — the
bottleneck is approval and publishing, not writing."*

**Status: SHIPPED** (analyze v1, orchestrator v13, runner v15). Verified live:
the analyzer ran against real data, the orchestrator planned cleanly with the
new section in its prompt, and the rendered block was confirmed word for word.

**Open for Otis:** the approval queue is the bottleneck the system just
identified. Nine items are waiting.

---

## 11. Lead attribution — the gap that would have made the loop useless

**Where:** `meridian-interface-website` → `src/lib/attribution.ts`,
`src/lib/leads.ts`, `src/components/CampaignLinks.tsx`

Found while answering a question about connecting social accounts, and it was
load-bearing: **connecting the accounts alone would not have worked.**

`intake` sets `contacts.source` from `payload.source`, defaulting to
`meridian-website:booking`. The site never sent one. So a visitor arriving from
an Instagram post and booking was filed as a website lead — and `analyze`
attributes by matching `contacts.source` to a `channels.key`. It would have
kept reporting **"0 leads attributable to channels"** no matter how much was
published, and never reached the 10 it needs before it can rank anything.

**Fixed on the website side only** — no backend change, no redeploy, because
`intake` already read the field the site was failing to send.

- UTM tags and the referring host are captured on arrival, normalised to real
  channel keys.
- **First touch wins** and is never overwritten: found in March, booked in May,
  still an Instagram lead. The one exception is a blank "direct" first touch,
  which upgrades if a tagged arrival follows.
- **Organic search is deliberately unmapped.** It is not something the system
  did, and counting it would flatter every number the system reports.
- **Only the referrer's hostname is stored** — a search referrer carries the
  query in its path, and that is the visitor's words.
- A **Campaign Links** tab in the owner portal builds the tagged links, so they
  do not get hand-typed and quietly stop matching.

**Status: SHIPPED** to `main`. 13 checks against a real build, then end to end
against live `intake`: a tagged booking moved Instagram from 0 leads to 1 in
`v_channel_performance`. Canary removed.

**Open for Otis:** tagged links only help if they are used. Instagram bio links
and Google Business Profile links need tagging by hand — GBP especially, since
its referrer is indistinguishable from organic Google without a tag.

---

## Not pre-launch

Phase 2 publishing channels — Meta, Google Business Profile, Google Ads,
WordPress. Each needs its own OAuth flow. These are a post-launch project, not
a blocker.

---

## Still to be added

Otis has more items to raise. Add them here as they come up, so the list is
one place and survives between sessions.
