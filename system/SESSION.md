# Session memory — Meridian Marketing System

Compact record of what was built and the current state, so work can resume later.

---

## ► START HERE (last updated Sep 2)

**Read this block first. The sections below it are a running log and some of the
older entries have been overtaken — where they disagree with this block, this
block is right.**

### Where things actually stand

| Piece | State |
|---|---|
| **meridian-interface-website** | **LIVE** on Vercel, deploying from `main`. ⚠️ **Unmerged work on `claude/footer-studio-plate`: the real logo.** Until it merges, the live site still shows the wrong mark. |
| **all-in-1-events-2** (this repo) | Working branch `claude/marketing-system-tech-stack-uds0mp`. Holds the marketing system in `system/` **and** the All in 1 Events *client* site at the root. |
| **key-router** | Both PRs merged to `main`. **Not deployed to Render.** |
| **Marketing system** | **LIVE on a real Anthropic key** since Sep 2 (the key was saved under the wrong secret name for two weeks; `_shared/claude.ts` now also reads `settings.anthropic.api_key`, where it lives today). First real plan, post, four lead follow-ups and a video script all produced and verified. Placeholder backlog cleared. |
| **Short-form video** | Built Sep 2. `kind: "video"` → Claude script → Shotstack render → MP4 + poster in the `social-videos` bucket → approval queue. **No Shotstack key yet** — scripts land in the queue marked not rendered. Adapters for TikTok (Content Posting API), Instagram Reels, Facebook video, LinkedIn video, with a `pending` state for platform processing. **No platform credentials yet.** Setup in `CHANNELS.md`. |
| **Owner approval** | **Enforced by trigger (0016)**: nothing becomes approved/scheduled/published or queued/sent without `meta.approved_by = 'owner'`. The `owner` function has `content_list/approve/reject/update` and `message_list/send/reject`; **the portal tab that calls them is not built** (website repo not in this session). Until it is, approval is the CLI. |
| **Health check** | Now also checks *output*: `placeholder_output` (critical) fires within 15 min if drafts are filler or the last plan spent no tokens; `no_recent_drafts` after two quiet days. Both verified against real data. |
| **Owner invoice portal** | Server-side auth, live and working. Invoices in Postgres behind RLS. Five tabs: Invoices & Pricing, Client Answers, Campaign Links, **System Health**, Photo Control. |
| **System Health** | Live. Checks every 15 min; alerts raise and clear on their own. Key Router probed on each load. **No email notification** — needs a SendGrid key. |
| **Payments** | Half built (Aug 23). Tables live, `pay-webhook` deployed and signature-tested. `pay` written but **not deployed**; no portal button. Blocked on a Stripe key. |

### ⚠️ Careful with this repo

The **root** of this repo (`index.html`, `netlify.toml`) is the **All in 1 Events
client site**, and it **auto-deploys to Netlify**. The Meridian work lives in
`system/`. A change at the root publishes to a client's live site — check what
you are touching before committing here.

### The two security items still open for Otis

1. **Rotate `OWNER_PASSCODE`.** The one in use came from an example in a session
   transcript, so it is not private. Not urgent — it guards invoices, not money,
   and failed logins throttle at 8 per 15 minutes — but it should not stay.
2. **Delete `VITE_OWNER_PASSCODE` from the Vercel project.** Inert now, but a
   dead credential sitting readable in a public bundle should not linger.

### Open items after Sep 2

- **Otis:** rotate keys at console.anthropic.com (keep `…ywAA`, delete the rest — four keys are exposed, three as Supabase secret *names*); delete the six junk secret rows and the `keycheck` function; set a spend cap.
- **Otis:** a Shotstack key (`select public.set_channel('shotstack_api_key', …)`) turns video rendering on; Meta / LinkedIn / TikTok credentials per `CHANNELS.md`. Confirm or correct the four draft customer profiles in `settings.icp_profiles`.
- **Next session:** the portal's Marketing tab (website repo) against the `owner` actions above, so approval is a button. The `dashboard` function cannot be that UI — Supabase serves it as text/plain (verified).
- **Next session:** `claude/prune-dead-hotlinks` on the website repo is still unmerged; the live site shows the old portfolio.

### What to pick up next

See **Open next steps** at the bottom of this file. **RUN_SECRET is now DONE**
(Aug 21) — closed before any key exists and before publishing went in, which is
the right order.

### ⚠️ The logo was wrong for months — read this before touching branding

`MeridianLogoMark` in the website repo drew a rounded, symmetric M with
hand-written SVG paths. It shipped in that repo's **first commit** and everyone,
including this assistant, took it for the real logo. It was not. It rendered in
the header, the footer and every modal, and it reached a published client-facing
form before Otis compared it and said so.

His real mark: two ribbon strokes with flat angled tops, a **visible vertical
meridian line** through the centre, cool slate left and neutral grey right.

Fixed Sep 1. The invented paths are **deleted, not kept as a fallback** — a wrong
logo that renders looks exactly like a right one, and nobody goes looking.

Three things about his artwork that will bite if forgotten:

1. **The wordmark is baked in at near-black**, so the lockup file dies on any
   dark ground. Use a light plate behind it, or use `meridian-mark.png` beside
   live text you can colour.
2. **`meridian-icon-512.png` is not an app icon** — it is the whole lockup in a
   square with no alpha.
3. **There is no vector.** Largest file is 1024px. Signage, a vehicle wrap or
   embroidery needs the mark properly redrawn first.

### How files actually reach this session

Chat attachments do **not** land on the container filesystem, and outbound
egress is blocked (`meridianinterface.com` returns EGRESS_BLOCKED; curl gets 403
on any non-allowlisted host). A whole session was lost to this. What works:

- **A path under `/root/.claude/uploads/…`** — this is how the logo finally
  arrived. If Otis references a file with `@`, look there first.
- **Google Drive** via the connector.
- **A git push** to a repo in scope.

### Source-of-truth docs

- **`system/ARCHITECTURE.md`** — how the three repos connect, and the go-live order.
- **`system/PRELAUNCH.md`** — the numbered fix list, with what is done and what is not.

---

## Who / what
- **Owner:** Otis Williams — **Meridian Interface** (web/software studio). otis@meridianinterface.com · (281) 882-9198.
- **Repo:** `infoallin1eventsllc-sys/all-in-1-events-2`, working branch **`claude/marketing-system-tech-stack-uds0mp`**.
- The repo also holds the "All in 1 Events" client site (`index.html`). The marketing system + portfolio page are Meridian Interface's own portfolio/product work.
- **Brand:** see the **`meridian-brand` skill** (`.claude/skills/meridian-brand/`) — it is the source of truth for the logo, colours, type and lockup rules. Do not restate them from here. Site palette: `#0f172a` ink, `#f7f9fd` surface, `#2563eb` accent. Fonts: Hanken Grotesk (display) + Inter (body), self-hosted in the website repo.
- **Logo:** Otis's real artwork, supplied Sep 1, lives in the skill and in the website at `public/brand/`. **Raster only — no vector master exists.**

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
- ~~**ACTION FOR OTIS:** set `VITE_OWNER_PASSCODE` in the Vercel project.~~
  **SUPERSEDED the same evening.** The passcode moved server-side entirely —
  it is now a Supabase Edge Function secret named `OWNER_PASSCODE`, checked by
  the `owner` function with a constant-time comparison and never sent to a
  browser. `VITE_OWNER_PASSCODE` is dead and should be deleted from Vercel:
  anything `VITE_`-prefixed is compiled into the pages the site serves.

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

## Aug 20 (late) — invoice manager: itemisation, four bug fixes, Client Answers

All on `meridian-interface-website` `main`, all deployed.

### Itemised what each line actually buys
Otis, reading a real invoice: *"If a client asks to itemize and explain every
item and what it does and what it's for, how will I do that? It needs to be
itemized in letting the client know exactly what they're are getting."*

- `InvoiceLineItem` gained `deliverables?: string[]` and `excluded?: string[]`.
- Every catalogue add path now carries its deliverables onto the line; the
  editor has a "What the client receives" row per item; the printable invoice
  renders them as bullets.
- Then he asked to rebuild the catalogue wording itself in plain language.
  `mockData.ts` now carries `plainDeliverables` throughout. **Prices and scope
  were not touched — only the words.** Studio shorthand ("contact routing, CMS
  integration") means nothing to someone staring at a four-figure line.

### Four defects found by full diagnostic — all fixed
He reported "some of the components in the invoice pricing don't work." Three
of the four presented identically: **Save appears to do nothing.**

1. **Decimal tax/discount silently rejected.** `type="number"` with no `step`
   defaults to `step=1`, so a browser refuses to submit a form containing
   `8.25` — the Texas rate. Grand Total updated correctly throughout, which is
   why the arithmetic always looked fine and the invoice simply never filed.
2. **`step="50"` on the line rate** rejected any custom quote that was not a
   multiple of fifty ($2,875) the same way.
   Both surfaced only as a native tooltip pinned to a field usually scrolled
   out of view. The form is `noValidate` now and validates in
   `handleSaveInvoice`, rendering every rejection beside the button pressed.
3. **Invoice ids collided after a delete.** The id came from
   `invoices.length + 1`, so deleting one of three made the next invoice reuse
   an existing number — and since saving upserts by id, it **overwrote the
   invoice already filed under it**, silently. Now derived from the highest in
   use, with a collision guard.
4. **The printable invoice trapped the owner inside it.** `.animate-fadeIn`
   used fill-mode `both`, which leaves a permanent `transform` on every page
   container — and **an element with a transform becomes the containing block
   for its `position: fixed` descendants.** So no overlay on the site was
   anchored to the window. On a long invoice the action bar (Print / Save PDF
   and Close) sat 596px above a scroll area already at `scrollTop: 0`.
   Unreachable. Dropping the fill mode fixed every overlay site-wide; Escape
   now closes the preview too.

**THE LESSON IN #4 IS WORTH KEEPING:** `transform` on an ancestor silently
breaks `position: fixed` for everything inside it. Any `animation: … both` or
`forwards` that ends on a transform will do this permanently. If an overlay is
mispositioned, check the ancestor chain for a non-`none` computed transform
before touching the overlay's own CSS.

### Client Answers — copy-ready explanations
Otis: *"if the client asks for more in-depth on what they're paying for, can we
create a section to where I can copy paste the information."*

- New **`src/data/clientExplainers.ts`** — the written answer for all ten
  catalogue services: what is included *and why each piece matters*, what it
  does for their business, **what the price does not cover**, typical timeline,
  and what the studio needs from them.
- New **`src/components/ClientExplainers.tsx`** — a "Client Answers" tab in the
  portal. Search (covers exclusions, not just titles), category filter, two
  copy buttons per entry: full email-ready text (~2,600 chars, signed with the
  studio's details) and a three-sentence version for a text message.
- The same answer is **one click from the invoice line itself**, carrying the
  rate actually billed rather than the catalogue range — and rendering nothing
  when a hand-typed line matches no entry, because a dead button is worse than
  no button.
- **The timelines are drafted, not confirmed.** Otis was asked to check them
  against what he actually commits to. If he has not, that is still open.

### Diagnostics written (in scratchpad, not committed — rewrite if needed)
`diag5.mjs` 26/26 on the invoice manager, `diag-answers.mjs` 17/17 on Client
Answers, `regress-fixed.mjs` 9/10 site-wide on overlay anchoring.

**METHOD NOTE, repeated enough times to be a rule:** across this session,
**six** reported test failures were bad selectors in my own harness, not defects
in the app — a regex that missed "Add Basic Logo", a too-broad `/ADD|\+/i`
matching 23 elements, a delete selector reaching into the wrong table, a
`/Copied/` that was case-sensitive against CSS-uppercased text, a button label
guessed rather than read. **Read the real markup before believing a failure,
and measure rather than reason** — the same discipline that corrected an
earlier claim of "21 broken icons" down to the one that was real.

## Aug 21 — the shared context layer (the "what does it know about my niche" fix)

Otis sent a competitor's "$15,000 Agentic AI Marketing System" architecture
video. Comparison showed most of its boxes already exist here (orchestrator,
queue, Supabase, cron, approval-as-human-gate) or are oversized for this scale
(Redis cache, NGINX LB, ELK, Grafana). The one genuinely missing piece was its
best idea: a **shared context layer** — "one store, read by every agent" — ICP
profiles and buying triggers. Which matched the audit finding from Aug 20: the
agents knew exactly two things about the business (name + voice), and only
those two fields ever reached a prompt.

**Built and deployed (orchestrator v11, runner v13):**
- Five settings rows are now the context store: `business_profile` (extended
  with location/service_area), `icp_profiles` (4 buyer profiles, each marked
  `status:"draft"` — inferred from the pricing catalogue, NOT yet confirmed by
  Otis), `services` (all 10, with real prices), `proof_points` (5, all
  verifiably true), `content_rules` (5 ALWAYS + 5 NEVER, incl. "only listed
  proof points are true" and a banned-word list).
- `_shared/context.ts` renders them into one ~7.5k-char prompt block;
  orchestrator + runner (both generate_content and follow_up_lead) inject it.
  The orchestrator is also told to plan topics aimed at a specific profile's
  pains/triggers, never "an update for our audience".
- **Editing the settings rows changes the agents' next run — no redeploy.**
  Seed preserved as `migrations/0004_shared_context_seed.sql`.
- Verified live: orchestrator v11 ran ok (mock plan, 1 task), cron runner v13
  drained it and drafted a content item at 16:06 with no errors.

**Waiting on Otis:** review the four ICP drafts (they stay labelled "draft" in
the prompt until `status` flips to `"confirmed"`), and the proof points /
rules. This was built precisely so the key, when it comes, writes from HIS
niche — so his review is the point, not a formality.

## Aug 21 (later) — channel integrations + the run-secret gate

Otis asked for gap #2 from the competitor teardown: the bottom row of channels.

### RUN_SECRET first, deliberately
Publishing is the first capability that makes an uninvited run cost something,
so the open door was closed before the door led anywhere. `_shared/runauth.ts`:
a caller needs the `x-run-secret` header (sent by `public.invoke_edge()`, so
cron just works) or a service-role JWT. The secret is a **settings row**, not an
env secret — one UPDATE to rotate, no redeploy, one copy shared by the SQL and
TS sides. An absent secret leaves the gate open on purpose, so seeding order
can never self-lockout. Migration `0005`.
**Verified live:** anon alone → unauthorized; anon + correct secret → runs;
anon + wrong secret → unauthorized.

### Real publish adapters (runner v14)
`publishContent` was a stub that marked everything published without sending
anything. Now: **generic webhook** (Make/Zapier/n8n), **Facebook Page**,
**Instagram**, **LinkedIn** — each behind its own credentials in the `channels`
settings row (env secrets take precedence), each falling back to the honest
stub when unconfigured. Read per publish, so **no redeploy to switch one on**.

Routing: the channel's own platform if configured → else webhook → else stub.

**The webhook adapter is the practical unlock.** It reaches TikTok, YouTube,
WordPress and Google Business Profile TODAY through a tool that already holds
those connections, rather than waiting weeks on each platform's API approval.

**Ad platforms (Google Ads, Meta Ads) deliberately NOT built.** Publishing a
post costs nothing; an ads API spends money on a schedule with nobody in the
loop. Left in the `channels` table as known-but-disabled so it reads as a
decision, not an oversight.

### A bug this surfaced
`content_items.channel` is a FK to `channels(key)`, and `facebook`/`linkedin`
were never registered — a LinkedIn draft would have failed at the database
before any adapter ran. Registered in migration `0006`, along with `webhook`.

### Verified live, all three branches (test rows removed after)
- real 200 → item `published`, `{ok:true, mocked:false, provider:"webhook", providerId:"200"}`
- real 400 → item `failed`, no publish date, error stored verbatim, task retried with backoff
- unconfigured → stub, completes

Receivers were endpoints inside Otis's own project (the `dashboard` function
returns 200 with a valid key; `intake` returns 400 without an email) — no
third-party service involved.

### Free fix taken on the way
PRELAUNCH #1 (mock weekly report printing an Instagram caption) is closed: a
summary branch keyed on `owner summary` now sits ahead of the content branch.
It only ever needed a `report` redeploy, which this change required anyway.

**Setup guide: `system/CHANNELS.md`** — what is built, what each channel needs,
and how long each approval realistically takes.

## Aug 21 (later still) — the loop is closed

Gap #3 from the competitor teardown: analytics feeding back.

**New `analyze` function (v1)** aggregates real per-channel outcomes, writes
`settings.performance`, and `_shared/context.ts` renders it into every planning
and writing prompt. Cron at 12:30 UTC, thirty minutes before the orchestrator
plans, so each plan sees the latest numbers. Migration `0007` adds the
`v_channel_performance` view plus the `performance`, `ad_spend` and
`model_rates` settings rows.

**CAC honestly handled.** Their diagram computes cost-per-acquisition; CAC needs
ad spend and there is none here by deliberate decision. `ad_spend` is an empty
seam — enter spend, CAC becomes real. What IS measurable is the AI's own cost,
priced from `agent_runs` tokens against `model_rates` ($0.00 in mock mode).

**Sample-size gating is the point.** <10 attributable leads → refuses to rank
channels. <3 published posts → does not judge that channel. `leads_per_post` is
`null` rather than a flattering 0 when nothing is published. Leads from sources
outside the channel registry are excluded from performance and reported
separately, so the system can never take credit for the website's leads.

**ICP tagging closes the effort side:** orchestrator sets `payload.icp` on
content tasks (v13), runner persists it to `content_items.meta.icp` (v15),
analyze aggregates `effort_by_customer_profile`. Note this measures EFFORT per
profile, not leads per profile — the latter needs per-link tracking that does
not exist.

**First real finding, and it stings:** 9 drafts, 0 ever published, all 4 leads
from outside the system. Guidance written back: *"Do not plan more content
volume — the bottleneck is approval and publishing, not writing."*

**Verified:** analyzer ran on real data; orchestrator v13 planned cleanly with
the new section; the rendered block confirmed word for word.

All three gaps from the competitor teardown are now closed.

## Aug 21 (last) — lead attribution, the gap that would have broken the loop

Otis asked what changes when he connects his social accounts. Answering it
properly surfaced a real defect: **connecting them would not have been enough.**

`intake` sets `contacts.source` from `payload.source` and defaults to
`meridian-website:booking`; `leads.ts` never sent one. So an Instagram visitor
who clicked through and booked was recorded as a website lead — and `analyze`
attributes by matching `contacts.source` to a `channels.key`. The system would
have published happily and gone on reporting "0 leads attributable to channels"
forever, never reaching the 10 needed to rank anything.

**Fixed website-side only — no backend change, no redeploy**, because intake
already read the field the site was failing to send.

- `src/lib/attribution.ts` — captures UTM + referrer host on arrival,
  normalises to real channel keys. First touch never overwritten (found in
  March, booked in May = Instagram), except a blank "direct" first touch which
  upgrades when a tagged visit follows.
- Organic search maps to `google-organic` / `search-organic` — deliberately NOT
  channel keys, so it lands in "from elsewhere". Counting it would flatter the
  system's own numbers.
- Only the referrer HOSTNAME is stored; a search referrer carries the query.
- `CampaignLinks.tsx` — a 4th owner-portal tab that builds tagged links, so
  they don't get hand-typed and drift out of matching.

**Verified:** 13/13 against a real build (tagged link → instagram; LinkedIn
referrer with no tag → linkedin; organic stays unclaimed; direct keeps the old
default; first touch survives; no full URL or search query leaves the browser).
Then live against `intake`: a tagged booking moved Instagram 0 → 1 leads in
`v_channel_performance`. Canary removed.

**METHOD NOTE:** the first harness run scored 5/13 and all 8 failures were the
test not driving the booking form correctly — it is a single form with a
required date, not a multi-step wizard. The app was fine. That is now **seven**
times this session.

**Two artifacts published** (static + animated):
- Architecture diagram: https://claude.ai/code/artifact/9ec3d3a6-d674-461e-9ef3-92d577924a9b
- Running loop simulator: https://claude.ai/code/artifact/ccd9bd39-3876-4da5-8a40-e411219ad6b7

## Aug 21 — full-system diagnostic (website + key-router + marketing system)

Otis asked for a whole-system debug: does it all communicate as one system?
Four passes. **72 checks, one real defect found and fixed.**

### A. Structural — clean
website `tsc --noEmit` + build clean; **key-router 36/36 tests**; all seven edge
functions' `_shared` imports resolve. key-router working branch has **zero**
unmerged commits vs origin/main.

### B. Config coherence — the seam nobody had ever exercised
Website endpoints point at project `glzodwhyavexpuusbqjy` (correct). The
marketing system calls `POST /v1/route`; key-router serves exactly that.

**Then actually proved it: 9/9 cross-repo seam test** (`scratchpad/seam-test.mjs`).
Ran key-router in-process with a stubbed provider and called it with a faithful
transcription of `viaKeyRouter()` from `_shared/claude.ts`. Happy path, text
extraction, token usage for cost tracking, auth enforced, wrong token rejected,
trailing-slash URL handled, fleet status, usage metering advanced. **This call
had never been made — the seam was deployed but KEYROUTER_URL was never set.**

**Deploy gotcha found:** the secret env var uses the key `id` VERBATIM.
`{"id":"primary"}` needs `KEYROUTER_SECRET_primary`, not `_PRIMARY`. A wrong
case kills the boot with `missing env var`.

### C. Live end-to-end — every hop
Run-secret gate: all four scheduled functions refuse the bare anon key AND a
wrong secret. Booking → intake → contact (`source: linkedin`), company parsed,
campaign carried, deal `quoted / $12,000` (budget range parsed), follow-up task
queued and drained by the 2-min cron → message drafted `status: draft` (never
auto-sent). `analyze` then reported **"4 of 5 leads came from outside the
system's channels"** — it correctly attributed the one tagged lead and excluded
the rest. Weekly report showed `linkedin: 1` in its source breakdown.
Owner portal: status ok, unauthenticated list 401, forged token 401, wrong
passcode `invalid_passcode` with throttle countdown.
**RLS canary:** anon reads return `[]` for contacts, deals, messages,
content_items, owner_invoices AND `settings` — which holds the run secret and
channel credentials. Test rows removed.

### D. Website feature QA — 18/18 after one fix
All public views, hero video with poster fallback, booking → intake with an
attribution source, portal unlock, all four portal tabs, link builder emitting a
tagged URL and copying it, invoice add + save, no horizontal scroll at 390px,
zero page errors.

### THE ONE REAL DEFECT — a second broken icon ligature
`quick_reference_all` (the Client Answers tab icon, added earlier today) contains
a **q**. The subset font's cmap covers only `' _abcdefghiklmnoprstuvwy'` — **j,
q, x, z are absent** — so the ligature never forms and the browser paints the raw
word: **444px of literal text at 24px font**, which pushed the owner portal into
horizontal scrolling at 390px. Public pages were clean throughout.

Replaced with `contact_support`. **A measurement pass over every icon across all
views and portal tabs now reports 0 broken.** The constraint is written at the
site where icons are chosen. Method worth keeping: **measure rendered width vs
font size** — a resolved ligature is ~1em square, raw text is several times
wider. Reading font tables got this wrong before; measuring has not.

## Aug 21 (final) — pricing off the wire, and a fabricated invoice removed

Otis: "I'm fine with all the prices. But I don't want the customer or client to
see the prices. Let them pick what they want, and then I will send them an
invoice." Checking where prices were *displayed* found something bigger.

### Prices were not displayed publicly — they were SHIPPED
Every rate, every invoice preset, and the freelancer/boutique/agency comparison
were imported into the app, so Vite compiled them into the JavaScript every
visitor downloads. No public page rendered any of it, which is precisely why it
went unnoticed for the whole build.

**Fixed:** the catalogue lives in `settings.pricing_catalogue` and reaches the
portal through a new token-gated `catalogue` action on the `owner` function
(v8). `src/lib/catalogue.ts` fetches it after login. TypeScript interfaces stay
client-side — types are erased at build, so the shape ships without a number.
**A price change is now a SQL update, no redeploy.** Migration `0008`.

**Verified:** no rate of ours remains in the built bundle. The only dollar
figures left are the client's own budget-range selector, which is their number.

### The public price calculator became a scope builder
The Services page had a working estimator — base rate + add-ons + rush fee →
"Estimated Project Quote $X" with a range. The *selections* are valuable (they
say what a visitor wants before the first call) so those stay and travel into
the booking as a brief. The arithmetic is gone.

### A FABRICATED INVOICE was being shown to clients — removed
Worse than the pricing issue, and not a pricing issue. After booking, a client
saw **"View Official Service Invoice"** and **"View Deposit Receipt"**. Both
opened a document with a hard-coded **$3,500 total** and a badge reading
**"Deposit Received ($250.00)"**, carrying an invoice number and a transaction
reference — shown to someone who had booked a call and paid nothing. Reachable
from three more places in the client portal.

`InvoiceReceiptModal.tsx` is **deleted**. Replaced with a plain statement that a
written quote follows and nothing is owed until it has been seen. Real invoices
come from the owner portal, which is backed by the database.

### Also this session
- **Motion installed** (`motion` 13.1.1 — Framer Motion renamed) behind
  `src/lib/motion.ts`. Named imports + LazyMotion: +29kB gzip. Namespace imports
  cost 194kB raw — `import * as` defeats tree-shaking. Provider is `strict`.
- **`system/tools/site-audit.mjs`** — scores prospect websites on 11 checks with
  owner-facing sentences per finding. Willing to say "site is fine". Apify
  optional; it supplies the list, this decides who to call.
- **Tech Stack service** added, defined in plain language for non-technical
  readers, with exclusions (the tools' own monthly fees) stated up front.

**METHOD NOTE:** harness artifacts reached **nine** this session. The last three:
wrong nav button, wrong portal tab, and a harness that predated the server-side
pricing change. The app was fine every time.

## Open next steps (not done)

*(Current as of end of Aug 20. The site is already live, so these are live-site
items, not pre-deploy ones.)*

**For Otis, no code needed:**
1. **Rotate `OWNER_PASSCODE`** (Supabase → Edge Functions → Secrets). The value
   in use came from a session transcript and is not private.
2. **Delete `VITE_OWNER_PASSCODE` from Vercel.** Inert, but readable.
3. **Check the Client Answers timelines** against what he actually commits to.
   They were drafted, not confirmed with him.
4. **Rebuild any invoice created before the itemisation shipped** — old ones
   carry the studio shorthand and no deliverable bullets.

**Code, in priority order:**
1. ~~`RUN_SECRET`~~ — **DONE Aug 21**, before any key and before publishing.
2. **24 Unsplash hotlinks** on the website. Works today; breaks silently if
   Unsplash changes a URL or rate-limits, and leaks visitor traffic. The hero
   and its video are already licensed and self-hosted; this is the rest.
3. ~~Mock-mode weekly report~~ — **DONE Aug 21**, shipped with the report redeploy.
4. **Real logo PNG** at `assets/meridian-logo.png`; the card generator and the
   Key Router console still draw the built monogram.

**The decision that gates everything else:**
- **The API key.** The marketing system is deployed, scheduled and has produced
  **zero real AI outputs**. Otis decided not to use his own key for now. Until
  one exists — his, or a client's through Key Router — the system is a
  well-tested demo. Per the `client-handoff-api-keys` rule, **never ship or
  deploy on a client's behalf using Otis's own key.**

**Deploy steps still outstanding:**
- Render: Blueprint from `key-router`, set `KEYROUTER_AUTH_TOKEN` + `KEYS`.
- Supabase secrets: `KEYROUTER_URL` + `KEYROUTER_AUTH_TOKEN`. Flips mock → real
  with no redeploy (the functions already carry the seam).

**Later:**
- Phase 2 channels: Meta / Google Business Profile / Google Ads / WordPress
  publishing (OAuth per platform). Post-launch, not a blocker.
- Wire the marketing dashboard into the deployed site so real photos render.
- Hero dials if Otis wants more: longer/slower (24s), more push (9% -> 15%),
  heavier grain.


---

## Aug 21 (late) — System Health: the system's own voice

Otis asked: *"I have a question about the tech stack and the key router. Can we
create a portal so I can access both of those? From the owner's portal? to see
how they're performing? or if any problems occur. that I get notified?"*

Built as a fifth portal tab. Full write-up in `PRELAUNCH.md` §12; the parts
worth having in memory:

**Shipped**
- `system_alerts` + `raise_alert()` / `clear_alert()`. Unique index on the code
  **while open**, so a persisting condition bumps `seen_count` instead of adding
  rows, and the same code can recur later as a fresh row.
- `check_system_health()` — cron silence, agent errors, dead tasks, failed
  sends, failed publishes, approval backlog. Every message written for an owner,
  not an engineer.
- `cron_health()` — pg_cron's tables are not reachable through PostgREST; this
  narrows them to what the panel shows.
- `marketing-healthcheck` on `*/15 * * * *`.
- `owner` v9: token-gated `health` action, live Key Router probe.
- `src/lib/health.ts`, `src/components/SystemHealth.tsx` (website repo, on `main`).
- Migration `0009_system_health.sql` consolidates the four that were applied live.

**Two decisions to keep**
1. **Mode is read from real output, not from config.** `content_items` with
   `meta->>mocked = 'false'` decides live vs mock. A present-but-invalid key
   degrades to placeholder text silently; config would call that live.
2. **Never-run ≠ stopped running.** My first version raised a critical for a job
   scheduled minutes earlier. You can only say something stopped if you saw it
   start. Never-run is `info` now. An alert list that cries wolf on day one
   teaches its reader to ignore it.

**Still open on this**: notification is page-only. Email needs a SendGrid key.
Say so plainly rather than implying he will be told.

**Note for next session**: `mcp__Supabase__execute_sql` returned *"You do not
have permission to perform this action"* at the end of this session. The four
health migrations were already applied and verified before that; `0009` is the
consolidated file, written idempotent so it converges rather than conflicts.
Check the tool works before assuming the database is unreachable.

### The tab existed and Otis still could not see it

He was in the **artifact copy** of the site, built Aug 20 — a frozen snapshot
that predates System Health by a day. Nothing was broken. Rebuilt it and
republished to the **same URL**, so his bookmark still works:
`https://claude.ai/code/artifact/4ee1e978-b336-40b6-ba13-dadd73cf5f33`

**When he says a feature is missing, establish which copy he is looking at
before touching code.** There are three: the artifact snapshot, the Vercel
deploy, and this checkout. Only the last is current by definition.

Two things this environment cannot do, so do not waste a turn on them:
- The network policy blocks `meridian-interface-website.vercel.app` (403 at the
  proxy CONNECT). The deployed site cannot be fetched from here — verify from
  the checkout and say plainly that you did not look at the live page.
- Playwright is global (`/opt/node22/lib/node_modules`) but ESM ignores
  `NODE_PATH`. Run `npm install` inside `system/tools` (3s, browser download is
  skipped) rather than trying to point at the global copy.

### Tooling moved into the repo, because the scratchpad dies with the container

`system/tools/` now holds `build-site-preview.mjs` (rebuilds the clickable
artifact, with the shim that answers what the CSP blocks), `diag-site.mjs` (the
18-check headless pass over `dist/`), and `diag-preview-health.mjs`. Paths come
from `SITE_DIST` / `PRICING` / `OUT`; the rate card is deliberately **not**
committed — fetch it from the `owner` function. `system/tools/README.md` has
the commands.

### A second defect in my own health panel

The schedules table had **"Runs" as the header over the cron expression** and
"Last 24h" over the run count, so `*/2 * * * *` sat under a column that said
Runs. Fixed and pushed. My earlier 17/17 pass had verified the panel *rendered*
— not that its labels described their own cells. A passing test says the thing
drew, not that it is telling the truth.


---

## Aug 23 — end-to-end verification, and two real defects

Otis: *"can I get a step by step how we're going to set it up and how it's going
to work for the business? And make sure everything is set up properly with the
code and communication to function and operate properly."*

**Runbook artifact** (setup order + how the week runs + what is deliberately not
built): `https://claude.ai/code/artifact/68750eb8-c1a0-41d0-b87c-a1101c3b39a0`
Source kept in the repo at `system/runbook.artifact.html`.

### First: yesterday's "permission denied" was my own error

`mcp__Supabase__execute_sql` was fine. I had used the **wrong project ref**
(`iyeqrrvmlaqcgytqhgik`). The correct one is **`glzodwhyavexpuusbqjy`** — it is
in this file and in the skill. Check the ref before concluding the tool or the
database is unavailable.

### Verified working, against the live system

- All 5 schedules active, **zero failures**: runner 3,554 runs, healthcheck 169,
  orchestrator 5, analyze 2, report 0 (weekly, Monday not yet reached).
- Full chain, live: `intake` → contact + activity → `follow_up_lead` task →
  runner executed within 2 min → email drafted. Test contact then deleted.
- `invoke_edge()` is the only path that satisfies both the gateway JWT **and**
  the run secret. A bare `x-run-secret` POST gets
  `UNAUTHORIZED_NO_AUTH_HEADER` from the gateway before the function runs.

### Defect 1 — the agent was writing for the wrong business

`_shared/claude.ts` mock copy was the events client's: *"lighting, photo booths,
a DJ"*, and the follow-up asked web-design leads for their **"date and guest
count"**. Nine such drafts were in the approval queue. The shared context layer
had fixed the real prompts; nobody had fixed the fallbacks.

Fixed, deployed (**orchestrator v14, runner v16**), and verified by queueing a
content task and reading the output. The nine drafts are **rejected** with
`meta.rejected_reason`, not deleted.

Lesson: placeholder text is not unread text. The owner reads it, and on
`autonomy=auto` a lead receives it.

### Defect 2 — migration 0009 did not match production

The file I wrote Aug 22 from memory differed from the deployed functions in four
ways: alert codes (`cron_never_ran:` vs the real `cron_never:`), one shared
staleness threshold instead of **per-schedule grace periods**, `returns jsonb`
instead of `returns table(raised, cleared)`, and a 3-day approval-backlog window
instead of 7. Applying it would have downgraded the live checks and stranded
every open alert, since `clear_alert` matches on code.

Now dumped from the live database and **verified body-for-body** (md5 of
whitespace-normalised `prosrc` for all four functions).

Lesson: a file that describes a running system is not evidence about that
system.

### Also fixed

`vite-env.d.ts` declared `VITE_OWNER_PASSCODE`. Nothing read it, but Vite
inlines every `VITE_` var into the public bundle, so the name invited someone to
set it. Removed; added `VITE_OWNER_ENDPOINT`, which four modules actually read.

### Current true state (23 Aug)

| | |
|---|---|
| AI | mock — no `ANTHROPIC_API_KEY`, no `KEYROUTER_URL` |
| Channels | `settings.channels` is `{}` — every publish hits the stub |
| Email | no SendGrid — 6 drafted messages, 0 sent |
| Autonomy | `draft` |
| Approval queue | 5 pending (4 older on-brand mocks + 1 new correct one) |
| Open alerts | 1 info: `cron_never:marketing-report` (correct — weekly) |

### The order that matters (from the runbook)

1. `ANTHROPIC_API_KEY` as a **Supabase Edge Function secret**.
2. **Read one real draft before connecting any channel** — cheapest moment to
   catch a wrong voice, and the fix is the `settings` context, not the code.
3. A channel: webhook first (an afternoon), Meta/LinkedIn later (days of review).
4. SendGrid — also what turns on System Health alert emails.
5. Autonomy last, after ~30 approvals that felt like rubber stamps.


---

## Aug 23 (late) — payments, and a naming problem worth remembering

Otis: *"I need to create a transactional credit card system for this business.
Can we do that? including Apple Pay, PayPal, Google Pay."* Then, on being told
he had no LLC or business account: *"Can we still move forward, or do I have to
wait?"* — answer: yes, Stripe test mode needs none of that.

### Three corrections that shaped the build

1. **Never build card handling.** Card numbers touching our server means
   PCI-DSS. We integrate a processor; the system only ever sees paid / not paid.
2. **Apple Pay and Google Pay are not separate integrations.** They are wallets
   on the card rails. One Stripe integration covers card + Apple + Google.
   PayPal is the only genuinely separate one, and is deferred.
3. **ACH is the real story at this studio's invoice sizes.** ~$276 in card fees
   on a $9,500 package versus **$5 flat** by bank transfer. The largest invoice
   in the system is **$125,950** — about $3,653 in card fees. Bank transfer is
   offered first by default (`settings.payments.allow_bank_transfer`).

### The business-name problem (fixed)

Client-facing output claimed an **LLC that does not exist**, in three different
spellings — portal header "Meridian Digital Studio LLC", invoice footer "DIGITAL
DESIGN & DEVELOPMENT STUDIO LLC", and a default company field of "Meridian
Digital Design Studio LLC". The invoice also carried a fabricated **New York
address** beside a real Houston phone number.

All of it now reads **Meridian Interface**, with "Houston, Texas" and no
invented street line. Otis confirmed the name and said a virtual address is
coming later — one line to change when it does. **Do not reintroduce "LLC"
anywhere client-facing** unless he says the entity has been registered.

### What was built

- Migration `0011_payments.sql` — `payments`, `payment_events`, and a generated
  `owner_invoices.total_cents`. **Cents are computed by Postgres**, not JS;
  binary floating point eventually turns some invoice into 849999 cents.
- `_shared/stripe.ts` — hosted Checkout over plain fetch, plus signature
  verification. Hosted (not embedded) so card data never touches our page and
  Apple Pay needs no domain registration of ours.
- `_shared/ownertoken.ts` — verify-only copy of the owner session check, so
  functions other than `owner` can authenticate the portal. **Duplicated from
  `owner/index.ts` on purpose; change both together or sessions break in one.**
- `pay/index.ts` — creates a link. **Written, NOT DEPLOYED.**
- `pay-webhook/index.ts` — **deployed, verify_jwt=false.**

### Two invariants, both deliberate

- **The amount is read from the invoice server-side, never from the caller.**
  An amount the browser can set is an amount the client can set.
- **Nothing marks an invoice paid except a signature-verified webhook.** The
  `success_url` a payer lands on is a string anyone can type; it shows a
  message and decides nothing.

### The signature test

`system/tools/tests/stripe-signature.test.mjs` — `npm run test:signature` from
`system/tools`. 12/12, including a forged signature and **a replay of a genuine
old "paid" event** (the timestamp window is what stops it). The test
**extracts the function from `_shared/stripe.ts` at run time** rather than
testing a committed copy, so it cannot pass against a stale duplicate.

### Handled because they will otherwise bite

- **ACH settles late.** A card is paid inside `checkout.session.completed`; a
  bank debit completes that event with `payment_status: "unpaid"` and clears
  days later via `async_payment_succeeded`. Treating the first event as payment
  marks bank transfers paid before the money moves.
- **Webhooks are retried by design.** `payment_events` is keyed by Stripe's own
  event id, so a redelivery conflicts and stops.
- **Refunds** put the invoice back to `Issued`, so income is not overstated.

### Live state at close (verified, not remembered)

| | |
|---|---|
| AI | **mock — zero real outputs** |
| Channels | none configured |
| Approval queue | 4 pending, 9 rejected (the events-client copy) |
| Messages | 6 drafted, 0 sent |
| Invoices | 9 unpaid |
| Payments | 0 recorded — no Stripe key |
| Open alerts | `cron_never:marketing-report` (info, correct — weekly) |
| ICP profiles | 4 still DRAFT |

### Needs a human, cannot be done from here

- **Delete the `cardspike` edge function** in the Supabase dashboard. It is a
  retired feasibility test, now a 410 tombstone. The MCP tooling deploys
  functions but cannot delete them.

### Tomorrow's checklist (published)

`https://claude.ai/code/artifact/8857e9ea-d148-4d96-ae92-c2eb516ed81a`
Source kept at `system/checklist.artifact.html`. Ticks persist in Otis's
browser only — this session cannot see them, so ask rather than assume.

**The two items that unblock everything**, both one paste each and neither
needing the LLC: `STRIPE_SECRET_KEY` (test mode) and `ANTHROPIC_API_KEY`, both
as Supabase Edge Function secrets.


---

## Sep 1 — loop simulator updated from a second competitor video

Otis uploaded a second Structure Webworks video (1:37, vertical): *"62 AI agents
run an entire social media team"* — 20 modules, 8 departments, a numbered
pipeline (01 SIGNALS, 03 ORCHESTRATOR, 04 KNOWLEDGE LAYER + ACCESS, 05
DEPARTMENTS, 06 ENGAGE), and a "Brand OS file system" of markdown files
(/brand-brain, /signals-seo, /content, /creative, /social, /reputation,
/conversation, /reporting).

Processed by extracting frames with the bundled ffmpeg-static and tiling them
into 4x4 contact sheets — three images cover a 97-second video.

**Used as a checklist, not a template.** Their claims were read for what
Meridian genuinely has an answer to, and the simulator updated accordingly:

- **Shared context opened up.** It was one opaque box; it is now the six real
  `settings` rows (`business_profile`, `icp_profiles`, `services`,
  `proof_points`, `content_rules`, `performance`), and `performance` lights up
  when analyze writes it. Meridian's equivalent of their "brand brain" already
  existed — it just was not visible on the page.
- **System Health watchdog added**, running the genuine rule from
  `check_system_health()`: five or more drafts whose oldest has waited a week.
  It clears when the backlog is approved.
- **The money lane added** (built Aug 23): invoice → hosted checkout → client
  pays on Stripe → *marked paid by signed webhook only, never the redirect*.
- **A coverage map added**, naming what the loop does not do — search
  visibility and reputation absent, creative and publishing partial, ad
  platforms excluded by choice.

### A design flaw I built and then fixed

The backlog alert needs seven simulated days. At every speed the page offers
that is minutes of watching, so the feature would have been invisible in
practice — built, correct, and never seen. Rather than lower the threshold to
make the demo livelier (which would misrepresent the one number deciding
whether Otis gets interrupted), a **Skip a week** control was added: the rule
stays real and the clock becomes reachable.

Verified in both themes: zero page errors, no horizontal scroll at 390px, money
lane advances through all four states, and the watchdog stays quiet at three
drafts, stays quiet at seven drafts on the same day, raises after a week, and
clears on approval.

Artifact: `https://claude.ai/code/artifact/ccd9bd39-3876-4da5-8a40-e411219ad6b7`
Source kept at `system/loop-simulator.artifact.html`.

---

## Sep 1 — the logo, the brand skill, the footer plate

**What changed**

- **`meridian-brand` skill** (`.claude/skills/meridian-brand/`) — new. Otis's
  real logo files, brand tokens as CSS and JSON, the React component, an HTML
  snippet, and `proof-sheet.mjs`, which composes the artwork over every ground
  it has to survive. Installable to `~/.claude/skills/` with a tested installer
  script (sent to Otis, not committed — it lives in chat).
- **Website** (`claude/footer-studio-plate`, **unmerged**) — real logo in the
  header, footer and modals; `BuiltBy.tsx`, the studio signature plate for the
  bottom of every site the studio ships. Its kicker is a prop so a client site
  says "this website built by" and Meridian's own says something else.
- **`system/tools/build-site-preview.mjs`** — now sweeps the bundle for every
  absolute image path and embeds it, instead of a hardcoded list of filenames.
  It threw the brand logos away silently before that.
- **Project Intake artifact** — now on letterhead, but **still the invented
  mark**. First thing to fix tomorrow.

**Bugs worth not rediscovering**

- A `<style>` rule of `.masthead .mark` outspecifies `.mark--dark`, so both
  light and dark marks paint at once. Watch specificity when toggling variants.
- An SVG gradient inside a `display:none` element is a **dead paint server**:
  hide one mark and the *visible* one further down the page renders as nothing.
  Two files with one mark each, never a hidden twin.
- A locator screenshot rounds a flex box's fractional width **up**, which turns
  a 384px square into 387×384 and gets an app icon rejected. Clip to a rounded
  box.
- A `loading="lazy"` image reports `naturalWidth === 0` until it nears the
  viewport. Assert *after* scrolling, or the check reports a working image as
  broken.

**Artifacts**

- Site preview (real logo): `add7c0c8-b97e-427b-bbd0-7188e7d2e8d0`
- The older "Meridian Interface Site" (`4ee1e978…`) still shows the invented
  mark and can be deleted.
- Artifact **wake subscriptions are refused in this environment** (403,
  "subscribing requires a session credential"). Do not claim to be watching one.

**Next**

1. Merge `claude/footer-studio-plate` — the live site is still wrong until then.
2. Put the real logo on the Project Intake letterhead and republish
   (`fa92200c-73ff-43d2-8ca8-c184107fed7c`).
3. Everything on the pre-existing list: Stripe key, Anthropic key, rotate
   `OWNER_PASSCODE`, delete `VITE_OWNER_PASSCODE`.

---

## Sep 2 — real logo everywhere, stock photographs gone

- `claude/footer-studio-plate` **merged to main** — the live site carries the
  real logo. Intake form and Discovery Call republished on letterhead; the
  Discovery Call carries an INTERNAL · SALES tag because it is a script, not a
  client document.
- **Unsplash: closed.** Six hotlinks were dead code (never rendered; the
  testimonial avatars had no caller — `TESTIMONIALS` is empty). The remaining
  twelve photographs of laptops are replaced by thirteen rendered mockups from
  `system/tools/render-work-images.mjs` → website `public/images/work/`. Zero
  external image requests now. **On `claude/prune-dead-hotlinks`, unmerged.**
- The portfolio was already honestly labelled "Concept & Sample Work" — no
  misrepresentation to fix, which was the worry going in.
- Renderer rules worth keeping: charts fill their box with constant stroke
  (`vector-effect: non-scaling-stroke`); app chrome uses real icons; JPEG not
  PNG for gradient grounds (2.6MB → 948KB); and **a logo-service illustration
  must show a fictional client, never MERIDIAN over a mark that is not his.**
- Egress is blocked, so the "download and self-host" route was never
  available; rendering locally was the only path that did not need Otis's Mac.

**Next:** merge `claude/prune-dead-hotlinks`; then the four key-blocked items.
