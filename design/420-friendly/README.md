# 420 Friendly — four directions

Animated brand directions, MONTAGE removed. Canvas:
https://claude.ai/code/artifact/4ff3a91d-884b-42ab-b693-ab6e44cdb300

| Artboard | Direction | Type | Motion | Tradeoff |
|---|---|---|---|---|
| `Main.dc.html` | **A — Haze** | Archivo Black | Rising smoke, breathing halo | Least overtly 420 |
| `Neon.dc.html` | **B — Neon** | Bungee + tube-drawn 420 | Flickering numeral, humming frame | Needs dark backgrounds |
| `Groove.dc.html` | **C — Groove** | DynaPuff | Rotating sunburst, bobbing leaf | Playful, less premium |
| `Stamp.dc.html` | **D — Stamp** | Protest Guerrilla | Rotating tick ring | Most conventional |

## Typography sourced via Adobe Fonts

Faces were chosen from Adobe `font_recommend` for a 420/counterculture brief.
Its top picks were Cooper Std Black (the 1970s counterculture face) and
DynaPuff for the groovy lineage, Protest Guerrilla for activist energy.

**Cooper Std and Poplar Std are Adobe Fonts only** — the design-canvas CSP
admits `fonts.googleapis.com` alone, so they cannot load in an artboard.
DynaPuff, Protest Guerrilla, Bungee and Archivo are Google-available and are
what ship here. If a direction goes to production outside the canvas, Cooper
Black is the stronger choice for direction C.

## Motion

Every direction animates in CSS, and every animation is disabled under
`prefers-reduced-motion: reduce`. PNG/PDF export captures a static frame.

## Placeholders

`[YEAR]` and `[YOUR CITY]` are unresolved facts — fill before production.

## Regenerating

```bash
node "<claude design skill>/seed-canvas.mjs" \
  --template "<claude design skill>/payload.template.html" \
  --out 420-friendly-directions.html --title "420 Friendly Directions" \
  --artboard Main.dc.html --artboard Neon.dc.html \
  --artboard Groove.dc.html --artboard Stamp.dc.html --canvas canvas.json
```
