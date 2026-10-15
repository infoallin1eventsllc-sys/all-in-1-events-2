---
name: meridian-auth
description: "How authorization works on every Otis project: all credentials live in the back end, the browser never holds one. Holds the two shipped patterns (serverless proxy for the public site, Supabase edge functions for the marketing system), where each kind of secret is stored, the anon-vs-service-role distinction that is the easiest thing to get catastrophically wrong, the RLS default-deny posture, webhook signing, and the client-keys-at-handoff rule. Load it before writing or reviewing anything that touches an API key, token, secret, login, session, permission, RLS policy, edge function, serverless function, webhook, or a client credential handoff — and before proposing any design where the browser calls a third-party API. Skip it for pure visual design and for code that touches no credential."
---

# Authorization: back end only

The single rule everything else follows from: **a credential never reaches the
browser.** The browser is given an endpoint, never a key. If a secret appears
in HTML, client JS, or a network response, that is an incident to fix now, not
a style preference.

`meridian-engineering` states this as one rule among many; this skill is how it
is actually built.

## The two shipped patterns

**1. Serverless proxy — the public site.**
Browser → serverless function (Netlify `netlify/functions/`, Vercel
`vercel/api/`) → third-party API. The function reads its key from
`process.env`, validates the request body (schema and length), calls out, and
returns a sanitized response. Errors log server-side and never reach the
client. The browser knows only the function's URL.

**2. Supabase edge functions — the marketing system.**
Browser or CLI → edge function → database and third-party APIs. Every table has
row level security enabled and no anon-facing policy, so the default is deny:
a browser holding the publishable key can read nothing directly. The edge
functions carry the service-role key, which bypasses RLS, and are therefore the
only path to data. Authorization is enforced by *which function exists*, not by
what the client asks for.

## Where each secret lives

| Secret | Home | Never |
|---|---|---|
| Third-party API keys for the public site (`ANTHROPIC_API_KEY`) | Netlify/Vercel dashboard env vars | Client JS, HTML, git |
| Edge-function secrets (`ANTHROPIC_API_KEY`, `SENDGRID_*`, `TWILIO_*`, `WEBHOOK_SECRET`) | Supabase → Edge Functions → Secrets, or `supabase secrets set` | `.env`, the repo, the CLI |
| `SUPABASE_SERVICE_ROLE_KEY` | Local `system/.env` for the operator CLI only; auto-injected into edge functions by the platform | Any browser, any commit, any client hand-off |
| Supabase publishable/anon key | Safe in the browser — it is designed to be public | Treated as a permission grant; RLS is what actually protects data |
| Client's own third-party keys | The client's own accounts, entered by them | Otis's accounts standing in for theirs |

`.env` stays untracked; `.env.example` documents the shape with placeholders and
notes which keys the CLI reads versus which must be set as platform secrets.

## The distinction that matters most

**Publishable/anon key** identifies the project and is meant to be public. It
grants nothing on its own — RLS decides what it can see. **Service-role key**
bypasses RLS entirely and can read and write every row in the database. Leaking
it is equivalent to handing over the database.

Consequences to hold on to:

- Service-role keys belong only in edge functions (auto-injected) and the
  operator CLI on Otis's own machine. Never in a browser bundle, a client
  hand-off, a screenshot, or a commit.
- Never "fix" a blocked browser query by reaching for the service-role key.
  A blocked query means the intended path is an edge function — write it.
- New tables get RLS enabled in the same migration that creates them. The
  migrations enable it across every table in a loop precisely so a new table
  cannot be born readable.
- Adding an anon-facing RLS policy widens the public attack surface. It can be
  right, but it is a deliberate decision to raise, never a convenience.

## Webhooks

The intake webhook takes a `WEBHOOK_SECRET` and should require it. Anything
publicly postable validates a shared secret or signature before it writes,
rate-limits, and caps body size. A public write endpoint with no auth is a
door, not an integration.

## Client hand-off

Client projects run on **client-owned credentials**. The client creates their
own accounts (Stripe, Anthropic, SendGrid, Twilio) and their keys are
configured into their deployment. Never ship a client on Otis's keys: it puts
his billing behind their traffic and breaks their service the day his account
changes. The `client-handoff-api-keys` skill covers how to ask for them; the
`meridian-client-letter` skill drafts the request.

## Verifying, and what to do when a key leaks

Before any deploy or hand-off, confirm nothing sensitive is in the tree:

```bash
grep -rE "sk-ant-|SG\.|AC[0-9a-f]{32}|service_role" . \
  --exclude-dir=node_modules --exclude-dir=.git
git log -p --all | grep -E "sk-ant-|SUPABASE_SERVICE_ROLE_KEY=."
```

Both should come back empty. A key that appeared in a chat, commit, log,
screenshot, or client email is burned regardless of whether anyone saw it:
**rotate first, investigate second.** Rotation means issuing a new key at the
provider, updating the platform secret store, redeploying, and only then
working out how it escaped. A key in git history survives deletion of the
file — rotation is the fix, not a revert.
