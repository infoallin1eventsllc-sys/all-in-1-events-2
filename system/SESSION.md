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

## Open next steps (not done)
- Wire dashboard into the deployed website so real photos render + it's live.
- Phase 2 channels: Meta/Google Business Profile/Google Ads/WordPress publishing (OAuth per platform).
- Optional hardening: `RUN_SECRET` header on orchestrator/runner/report (currently callable by anyone with the public anon key; only burns idempotent work / would spend tokens once a real key is set).
- Wire the site inquiry form to the `intake` webhook.
- Swap the SVG monogram for the real logo PNG once provided.
