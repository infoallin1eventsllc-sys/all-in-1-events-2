# 420 Montage — brand identity

Vector rebuild of the 420 Montage logo, published as a Claude Design canvas:
https://claude.ai/code/artifact/412171d0-a8f3-4f68-9359-f73638964d7c

## Artboards

| File | Use |
|---|---|
| `Main.dc.html` | Primary lockup, 1080×1080 — social, 1:1 |
| `IconMark.dc.html` | Icon only, 640×640 — avatar, favicon, stamp |
| `OnLight.dc.html` | Light background — print, invoices, contracts |
| `Horizontal.dc.html` | Horizontal lockup — web header, email signature |

## The mark

Monoline construction throughout, 12px stroke at 1080 scale, rounded caps and
joins. The 420-friendly move is a seven-leaflet cannabis leaf inside the
counter of the zero, drawn at the same stroke weight so it reads as part of
the numeral rather than an applied decoration. One move, per the `taste`
skill — no smoke, no gradient, no second flourish.

## Palette

| Role | Hex |
|---|---|
| Ground (dark) | `#1A1E23` |
| Ground (light) | `#F4F3EE` |
| Green | `#2E7D4F` (dark bg) · `#1F6B41` (light bg) |
| Numerals | `#FFFFFF` on dark · `#1A1E23` on light |
| Tagline | `#7C8792` on dark · `#6B7480` on light |

**Unverified:** these hexes are read from the supplied raster, not sampled
from a source file. Replace with the real brand values when available and
re-seed.

Wordmark set in **Outfit** (Google Fonts), a geometric substitute for the
original face, which is unidentified. Confirm or replace before production.

## Regenerating

```bash
node "<claude design skill>/seed-canvas.mjs" \
  --template "<claude design skill>/payload.template.html" \
  --out 420-montage-identity.html \
  --title "420 Montage Identity" \
  --artboard Main.dc.html --artboard IconMark.dc.html \
  --artboard OnLight.dc.html --artboard Horizontal.dc.html \
  --canvas canvas.json
```
