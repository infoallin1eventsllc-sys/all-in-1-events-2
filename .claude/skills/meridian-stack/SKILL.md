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
| Ad/analytics data pull | **Supermetrics** — 150+ sources |
| Leads, deals, event projects | **monday.com** + the `monday-crm` plugin |
| Database, auth, edge functions | **Supabase** |
| Test a page, fill a form, verify a flow actually works | **Playwright MCP** — `browser_navigate`, `browser_snapshot`, `browser_click` *(local Claude Code only)* |
| Messy real-world browsing, scraping, visual checks | The `browser-use` plugin |
| Launch this project and screenshot it | The bundled `run` skill |

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
