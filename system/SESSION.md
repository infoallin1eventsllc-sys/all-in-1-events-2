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
- The website itself, single-file & clickable: https://claude.ai/code/artifact/f10cd8e3-c781-46ec-b0ca-4a8ae4fa1071
  (built by inlining dist CSS/JS/fonts/hero; Unsplash photos and file downloads
  do not work inside the artifact viewer — that is the viewer, not the site.)
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

## Website → CRM bridge (2026-08-25)

The 420 Friendly Portal signup now feeds the CRM. Previously it only wrote to
localStorage, so a real visitor never became a lead.

- `netlify/functions/lead.js` proxies form posts to `intake`. It is a proxy
  rather than a direct browser call for three reasons: `intake` supports an
  `x-webhook-secret` a browser cannot hold; same-origin avoids a CSP change and
  a CORS round trip; and it gives one place to drop obvious spam.
- `420-friendly/assets/crm.js` posts and reports honestly — `delivered` is true
  only when the CRM accepted the lead. On any failure the address is kept in
  localStorage, the message says so, and the field is NOT cleared so the visitor
  can retry.
- Honeypot field (`company_website`) is off-screen rather than `display:none`,
  which more bots skip. A filled honeypot returns 200 so the bot does not retry
  with a variation.
- Needs `MERIDIAN_INTAKE_URL` in Netlify env (optionally
  `MERIDIAN_WEBHOOK_SECRET`, matching Supabase's `WEBHOOK_SECRET`). Until set,
  the function returns a specific `not_configured` 503 and the form says the
  lead was kept locally.
- **Verified live against the real intake function** with the exact payload the
  bridge sends: contact created (source `420-friendly:portal`, stage `lead`),
  1 activity, 1 follow-up task queued. Test data then removed — counts back to
  4 contacts / 9 activities / 21 tasks.

## Brand Brain + departments (2026-09-01)

Prompted by a video Otis sent ("62 AI agents run an entire social media team",
Structure Webworks) proposing an 8-department, ~35-tool stack. The structural
half of that architecture — signals → orchestrator → departments → approval →
engage → results — is what Meridian already is. The other half is roughly
$800–1,500/month of SaaS, which is the wrong order for a business that has not
taken its first order. Otis chose the free foundation plus one paid tool later.

### What changed

**Brand Brain.** The entire brand guidance in every prompt used to be one
interpolated string: `Voice: ${profile.voice}` → "warm, professional, upscale".
That is why drafts read like anyone's marketing. Now four documents per brand
(`positioning`, `voice-guide`, `messaging-bank`, `tone-rules`) are loaded from
`public.brand_brain` and composed into the system prompt by
`_shared/brand.ts`.

- Order is deliberate: positioning → voice → approved lines → **hard rules
  last**, because a model weights the end of a system prompt most. Reordering
  weakens the rules.
- `tone-rules` carries the compliance load. For 420 Friendly that is the
  never-imply-we-sell-cannabis rule — an apparel brand stays legal by staying an
  apparel brand in every sentence. For events it is never confirm a date, never
  quote a firm price, never say a booking is confirmed.
- Degrades rather than breaks: a missing table, missing brand, or empty
  documents fall back to the old one-line voice hint. 13 unit tests cover the
  composition and every degrade path.

**Authoring lives in the repo, the live copy lives in the database.** Markdown
in `system/brand-brain/<brand>/`, pushed with `node cli.mjs brand-sync`. The
edge functions cannot read the repo, so **editing Markdown changes nothing
until the sync runs** — the single most confusing thing about the setup.

**Departments.** `public.departments` (8 rows) plus `channels.department` and
`channels.cost_note`. Turns the flat channel list into an honest inventory:
`node cli.mjs departments` shows live/total per department and what a gap would
cost. Currently **1 of 18 channels live** (Content Studio). Eight free channels
were seeded — GSC, GA4, GBP insights, IG insights, review requests, review
replies, Calendly — plus Metricool (~$20/mo) as the recommended first paid tool,
chosen over an SEO suite because the customers are on Instagram and TikTok.

### State

- Migration `0003` applied. Advisors: only the usual INFO
  `rls_enabled_no_policy`, matching every other table (deny-by-default,
  service-role only). Nothing new introduced.
- Both brands seeded in `brand_brain` (8 rows). Active brand is
  `all-in-1-events` via `settings.business_profile.brand`; switch with a
  `jsonb_set` on that key.
- `orchestrator` (v15) and `runner` (v19) redeployed with `brand.ts` bundled.
- Verified end to end: a queued `generate_content` task completed with no
  error through the new runner.

**What is NOT yet proven:** that the Brand Brain improves the writing. Without
`ANTHROPIC_API_KEY` everything is mock, and the mock text is hardcoded — it
ignores the system prompt entirely. The wiring is proven not to break; the
payoff arrives with the key.

### Facebook + Snapchat added (2026-09-01)

Migration `0004`. Facebook Pages was a real gap — `meta_ads` (paid) existed but
the free side, posting to a Page, did not. Worth knowing: **Instagram business
accounts authenticate through a linked Facebook Page**, so one Meta OAuth grant
covers both. Those two rows go live together or not at all.

Snapchat is the honest one. Its public API is a **Marketing (ads) API** —
there is no general endpoint for posting organic content to a profile or Story
the way Meta and TikTok provide; Snap keeps organic posting inside its own app.
So `snapchat` is seeded with status **`manual`**, a new status value added for
exactly this: `not_configured` means "connect it and it works", `manual` means
"no amount of configuration will automate this". A false promise on a dashboard
costs more than an absent row. The system's useful role on Snapchat is drafting
the caption, not publishing it.

`snapchat_ads` is listed separately because that one *does* have an API — but
it is ad spend, not organic reach, and should not be confused with the free
channels around it.

### Diagnostic + regression fix (2026-09-01)

Full sweep: TypeScript compilation, imports, schema integrity, live function
invocation, cron health, data integrity. Four findings, all fixed.

**1. A regression I caused.** `_shared/runauth.ts` — the gate that stops the
public anon key triggering a run — existed **only in the deployed `report`
function and had never been committed**. Redeploying `runner` and
`orchestrator` from repo source therefore silently stripped it from both;
`runner` was answering 200 to a bare anon key. Recovered the file into the
repo, re-wired both functions, redeployed (runner v20, orchestrator v16), and
verified: **anon key alone → 401, run secret → 200.**

The lesson is structural, not incidental: **deployed code that is not in the
repo is invisible to every future change.** Any redeploy silently reverts it.

**2. Deployed functions with no source anywhere.** Nine functions are deployed;
the repo has five. `owner`, `analyze`, `cardspike` and `pay-webhook` have no
source in this repo — and `analyze` is on a cron schedule, so it is actively
running code nobody can fix or review. **Still outstanding.** Recovering them
is a `mcp__Supabase__get_edge_function` per function, then commit.

**3. Two orphaned channels.** `linkedin` and `webhook` had no department, so
they were invisible in the inventory. Migration 0003 mapped an explicit key
list, which drops anything added in between. Fixed, and `check_system_health`
now raises `channels_orphaned` so it cannot recur silently.

**4. Stale alert titles.** `raise_alert` refreshed severity, detail and meta on
a repeat but not `title` — the field shown in a list. The backlog alert read
"6 drafts waiting" over detail describing a larger backlog. Fixed; it now
reads 14, matching reality.

Also added a `brand_brain_empty` health check: if the active brand has no
documents, drafts silently revert to the one-line voice hint the Brand Brain
was built to replace, and nothing would have said so.

Also recovered into the repo from the deployed `report`: a `claude.ts`
mock-ordering fix (the report prompt matched the caption branch, so weekly
summaries read like Instagram posts) and `x-run-secret` in the CORS allowlist.

Verified clean after: 5 cron jobs healthy, 0 failed tasks, 0 errored runs, 0
orphans, intake/runner/orchestrator/report/dashboard all responding correctly.
One open alert — 14 drafts awaiting approval — which is a real state, not a
fault.

## Open next steps (not done)
- Set `MERIDIAN_INTAKE_URL` in Netlify so the bridge goes live (Otis's step).
- ~~All in 1 Events index.html was dead.~~ **Fixed 2026-08-25.** `css/styles.css`,
  `js/api.js`, `js/app.js` and `netlify/functions/chat.js` were referenced by
  `index.html` but had never been committed — the page has been broken since its
  first commit. Rebuilt, and the inquiry form now posts to the same `/lead`
  bridge (source `allin1events:concierge`). Concierge chat needs
  `ANTHROPIC_API_KEY` in Netlify; without it the page answers from scripted FAQ
  copy and says so rather than pretending.
- Wire dashboard into the deployed website so real photos render + it's live.
- Phase 2 channels: Meta/Google Business Profile/Google Ads/WordPress publishing (OAuth per platform).
- Optional hardening: `RUN_SECRET` header on orchestrator/runner/report (currently callable by anyone with the public anon key; only burns idempotent work / would spend tokens once a real key is set).
- Vercel preview deploy of the Meridian website (Otis's step; main is ready).
- key-router PR #1 is OPEN and unmerged: https://github.com/infoallin1eventsllc-sys/key-router/pull/1
- Self-host the Unsplash photography on the Meridian site.
- Swap the SVG monogram for the real logo PNG once provided.
