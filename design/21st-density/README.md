# Catalog System — design canvas

21st.dev's information density applied to All in 1 Events and Meridian Interface,
plus an original component-gallery design. Published as a Claude Design canvas:
https://claude.ai/code/artifact/899b73d8-313e-46f0-b63f-49c4099a69e5

## Artboards

| File | Page | What it is |
|---|---|---|
| `EventsHero.dc.html` | All in 1 Events | Landing hero — ⌘K search, mono kicker, preview strip |
| `Main.dc.html` | All in 1 Events | Catalog browser — filter rail, working category tabs, inquiry tray |
| `MeridianConsole.dc.html` | Meridian console | Marketing-system approval queue, Demo/Live switch |
| `Gallery.dc.html` | Component gallery | Component marketplace, light/dark theme switch |
| `ComponentCard.dc.html` | Component gallery | Gallery card spec — default / hover / selected / loading |

`canvas.json` holds artboard positions, the three pages, and the sticky notes.

## Tokens

Nothing here invents a palette. The dark artboards use the Tailwind theme in
`index.html`; the light ones use the theme in `marketing-system.html`, including
its card shadow and hover recipe verbatim.

## Placeholders

Dashed `[SLOTS]` mark facts that were not available when this was drawn — rates,
event counts, timestamps, service area. Fill them before anything ships.
`360 Spin Booth`, `Open-Air Booth` and `LED Cocktail Tables` are extrapolated
from the four services in `index.html`; confirm or remove them.

## Regenerating

```bash
node "<claude design skill>/seed-canvas.mjs" \
  --template "<claude design skill>/payload.template.html" \
  --out all-in-1-events-catalog-system.html \
  --title "All in 1 Events — Catalog System" \
  --artboard Main.dc.html --artboard EventsHero.dc.html \
  --artboard MeridianConsole.dc.html --artboard Gallery.dc.html \
  --artboard ComponentCard.dc.html --canvas canvas.json
```
