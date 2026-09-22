---
name: client-security-gate
description: "The security gate to run before handing a site to a client — load it whenever work is about to be delivered, launched, handed off, or called finished for someone who is paying for it, and whenever Otis asks whether a site is safe to ship. It covers the layer his other gates miss: the DEPLOYED surface. Holds the header and CSP audit with the dead-grant trap that ships silently, the check that no credential reached the browser bundle, the Supabase exposure checks (RLS, anon vs service role, function auth), the dependency and form-abuse checks, where a dynamic pentest fits and which tier of Strix he can actually reach, and the credential handoff that must happen before the client owns the project. Use it before any client delivery or launch, and before telling a client a site is ready. Skip it for internal experiments and for work that will not be deployed."
---

# The gate before a client owns it

Three gates already exist and this does not replace them. Run them in order:

| Gate | Covers | When |
|---|---|---|
| `/ship` | branch, staged secrets, dangling refs, docs | every commit |
| `PRE-LAUNCH-CHECKLIST.md` | code quality, a11y, semantics | before deploy |
| **this** | **the deployed surface + credential handoff** | **before the client owns it** |

The first two read the repo. This one asks what is actually exposed on the
internet, which is the thing a client's users — and attackers — meet.

## 1. Headers and CSP

Read `vercel.json` / `netlify.toml`. Every header block must exist, and then
the CSP must be checked **against what the code actually calls**.

```bash
grep -rn "Content-Security-Policy" vercel.json netlify.toml
# for each origin granted in connect-src / script-src / img-src:
grep -rn "<that-origin>" --include="*.html" --include="*.js" --include="*.ts" . \
  | grep -v node_modules
```

**The dead-grant trap, found in Otis's own production config.** Both host
configs granted `connect-src https://api.anthropic.com`, and nothing in the
codebase called it. A dead grant is worse than clutter: it is exactly the CSP
shape you would need if the browser *were* holding an API key, so it removes
the backstop that would otherwise block an exfiltration attempt or a future
mistake. **Every origin in a CSP must have a caller in the code. If it has no
caller, delete it.**

`'unsafe-inline'` in `script-src` defeats most of the XSS protection a CSP
gives. Sometimes it is genuinely required — an inline `tailwind.config` forces
it. That is an accepted risk, not a passed check: say so out loud rather than
letting it read as clean.

## 2. Nothing secret reached the browser

```bash
grep -rnE "(sk-ant-api|sk-[A-Za-z0-9]{32,}|SG\.[A-Za-z0-9_-]{20,}|AC[0-9a-f]{32}|service_role)" \
  --include="*.html" --include="*.js" --include="*.ts" --include="*.tsx" . | grep -v node_modules
```

Check the **built** bundle too, not just source — a framework will happily
inline anything not prefixed as server-only. A Supabase **anon** key in the
browser is correct by design; a **service-role** key there is a total
compromise of the database. `meridian-auth` holds that distinction and it is
the easiest thing in the stack to get catastrophically wrong.

## 3. Supabase, if the project has one

- RLS enabled on **every** table, default-deny, not just the obvious ones.
- Edge functions validate input at the boundary and check auth.
- Webhooks verify their signature.
- Run `get_advisors` after any DDL — it catches missing RLS directly.

Delegate to the `edge-function-reviewer` agent; it knows these rules
specifically, where a generic scanner does not.

## 4. Abuse surface

Any public form or proxy endpoint is a bill someone else can run up. Confirm
rate limiting, a size cap on request bodies, and that errors do not echo
internals back to the caller. Then `npm audit` and resolve anything high.

## 5. Dynamic test — what static review cannot do

Everything above reads code. It cannot tell you how the running site behaves.
For that, **Strix Cloud at `app.strix.ai`** is the tier Otis can reach — a
hosted web app, no Docker, no terminal. The open-source CLI needs both, and
there is no MCP server, so it never becomes a connector.

Run it against the deployed URL, not localhost, and only against a site Otis
built or has written permission to test.

## 6. The handoff — the step most likely to be skipped

A project is not delivered while it still runs on Otis's credentials.

- Every third-party key must be **the client's own**, provisioned by them.
- Rotate anything of his that ever touched the project.
- Remove his personal accounts from the platform project.
- Confirm the client controls the domain, the host and the database.

`client-handoff-api-keys` holds the argument for why shipping on his own key
is never acceptable, including "just for now".

## Report it as a gate, not a vibe

Deliver a pass/fail list, name what failed and where, and state accepted risks
explicitly. **Never call a site secure.** Say what was checked, what passed,
what was accepted, and what was not covered — a static review plus a scanner
is not a penetration test by a human, and a client should not be told it is.
