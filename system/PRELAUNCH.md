# Pre-launch fix list

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

## Not pre-launch

Phase 2 publishing channels — Meta, Google Business Profile, Google Ads,
WordPress. Each needs its own OAuth flow. These are a post-launch project, not
a blocker.

---

## Still to be added

Otis has more items to raise. Add them here as they come up, so the list is
one place and survives between sessions.
