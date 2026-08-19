# Meridian Interface — one system, three repositories

This is the map of how everything connects. Three repositories, one running
system. Nothing here needs the repos to be merged: they are joined by a small
number of configuration values, listed at the bottom.

---

## The chain

```
  Visitor books on the website
            │
            │  POST { type: "appointment", payload: {...} }
            ▼
  ┌───────────────────────────────────────────────┐
  │  meridian-interface-website        (Vercel)   │
  │  src/lib/leads.ts → submitAppointment()       │
  │  Retries once, then keeps a local copy.       │
  └───────────────────────────────────────────────┘
            │
            ▼
  ┌───────────────────────────────────────────────┐
  │  intake  (Supabase Edge Function, public)     │
  │  → contacts row                               │
  │  → deals row (amount parsed from budgetRange) │
  │  → activities row                             │
  │  → tasks row: follow_up_lead                  │
  └───────────────────────────────────────────────┘
            │
            ▼
  ┌───────────────────────────────────────────────┐
  │  runner  (pg_cron, every 2 minutes)           │
  │  Claims tasks, executes by type, retries with │
  │  exponential backoff.                         │
  │    follow_up_lead   → drafts an email         │
  │    generate_content → drafts a post + image   │
  │    send_email/sms   → SendGrid / Twilio       │
  └───────────────────────────────────────────────┘
            │
            │  every call to a model goes through one seam:
            │  _shared/claude.ts
            ▼
  ┌───────────────────────────────────────────────┐
  │  Key Router                        (Render)   │
  │  Holds the keys. Meters usage per key,        │
  │  rotates before a quota runs out, opens a     │
  │  circuit breaker on a bad key.                │
  └───────────────────────────────────────────────┘
            │
            ▼
       Anthropic / OpenAI
```

Two more scheduled jobs run alongside the runner:

| Job | Schedule | What it does |
|---|---|---|
| `orchestrator` | daily 13:00 UTC | Reads goals + CRM state, plans the next batch of tasks |
| `report` | Mondays 13:30 UTC | Writes a plain-language weekly summary for the owner |

---

## The one seam that matters

Every model call in the marketing system goes through `_shared/claude.ts`.
It picks a transport at runtime, with no code change and no redeploy:

| Condition | What happens |
|---|---|
| `KEYROUTER_URL` is set | Route through Key Router. **No API key lives in Supabase at all** — that is the point. |
| `ANTHROPIC_API_KEY` is set | Call Anthropic directly with the SDK. |
| Neither | Deterministic mock. The whole pipeline still runs end to end. |

If Key Router is unreachable, it falls back to a direct call when a key is
present, and to mock otherwise. **Key Router going down never takes marketing
down with it.**

### Why Key Router exists

Key Router *manages* keys; it does not *supply* them. Every call still bills
whoever owns the key it routes to. The working model is **one key entry per
client, each with its own `limit`** — so a client's marketing runs on the
client's budget and is metered separately, never on Meridian's key. Meridian's
own marketing still uses Meridian's key, where the `limit` acts as a spend cap.

---

## What connects to what

These are the only values that join the three repositories.

### Website → marketing system

| Where | Name | Value |
|---|---|---|
| Vercel env (optional) | `VITE_LEAD_ENDPOINT` | Overrides the intake webhook. **Leave unset** — the default already points at the live intake function. |
| Vercel env (optional) | `VITE_OWNER_PASSCODE` | Enables the studio login link in the footer. Unset in production hides it. |

The intake webhook is public by design and exposes no secret. Nothing else is
needed for the website to feed the CRM — it works the moment the site is live.

### Marketing system → Key Router

Set as **Supabase Edge Function secrets** (Dashboard → Edge Functions →
Secrets). Never in `.env`, never in the repo, never on a laptop.

| Name | Value |
|---|---|
| `KEYROUTER_URL` | The deployed Key Router base URL, e.g. `https://key-router.onrender.com` |
| `KEYROUTER_AUTH_TOKEN` | Must match Key Router's own `KEYROUTER_AUTH_TOKEN`. **Without it the proxy is open to anyone.** |

### Key Router → providers

Set in Render (all marked `sync:false` in `render.yaml`, so no key is ever
committed).

| Name | Value |
|---|---|
| `KEYROUTER_AUTH_TOKEN` | Same value as above |
| `KEYS` | The key fleet — one entry per client, each with its own `provider` and `limit` |
| `KEYROUTER_URL_<PROVIDER>` | Optional endpoint override (Azure OpenAI, a gateway, a compatible proxy) |

### Optional sending channels

Set as Supabase secrets. Until they exist, the system drafts for approval
instead of sending — which is the safe default.

`SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`

---

## Current state

| Piece | Where it runs | Status |
|---|---|---|
| Marketing system | Supabase `glzodwhyavexpuusbqjy` | **Live.** All 5 functions deployed, 3 cron jobs active. |
| Website | — | Built, tested, merged to `main`. **Not deployed yet.** |
| Key Router | — | Merged to `main`, `render.yaml` ready. **Not deployed yet.** |
| Model calls | — | **Mock mode.** No valid key, by choice. |

Verified end to end on 2026-08-19 with the website's exact booking envelope:
intake returned `200` with a contact and a deal, the runner drained the
follow-up task and drafted an email, a content task produced a valid on-brand
SVG card, and the orchestrator and report both completed successfully.

---

## Going live, in order

1. **Deploy the website.** Vercel → Add New → Project → import
   `meridian-interface-website` → Deploy. Vite is auto-detected; no
   configuration and no environment variables are required. Bookings start
   flowing into the CRM immediately.
2. **Deploy Key Router.** Render → New → Blueprint → point at the `key-router`
   repo. `render.yaml` does the rest. Set `KEYROUTER_AUTH_TOKEN` and `KEYS`.
3. **Connect them.** Add `KEYROUTER_URL` and `KEYROUTER_AUTH_TOKEN` as Supabase
   secrets. Everything flips from mock to real output with no redeploy.
4. **Optional:** add SendGrid/Twilio secrets to actually send, and set
   `settings.agent.autonomy = 'auto'` to send without approving each draft.

Steps 1 and 2 are independent — either can be done first.

---

## Known gaps

- **Mock-mode report copy.** In mock mode the weekly summary renders a content
  caption rather than a summary, because the prompt matches the mock's content
  branch. Cosmetic, and it disappears the moment a real key is set. The metrics
  in the same report are real.
- **24 images on the website are hotlinked from `images.unsplash.com`.** They
  work, but the visual identity depends on a third party. Worth self-hosting.
- **The orchestrator, runner and report functions are callable by anyone
  holding the public anon key.** They only burn idempotent work today; once a
  real key is set that becomes spend. A `RUN_SECRET` header would close it.
- **Phase 2 channels** — Meta, Google Business Profile, Google Ads and
  WordPress publishing each need their own OAuth flow.
