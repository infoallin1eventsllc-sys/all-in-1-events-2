# Connectors (24)

Snapshot 20 Aug 2026. `ListConnectors` returns current state — re-check before
relying on this. The **enabled in chat** column is the one that bites: a
connector can be authenticated at account level and still have none of its tools
loaded in a given session.

## Enabled in chat (12)

| Connector | Use it for |
|---|---|
| Adobe for creativity | Image/vector/video editing, fonts, Firefly boards, InDesign |
| Canva | Client collateral, brand templates, bulk variants, exports |
| Figma | Design context, tokens, code-connect, motion, FigJam |
| Magic Patterns | Prompt-to-UI generation and visual iteration |
| Notion | Durable docs and databases |
| Supabase | Postgres, auth, storage, edge functions (Meridian marketing system) |
| monday.com | Boards, CRM, docs, dashboards |
| Supermetrics Marketing Analytics | 150+ ad/analytics sources |
| Google Drive | Files and assets |
| Gmail | Client correspondence |
| Google Calendar | Event scheduling |
| Devil's Advocate | Adversarial review of a plan or argument |

## Installed, NOT enabled in chat (12)

Their tools do not load until toggled on in the chat's connector settings.
Three are design-relevant and worth turning on.

| Connector | Note |
|---|---|
| **Whimsical** | Wireframes, flowcharts, mindmaps — the lo-fi step. Worth enabling. |
| **Webflow** | Site and CMS management. Worth enabling for client sites. |
| **Vercel** | Deploy previews. Worth enabling once a design becomes a page. |
| Firecrawl | Live web/research fetch |
| Slack | Messaging — its plugin is separately enabled, so both or neither |
| HubSpot | CRM — overlaps monday.com; pick one |
| Neon | Postgres — overlaps Supabase; pick one |
| AWS MCP | Infrastructure |
| Vercel Control Plane | Internal |
| Loops | Email |
| Optimove | Marketing orchestration |
| Oxford Economics | Macroeconomic data |

## Local-only, not claude.ai connectors

These run as local processes on Otis's own machine and will never appear in
the claude.ai connector list. A remote or cloud session cannot use them.

| Server | Install | Use for |
|---|---|---|
| **Playwright MCP** | `claude mcp add playwright -s user -- npx @playwright/mcp@0.0.80` | Accessibility-tree browser control: verify a page renders, fill and submit forms, walk a flow, regression-check a client site before handoff. Add `--headless` to suppress the window. `claude mcp list` verifies; `claude mcp remove playwright -s user` undoes. |

Scope flags: `-s user` = every project on the machine, `-s local` = current
project only, `-s project` = committed to the repo's `.mcp.json` and shared
with collaborators.

**In a remote session, do not report browser automation as unavailable.**
Playwright the library plus Chromium are usually preinstalled there
(`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`) — write and run a script
directly. Never run `playwright install`; the browsers are already there.

## Seen intermittently

These appeared mid-session and were not in the stable set. If a job calls for
one and it is missing, tell Otis to enable it rather than declaring it absent.

- **Mobbin** — `search_screens`, `search_flows`, `search_sections`. The best
  UI-reference source on the account.
- **Trimble SketchUp** — `build_model`, `save_model`. The only spatial/3D tool;
  directly useful for venue and lounge layouts.
- **Three.js 3D Viewer** — `show_threejs_scene`.
