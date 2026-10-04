---
name: meridian-deploy
description: "How the All in 1 Events site and the Meridian marketing system actually deploy — routes to the deploy truth that otherwise sits unread in root markdown. Load it for anything involving Netlify, Vercel, environment variables on a platform, the pre-launch gate, the inquiry-form wiring, or the question of which host serves the site. Skip it for local-only edits that never leave the branch."
---

# Deploying this repo

Three root documents hold the deploy truth. This skill exists because nothing
routed to them: read the one the task needs, don't summarize from memory.

| Question | Read |
|---|---|
| Threat model, headers, why the key never reaches the browser | `SECURITY-and-DEPLOYMENT.md` |
| What must be true before a release goes out | `PRE-LAUNCH-CHECKLIST.md` |
| How the inquiry form reaches the serverless function | `INQUIRY-FORM-SETUP.md` |

## The unresolved question: Netlify or Vercel?

The repo carries **both** `netlify.toml` and `vercel.json` with identical
security headers, and each declares a function directory that does not exist
(`netlify/functions/`, `vercel/api/`). Nothing in the repo says which platform
actually serves the site. Until that is settled and recorded here:

- Do not add a function to one platform's directory without asking which is
  live — you may be building for the host that isn't serving.
- The Vercel connector is installed on the account but usually off in chat;
  enabling it is the fastest way to find out (`meridian-stack` has the toggle
  note).
- When the answer is known, record it here in one line and delete the other
  platform's config in the same commit.

## Environment variables per platform

| Secret | Netlify | Vercel | Supabase |
|---|---|---|---|
| `ANTHROPIC_API_KEY` (site chat) | Site settings → Env vars | Project → Env vars | — |
| Edge-function secrets | — | — | Edge Functions → Secrets, or `supabase secrets set` |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into edge
functions by the platform; never set them by hand there. `meridian-auth`
covers the rest.

## Order of operations for a release

1. `/ship` passes (branch, secrets, dangling references, SESSION.md, docs).
2. `PRE-LAUNCH-CHECKLIST.md` walked top to bottom.
3. Deploy preview first; production only after the preview is exercised at
   phone width.
4. Post-deploy: open the live URL, submit the inquiry form once with a test
   address, confirm the function responded — the checklist's last item.
