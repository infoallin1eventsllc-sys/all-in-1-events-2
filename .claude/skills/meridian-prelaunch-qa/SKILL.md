---
name: meridian-prelaunch-qa
description: >-
  Find mistakes on the Meridian Interface website and its hosted demos before
  anything goes live or reaches a client. Run it before every push to the
  website's main branch (which deploys meridianinterface.com), before sending a
  demo link to a client or customer, and whenever Otis asks to "check the site",
  "find mistakes", "QA", "make sure everything works", "is it ready to go
  live", or "test before deploying". Bundles two scripts: static checks (types,
  build, vulnerable packages, leaked secrets, missing pictures and demos,
  icons missing from the font subset, demos that tell visitors something
  happened when it did not) and a browser pass under the live security policy
  (every page at four screen sizes, booking/search/menu flows, card layout,
  repeated content, accessibility, and a click-through of every demo). Nothing
  ships while either script reports a FAIL.
---

# Meridian pre-launch QA

Every mistake this checks for has already reached the live site once: an
empty Google map, an icon printing the word "ExPLORE", booking dates two
months in the past, a real shop's demo telling customers "Paul has received
your request" when nothing was sent, cover pictures sliding 40px down their
cards, the whole portfolio repeated on the home page. The scripts catch the
mechanical ones; the checklist at the end catches the ones only a reader can.

**The rule: no FAIL, no ship.** WARN lines are read and either fixed or
explained to Otis in the hand-off; they never silently pass.

## When to run it

| About to… | Run |
|---|---|
| Push to `main` of `meridian-interface-website` (Vercel deploys it live) | Both scripts, full |
| Send a client a `/demos/<slug>/` link, or host a new demo | `static.sh`, then `browser.mjs --only demos`, plus the demo checklist below |
| Change only copy or a picture | Both scripts anyway. Copy changes are how the repeats got in. |

Run it on the **branch you are about to push**, after `git fetch && git pull`.
The repo moves (other sessions push demo updates), and a check of a stale tree
proves nothing.

## Steps

From the website repo root (`meridian-interface-website`):

```bash
SKILL=<path to this skill>            # e.g. /home/user/all-in-1-events-2/.claude/skills/meridian-prelaunch-qa
git fetch origin && git status -sb    # behind? pull first
bash $SKILL/scripts/static.sh         # builds dist/ as part of the run

# serve the build exactly as Vercel will, in the background
npx vite preview --port 4799 --strictPort &
until curl -s -o /dev/null http://localhost:4799/; do sleep 1; done

# accessibility needs axe-core; install it without touching package.json
npm i --no-save --no-package-lock axe-core

node $SKILL/scripts/browser.mjs --site . --base http://localhost:4799 --out /tmp/meridian-qa
```

`browser.mjs` finds Playwright and Chromium on its own (cloud sessions have
both preinstalled). Elsewhere: `npm i -g playwright && npx playwright install
chromium`, or set `PLAYWRIGHT_PATH` / `CHROMIUM_PATH` / `AXE_PATH`.

Then **look at the screenshots** in `/tmp/meridian-qa` (one per page per size,
one per demo). Scripts measure; they do not see that a picture is ugly or
wrong. Every page at desktop and phone, every demo: does anything look broken,
clipped, out of place, or not like the rest?

Fix, rebuild, and run again until both scripts end in `0 FAIL`. Then push.
After the push, confirm the Vercel deployment for that commit is `READY`
before telling Otis it is live (the sandbox cannot load meridianinterface.com
itself, so say that the live check was via Vercel, not a browser).

## What each FAIL means and the usual fix

| FAIL says | Usual cause and fix |
|---|---|
| `blocked by the live security policy` | A page or demo loads something `vercel.json`'s CSP refuses (a Google Maps iframe, a hotlinked photo, a CDN font). Self-host it, or replace it (the Frame Shop map became a location card). Only widen the CSP for one path, and only if Otis agrees. |
| `loads from another site` | Hotlinked image/font/script. Self-host: images into the demo's `public/`, fonts as latin `woff2` subsets. |
| `icon shows as text` / `icon … not in the icon subset` | The Material Symbols font is a subset. Pick a name that exists (the static check prints the file); do not regenerate the subset casually. |
| `booking date defaults to … in the past` | A hard-coded date. Use `src/lib/dates.ts` (`nextBusinessDay`, `todayISO`), local time, never `toISOString()`. |
| `card pictures sit Npx below the top` | A `<button>` wrapping a stretched card centres its content. `flex flex-col justify-start` on the button. |
| `page scrolls sideways` / `clipped label` / `navigation bar runs off the screen` | Something too wide at that size. Check the `small-phone` (320px) result first. |
| `does not close on Escape` | Dialogs need a keydown handler (see `Modals.tsx`). |
| `EMPTY booking was sent` / `filled booking was not sent` | The booking form's validation or `lib/leads.ts` broke. Never ship this. |
| `/demos/X says "<phrase>" with no demonstration notice` | A demo claims something happened that did not (sent, charged, dispatched). On a hosted copy it must say it is a demonstration. Pattern: `frame-shop/src/utils/demoCopy.ts`. |
| `the Meridian demonstration bar is missing` | A demo was rebuilt and not re-stamped: `node tools/brand-demos.mjs`. |
| `pinned element(s) sit under the Meridian bar` | The demo's own fixed header ignores `--meridian-bar`; see `tools/brand-demos.mjs`. |
| `accessibility …` | Usually contrast (raise `slate-400` to `slate-500`/`600`) or a scroll area with no `tabIndex`. |
| `npm audit … (fix)` | `npm audit fix` in that folder, rebuild, and confirm the demo's bundle name did not change if the package is server-only. |
| `secret-looking strings in dist` / `SERVICE ROLE key` | Stop. Remove it from the source, rotate the key in its dashboard, rebuild. Never push. |
| `demo link points at missing` / `missing file` | A tile or page references a file that is not committed. |

## WARNs worth acting on

- `repeated content` — the same sentence or picture twice on one page, or the
  footer repeating contact details. Otis asked for no repeats (5 Oct). Fix or
  say why it stays.
- `hosted but nothing links to it` — an orphaned demo (ORCHESTRA is one, kept
  on purpose). Mention it; deleting is Otis's call.
- `not used anywhere` — an orphaned picture; remove it if nothing else needs it.
- `long dash` — house style is no em dashes in visitor copy.
- `AI model badge` — a demo naming a model while answering from canned data.

## Known noise (not failures)

- In a cloud sandbox, outbound requests to supabase.co, posthog and Google
  Fonts fail at the proxy. The script stubs the site's own backend calls and
  ignores `net::ERR_TUNNEL/CERT` console lines; the stack-planner call and
  Drone Command's fonts are allowlisted because the CSP permits them live.
- Demo crawls cannot reach every control; the per-demo click count is printed.
  Demos whose menus are plain elements (CRM, planner, FinSight, Analytics Hub,
  Modern Street, Drone Command) are also driven by label from the `MENUS`
  list in `browser.mjs`. "menu item not found" means the demo changed: look,
  then update the list. A new demo with under ~10 clicks needs its own entry.
- Drone Command renders 3D in software in a sandbox with no GPU, so each click
  takes ~5 s; `SLOW` gives it longer. It is instant on a real machine.
- The accessibility step bypasses the CSP on purpose (the live policy blocks
  the injected axe script); every other step runs under the live policy.
- A demo with no source in either repo (Analytics Hub, FinSight, CRM,
  ORCHESTRA) can only be fixed by a careful literal edit of its built bundle:
  replace one exact, unique string, then `node --check` a `.mjs` copy of the
  file. Note the edit in `public/demos/README.txt`.

## Its first run (5 Oct 2026), for calibration

Caught on the way to deploying the redundancy fixes: a dead Google Maps embed
address still bundled in the Frame Shop, Analytics Hub asking the site for an
AI server that does not exist (a 404 on every question), the accessibility
injection itself blocked by the CSP, and a crawler that reported Drone Command
as having nothing to click. All fixed before the push.

## Human checklist (the script cannot do these)

For the site, before pushing:
- [ ] Read every changed sentence as a stranger would. Is it true today? (A
      promise like "reschedule anytime in the portal" was false for weeks.)
- [ ] Is anything said twice, on this page or another? Prefer one place and a link.
- [ ] Names are consistent: "My Appointments", "Portfolio", "Studio login".
- [ ] Prices, timelines and the phone/email match `index.html`'s noscript
      fallback, which must mirror the home page copy.

For a demo going to a client or customer:
- [ ] It shows the client's own name, brand and real details, not another
      client's and not Meridian placeholder data.
- [ ] Nothing in it uses Meridian's or Otis's own API keys
      (`anthropic-skills:client-handoff-api-keys`).
- [ ] Every form either really sends, or says plainly that it is a demonstration.
- [ ] Open it on a phone-sized screen and click through it start to finish.

## Record it

Add a line to `system/SESSION.md` (all-in-1-events-2 repo): date, commit,
`static: N FAIL / browser: N FAIL`, anything left as a WARN and why.
