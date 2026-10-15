# Otis's two shipped design systems

Both are real and in production. Design work for either brand must use these
values, not invented ones. Follow variables through to resolved values; do not
round to a 4/8px grid.

## All in 1 Events — dark, nightlife

Source of truth: the inline `tailwind.config` in `index.html` of the
`all-in-1-events-2` repo.

**Surfaces** (darkest to lightest)
`#0c0e12` lowest · `#111317` background/surface · `#1a1c20` low ·
`#1e2024` container · `#282a2e` high · `#333539` highest · `#37393e` bright

**Accents**
primary `#ecb2ff` (orchid) · primary-container `#bd00ff` · on-primary `#520071`
secondary-container `#00eefc` (cyan) · secondary-fixed `#7df4ff` · secondary `#d3fbff`
tertiary `#ffb1c3` (pink) · tertiary-container `#e7006e` · error `#ffb4ab`

**Text and lines**
on-surface `#e2e2e8` · on-surface-variant `#d4c0d7` · outline `#9d8ba0` ·
outline-variant `#514255`

**Type** — Sora 600/700 headings, Plus Jakarta Sans 400/600 body
- `headline-xl` 48/56, -0.02em, 700
- `headline-lg` 32/40, 600
- `body-md` 16/24, 400
- `label-sm` 12/16, +0.05em, 600

**Geometry** — radii 4 / 8 / 12 / full · gutter 24 · desktop margin 64 ·
container 1280

**Caution:** `index.html` references `css/styles.css`, `js/app.js` and
`js/api.js`, none of which exist in the repo. The classes `glass-card`,
`primary-gradient-btn`, `iris-chip`, `mirror-shine` and `glow-text` are
therefore undefined and the page renders unstyled. Flag this rather than
designing around it silently.

## Meridian Interface — light, ivory

Source of truth: the inline `tailwind.config` and `<style>` block in
`marketing-system.html`.

**Surfaces** — paper `#F5F4EF` · paper-2 `#EFEDE6` · card `#FFFFFF` ·
node `#FAFAF7`

**Text** — ink `#23262B` · ink-soft `#5B626C` · ink-faint `#8A8F98`

**Lines** — warm `#E3E1D8` (cards use `#E7E5DD`) · cool `#DCE0E7` ·
hover `#C9D0DA`

**Accents** — slate `#3E4C63` · slate-2 `#5B6472` · steel `#4F6D8C` ·
steel-soft `#7C96AE` · teal `#3E7C86`

**Type** — Sora 600/700/800 headings, Inter 400/500/600 body. Some artifacts
use Hanken Grotesk in place of Inter.

**Geometry** — radii 6 / 8 / 12 / 16 · container 1200

**Card recipe** — reuse verbatim rather than reinventing:
```css
border: 1px solid #E7E5DD;
box-shadow: 0 1px 2px rgba(35,38,43,0.04), 0 18px 40px -28px rgba(35,38,43,0.30);
transition: transform .35s cubic-bezier(.2,.7,.2,1), border-color .35s, box-shadow .35s;
/* hover */
transform: translateY(-3px);
border-color: #C9D0DA;
box-shadow: 0 1px 2px rgba(35,38,43,0.05), 0 26px 50px -28px rgba(62,76,99,0.35);
```

## Prior work to build on

`design/21st-density/` in this repo holds five `.dc.html` artboards applying
21st.dev's information density to both systems — a catalog browser, an approval
queue, and a component gallery. Its README documents how to re-seed the canvas.
Reuse those tokens and patterns before drawing anything new.
