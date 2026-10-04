---
name: meridian-engineering
description: "Otis's engineering ground rules for every All in 1 Events and Meridian client build — apply them whenever writing, reviewing, committing, or shipping code on any of his projects, not only when asked. They cover: branch and commit discipline, the no-key-in-the-browser and client-keys-for-client-projects rules, the deliberate no-build frontend stance, design tokens as the only styling source, serverless input validation, dependency policy, the definition of done, and how session context is preserved. Load it at the start of any coding or shipping task, before proposing a framework or dependency, before a client handoff, and when deciding whether work is finished. Skip it for pure design mockups, documents, and questions that never touch code."
---

# Meridian engineering ground rules

House rules for code across All in 1 Events LLC and Meridian Digital Design
Studio LLC — the owner's projects and client builds alike. A repo's own
`ENGINEERING.md`, `ARCHITECTURE.md` or CLAUDE.md always wins where it is more
specific; these rules fill everything they don't cover.

## Repository discipline

- Branch per piece of work, named by what it does (`fix/footer-phone`,
  `design/catalog-canvas`). Never commit straight to the default branch.
- Commit messages record **why**, not what — the diff already shows the what.
  "Colons in YAML frontmatter broke skill parsing" is a good message; "update
  SKILL.md" is not.
- Push finished work the same day. Sessions and containers are ephemeral;
  unpushed work can vanish with the environment.
- Sources are committed, generated files are gitignored. Anything that
  regenerates from source (seeded canvases, exports, build output) stays out
  of history, with a README note on how to regenerate it.

## Secrets and keys

- **No key ever ships to the browser.** Secret-bearing calls go through a
  serverless function or Supabase edge function. A key in client-side JS is an
  incident to fix now, not a style nit.
- Config lives in the environment. `.env` untracked, `.env.example` documents
  the shape, platform dashboards hold production values.
- **Client projects run on client keys.** The client opens their own Stripe /
  Anthropic / etc. accounts and their keys are integrated — never Otis's own.
  This is non-negotiable at handoff: it protects him from their usage bills
  and them from losing service later.
- A key exposed anywhere (chat, commit, screenshot) is burned. Rotate first,
  investigate second.

## Frontend

- The house stack is **deliberately no-build**: plain HTML, Tailwind via a
  pinned CDN link, vanilla JS. Don't introduce a bundler or framework to a
  page that doesn't need one — added machinery is what breaks in two years.
  If a page genuinely outgrows this, raise it as a decision, don't drive-by
  upgrade.
- **Design tokens are the only styling source.** Each site's Tailwind config
  block defines its palette and type ramp; new UI uses tokens by name and
  never hardcodes a hex that already has a token. Resolved values for both
  shipped design systems live in the `meridian-stack` skill
  (`references/design-tokens.md`) — read that, don't invent.
- Untrusted text renders via `textContent`, never `innerHTML`. Cheapest XSS
  defense there is.
- Accessibility is baseline: `aria-` labels and visible focus on
  interactives, `prefers-reduced-motion` respected, body text ≥16px.
- Check phone width before calling any UI done.

## Backend and serverless

- Functions validate input at the edge — length caps, types, required fields.
  The form is a courtesy; the function is the boundary.
- Logs before code: for Supabase, `query_logs` and `get_advisors` first.
  Most "bugs" are config or data.
- Schema changes go through migration files, never ad-hoc SQL that "just
  fixed it."
- Systems with a demo/live switch surface their state in the UI. Nobody
  greps to learn whether real emails are sending.

## Dependencies and external services

- Prefer the platform to a package: CSS before a UI library, `fetch` before
  an HTTP client. A dependency must earn its maintenance cost.
- Pin versions — a CDN `@latest` changes page behavior overnight.
- Every external call gets a failure path the user can see. Widgets degrade,
  forms explain errors; nothing spins forever.

## Known issues are flagged, never papered over

When a file references something missing, a config contradicts the docs, or a
page is quietly broken: record it in the README or CLAUDE.md and fix it
deliberately. Building around a known issue without writing it down forces the
next session to rediscover it from scratch.

## Definition of done

Work is done when all of these hold — not when the code exists:

1. It runs — actually opened and exercised, not just written.
2. Committed and pushed to its branch with a reasoned message.
3. Secrets audit clean: nothing sensitive in the diff.
4. Mobile check passed, for anything with a UI.
5. Docs updated if behavior or setup changed.
6. Limitations stated out loud — "done except X" is honest; silent partial
   delivery is not.

A repo's own pre-launch checklist governs on top of this for releases.

## Session context is an engineering asset

Otis's projects are built heavily through Claude sessions, so recorded context
outlives any one conversation:

- Facts a future session needs — gotchas, states, decisions — go into
  CLAUDE.md or a repo skill, never only into chat history.
- Generated code gets the same review and testing as human code. "The model
  wrote it" skips nothing.
- One session, one concern where possible. Finish and push, then pivot;
  drifting across five topics leaves five half-finished branches.
