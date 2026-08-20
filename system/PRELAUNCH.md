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

**Status:** open. Deliberately deferred — it needed a full function redeploy
for something no one sees in production.

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

**Status:** open. Rises from "optional hardening" to **required** the moment
a key exists.

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

## Not pre-launch

Phase 2 publishing channels — Meta, Google Business Profile, Google Ads,
WordPress. Each needs its own OAuth flow. These are a post-launch project, not
a blocker.

---

## Still to be added

Otis has more items to raise. Add them here as they come up, so the list is
one place and survives between sessions.
