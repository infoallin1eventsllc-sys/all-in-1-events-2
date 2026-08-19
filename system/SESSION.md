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

## Open next steps (not done)
- Wire dashboard into the deployed website so real photos render + it's live.
- Phase 2 channels: Meta/Google Business Profile/Google Ads/WordPress publishing (OAuth per platform).
- Optional hardening: `RUN_SECRET` header on orchestrator/runner/report (currently callable by anyone with the public anon key; only burns idempotent work / would spend tokens once a real key is set).
- Vercel preview deploy of the Meridian website (Otis's step; main is ready).
- key-router PR #1 is OPEN and unmerged: https://github.com/infoallin1eventsllc-sys/key-router/pull/1
- Self-host the Unsplash photography on the Meridian site.
- Swap the SVG monogram for the real logo PNG once provided.
