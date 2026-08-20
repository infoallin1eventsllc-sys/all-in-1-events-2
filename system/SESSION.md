# Session memory — Meridian Marketing System

Compact record of what was built and the current state, so work can resume later.

## Who / what
- **Owner:** Otis Williams — **Meridian Interface** (web/software studio). otis@meridianinterface.com · (281) 882-9198.
- **Repo:** `infoallin1eventsllc-sys/all-in-1-events-2`, working branch **`claude/marketing-system-tech-stack-uds0mp`**.
- The repo also holds the "All in 1 Events" client site (`index.html`). The marketing system + portfolio page are Meridian Interface's own portfolio/product work.
- **Brand:** slate-on-ivory. `#3E4C63`/`#5B6472` slate, `#4F6D8C` steel, `#3E7C86` teal, ivory `#F5F4EF`, ink `#23262B`. Fonts: Sora (headings) + Inter (body). Logo = "M" monogram (rendered as inline SVG; real PNG goes at `assets/meridian-logo.png` and the header/footer auto-swap to it).

## Deliverables (all committed to the branch)
1. **`marketing-system.html`** — portfolio page: the tech-stack architecture in Meridian brand. Uses Tailwind CDN.
   - **`system/marketing-system.artifact.html`** — self-contained build (Tailwind compiled to inline CSS). Published artifact: https://claude.ai/code/artifact/72505b31-cf3b-475a-a635-a9fd7cf53f66
   - Linked from `index.html` nav + footer.
2. **Working backend** on Supabase (see below).
3. **`system/cli.mjs`** — operator CLI (status/lead/plan/run/loop/content/approve/messages/send/report). Needs Node 18+ and `system/.env` (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
4. **Dashboard** — Meridian-branded. Published snapshot artifact: https://claude.ai/code/artifact/31148180-2fe1-49f1-bc19-dfbe2d483031
5. **`system/README.md`** — deploy/handoff guide. **`system/.env.example`**, migrations in `system/supabase/migrations/`.

## Supabase (project ref `glzodwhyavexpuusbqjy`, region us-west-2)
- **Tables:** contacts, deals, activities, campaigns, channels, content_items (+image_url), messages, tasks (queue), memory (pgvector), reports, settings, agent_runs, media_assets. RLS deny-by-default (service role only).
- **Edge functions:** `orchestrator` (Claude plans work, JWT), `runner` (drains task queue w/ retries+backoff, JWT), `intake` (public lead webhook, no JWT), `report` (weekly owner summary, JWT), `dashboard` (server-rendered, passcode-gated, no JWT).
- **Scheduling (pg_cron, active):** `marketing-runner` */2min, `marketing-orchestrator` daily 13:00 UTC, `marketing-report` Mon 13:30 UTC. Cron calls functions via `public.invoke_edge()` using a vaulted anon token (`marketing_invoke_token`).
- **settings rows:** `business_profile`, `goals`, `agent` (model `claude-opus-5`, autonomy `draft`), `dashboard` (holds the dashboard passcode — retrieve with `select value->>'passcode' from settings where key='dashboard'`).

## Current state
- **`system/PRELAUNCH.md` — the fix list to close BEFORE deploying anything.**
  Otis asked to hold these and do them as one pass before go-live. Note #3
  (RUN_SECRET) becomes a real spend risk the moment a key is configured.
- **See `system/ARCHITECTURE.md`** — the one map of how the three repos connect,
  what config joins them, and the go-live order. Start there.
- **Demo / mock mode.** No valid Anthropic key. Otis decided NOT to use his key for now.
- An **invalid** `ANTHROPIC_API_KEY` is still set as a Supabase secret. All Claude calls now **degrade to mock gracefully** (try/catch in `_shared/claude.ts`), so nothing errors. Dashboard badge shows "Demo mode" (based on real non-mock output existing, not key presence).
- Pipeline verified end-to-end in mock: intake → contact+activity → follow_up task → runner drafts email + content post (with tag-matched image) → approval queue. Owner summary + report path work.
- Demo data present: leads Marcus Bell (instagram), Jordan Rivera (website); 2 drafted instagram posts; 1 drafted email.

## To go LIVE (Otis's steps)
1. Set real `ANTHROPIC_API_KEY` as a **Supabase Edge Function secret** (dashboard → Edge Functions → Secrets) — NOT on his Mac, NOT in `.env`. Everything flips to real Claude output, no redeploy.
2. Optional: `SENDGRID_*` / `TWILIO_*` secrets to actually send email/SMS (until then it drafts for approval).
3. Optional: set `settings.agent.autonomy = 'auto'` to auto-send instead of draft.

## Constraints learned (important)
- **Supabase functions domain refuses to serve web pages** — it rewrites `text/html` AND `application/xhtml+xml` → `text/plain` (anti-phishing). `application/json` passes. So a browser-rendered dashboard can't be served from the edge function; delivered as an Artifact snapshot instead.
- **This sandbox's egress blocks `*.supabase.co` and CDNs** (cdn.tailwindcss.com, Google Fonts, googleusercontent). Work around by invoking functions server-side via the pg `http`/`pg_net` extensions and using MCP tools. Local screenshots can't load those hosts.
- **Artifacts block remote images** (only Google Fonts allowed) — dashboard post photos show as brand-slate placeholders in the artifact; real photos render when served from a normal host.

## Key Router integration (Aug 19)
- `key-router` repo (separate) is the API-key failover proxy. Its provider seam
  was a stub; now implemented against the Anthropic Messages API on branch
  `claude/implement-anthropic-provider` (31/31 tests, +5 new). `render.yaml`
  added for one-click Render deploy.
- `_shared/claude.ts` here now has THREE modes: KEYROUTER_URL → route through
  Key Router (no local key), ANTHROPIC_API_KEY → direct SDK, neither → mock.
  Router failure falls back to direct, then mock.
- To switch on: deploy Key Router, then set KEYROUTER_URL +
  KEYROUTER_AUTH_TOKEN as Supabase secrets. Edge functions need a redeploy to
  pick up the new `_shared/claude.ts` (source committed, not yet deployed).

## Key Router — multi-provider (Aug 19)
- Each key's `provider` field now drives dispatch (`src/providers.js`):
  anthropic (`/v1/messages`, x-api-key, input+output tokens) and openai
  (`/v1/chat/completions`, Bearer, total_tokens). Defaults to anthropic, so old
  configs are untouched. Unknown provider throws AT BOOT with the known list.
- `KEYROUTER_URL_<PROVIDER>` overrides an endpoint (Azure/gateway/proxy).
- Suite 36/36 on branch `claude/implement-anthropic-provider`.
- WHY this matters: Key Router manages keys, it does not supply them. Every call
  bills whoever owns that key. The model is one key entry per CLIENT, with their
  own limit — their marketing on their budget, never Otis's. Meridian's OWN
  marketing still needs Otis's key (the `limit` is the spend cap).

## Meridian Interface WEBSITE (separate repo, Aug 19)
- **Repo:** `infoallin1eventsllc-sys/meridian-interface-website` — React 19 + Vite +
  Tailwind v4 + TS. Marketing site AND a client booking/invoice portal. Built by
  Otis in Google AI Studio, pushed by him after granting Claude repo access.
- **Structure:** `src/components/` (Home/Solutions/Impact/Connect/Dashboard/
  OwnerInvoice/Modals), `src/lib/leads.ts` (THE lead seam — every booking goes
  through `submitAppointment()`), `src/lib/imageStore.ts` (owner image overrides).
  Fonts self-hosted in `public/fonts` (Hanken Grotesk, Inter, Material Symbols).
- **Wired to the CRM:** `leads.ts` POSTs to the intake webhook by default
  (`VITE_LEAD_ENDPOINT` overrides). `intake` was extended to accept the site's
  `{type:'appointment', payload:{...}}` envelope, map clientName/clientEmail/etc,
  AND open a pipeline deal (amount parsed from budget range). Verified live.
- **Pre-deploy audit + QA (all fixed, all verified):**
  1. Bookings did not appear in the client portal — DashboardView read storage
     only on mount. App now bumps `bookingVersion` which keys the view. Proven 2→3.
  2. Full appointment (name/email/phone) was logged to the browser console. Removed.
  3. Footer "Studio login" showed in prod with no passcode configured → now gated
     on `import.meta.env.DEV || VITE_OWNER_PASSCODE`.
  4. Booking POST tried once → now retries once before falling back to local save.
  - Also enabled TS `strict: true` and added aria-labels to booking inputs.
  - PASSED: no secrets committed, no XSS surface, no third-party scripts, zero JS
    errors across 8 views, no mobile horizontal scroll at 390px, clean build.
  - OPEN (Otis's call): 24 images hotlinked from images.unsplash.com — works, but
    the visual identity depends on a third party. Worth self-hosting.
- **MERGED TO `main`** (commit 01fa062). main = the fixed, tested version.
- **Deploy status:** NOT deployed. Next step is Otis doing a Vercel preview
  deploy (vercel.com → Add New → Project → import the repo → Deploy; Vite is
  auto-detected, zero config, no env vars needed). Explained to him that a
  preview deploy ≠ public launch — the URL is live but unlisted.

## Published artifacts (all private, Otis's gallery)
- Marketing tech-stack page: https://claude.ai/code/artifact/72505b31-cf3b-475a-a635-a9fd7cf53f66
- Marketing dashboard snapshot: https://claude.ai/code/artifact/31148180-2fe1-49f1-bc19-dfbe2d483031
- Pre-deploy review (all 8 screens + findings): https://claude.ai/code/artifact/4c53084d-582c-40d3-b0ef-0c3d0353fc00
- The website itself, single-file & clickable (SUPERSEDED, kept for history):
  https://claude.ai/code/artifact/f10cd8e3-c781-46ec-b0ca-4a8ae4fa1071
- **CURRENT site artifact** (video hero + invoice portal reachable):
  https://claude.ai/code/artifact/4ee1e978-b336-40b6-ba13-dadd73cf5f33
  Source `system/meridian-invoice-portal.artifact.html`, built by
  `inline-site.mjs` (scratchpad) from `dist`: CSS, JS, the three self-hosted
  fonts, the hero still, the video loop and its poster all inlined as data URIs
  — the artifact has no origin to resolve absolute paths against, which is why
  the page is 3.7 MB. Built with VITE_OWNER_PASSCODE=meridian, so the owner
  portal opens from footer -> Studio login with the passcode `meridian`.
  Unsplash photos and file downloads do not work inside the artifact viewer —
  that is the viewer, not the site.
- Key Router console (the API router UI): https://claude.ai/code/artifact/c2b1c27e-9c31-4409-b024-a406d29d4754
  Source `system/keyrouter-dashboard.artifact.html`, built from
  `key-router/dashboard` (React 19 + recharts + lucide) via `vite build` with the
  dist CSS/JS inlined. Opens in DEMO mode — three seeded keys, client-side only,
  no server needed. Verified headless with all network blocked: mounts clean,
  zero page errors, no horizontal scroll at 1440px or 390px; streaming traffic
  advances usage 61,000 -> 70,000; injecting a 401 on the active key rotates to
  Backup pool and logs it; keys stay masked; the LIVE tab with no backend shows a
  connection error instead of crashing.

## Connected as one system (Aug 19)
- Otis's intent, in his words: not a repo merge — "when I launched the website
  that everything will be connected to one another." So: one visual identity,
  one verified data path, one architecture doc. Repos stay separate.
- **Key Router console rebranded** into the Meridian system (ivory/slate/steel/
  teal, Sora over Inter, studio monogram). Also fixed a real defect the dark
  theme hid: the "Keys routable" gauge measures availability, where high is
  good, but was coloured by the consumption scale — a fully healthy fleet
  showed red. PR #2 on key-router.
- **key-router PR #1 MERGED** (d53468a). main now has the real provider call
  and the multi-provider fleet.
- **Edge functions redeployed** so the Key Router seam is live in production,
  not just in source: runner v7, orchestrator v5, report v5. Before this,
  setting KEYROUTER_URL would have done nothing.
- **End-to-end verified live** with the website's exact booking envelope:
  intake 200 -> contact a6494c62 + deal 5dbaff20 -> runner drained the
  follow_up_lead task and drafted an email -> a generate_content task produced
  a valid 2410-char on-brand SVG card -> orchestrator success (1 task) ->
  report wrote real metrics (3 new leads, $5,000 pipeline).
- Known mock-only cosmetic: the weekly report body renders a content caption
  instead of a summary, because the report prompt matches the mock's content
  branch. Disappears with a real key; metrics in the same report are correct.

## Aug 20 (evening) — DEPLOYED TO VERCEL

- **`meridian-interface-website` PR #1 MERGED** (83d68aa). Vercel was already
  connected to the repo and building preview deploys from branches; merging to
  `main` triggered the **production deploy, which completed successfully**.
  Project: `infoallin1eventsllc-7684s-projects/meridian-interface-website`.
- The site is therefore LIVE with: the licensed video hero, the branded image
  fallbacks, the fixed dropdown chevron, and the owner portal reachable again.
- **ACTION FOR OTIS:** set `VITE_OWNER_PASSCODE` in the Vercel project if he
  wants the Invoice & Pricing Manager usable in production. Without it the
  portal shows its setup panel — correct behaviour, but the tool stays locked.

### Two rendering bugs fixed this round
1. **Every failed image impersonated another service.** All five image call
   sites fell back to one hard-coded Unsplash photo — the *dashboards* shot. A
   Web Design card whose photo failed rendered a dashboard under a "Custom Web
   Design & Development" heading. The fallback was itself an Unsplash URL, so
   in the only failure that actually happens (Unsplash unreachable) it failed
   too — it could only ever produce a wrong image, never a working one. Now a
   shared `ImageWithFallback` renders a branded panel with the item's own icon
   and label. No network, no other service's photo.
2. **`expand_more` was painted across the service dropdown** in 24px type.
   The subset font's cmap covers only `' _abcdefghiklmnoprstuvwy'` — **j, q, x,
   z are absent** — so the `x` in "e(x)pand_more" cannot map, the ligature never
   forms, and the browser paints the word. It is the ONLY icon name on the site
   containing one of those letters. Replaced with an inline SVG chevron.
   METHOD WORTH REUSING: measured rather than reasoned — walked every Material
   Symbol span and compared rendered width to font size. A resolved ligature is
   ~1em square; raw text is far wider. My font-table reading had wrongly claimed
   21 broken icons; the measurement found exactly 1.

## Aug 20 — merges, portal lockout, video hero

### Merged
- **key-router PR #1** (provider call + multi-provider) -> `main` (d53468a).
- **key-router PR #2** (Meridian console rebrand + gauge fix) -> `main` (e2f3ff7).
- **all-in-1-events-2 PR #2** (the whole marketing system, 27 files) -> `main`
  (8131399). Netlify deploy preview was green before merging.
- **STILL OPEN:** `meridian-interface-website` **PR #1**
  (`claude/restore-owner-portal-access`) — owner-portal fix AND the video hero
  both live on that branch. Not merged.

### The client-site call (important)
The branch had added a "Marketing System" link to the All in 1 Events nav and
footer. **That repo auto-deploys to Netlify**, so merging would have published
Meridian links onto a client's live site. Stripped both links before merging;
`index.html` is byte-identical to main. The marketing-system page still ships
and is reachable by URL — it belongs on meridianinterface.com, not a client's nav.

### Owner Invoice & Pricing Manager — was invisible, now fixed
Otis reported it "missing from the ZIP". It was never missing — `OwnerInvoiceView.tsx`
is intact (1,326 lines). Two compounding bugs:
1. In a prod build with no `VITE_OWNER_PASSCODE`, both `OWNER_PASSCODE` and
   `DEV_PASSCODE` are `''`, so `handlePinSubmit` can NEVER return valid — every
   passcode answers "Incorrect passcode." forever.
2. An earlier hardening change (mine) hid the footer link in exactly that state,
   turning a confusing lockout into an invisible one.
Fix: footer link always rendered; an unconfigured build shows a **setup panel**
naming `VITE_OWNER_PASSCODE` instead of a form that cannot succeed. No default
passcode ships to production. Verified against two real prod builds over HTTP.
**Feature QA: 16/16, zero page errors** — unlock, 4 pricing tabs, add bundle
($9,500), add custom item, qty x rate, grand total $9,500 -> $11,000 -> $9,500,
remove, save, printable view, directory, photo control, lock.
NOTE: 3 of those first reported FAIL and were ALL test error, not app error —
the button is "Add Custom **Item**" (not "Line"), and the delete selector was
reaching past the editor into the invoice directory table where a confirm
dialog silently blocked it. Scope selectors to the editor table.

### Hero: canvas simulation -> real video
First attempt was a canvas starfield + CSS ken-burns. Otis: "the quality is not
what I'm looking for." He was right — it was tuned to sit under the threshold of
noticing, which is an Operate-mode instinct on a Persuade/Experience surface.
**Replaced with real footage.** 16s cinematic loop rendered with ffmpeg from his
own Earth still: slow dolly + arc, breathing rim bloom, film grain, vignette,
graded. All animated values are cosines over the clip, so the last frame IS the
first — measured loop seam 0.48/255, invisible.
- Assets: `public/video/earth-loop.webm` (323 kB), `.mp4` (1.7 MB),
  `public/images/earth-poster.jpg` (32 kB). Poster paints first (LCP never waits
  on video), `preload="none"`.
- Degrades to poster on: reduced-motion (no `<video>` rendered at all),
  Save-Data, 2g, autoplay refusal, slow load. Pauses when tab hidden.
- **Two ffmpeg bugs worth remembering:** (a) `blend` with a single `all_expr`
  hits chroma too, and chroma is centred at 128 — `A+B` turned the Earth
  magenta; blend luma only (`c0_expr`, with `c1_expr='A':c2_expr='A'`).
  (b) `zoompan`'s `zoom` MAGNIFIES, it does not frame — `z=2` cropped to a
  quarter of the image; run the pan at full 4K with `s=3840x2160` then
  `scale=1920:1080`.
- Render recipe lives in the commit message on `claude/restore-owner-portal-access`.

### Tooling note
`adobe-for-creativity` shows as enabled in the plugin catalog but its **MCP
server is NOT connected** in these remote sessions — do not promise Adobe.
Figma (incl. `export_video`), Canva, Magic Patterns, Supabase, github ARE
connected. ffmpeg + sharp install fine via npm in the scratchpad.

### New docs (source of truth — read these first)
- **`system/ARCHITECTURE.md`** — the one map: website -> intake -> runner ->
  Key Router -> provider, the config values that join the three repos, go-live
  order, known gaps.
- **`system/PRELAUNCH.md`** — the fix list to close BEFORE deploying anything.
  Five items. Otis asked to hold them and do one pass before go-live.
  #3 (RUN_SECRET) becomes a real SPEND risk the moment a key is configured.

## Open next steps (not done)

**Blocking, before any deploy — see `system/PRELAUNCH.md` for detail:**
1. Mock-mode weekly report prints a content caption instead of a summary.
2. 24 Unsplash images on the website are still hotlinked; self-host them.
3. `RUN_SECRET` header on orchestrator/runner/report. Today they only burn
   idempotent work; **once a key is configured, every unsolicited call spends
   money.** Close this before go-live step 3, not after.
4. Real logo PNG at `assets/meridian-logo.png` (card generator + console mark
   still render the built monogram).
5. Owner invoices live in browser `localStorage` with a client-side passcode —
   one browser, no backup, not real access control. Move to Supabase before
   real client pricing goes in.

**Then, Otis's deploy steps (order in `system/ARCHITECTURE.md`):**
- Merge `meridian-interface-website` PR #1 (owner-portal fix + video hero).
- Vercel: import `meridian-interface-website`, Deploy. Zero config.
- Render: Blueprint from `key-router`, set `KEYROUTER_AUTH_TOKEN` + `KEYS`.
- Supabase secrets: `KEYROUTER_URL` + `KEYROUTER_AUTH_TOKEN`. Flips mock -> real,
  no redeploy needed (functions already carry the seam as of Aug 20).

**Later:**
- Phase 2 channels: Meta / Google Business Profile / Google Ads / WordPress
  publishing (OAuth per platform). Post-launch, not a blocker.
- Wire the marketing dashboard into the deployed site so real photos render.
- Hero dials if Otis wants more: longer/slower (24s), more push (9% -> 15%),
  heavier grain.
