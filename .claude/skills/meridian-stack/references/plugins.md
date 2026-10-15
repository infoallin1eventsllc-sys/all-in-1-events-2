# Plugins (78 enabled at snapshot)

All from the `knowledge-work-plugins` marketplace. Enabling and disabling
happens at claude.ai → Settings → Capabilities. Disabling keeps a plugin
installed.

The volume itself is the problem: each enabled plugin loads its skill
descriptions into every session. The recommended target is ~18.

## Keep (18)

**Design and creative:** `design` (7 skills: design-critique, design-system,
accessibility-review, design-handoff, ux-copy, user-research,
research-synthesis) · `figma` (12 skills incl. figma-use-motion,
figma-implement-motion, figma-generate-library) · `canva` ·
`adobe-for-creativity` · `miro` · `cloudinary` · `brand-voice` · `pdf-viewer` ·
`modern-web-guidance`

**Business:** `marketing` · `postiz` · `searchfit-seo` · `small-business` ·
`monday-com` · `monday-crm`

**Infrastructure:** `gitkraken` · `browser-use` · `cowork-plugin-management`
(leave this one on — it manages the rest)

## Disable (47)

- **Financial data (7):** lseg, sp-global, carta-investors, carta-crm, daloopa, bigdata-com, airwallex-agentos
- **Sales/prospecting (7):** lusha, zoominfo, apollo, common-room, vibe-prospecting, grasp, intercom
- **Observability/security (7):** signoz, honeycomb, grafana-assistant, fastly-agent-toolkit, vanta-mcp-plugin, stackhawk-hawkscan, stackhawk-api
- **Dev platforms (6):** twilio-developer-kit, auth0, valtown, base44, sanity-plugin, zoom-plugin
- **Data/ML (4):** datarobot-agent-skills, qdrant-skills, pixeltable, bio-research
- **Web scraping (5):** tinyfish, tavily, exa, brightdata-plugin, nimble
- **Role packs (6):** human-resources, product-management, customer-support, data, enterprise-search, product-tracking-skills
- **Misc (5):** box, desktop-commander, carbone-skill, learn-with-coursera, ai-firstify

**Two carry session hooks**, so they cost something even when unused:
`signoz` (SessionStart, PreToolUse) and `carta-investors` (SessionStart,
PreToolUse, PostToolUse, UserPromptSubmit).
`twilio-developer-kit` is the single largest source of noise at 56 skills.

## Otis's call (13)

Do not decide these unilaterally — ask.

wix · b12-claude-plugin · airtable · dropbox · zapier · adspirer-ads-agent ·
slack-by-salesforce · sales · finance · productivity · operations ·
engineering · legal

## Available but never enabled

`synthflow` (voice agents) · `growthbook` (feature flags) ·
`qt-development-skills` (Qt/QML, though it does include
qt-figma-token-extraction and qt-figma-component-generation).

`SearchPlugins` returns ranked matches, not the full catalog — this list is a
sample, not an enumeration.
