# Social plates — Archive V.24

Generated atmosphere + **real** 420 Friendly branding composited in post.

| File | Prompt | Size | Notes |
|---|---|---|---|
| `01-brand-hero-4x5.png` | #1 Brand hero | 720×900 (4:5) | Blank hoodie plate + real emblem on chest |
| `02-story-cover-9x16.png` | #2 Story/Reel cover | 720×1280 (9:16) | Silhouette plate + real emblem in top negative space |
| `_ref-garbled-logo.png` | — | — | Reference only. Do not publish. |

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
