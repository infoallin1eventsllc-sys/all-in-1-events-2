# Design System

Two brands ship from this repo, each with its own complete visual system:

| System | Ground | Surface | Source of truth |
|---|---|---|---|
| **All in 1 Events** — dark, nightlife | `#111317` | Public site (`index.html`) | Inline `tailwind.config` in `index.html` |
| **Meridian Interface** — light, ivory | `#F5F4EF` | Marketing system, client docs (`marketing-system.html`, `system/`) | Inline `tailwind.config` + `<style>` in `marketing-system.html` |

Every value below is lifted from those files. When this doc and the code
disagree, the code wins — update this doc, don't fork the values. Never invent
a hex, round a size, or substitute a "close enough" font.

---

## Shared principles

These hold across both brands:

1. **Tokens by name, never raw values.** New UI references the Tailwind token
   (`text-primary`, `bg-paper`); a hardcoded hex that duplicates a token is a
   bug.
2. **Sora heads, a humanist sans bodies.** Both systems pair Sora (600–800)
   for headings with a workhorse body face. Two families per page, three max.
3. **Mono for metadata.** Timestamps, counts, labels, keyboard hints set in
   `ui-monospace` stack, 9–11px, letter-spaced 0.12–0.18em, uppercase. This is
   the systems' shared "data voice."
4. **Hairlines, not borders.** Separation comes from 1px lines at low
   contrast, generous gap, and surface steps — not heavy strokes or shadows.
5. **One accent doing the work per view.** Semantic state colors (error,
   success) are separate from the accent and don't count against it.
6. **Placeholders are visible, never fabricated.** A missing fact renders as a
   dashed-underline `[SLOT]` (`border-bottom: 1px dashed <outline-token>`),
   not an invented number, rate, or date.
7. **Real hit targets.** Interactive elements ≥44px on touch surfaces; body
   text ≥16px; focus states visible; `prefers-reduced-motion` respected.

---

## System 1 — All in 1 Events (dark)

Electric nightlife energy with production precision. Dark ground, orchid
primary, cyan secondary, pink tertiary.

### Color

**Surfaces**, darkest → lightest. Step up one level per elevation; never skip
to pure black or invent a gray.

| Token | Hex | Use |
|---|---|---|
| `surface-container-lowest` | `#0c0e12` | Sunken wells: inputs, code, footer, trays |
| `background` / `surface` | `#111317` | Page ground |
| `surface-container-low` | `#1a1c20` | Cards |
| `surface-container` | `#1e2024` | Grouped panels |
| `surface-container-high` | `#282a2e` | Raised chrome, chat panel |
| `surface-container-highest` | `#333539` | Highest elevation |
| `surface-bright` | `#37393e` | Hover peaks |

**Accents**

| Token | Hex | Role |
|---|---|---|
| `primary` | `#ecb2ff` | The brand orchid — CTAs, active nav, brand marks |
| `primary-container` | `#bd00ff` | Gradient partner / intense fills |
| `on-primary` | `#520071` | Text on primary fills |
| `secondary-container` | `#00eefc` | Cyan pop — secondary chips, interactive tags |
| `secondary-fixed` | `#7df4ff` | Cyan for icons and checklists |
| `secondary` | `#d3fbff` | Cyan text on dark |
| `tertiary` | `#ffb1c3` | Pink — sparingly, fine print and warmth |
| `tertiary-container` | `#e7006e` | Hot pink fills, rare |
| `error` | `#ffb4ab` | Errors only |

**Text and lines**

| Token | Hex | Use |
|---|---|---|
| `on-surface` | `#e2e2e8` | Primary text |
| `on-surface-variant` | `#d4c0d7` | Secondary text |
| `outline` | `#9d8ba0` | Muted text, placeholder ink |
| `outline-variant` | `#514255` | Input borders, dashed slots |
| — | `rgba(255,255,255,0.07)` | Hairline dividers on dark |

### Type

Sora (600/700) + Plus Jakarta Sans (400/600), both from Google Fonts.

| Role | Face | Size/leading | Extras |
|---|---|---|---|
| `headline-xl` | Sora 700 | 48/56 | -0.02em |
| `headline-lg` | Sora 600 | 32/40 | |
| `body-md` | Plus Jakarta Sans 400 | 16/24 | |
| `label-sm` | Plus Jakarta Sans 600 | 12/16 | +0.05em, nav & buttons |
| mono meta | ui-monospace | 9–11px | +0.12–0.18em, uppercase |

Display headlines on hero surfaces may scale to ~88px at 0.98 leading and
-0.035em — tighter as it gets bigger.

### Geometry

Radii `4 / 8 / 12 / full` (buttons and chips are `full` pills; cards are 12).
Spacing: 16 mobile margin, 24 gutter, 64 desktop margin, 1280 container.

### Component recipes

**Primary button** — pill, orchid fill, dark plum text:
`border-radius: 9999px; background: #ecb2ff; color: #520071;`
`font: 600 12px 'Plus Jakarta Sans'; letter-spacing: .05em; height: 32–40px.`
Ghost variant: transparent, `1px solid #514255`, text `#d4c0d7`; hover
border/text shift to primary.

**Card**:
`background: #1a1c20; border: 1px solid rgba(255,255,255,0.07);`
`border-radius: 12px;` hover: border warms to `rgba(236,178,255,0.45)`,
`translateY(-2px)`, transition ~.18s ease.

**Chip / tag** — pill, tinted, letter-spaced:
`font: 600 10px; letter-spacing: .12em; padding: 3px 8px; radius: full;`
orchid: `border: 1px solid rgba(236,178,255,.22); background: rgba(236,178,255,.07); color: #ecb2ff;`
cyan: same recipe with `rgba(0,238,252,…)` and text `#7df4ff`.

**Search / ⌘K field**:
`background: #0c0e12; border: 1px solid #514255; radius: 8–12px;`
placeholder `#9d8ba0`; the `⌘K` hint is a bordered mono badge.

**Preview stage** (catalog cards): sunken `#0c0e12` panel with a dot grid —
`background-image: radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1px); background-size: 12px 12px;`

**Icons**: stroke SVG only, 1.2–1.4 stroke-width, 16/20/24 grid, colored by
accent token. Never emoji, never filled dingbats.

### Voice on this surface

Confident, kinetic, short. "Elevate your atmosphere." Headlines under six
words; body copy names concrete gear (DMX, LED, load-in) rather than vibes.

---

## System 2 — Meridian Interface (light)

Calm, professional, warm ivory. This is the client-facing and internal-tools
face of the studio.

### Color

**Surfaces**

| Token | Hex | Use |
|---|---|---|
| `paper` | `#F5F4EF` | Page ground (with faint radial slate washes) |
| `paper-2` | `#EFEDE6` | Deeper ivory wells |
| `card` | `#FFFFFF` | Cards |
| node | `#FAFAF7` | Tiles inside cards, preview stages |

**Text (ink ramp)**: `ink #23262B` → `ink-soft #5B626C` → `ink-faint #8A8F98`.

**Lines**: warm `line #E3E1D8` (cards use `#E7E5DD`), cool `line-2 #DCE0E7`,
hover `#C9D0DA`.

**Accents**: `slate #3E4C63`, `slate-2 #5B6472` (the logo pair — gradient
`135deg` between them), `steel #4F6D8C` (the working accent for links,
active states, primary actions), `steel-soft #7C96AE`, `teal #3E7C86`
(secondary accent, success-adjacent).

### Type

Sora (600/700/800) + Inter (400/500/600). Some artifacts substitute Hanken
Grotesk for Inter — either is in-system; don't mix both on one page.

Page titles ~40px Sora 700 at -0.03em; section heads 22–30px; body 13–16px
Inter; mono meta same as the shared rule.

### Geometry

Radii `6 / 8 / 12 / 16`. Container 1200. Gutter 24, desktop margin 56–64.

### Component recipes

**Card** — reuse verbatim, do not re-derive:

```css
background: #FFFFFF;
border: 1px solid #E7E5DD;
box-shadow: 0 1px 2px rgba(35,38,43,0.04), 0 18px 40px -28px rgba(35,38,43,0.30);
transition: transform .35s cubic-bezier(.2,.7,.2,1), border-color .35s, box-shadow .35s;
/* hover */
transform: translateY(-3px);
border-color: #C9D0DA;
box-shadow: 0 1px 2px rgba(35,38,43,0.05), 0 26px 50px -28px rgba(62,76,99,0.35);
```

**Node tile** (inside a card): `background: #FAFAF7; border: 1px solid #EAE8E0;`
hover lifts 2px, border cools to `#B9C4D3`, background to white.

**Chips**: `chip` — `background: rgba(62,76,99,0.06); border: 1px solid rgba(62,76,99,0.16);`
`chip-steel` — same with `rgba(79,109,140,…)`. Teal state chips:
`rgba(62,124,134,0.08)` / `rgba(62,124,134,0.22)` / text `#3E7C86`.

**Primary action**: steel fill `#4F6D8C`, white text, radius 8. Secondary:
white, `1px solid #DCE0E7`, `#5B626C` text. Tertiary: borderless faint.

**Stat strip**: white bar, cells split by 1px `#E3E1D8` dividers; number in
Sora 700, label in mono caps `#8A8F98`.

**Status pill** (demo/live pattern): pill with dot; live =
`rgba(62,124,134,…)` teal treatment; demo/neutral = white with `#DCE0E7`
border and gray dot. Any system with a mode switch shows it this way.

**Card states** (galleries and pickers): hover = the card recipe above;
selected = `border: 1px solid #4F6D8C` plus a `0 0 0 3px rgba(79,109,140,0.14)`
ring — a border+ring change, never a fill change; loading = skeleton blocks in
`#E7E5DD`/`#EFEDE6` holding the exact final footprint, no spinner.

**Focus**: `outline: 2px solid #4F6D8C; outline-offset: 3px;`.

### Voice on this surface

Plain, precise, unhurried. Controls say exactly what happens ("Approve",
"Send inquiry"). No exclamation marks, no marketing filler in tool chrome.

---

## Motion (both systems)

- Transitions 150–350ms; the Meridian card curve `cubic-bezier(.2,.7,.2,1)`
  is the house easing for lifts.
- Hover lifts are 2–3px translateY with a border/shadow change — never scale
  jumps on cards (images inside a card may scale ≤1.05 over ~1s).
- One orchestrated moment beats scattered micro-effects. Ambient loops (the
  Meridian flow-rail dot) run ≥2.5s cycles and are removed entirely under
  `prefers-reduced-motion`.

## Accessibility floor (both systems)

- Body text ≥16px, print body ≥12pt.
- Interactive hit targets ≥44px on touch surfaces.
- Focus visible on every interactive element (recipes above).
- All meaning carried by color is duplicated in text or form (a dot label, a
  chip word).
- `prefers-reduced-motion: reduce` disables lifts, loops, and smooth scroll.

## Known issue

`index.html` references `css/styles.css`, `js/app.js`, `js/api.js`, which are
not in this repo. The classes `glass-card`, `primary-gradient-btn`,
`iris-chip`, `mirror-shine`, `glow-text` and the chat behavior are therefore
missing, and the live page renders unstyled. Their intended look can be read
from the recipes above; restoring the files is tracked work — do not silently
re-implement fragments of them inside pages.

## Where else this lives

- `.claude/skills/meridian-stack/references/design-tokens.md` — condensed
  token sheet for AI sessions (keep in sync with this doc).
- `design/21st-density/` — five artboards applying both systems at 21st.dev
  density: catalog browser, approval queue, component gallery, and a card
  spec sheet. Reuse those patterns before drawing new ones.
