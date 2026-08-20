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

**Status:** open. The lockout that made this visible is fixed
(`meridian-interface-website` PR #1); the storage question is untouched.

---

## Not pre-launch

Phase 2 publishing channels — Meta, Google Business Profile, Google Ads,
WordPress. Each needs its own OAuth flow. These are a post-launch project, not
a blocker.

---

## Still to be added

Otis has more items to raise. Add them here as they come up, so the list is
one place and survives between sessions.
