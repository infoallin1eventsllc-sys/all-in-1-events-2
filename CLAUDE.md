# all-in-1-events-2

Production site for All in 1 Events LLC plus the Meridian Interface marketing
system (`system/`).

**Before answering anything about available tools, connectors, plugins, or
brand styling, read `.claude/skills/meridian-stack/SKILL.md`** — it is the
source of truth for what this account has, what is confirmed absent, and the
exact design tokens of both shipped design systems. Do not guess hexes or
propose installs without checking it.

Other repo-specific skills: `meridian-marketing` (read before touching
`system/` or the Supabase project).

Known issue: `index.html` references `css/styles.css`, `js/app.js`, `js/api.js`
which do not exist in this repo — the page currently renders unstyled. Flag it,
don't silently work around it.
