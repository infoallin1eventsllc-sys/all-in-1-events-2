# Meridian Marketing System

An always-on, AI-orchestrated marketing engine. A scheduled agent plans work,
generates content and follow-ups with Claude, moves them through human approval,
sends via email/SMS, and writes a weekly plain-language owner summary — all on
top of one CRM in Supabase.

This is the working backend behind the architecture shown on `marketing-system.html`.

---

## What's built (Phase 1)

| Layer | Status |
|---|---|
| **CRM database** (contacts, deals, activities, campaigns) | ✅ live in Supabase |
| **Task queue** + concurrency-safe runner with retries/backoff | ✅ |
| **Orchestrator** — Claude plans a batch of tasks each day | ✅ |
| **Content studio** — AI drafts into an approval queue | ✅ |
| **Email (SendGrid) + SMS (Twilio)** senders | ✅ (add keys to go live) |
| **Intake webhook** — website form → CRM → follow-up | ✅ |
| **Owner summary reports** — weekly, written by Claude | ✅ |
| **Always-on scheduling** (pg_cron) | ✅ runner /2min, orchestrator daily, report weekly |
| Social / Ads / Local-SEO / WordPress publishing | 🔜 Phase 2 (OAuth per platform) |

### Architecture

```
Website form ──▶ intake ──▶ CRM (contacts, activities)
                                │
      pg_cron ─▶ orchestrator ──┤ plans work ─▶ tasks queue
      pg_cron ─▶ runner ────────┘ executes ──▶ content_items (approval)
                                              └▶ messages ──▶ SendGrid / Twilio
      pg_cron ─▶ report ───────▶ reports (owner summary)
```

Edge functions: `orchestrator`, `runner`, `intake`, `report` (in `supabase/functions/`).
Schema: `supabase/migrations/0001_marketing_system.sql`.

---

## Going live (what you provide)

Everything runs today in **mock mode** — the pipeline works, but AI text is a
placeholder and nothing is actually sent. To make it real, set these as
**Supabase secrets** (Dashboard → Edge Functions → Secrets, or the CLI):

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...        # real AI planning + copy
supabase secrets set SENDGRID_API_KEY=SG....             # send email
supabase secrets set SENDGRID_FROM_EMAIL=hello@yourdomain.com
supabase secrets set SENDGRID_FROM_NAME="Your Business"
supabase secrets set TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... TWILIO_FROM_NUMBER=+1...
```

### Option: route through Key Router instead of holding a key

Rather than putting an Anthropic key in this project at all, point it at
[Key Router](https://github.com/infoallin1eventsllc-sys/key-router) — it holds
the keys, meters usage per key, and rotates before a quota runs out:

```bash
supabase secrets set KEYROUTER_URL=https://<your-key-router-host>
supabase secrets set KEYROUTER_AUTH_TOKEN=<the router's bearer token>
```

With `KEYROUTER_URL` set, no `ANTHROPIC_API_KEY` is needed here — the secret
never enters this project. If the router is unreachable the system falls back
to a direct call when a key is present, otherwise to mock, so a router outage
degrades marketing rather than breaking it.

This is also the multi-client answer: each client's key lives in their own
router fleet, metered separately, so you never run a client's marketing on your
own key (see the `client-handoff-api-keys` skill).

- Only `ANTHROPIC_API_KEY` is needed to see real AI output. Email/SMS keys are
  only needed when you want messages actually delivered.
- The agent runs in **`draft` autonomy** by default: it drafts, a human approves.
  Switch to auto-send by setting `settings.agent.autonomy = 'auto'`.
- Edit your business voice/goals in the `settings` table (`business_profile`, `goals`).

---

## Web dashboard

A live, Meridian-branded dashboard (server-rendered, no build step) shows the
CRM, the approval queue with post images, drafted messages, recent leads, and
agent activity:

```
https://glzodwhyavexpuusbqjy.supabase.co/functions/v1/dashboard?key=<PASSCODE>
```

The passcode is stored in the database, not a Supabase secret. Retrieve or
rotate it:

```sql
-- view current passcode
select value->>'passcode' from settings where key = 'dashboard';
-- set a new one
update settings set value = jsonb_build_object('passcode','your-new-code') where key = 'dashboard';
```

The dashboard is read-only; approve/publish/send from the CLI below.

## Run it from the terminal

The operator CLI drives the whole loop. From `system/`:

```bash
cp .env.example .env        # fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
node cli.mjs status         # snapshot: CRM, queue, recent runs
node cli.mjs lead --name "Sam Lee" --email sam@example.com --message "Wedding in June"
node cli.mjs plan           # orchestrator: Claude plans tasks
node cli.mjs run            # runner: execute queued tasks
node cli.mjs loop           # plan + drain the whole queue
node cli.mjs content        # content awaiting your approval
node cli.mjs approve <id>   # approve a draft + queue it to publish
node cli.mjs messages       # drafted / queued messages
node cli.mjs send <id>      # queue a drafted message to send
node cli.mjs report         # generate + print the weekly owner summary
```

Requires Node 18+ (uses built-in `fetch`). No npm install needed.

---

## Scheduling (already active)

`pg_cron` jobs (see them with `select * from cron.job`):

| Job | Cadence | Does |
|---|---|---|
| `marketing-runner` | every 2 min | drains the task queue |
| `marketing-orchestrator` | daily 13:00 UTC | plans the day's work |
| `marketing-report` | Mon 13:30 UTC | writes the owner summary |

Adjust cadence with `cron.schedule('marketing-orchestrator', '<cron>', ...)`.

---

## Security notes

- **All CRM tables are RLS deny-by-default.** Only the service role (used by the
  edge functions) can read/write. The public/anon key cannot see any data.
- `intake` is the only public endpoint. Set a `WEBHOOK_SECRET` secret to require
  an `x-webhook-secret` header on it.
- `orchestrator` / `runner` / `report` require a valid JWT. **Hardening (optional):**
  they can currently be triggered by anyone holding the public anon key. To lock
  them to internal use only, add a shared-secret header check (set a `RUN_SECRET`
  and compare it in each function) — ask and this can be added.
- Never commit `system/.env`. It's gitignored.

---

## Redeploying functions

Functions were deployed via the Supabase MCP tools. To redeploy from source with
the Supabase CLI:

```bash
supabase functions deploy orchestrator runner intake report --project-ref glzodwhyavexpuusbqjy
```

(The `_shared/` folder is imported by each function via `../_shared/...`.)
