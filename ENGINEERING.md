# Engineering Practices

How code gets written, reviewed, and shipped across All in 1 Events and
Meridian Interface projects. This is the working layer; it defers to
`ARCHITECTURE.md` for structure, `SECURITY-and-DEPLOYMENT.md` for deploy
mechanics, and `PRE-LAUNCH-CHECKLIST.md` for release gates.

---

## 1. Repository discipline

- **Branch per piece of work.** Never commit directly to the default branch.
  Name branches by what they do (`fix/footer-phone`, `design/catalog-canvas`),
  not by who or when.
- **Commits explain why.** The diff already shows *what* changed. A commit
  message that restates the diff is wasted; one that records the reasoning
  ("colons in YAML frontmatter broke skill parsing") saves the next debugging
  session.
- **Push work the same day it's finished.** Remote sessions and containers are
  ephemeral — anything not pushed can vanish with the environment.
- **Generated files are gitignored, sources are committed.** Seeded canvases,
  build outputs, and exports regenerate from source; committing them bloats
  history and invites hand-editing the wrong file. (`design/21st-density/`
  follows this pattern — `.dc.html` sources in, seeded payload out.)

## 2. Secrets and keys

- **No key ever ships to the browser.** API calls that need a secret go through
  a serverless function (`netlify/functions/`, `vercel/api/`) or a Supabase
  edge function. If a key appears in client-side JS, that's an incident, not a
  style issue.
- **Config lives in the environment.** `.env` files stay untracked;
  `.env.example` documents the shape with placeholder values. Platform env vars
  (Netlify/Vercel/Supabase dashboards) are the production source of truth.
- **Client projects run on client keys.** Never deploy a client deliverable on
  our own API keys — the client creates their own accounts (Stripe, Anthropic,
  etc.) and we integrate theirs. This protects both sides: we don't eat their
  usage bills, they don't lose service when our account changes.
- **Rotate on exposure, don't debate it.** A key pasted into a chat, commit, or
  screenshot is burned. Rotate first, investigate second.

## 3. Frontend

- **This stack is deliberately no-build.** Plain HTML, Tailwind via CDN,
  vanilla JS. Don't introduce a bundler, framework, or package step to a page
  that doesn't need one — every dependency added is a thing that breaks in two
  years. If a page genuinely outgrows this (state management, routing), that's
  a conversation, not a drive-by upgrade.
- **Design tokens live in the Tailwind config, and only there.** Each site's
  inline `tailwind.config` block is its palette and type ramp. New UI uses
  those tokens by name; nobody hardcodes a hex that already has a token. The
  resolved values for both design systems are documented in
  `.claude/skills/meridian-stack/references/design-tokens.md`.
- **Render untrusted text with `textContent`, never `innerHTML`.** Chat
  messages, form inputs, anything a user typed. This is the single cheapest
  XSS defense and the codebase already follows it — keep it that way.
- **Accessibility is baseline, not polish.** Interactive elements get real
  `aria-` labels and visible focus states; animations respect
  `prefers-reduced-motion`; body text never drops below 16px. These are already
  in the shipped pages — new work matches them.
- **Check the page at phone width before calling it done.** Squashed grids,
  wrapping headlines, and 8px tap targets are found in thirty seconds of
  resizing, or by a client on launch day.

## 4. Backend and serverless

- **Functions validate input at the edge.** Length caps, type checks, and
  required-field checks happen in the function, not just the form — the form
  is a courtesy, the function is the boundary.
- **Read the logs before changing the code.** For Supabase issues:
  `query_logs` and `get_advisors` first, schema changes second. Most "bugs"
  are config or data.
- **Migrations over ad-hoc SQL.** Schema changes go through migration files so
  they replay in order. A `psql` one-liner that "just fixed it" is a change
  nobody can reproduce.
- **Demo mode and live mode are explicit states.** The marketing system runs
  in demo until deliberately taken live. Any system with a switch like this
  surfaces its current state in the UI — nobody should have to grep to learn
  whether real emails are being sent. (See the `meridian-marketing` skill
  before touching `system/`.)

## 5. Dependencies and external services

- **Prefer the platform to a package.** CSS can do most of what a UI library
  offers; `fetch` covers most of what an HTTP client offers. Reach for a
  dependency when it earns its maintenance cost, not by reflex.
- **Pin what you depend on.** CDN links without a version (`@latest`) are a
  time bomb — pin versions so pages don't change behavior overnight.
- **Every external service gets a failure path.** The chat widget degrades
  when the API is down; the inquiry form says what went wrong instead of
  spinning. Assume every third-party call will fail at the worst moment,
  because it will.

## 6. Known issues are flagged, never papered over

If a file references something that doesn't exist, a config contradicts the
docs, or a page is quietly broken — say so in the README or CLAUDE.md and fix
it deliberately. Working *around* a known issue without recording it means the
next person (or session) rediscovers it from scratch.

Current standing example: `index.html` references `css/styles.css`, `js/app.js`
and `js/api.js`, which are not in this repo. Until restored, the page renders
unstyled and the chat is inert. Any work touching `index.html` accounts for
this; nothing silently builds on top of it.

## 7. Definition of done

Work is done when all of these hold, not when the code exists:

1. It runs — actually opened, clicked, and exercised, not just written.
2. It's committed and pushed to its branch with a reasoned message.
3. Secrets audit: nothing sensitive in the diff.
4. Mobile check passed (for anything with a UI).
5. Docs updated if behavior or setup changed.
6. Known limitations stated out loud — "done except X" is honest;
   silent partial delivery is not.

For releases, `PRE-LAUNCH-CHECKLIST.md` governs on top of this.

## 8. Working with AI sessions

This repo is heavily developed through Claude sessions, which makes recorded
context an engineering asset:

- **CLAUDE.md and the repo skills are load-bearing.** Facts a future session
  needs (gotchas, states, decisions) go into CLAUDE.md, `meridian-stack`, or
  `meridian-marketing` — not just into chat history, which evaporates.
- **Verify generated code the same as human code.** Same review, same
  definition of done. "The model wrote it" is not a provenance that skips
  testing.
- **One session, one concern where possible.** Sessions that drift across five
  topics produce five half-finished branches. Finish and push, then pivot.
