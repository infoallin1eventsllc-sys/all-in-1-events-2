# AGENTS.md

Instructions for AI agents working in or reviewing this repository, including
Codex code review on pull requests. Claude sessions also read `CLAUDE.md` and
the skills in `.claude/skills/`; this file is the short, tool-neutral version
of the rules that matter most.

This repo holds the production site for All in 1 Events LLC and the Meridian
Interface marketing system. Code here ships to the public, and some of it is
later handed to paying clients. Treat it that way.

## Layout

| Path | What it is |
|---|---|
| `index.html`, `marketing-system.html` | Public pages. Deliberately **no-build**: plain HTML, Tailwind via CDN, vanilla JS |
| `system/` | Meridian marketing system: Supabase edge functions (`system/supabase/functions/`), SQL migrations (`system/supabase/migrations/`), operator CLI (`system/cli.mjs`) |
| `vercel.json`, `netlify.toml` | Host config, including the security headers and Content-Security-Policy. **Both publish the repository root as the website** |
| `.github/workflows/` | GitHub Actions |
| `.claude/`, `plugin/` | Instructions and skills for AI sessions. Documentation, not runtime code |
| `design/` | Design drafts and working files. Not part of the site's code |

Known issue, already recorded in `CLAUDE.md`: `index.html` references
`css/styles.css`, `js/app.js` and `js/api.js`, which are not in this repo.

## Review guidelines

Report only problems that would hurt the owner, a client, or a site visitor
if this pull request shipped. The project's standing rule is that a credential
never reaches the browser. Everything under P0 follows from it.

### P0: block the release

1. **A secret committed anywhere in the repo.** API keys, tokens, passwords,
   private keys, webhook secrets, or a filled-in `.env`. Look for Anthropic
   keys (`sk-ant-`), other `sk-` keys, SendGrid keys (`SG.`), Twilio account
   SIDs (`AC` followed by 32 hex characters), JWTs, and any value assigned to
   `SUPABASE_SERVICE_ROLE_KEY`. A placeholder in `.env.example` is fine.
2. **Browser code that needs a secret.** Any HTML or client-side JS that calls
   a paid or authenticated API directly (Anthropic, OpenAI, SendGrid, Twilio,
   Stripe secret endpoints). These calls must go through a serverless function
   or a Supabase edge function that reads the key from the environment.
3. **The Supabase service-role key reachable from a browser**, or browser code
   written to use it. It bypasses row level security and exposes the whole
   database. The anon/publishable key in the browser is correct by design and
   is not a finding.
4. **A new Supabase table without row level security** enabled in the same
   migration that creates it, or a new policy that grants `anon` or
   `authenticated` access without a stated reason in the PR.
5. **An edge function or serverless function that trusts its input.** Public
   write endpoints must check a shared secret or signature, validate type,
   required fields and length, and cap body size. Errors must not return stack
   traces, SQL, or internal details to the caller.
6. **Private information added to a published path.** Because both hosts
   publish the repository root, any file committed here gets a public URL.
   Flag client data, contracts, invoices, personal phone numbers or addresses,
   and internal financial notes in any committed file.

### P1: fix before release

7. **Content-Security-Policy grants without a caller.** Every origin in
   `connect-src`, `script-src`, `img-src`, `font-src` or `frame-src` in
   `vercel.json` and `netlify.toml` must be used by code in this repo. Flag a
   PR that adds an origin nothing calls, adds a wildcard (`*`, `https:`), adds
   `'unsafe-eval'`, or makes the two configs disagree.
8. **Unsafe rendering of untrusted text.** Text that came from a user, a form,
   an API or an AI model must be rendered with `textContent`, not `innerHTML`,
   `insertAdjacentHTML`, `document.write` or an unescaped template.
9. **Script injection in GitHub Actions.** `${{ inputs.* }}`,
   `${{ github.event.* }}` or other user-controlled values placed directly in
   a `run:` script. Pass them through `env:` and quote them. Also flag
   workflow `permissions` broader than the job needs.
10. **Changes that break the no-build deploy.** Neither host runs a build
    step. A PR that makes a public page depend on a bundler, framework,
    TypeScript compile or `npm install` will deploy broken.
11. **New references to files that do not exist**: `src`/`href` paths, or
    function directories named in `netlify.toml` or `vercel.json`.
12. **Unpinned new dependencies.** A new CDN script or stylesheet loaded
    without a fixed version (`@latest` or no version at all).
13. **Client work wired to the agency's own accounts.** Client deliverables
    must run on the client's own API keys and accounts.

### Known and accepted. Do not re-flag unless the PR changes them

- `connect-src https://api.anthropic.com` in both host configs has no caller.
  It is a recorded dead grant awaiting the owner's decision.
- `'unsafe-inline'` in `script-src` and `style-src` is required by the inline
  `tailwind.config` block. It is an accepted risk.
- `cdn.tailwindcss.com` is loaded without a version.
- The intake edge function enforces its webhook secret only when
  `WEBHOOK_SECRET` is set.
- The missing `css/` and `js/` files referenced by `index.html`.

### Out of scope

- Writing quality, wording or formatting in `.claude/`, `plugin/`, `design/`
  and other Markdown documentation. Still flag secrets or private
  information there.
- Secret-looking patterns that are clearly detection rules, such as the
  regexes in `.claude/hooks/secrets-guard.sh` or examples in the skills.
- Style, naming and formatting preferences.

## Rules for agents making changes

- Work on a branch and open a pull request. Never commit to `main`.
- Do not change the security headers or CSP in `vercel.json` or
  `netlify.toml` without the owner's explicit approval.
- Keep public pages no-build. Use the existing Tailwind tokens in each page's
  inline `tailwind.config` instead of hard-coded colours.
- Schema changes go in a new numbered migration in
  `system/supabase/migrations/` with row level security enabled.
- Read `system/README.md` before changing anything in `system/`.
- Never add a real key to the repo, a commit message, a PR, or a comment.
  If one appears, it is burned and must be rotated at the provider.
