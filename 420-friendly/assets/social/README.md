# Social plates — Archive V.24

Generated atmosphere + **real** 420 Friendly branding composited in post.

| File | Prompt | Size | Source |
|---|---|---|---|
| `01-brand-hero-4x5.png` | #1 Brand hero | 720×900 | Blank grey hoodie plate + real emblem |
| `02-story-cover-9x16.png` | #2 Story/Reel cover | 720×1280 | Silhouette plate + real emblem |
| `03-product-still-1x1.png` | #3 Flat-lay | 1024×1024 | **100% real product**, graded only |
| `04-rooftop-4x5.png` | #4 Rooftop lifestyle | 720×900 | Blank black hoodie plate + real emblem |
| `05-macro-embroidery-1x1.png` | #5 Macro detail | 900×900 | **100% real product**, cropped + graded |
| `06-smoke-9x16.png` | #6 Smoke/atmosphere | 720×1280 | Smoke plate + real emblem |
| `_ref-garbled-logo.png` | — | — | Reference only. Do not publish. |

## Substitution in #3

Prompt #3 asks for folded apparel on reclaimed wood. The only real product
file reachable from the build environment is `products/haze-snapback.webp` —
the rest live in the Supabase bucket, which the session is firewalled from.
So #3 is the snapback on stone with prompt #3's grade and format (amber
highlights, green shadows, side light, macro texture, 1:1), not folded
apparel. Redo it from `P12` (crimson folded) or `H13` (black folded) when
those files are reachable.

## Grading notes

Push the green into deep shadows only — weight it `(1-lum)**3`, not linear.
A linear push tints the whole frame and the heather grey stops reading as
grey. Amber belongs in the highlights at `lum**1.6`.
Clip to 0–255 *before* any fractional-power gamma, or negatives produce NaN.

## The method

Image generators have never seen the 420 Friendly mark and cannot reproduce it.
Prompting harder makes them render confidently *wrong* letterforms, not right
ones — `_ref-garbled-logo.png` is a fully-specified prompt that returned a chest
print reading **"8000 BREENT"**.

So the split is:

1. **Generate the plate with no branding at all.** Say "blank", "no print, no
   logo, no lettering" explicitly, and push the drawstrings clear of the chest
   so the panel is unobstructed.
2. **Composite the real emblem in post**, from
   `420-friendly/assets/brand/brand-3d-white.webp` — its light background keys
   out cleanly (flood-fill from the borders, then erode ~3px to kill the fringe;
   the white "FRIENDLY" survives because it is enclosed by dark and never
   touches an edge).
3. **Modulate the emblem by the fabric's own shading** — heavily blurred local
   luminance, normalised and clipped to ~0.78–1.22 — so folds and light fall
   across the mark instead of it looking pasted on.

The generator's own caption text gets burned into the bottom of the frame; the
4:5 crop removes it.

## Caution

vidIQ renders at 720px on the long edge. These are sized for feed and Stories,
not for print.
