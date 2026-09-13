# Social plates — Archive V.24

Built **only** from Otis's own Google Stitch uploads. No generated garments.

| File | Prompt | Size | Source |
|---|---|---|---|
| `03-product-still-1x1.png` | #3 Product still | 1024×1024 | Haze snapback, graded |
| `05-macro-embroidery-1x1.png` | #5 Macro detail | 900×900 | Haze snapback, cropped + graded |

## What the Stitch uploads actually contain

Seven zips were uploaded; three are byte-identical duplicates, leaving **five
unique 1024×1024 images**:

| | Subject |
|---|---|
| 1 | Gold crest logo on dark green — "420 FRIENDLY CLOTHING BRAND" |
| 2 | 3D emblem, light gradient ground |
| 3 | **Haze snapback** — the only garment/product |
| 4 | 3D emblem, dark brushed ground |
| 5 | 3D emblem, light ground, white FRIENDLY |

So: **one product and four logo treatments.** The hoodies and sweatpants
(H1–H13, P1–P14) are *not* in these zips. They arrived via pasted Stitch HTML
carrying temporary `lh3.googleusercontent.com` links, and were mirrored into
the Raylight project's Supabase bucket. The build environment's network policy
blocks that bucket (`selective: false` — no allowlist available), so those
files cannot be reached from here.

## To rebuild prompts 1, 2, 4 and 6 from real product

Upload the hoodie and sweatpant images as files to this session — the same way
the zips above were uploaded. They land in `/root/.claude/uploads/<session>/`
and can be read directly. Re-exporting them from Stitch, or downloading them
out of the Raylight assets panel, both work.

## Grading notes

Push green into deep shadows only — weight it `(1-lum)**3`, not linear. A
linear push tints the whole frame and heather grey stops reading as grey.
Amber belongs in the highlights at `lum**1.6`. Clip to 0–255 *before* any
fractional-power gamma, or negatives produce NaN.
