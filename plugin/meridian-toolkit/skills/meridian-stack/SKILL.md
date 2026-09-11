---
name: meridian-stack
description: "Otis's stack map and brand source of truth — load it whenever a request needs a fact about his setup or his design systems instead of a guess. It holds: the exact palettes, fonts and type ramps of the All in 1 Events and Meridian sites (never invent a hex or improvise styling meant to match what he already ships); which connector, plugin or skill actually does a given job — UI references, mockups, floor plans and 3D, typefaces, photo edits, charts, social posting, CRM, analytics; and which tools he does NOT have, so you stop searching or promising installs. Use it before saying a capability is missing, before proposing a tool or workflow, before starting design or branding work that must match his existing sites, and when he asks what's enabled, what to turn on for a new project or client, or why a slash command came back unknown. Skip it for plain coding, file edits, and document or data chores that touch neither his tooling nor his brand."
---

# Otis's Claude stack

Inventory snapshot: **20 Aug 2026**. Counts drift; the routing advice does not.

Otis runs **All in 1 Events LLC** (luxury event production — photo booths,
lighting, VIP lounges, planning) and **Meridian Digital Design Studio LLC**
(design and marketing systems for clients). Tooling questions almost always
trace back to one of those two.

## Reach for these first

Match the job, not the brand name. Everything below is on this account.

| Job | Reach for |
|---|---|
| Reference how real apps solve a UI problem | **Mobbin** — `search_screens`, `search_flows`, `search_sections` |
| Read an existing design, or push code into Figma | **Figma** — `get_design_context`, `use_figma`, `get_variable_defs` |
| Animation and motion design | `figma:figma-use-motion`, `figma:figma-implement-motion` |
| Multi-artboard mockups Otis will hand-edit | The bundled `design` skill (Claude Design canvas) |
| Critique, design system, a11y audit, dev handoff, UX copy | `design:*` plugin skills |
| Polish or audit a real product surface | The `impeccable` skill — Otis's own design vocabulary |
| Charts, dashboards, stat tiles | The bundled `dataviz` skill |
| Find or preview a typeface | **Adobe** — `font_search`, `font_recommend`, `font_preview` |
| Photo/video edit, background removal, vectorize | **Adobe for creativity** |
| Client-facing marketing collateral, bulk variants | **Canva** — `generate-design`, `create-design-from-brand-template` |
| Generate UI from a prompt, iterate visually | **Magic Patterns** |
| Wireframes, flowcharts, journey maps | **Whimsical** *(installed — usually needs enabling per chat)* |
| Venue floor plans, lounge layouts, truss/rigging | **Trimble SketchUp** — `build_model` |
| 3D scene in a browser | **Three.js 3D Viewer** — `show_threejs_scene` |
| Brand voice and tone enforcement | The `brand-voice` plugin |
| Schedule/publish social across 28+ platforms | The `postiz` plugin |
| Marketing system, CRM, approval queue in this repo | The `meridian-marketing` skill — read it before touching `system/` |
| Letter asking a client for credentials or a next step | The `meridian-client-letter` skill |
| See who visits a deployed site | **Vercel Web Analytics** — same-origin, cookieless, passes a `script-src 'self'` CSP where GA and Plausible do not |
| Ad/analytics data pull | **Supermetrics** — 150+ sources |
| Leads, deals, event projects | **monday.com** + the `monday-crm` plugin |
| Database, auth, edge functions | **Supabase** |
| Test a page, fill a form, verify a flow actually works | **Playwright MCP** — `browser_navigate`, `browser_snapshot`, `browser_click` *(local Claude Code only)* |
| Messy real-world browsing, scraping, visual checks | The `browser-use` plugin |
| Launch this project and screenshot it | The bundled `run` skill |
| Recommend hooks/skills/MCPs/subagents for any repo | **`claude-code-setup`** plugin (`claude plugin install claude-code-setup@claude-plugins-official`), then "recommend automations for this project" |
| Ship a change through the definition-of-done gate | `/ship` — branch, secrets, dangling refs, SESSION.md, docs, then commit+push |
| Keep the installable plugin in step with `.claude/skills` | `/sync-toolkit` |
| Find paths that files reference but that don't exist | the `broken-reference-auditor` agent |
| Review a Supabase function or migration against the auth rules | the `edge-function-reviewer` agent |
| Start a client site the house way | `/client-site-scaffold <name>` |
| Which host serves the site, platform env vars, release order | the `meridian-deploy` skill |
| Stop a build from growing past the problem it solves | the `restraint` skill — five rungs before writing code, plus the over-builds this stack repeats |
| A decision worth arguing over — client, price, direction, hire | `/council <question>` — five seats, blind review, chairman. Seven subagents; user-invoked only |
| Poke holes in one plan without the full council | **Devil's Advocate** connector — `run_premortem`, `challenge_assumptions` *(connected; authorize per session)* |

**Two guards run automatically in this repo** (`.claude/settings.json`): a
commit on `main` is refused, and a commit whose staged diff contains a
key-shaped secret is refused. They are why a commit can "fail" with no git
error — read the reason they print; do not work around them.

**Playwright vs. browser-use — they overlap, so pick deliberately.** Playwright
MCP works off the accessibility tree: precise, cheap, deterministic. Use it for
structured work — verifying a page renders, filling and submitting a form,
walking a checkout, regression-checking a client site before handoff.
`browser-use` drives a real Chrome and sees pixels. Use it when the page is
messy, login-gated, or when the visual result is the point.

**Playwright MCP is stdio, not a claude.ai connector.** It launches a browser
as a local process, so it exists only in Claude Code on Otis's own machine —
it will never appear in the claude.ai connector list, and a remote or cloud
session cannot use it (there is no browser there to drive). In a remote
session, reach for `browser-use`, or write and run a Playwright script
directly: the library and Chromium are usually preinstalled
(`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`), so no MCP is required to
automate a browser. Never run `playwright install` in those environments.

Install, for reference — pinned per house rules, never `@latest`:
`claude mcp add playwright -s user -- npx @playwright/mcp@0.0.80`

## Do not go looking for these

Confirmed absent as of this snapshot. Say so plainly rather than searching:

- **No Higgsfield MCP.** Not in the connector directory.
- **No Google Stitch MCP.** Stitch is real, but ships no MCP server. Its Figma
  export is the bridge — Stitch → Figma → read with `get_design_context`.
- **No "Nano Banana" connector.** That's a nickname for a Gemini image model,
  not a product with an MCP endpoint.
- **No `motion.dev` skill and no `frontend-design` skill.** For animation use
  the Figma motion skills above. For product-surface design use `impeccable`.
- **No 21st.dev connector.** Its density idiom can be reproduced by hand;
  Mobbin is the better reference source.

When a genuinely new tool is asked about, check `SearchMcpRegistry` once and
report the result. Do not promise to install anything — see the next section.

## Real, but not installable from a browser session

These exist and are not vapor — they are simply outside the claude.ai plugin
catalog and outside Anthropic's official marketplace, so they install only
from a terminal on Otis's own machine. He works in the browser. Answer with
what the tool does and what it would cost him, not with an install promise.

- **Ponytail** (`DietrichGebert/ponytail`) — a "lazy senior developer" ruleset
  injected by two Node lifecycle hooks, plus `/ponytail-review` and
  `/ponytail-audit`. Its ruleset is what has value, and that is now the
  `restraint` skill in this toolkit, which we own and can audit. Do not wire
  its hooks into `.claude/settings.json` — they run on every session.
- **Graphify** (`Graphify-Labs/graphify`, pip package `graphifyy`) — a local
  Python CLI that turns a codebase into a queryable knowledge graph, with a
  PreToolUse hook that consults the graph before file searches. Its payoff
  starts around 500 files. This repo has 96 tracked files, 33 of them code —
  Glob and Grep already cover it. Revisit only for a genuinely large client
  codebase, and only on a local machine (needs Python 3.10+ and `uv`).
- **OmniRoute** (`diegosouzapw/OmniRoute`) — a local gateway on port 20128
  that fronts 352 model providers with quota-aware fallback. It works by
  routing prompts out to third-party and free-tier providers. Client work and
  anything under an NDA must not leave Anthropic that way, and a browser
  session cannot reach `localhost` regardless. The answer here is no.
- **"Agent Skills"** — not a plugin. It is the open standard Anthropic
  published for `SKILL.md` (agentskills.io), now used by Cursor, goose,
  OpenCode and others. Every skill in `.claude/skills/` and in
  `plugin/meridian-toolkit/` already conforms to it, so they are portable to
  those tools as-is. Nothing to install.

## Three facts that repeatedly cost time

**Installed is not the same as enabled in this chat.** Roughly half of Otis's
connectors sit at `enabledInChat: false` — their tools never load, so they look
missing. Whimsical, Webflow, Vercel, Firecrawl, Slack and HubSpot have all been
in this state. Before concluding a connector is absent, check `ListConnectors`
and look at that field, then tell him to toggle it on in the chat's connector
settings.

**A remote session cannot install connectors or plugins.** Enabling happens at
claude.ai → Settings → Connectors / Capabilities, or `claude mcp add` in a local
terminal. Offering to install from a cloud session is a promise that cannot be
kept.

**Plugin count is the usual root cause of "the skill didn't trigger."** Every
enabled plugin loads its skill descriptions into every session and competes for
attention. Otis had 78 enabled at snapshot time — Twilio alone contributed 56
skill descriptions, and `signoz` and `carta-investors` install session hooks
that run regardless. When a slash command fails to resolve, suspect noise before
suspecting absence, and point him at the tune-up checklist rather than debugging
the command.

## Skills already on the account

These sync from claude.ai and load in **every** project, so never suggest
installing them:

`impeccable` · `canvas-design` · `algorithmic-art` · `theme-factory` ·
`brand-guidelines` · `web-artifacts-builder` · `docx` · `pptx` · `xlsx` ·
`pdf` · `doc-coauthoring` · `internal-comms` · `meridian-client-letter` ·
`client-handoff-api-keys` · `mcp-builder` · `skill-creator` · `learn` ·
`morning` · `slack-gif-creator`

Another ~15 ship inside the Claude Code CLI itself (`design`, `dataviz`,
`artifact-design`, `artifact-diagramming`, `artifact-capabilities`,
`code-review`, `security-review`, `init`, `run`, `loop`, `simplify`,
`claude-api`, `update-config`, `keybindings-help`, `fewer-permission-prompts`).
Project-local: `meridian-marketing`, and `session-start-hook` on his machine.

## Working preferences observed

- He asks in fragments — `21st.dev`, `/motion.dev`, `higgsfield mcp`. Treat a
  bare product name as "what can I do with this here," answer the capability
  question directly, and say plainly when the thing does not exist.
- He values the honest negative. "That isn't real" saves him more time than a
  hedged maybe.
- Design work should be grounded in his actual repos, never invented. The two
  live design systems are documented in `references/design-tokens.md`.
- He will ask for something and change direction mid-turn. Deliver what is
  finished, then follow the new direction — do not silently drop the old work.

## Full inventory

Read these only when the summary above is not enough:

- `references/connectors.md` — all 24 connectors with enabled-in-chat state.
- `references/plugins.md` — all 78 plugins, grouped, with a keep/drop call.
- `references/design-tokens.md` — the palettes and type ramps of Otis's two
  shipped design systems, for any work that must match them.
