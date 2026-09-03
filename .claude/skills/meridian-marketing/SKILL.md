---
name: meridian-marketing
description: >-
  Operate the Meridian Interface always-on marketing system (Supabase + edge
  functions + CLI) built in this repo. Use this whenever Otis wants to run,
  check, drive, or extend the marketing system — e.g. "check the marketing
  dashboard", "how many leads do we have", "draft/approve a post", "run the
  loop", "add a lead", "generate the weekly owner summary", "why is it in demo
  mode", "take it live", "add a channel", or anything touching the CRM,
  approval queue, orchestrator, runner, intake webhook, or the marketing
  dashboard. Also use before editing any of the `system/` code or the Supabase
  project, so you inherit the hard-won context (how it's wired, the demo-vs-live
  state, and two platform gotchas that will waste time if rediscovered).
---

# Meridian Marketing System — operating guide

This repo contains Meridian Interface's always-on, AI-orchestrated marketing
system. This skill is the operator's manual: what it is, how to drive it, and
the constraints that aren't obvious. For the deepest detail, read
`system/SESSION.md` (state snapshot) and `system/README.md` (full guide) — this
file is the fast path.

## State as of Sep 3 (read before the sections below — older lines they contradict are stale)

- **Live on a real Anthropic key** since Sep 2. The key resolves from `settings.anthropic.api_key` (fallback in `_shared/claude.ts`) because the edge secret `ANTHROPIC_API_KEY` still holds a 16-character label. Do not "fix" the secret from here; the fallback is the working path.
- **Owner approval is a database trigger** (migration 0016): nothing becomes approved/scheduled/published or queued/sent without `meta.approved_by = 'owner'`. Only the `owner` function's `content_*`/`message_*` actions and the CLI set it. Never work around this.
- **Approval UI** is the website portal's **Marketing** tab (`meridian-interface-website`, merged to `main`). The `dashboard` edge function cannot be a UI — Supabase serves it as text/plain (verified).
- **Video**: `kind: "video"` → script → Shotstack render → `social-videos` bucket → queue, with a browser `ScriptPlayer` on the card until a clip exists. No Shotstack key yet. Adapters for TikTok / Reels / Facebook video / LinkedIn video exist with a `pending` state; no platform credentials yet.
- **Credentials go in through `select public.set_channel(name, value)`** (migration 0015), which refuses the shapes past mistakes took. `CHANNELS.md` has the per-platform steps and TikTok form answers.
- **Health check watches output** (0014): `placeholder_output` fires within 15 min if drafts are filler.
- Full detail and the day-by-day log: `system/SESSION.md`.

## The mental model

A scheduled agent plans marketing work, drafts content and follow-ups with
Claude, moves them through human approval, and (when enabled) sends via
email/SMS — all on one Supabase CRM.

```
website form ─▶ intake ─▶ CRM (contacts, activities)
   pg_cron ─▶ orchestrator ─▶ plans tasks ─▶ tasks queue
   pg_cron ─▶ runner ───────▶ executes ──▶ content_items (approval queue)
                                        └▶ messages ──▶ SendGrid / Twilio
   pg_cron ─▶ report ───────▶ reports (weekly owner summary)
```

- **Supabase project ref:** `glzodwhyavexpuusbqjy` (org `infoallin1eventsllc-sys`). Reach it with the Supabase MCP tools (`mcp__Supabase__*`), not by guessing.
- **Edge functions:** `orchestrator`, `runner`, `intake` (public), `report`, `dashboard` (public, passcode-gated).
- **Cron (active):** `marketing-runner` every 2 min, `marketing-orchestrator` daily, `marketing-report` weekly. They call functions via `public.invoke_edge()` using a vaulted token.
- **Autonomy:** `settings.agent.autonomy` is `draft` (agent drafts, a human approves) or `auto` (agent sends/publishes itself).

## Two gotchas that will waste your time — read these

1. **Supabase's functions domain refuses to serve web pages.** It rewrites both
   `text/html` and `application/xhtml+xml` responses to `text/plain` (an
   anti-phishing measure), so a browser shows source, not a page. Only data
   types like `application/json` pass through. **Do not** try to serve a
   rendered dashboard/page from an edge function — deliver pages as **Artifacts**
   instead (see `system/dashboard.artifact.html` and `marketing-system.artifact.html`).
2. **This sandbox's network blocks `*.supabase.co`, CDNs, and googleusercontent.**
   So you cannot `curl` the functions or load remote images/fonts here. Drive
   the functions **server-side from the database** with the `http`/`pg_net`
   Postgres extensions (examples below), and use the Supabase MCP tools for
   everything else. Artifacts also block remote images (Google Fonts is the only
   exception) — that's why dashboard post photos are brand-slate placeholders in
   the artifact but real when served from a normal host.

## Two ways to drive it

### A) The operator CLI (best when a terminal + `system/.env` exist)

From `system/` (needs Node 18+, and `system/.env` with `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY`):

```
node cli.mjs status          # CRM + queue + recent runs snapshot
node cli.mjs lead --name "..." --email "..." --message "..."
node cli.mjs plan            # orchestrator: Claude plans tasks
node cli.mjs run             # runner: execute queued tasks
node cli.mjs loop            # plan + drain the queue
node cli.mjs content         # content awaiting approval
node cli.mjs approve <id>    # approve a draft + queue publish
node cli.mjs messages        # drafted / queued messages
node cli.mjs send <id>       # queue a drafted message to send
node cli.mjs report          # generate + print the weekly owner summary
```

### B) Server-side via the database (best in this remote session, where egress is blocked)

Invoke a function from SQL through the `http` extension. Public functions
(`intake`, `dashboard`) need no auth; JWT functions (`orchestrator`, `runner`,
`report`) need a Bearer token — the project's anon key works. Get it with
`mcp__Supabase__get_publishable_keys`, then:

```sql
-- public function (intake): create a lead
select (extensions.http(ROW('POST',
  'https://glzodwhyavexpuusbqjy.supabase.co/functions/v1/intake',
  ARRAY[extensions.http_header('Content-Type','application/json')],'application/json',
  '{"name":"...","email":"...","message":"...","source":"website"}'
)::extensions.http_request)).content::jsonb;

-- JWT function (runner/orchestrator/report): pass the anon key as Bearer
select (extensions.http(ROW('POST',
  'https://glzodwhyavexpuusbqjy.supabase.co/functions/v1/runner',
  ARRAY[extensions.http_header('Authorization','Bearer <ANON_KEY>')],'application/json','{}'
)::extensions.http_request)).content::jsonb;
```

Gotcha: a single `execute_sql` call runs in one transaction, so an `INSERT`
into `tasks` isn't visible to a function you invoke in the *same* call — insert
first, invoke in a second call.

Read data straight from the tables with `mcp__Supabase__execute_sql` (service
role bypasses the deny-by-default RLS). Key tables: `contacts`, `deals`,
`activities`, `content_items` (has `image_url`), `messages`, `tasks`,
`reports`, `agent_runs`, `media_assets`, `settings`.

## Demo vs. live

The system is fully functional **without** an Anthropic key — it just produces
placeholder ("mock") text. `_shared/claude.ts` catches any API error and falls
back to mock, so an absent *or invalid* key never breaks the pipeline. The
dashboard badge reads "Demo mode" until real (non-mock) output exists.

**To go live** (Otis's steps — never do this with your own key; see the
`client-handoff-api-keys` skill):
1. Set a real `ANTHROPIC_API_KEY` as a **Supabase Edge Function secret**
   (Dashboard → Edge Functions → Secrets) — not on his Mac, not in `.env`.
   Everything flips to real Claude output with no redeploy.
2. Optional `SENDGRID_*` / `TWILIO_*` secrets to actually send email/SMS.
3. Optional: set `settings.agent.autonomy = 'auto'` to auto-send.

If Otis says he saved the key but it's still mock: the key belongs in Supabase
(where the functions run), not on his laptop. If it errors with `invalid
x-api-key`, the value was truncated/mistyped or is the placeholder — re-copy the
full `sk-ant-...` from console.anthropic.com.

## The dashboard

Meridian-branded, live-data. Because of gotcha #1 it's delivered two ways:
- **Live URL (data, but shown as source in a browser):** the `dashboard`
  edge function. Passcode-gated; the passcode lives in
  `settings.dashboard.passcode` — retrieve with
  `select value->>'passcode' from settings where key='dashboard';`.
- **Rendered artifact (what to actually show Otis):** rebuild
  `system/dashboard.artifact.html` from live data and publish it as an Artifact.
  Use the data + the CSS already in `system/supabase/functions/dashboard/index.ts`;
  use brand-slate gradient placeholders for images (artifacts block remote ones).

## Editing / extending

- Function source lives in `system/supabase/functions/`. Redeploy with
  `mcp__Supabase__deploy_edge_function` (bundle the `_shared/*.ts` files the
  function imports, rewriting `../_shared/` → `./_shared/`), or the Supabase CLI.
- Schema changes: add a migration under `system/supabase/migrations/` and apply
  with `mcp__Supabase__apply_migration`; run `mcp__Supabase__get_advisors` after
  DDL and lock down any `security definer` RPCs to `service_role`.
- Keep the brand: slate `#3E4C63`/`#5B6472`, steel `#4F6D8C`, ivory `#F5F4EF`,
  ink `#23262B`; Sora headings + Inter body; "M" monogram. For any UI polish,
  also use the `impeccable` skill.
- Phase 2 (not built): Meta / Google Business Profile / Google Ads / WordPress
  publishing (OAuth per platform); wiring the site inquiry form to `intake`;
  swapping the SVG monogram for the real logo PNG at `assets/meridian-logo.png`.

## After any change

Commit to the working branch and keep `system/SESSION.md` current — it's the
memory a future session (or this skill) relies on.
