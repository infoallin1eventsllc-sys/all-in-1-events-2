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
| Build a screen someone operates — portal, booking flow, dashboard, form | the `apple-interface` skill — four states, navigation models, glass rules, spring motion |
| Make a hero or landing page read premium / Fortune-500 | the `cinematic-web` skill — hero media ranked, the weight budget, and the four techniques that cost nothing |
| Stop a build from growing past the problem it solves | the `restraint` skill — five rungs before writing code, plus the over-builds this stack repeats |
| Palettes, font pairings, UX guidelines, a11y checks, stack-specific UI — for a **client** project with no brand yet | the `ui-ux-pro-max` skill — vendored, searchable, offline. Never for All in 1 Events or Meridian: their tokens are locked |
| Render a video that does not exist yet — brand sting, merch reel from stills, title card, per-client cut | the `remotion-video` skill — React to 4K MP4. Two mandatory sandbox flags live there; free up to 3 people, paid at 4+ |
| Confirm a site is safe before a client owns it | the `client-security-gate` skill — deployed surface, CSP dead grants, Supabase exposure, credential handoff |
| A hero where scrolling drives a transformation — venue dressing itself, build assembling | the `scroll-reveal` skill — the generate-vs-render rule, Seedance backwards, WebP sequence, the proven scrub |
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

## Tools once recorded as absent — RE-VERIFY, DO NOT REPEAT

**This section has now been wrong five times.** Of its six original
entries, Higgsfield, `frontend-design`, Nano Banana and 21st.dev all turned out to exist,
and each wrong answer sent Otis away from something real. Treat every line here
as a dated observation, never as a standing fact. **Before repeating any of it,
re-check `ListConnectors`, `SearchMcpRegistry` and the open web.** A tool that
did not exist in August frequently exists now.

| Entry | Status |
|---|---|
| **Higgsfield** | **WAS WRONG.** Shipped a hosted MCP 30 Apr 2026. See its own section below |
| **`frontend-design` skill** | **WAS WRONG.** Exists in `anthropics/skills`. Not enabled here is a different fact from not existing |
| **Nano Banana** | **WAS WRONG.** Google ships no MCP, but community servers wrap it — see below |
| **Google Stitch MCP** | Checked Aug 2026: Stitch is real, shipped no MCP server. Its Figma export is the bridge. **Re-verify before repeating** |
| **`motion.dev` skill** | Checked Aug 2026: none found. For animation use the Figma motion skills. **Re-verify before repeating** |
| **21st.dev connector** | **WAS WRONG TWICE.** Real, hosted, and OAuth — connectable from the browser. See its own section below |

## Nano Banana — community MCP servers, not connected

Re-checked 15 Sep 2026, correcting an earlier flat "no".

Nano Banana is Google's nickname for a family of Gemini image models: Nano
Banana (Gemini 2.5 Flash Image), Nano Banana Pro (Gemini 3 Pro Image), and NB2
Lite (Gemini 3.1 Flash-Lite Image). **Google publishes no MCP server** — that
half of the old entry was right. What was wrong is the conclusion, because
third parties have wrapped it: `nanana-app/mcp-server-nano-banana` and
`ConechoAI/Nano-Banana-MCP` among others, exposing `generate_image`,
`edit_image` and `compose_images` up to 4K.

Not in Otis's connector list (verified). Three things to say if it comes up:

- **They are community wrappers, not Google.** Different trust posture from a
  directory connector.
- **Most are local stdio servers** run with npx or node. Otis works in the
  browser, so the deciding question is whether a given one offers a hosted
  HTTPS endpoint the way Raylight and Higgsfield do. If it does not, he cannot
  use it.
- **It bills per image** against his own Gemini key — roughly $0.04–0.05 at
  standard resolution, ~$0.15 at 4K, and Pro about $0.13 at 2K and $0.24 at 4K.

**The judgement that matters more than the availability.** This is the exact
category `cinematic-web` ranks last for hero work and lists among the tells
that mark a site as cheap. It is also the thing that produced the 420 Friendly
mockups reading FOUR HUNDRED FRIENDLY. Generated imagery is legitimate for
texture, mood and concept boards. It is the wrong tool for a product shot, a
logo, or anything carrying type.

## Raylight — motion design, connectable as a custom connector

Checked 13 Sep 2026. Otis said "Rayleight"; the product is **Raylight**
(raylight.app). Browser-based motion design: screenshots, shapes and footage
into cinematic product videos, with a motion-design agent you direct in plain
English. No After Effects, no install.

**It exposes a hosted MCP server**, so Claude can read shots, apply edits and
review rendered frames on his canvas:

```
https://api.raylight.app/mcp
```

Not in Anthropic's connector directory — `SearchMcpRegistry` returns nothing
for it. He adds it at claude.ai → Settings → Connectors → **Add custom
connector** and signs in with his Raylight account. Browser path, no terminal.

**The cost catch, which matters more than the connector:**

| Plan | What it gives |
|---|---|
| Free | Unlimited projects and length, 1080p60 export, "Made in Raylight" badge |
| Hobby, $15/mo | 4K60, badge removed, 300 AI credits |
| Pro | 1,000 credits, **5,000 MCP tool calls a week** |
| Max | Unlimited MCP calls |

MCP volume is gated behind Pro. The free tier is fine for using the editor by
hand; driving it from Claude is a paid feature.

**Why this is the right fit, unlike most things he has asked to install.** It
is built for exactly the job he has been stuck on: product videos from stills.
That is the merch-reel problem, and Raylight does it in a browser with a
proper timeline, camera moves, focus and bloom — rather than requiring the
photographs to be on a filesystem this session can reach.

Caveat when relaying: `raylight.app` is blocked by this sandbox's egress
proxy, so the endpoint and pricing above came from search results, not the
vendor's own page. He should confirm the URL on their site before pasting it —
an MCP URL grants access to whoever runs it.

## Higgsfield — connectable, as a custom connector

Higgsfield AI runs an official hosted MCP server at `https://mcp.higgsfield.ai/mcp`
(HTTP transport, OAuth, no API key to provision). It exposes 30+ image and video
models — Veo, Sora, Kling, Seedance, plus Higgsfield's own Soul and Cinema Studio.

It is **not** in Anthropic's connector directory, so `SearchMcpRegistry` returns
nothing for it and it cannot be added from the directory list. Otis adds it at
claude.ai → Settings → Connectors → **Add custom connector**, pasting that URL,
then authorizes with his Higgsfield account. That path works in the browser; no
terminal needed.

Two things to say when it comes up:
- A custom connector is one Otis vouches for himself, not one Anthropic reviewed.
- Generation spends Higgsfield credits, so it needs a paid plan to be useful.

Overlap to weigh before adding it: `vidIQ` (`vidiq_generate_video`,
`vidiq_generate_broll`), `Clipkit`, `HyperFrames` and `Descript` are already
connected and already cover scripted, branded and edited video. Higgsfield's
distinct value is cinematic camera control on a single generated shot. Worth it
for hero footage; not a replacement for the four already loaded.

## 21st.dev — real, hosted, and connectable from the browser

Re-checked 25 Sep 2026 on the vendor's own page (reached through Composio's
sandbox), **correcting the 18 Sep entry**, which said a static-header auth
probably blocked the browser path. It does not. 21st.dev is a library of
12,000+ React/Tailwind components; Magic MCP is now the 21st MCP.

- Endpoint (Streamable HTTP): `https://21st.dev/api/mcp`
- Read-only endpoint: `https://21st.dev/api/mcp/readonly`
- Auth: **OAuth 2.1 with dynamic client registration**, or an API key as
  `x-api-key` / Bearer

OAuth means claude.ai → Settings → Connectors → **Add custom connector** works,
same as Raylight and Higgsfield. Prefer the read-only endpoint unless he needs
to publish components. Not in Anthropic's directory.

## Framer Motion is a library, not a plugin

It comes up because tutorials say "install the Framer Motion plugin." There is
no such plugin. `framer-motion` (now published as `motion`) is an npm package
for React. That means:

- **All in 1 Events** is deliberately no-build (see `meridian-engineering`).
  It cannot take an npm animation library without abandoning that stance, and
  `cinematic-web` is explicit that CSS transforms and a scrubbed canvas read
  more expensive than a JS animation library anyway.
- **The Meridian Interface site** is React + Vite, so it *could* take it — at
  roughly 30–60 KB gzipped against a hero budget that `cinematic-web` caps at
  1 MB above the fold. Worth it only for real spring physics and gesture work,
  not for fades and reveals that three lines of CSS already do.

For motion guidance without the dependency: `figma:figma-use-motion`,
`figma:figma-implement-motion`, the GSAP presets in `ui-ux-pro-max`
(`--domain gsap`), and `cinematic-web`.

## Strix — security testing, and the cloud version IS browser-reachable

Checked 22 Sep 2026. Strix (`usestrix/strix`) is an **AI penetration testing**
tool, not a design or video tool — worth saying plainly, because the name comes
up in the same breath as design tools and the jump surprises people.

Three tiers, and only one works for Otis:

| Tier | Reachable from a browser? |
|---|---|
| Open-source CLI — `curl -sSL https://strix.ai/install \| bash` | **No.** Needs Docker running and a terminal |
| Agent skills — `npx skills add usestrix/strix` | **No.** npx |
| **Strix Cloud at `app.strix.ai`** | **Yes.** A hosted web app he signs into |

No hosted MCP server, so it never becomes a Claude connector — but the cloud
app does not need one. He uses it directly against a deployed URL.

**Static vs dynamic is the distinction that matters.** What he already has reads
code: the bundled `/security-review`, the `edge-function-reviewer` agent, the
`meridian-auth` rules, GitHub secret scanning, and the two commit hooks. Strix
probes a *running* application. Those are complementary, not redundant, so
"he already has security tooling" is the wrong answer. The right answer is that
static review is free and available every session, and a dynamic pentest is
worth doing against a deployed site before a client handoff.

Caveat: `app.strix.ai` and `docs.strix.ai` were not reachable from this
sandbox's egress proxy; the tiers above come from the project's own README on
GitHub, which was readable.

## Blender — three routes, and the best one needs no MCP

Checked 25 Sep 2026.

| Route | Where it runs | Verdict |
|---|---|---|
| **`pip install bpy`** | Real Blender 5.0.1 as a Python module, inside the cloud session | **Use this.** Verified: models and exports GLB. No MCP, no credits, no install on his machine |
| Higgsfield 3D Jutsu (`scene_builder_3d_*`) | Hosted Blender 5.2, via the connected Higgsfield server | Works for modelling, but each operation is capped at **5 minutes** — two ray-traced renders timed out and committed nothing. Credit-billed |
| Official Blender MCP (blender.org Lab) | Blender on Otis's own computer, `localhost:9876`, via Claude Desktop | Real and vendor-made, needs Blender 5.1+. Unreachable from a browser or cloud session. Not found in the connector directory search from here |

Install `bpy` in a venv (`python3 -m venv bpyenv && bpyenv/bin/pip install bpy==5.0.1`)
— it pins Python 3.11. Modelling and GLB export are verified; headless
rendering is not, because EEVEE wants a GPU. For a website that does not matter:
the GLB renders in Three.js in the visitor's browser.

**Codex is not needed for any of this.** It is OpenAI's equivalent of Claude
Code. Tutorials that say "Codex + Blender" work the same with Claude Code.

## Composio — a hub, not an app

Connected 25 Sep 2026. One connector that fronts 500+ apps, but **each app
inside it needs its own sign-in**, done through `COMPOSIO_MANAGE_CONNECTIONS`,
which returns a link Otis clicks. At install, **no apps were signed in** —
Instagram, TikTok, LinkedIn, Firecrawl and every other one checked came back
inactive.

What it adds that nothing else here does:
- **Posting where he has no direct connector** — Instagram Business/Creator,
  TikTok, LinkedIn company pages, Facebook, X, Discord.
- **Scraping** — Firecrawl, Scrapfly, ScrapingBee toolkits (each needs its own
  account).
- **A second cloud machine with open internet** (`COMPOSIO_REMOTE_BASH_TOOL`,
  `COMPOSIO_REMOTE_WORKBENCH`). Works with no sign-in. It reached TikTok,
  21st.dev, strix.ai and ffmpeg-micro.com, all blocked by this session's
  proxy. **Use it to verify vendor pages before recording a claim here** — it
  is how the 21st.dev entry got corrected.

Rules:
- **Prefer a direct connector when one exists.** Gmail, Drive, Calendar,
  Figma, Canva, Notion, monday, Shopify, Vercel, GitHub and Supabase are all
  connected directly; routing them through Composio adds a middleman holding
  the same keys.
- **It concentrates access.** Every app signed in through Composio hands it an
  OAuth token. Connect only what he will use.
- **Its sandbox is Composio's machine.** Fine for public pages; never put
  client code under NDA, secrets, or credentials there.

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
