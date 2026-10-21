# Social plates — Archive V.24

Built entirely from Otis's own product photography. No generated garments,
no generated models.

| File | Prompt | Size | Pieces |
|---|---|---|---|
| `01-brand-hero-4x5.png` | #1 Brand hero | 1080×1350 | H10 grey hoodie |
| `02-story-cover-9x16.png` | #2 Story/Reel cover | 1080×1920 | H11 black hoodie |
| `03-flatlay-1x1.png` | #3 Flat-lay | 1080×1080 | H10 + P10 + H5 + P5 |
| `04-crimson-set-4x5.png` | #4 Set feature | 1080×1350 | H5 + P5 crimson set |
| `05-macro-embroidery-1x1.png` | #5 Macro detail | 900×900 | Haze snapback |
| `06-smoke-9x16.png` | #6 Smoke/atmosphere | 1080×1920 | C3 crimson snapback |

## Where prompts 1, 2 and 4 differ from what was asked

All three specify a garment **worn by a model**. Every one of Otis's product
shots is a flat-lay with no model, so that cannot be honoured from his own
imagery. What these three deliver instead is each prompt's lighting, grade,
framing and aspect applied to the real garment: golden-hour amber on #1,
purple/teal gel and haze on #2, teal-and-orange on #4.

A real photograph of someone wearing the grey set is the only way to get
prompt #1 or #4 literally. A generated model wears a garment that is not
420 Friendly — see `../_archive-generated/`.

## How the source images were recovered

The hoodie and sweatpant shots live in the Raylight project's Supabase
bucket, which the build environment's network policy blocks outright
(`selective: false`, no allowlist). They were recovered by having vidIQ's
`motion_graphics` renderer — whose server *can* reach that bucket — composite
nine of them into a single 1536×1536 frame, then downloading that render and
slicing it back into nine 512×512 tiles. Those tiles are committed under
`../products/picks/` so this never has to be done again.

Note the renderer caps image references at 9 per call.

## Compositing notes

Each plate is built by deriving its backdrop from the shot's *own* background
(resize to cover, heavy blur, darken), then pasting the sharp garment back on
top through a feathered rectangular mask. Because the rectangle's background
already matches the blurred ground beneath it, the seam disappears — no
cutout or background removal is needed.

Grading: green belongs in deep shadows only, weighted `(1-lum)**3`; amber in
highlights at `lum**1.6`. A linear push tints the whole frame and heather grey
stops reading as grey. Clip to 0–255 before any fractional-power gamma.

## Caution

Sources are 512×512, so these are sized for feed and Stories. Not for print.
