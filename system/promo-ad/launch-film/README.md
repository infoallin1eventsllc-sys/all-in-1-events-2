# Meridian launch film ("The Line")

A 32 s promo for Meridian Interface, built in code (HTML and CSS, rendered frame by frame with
Playwright and encoded with ffmpeg). No generated footage. Made 22 Nov 2026.

Idea: the thin line through the Meridian mark becomes a line of light. It passes over an
out-of-date, hard-to-find business and switches on everything Meridian builds: websites, video
ads, digital cards, booking and a CRM. It ends on Otis's own logo light-up clip.

## Files

- `film.html`: the whole film. `?fmt=16x9|9x16|4x5|1x1` picks the layout; `window.render(t)`
  draws the frame at second `t`. Layouts live in the `ALL` table at the top.
- `render.cjs`: `node render.cjs video <fmt> out.mp4` (1080p, 30 fps), `stills <fmt> "t1,t2"`,
  `cover <fmt> out.jpg`.

It needs these next to it, which are not in the repo (they are large or are screenshots):
`hk.woff2` and `in.woff2` (the site's Hanken Grotesk and Inter), `tx/` (screens from the live
site and demos, the mark, and two made-up "before" pages), `clipf/` (64 frames of Otis's Agent
CRM laptop clip) and `endf/` (frames of `../end-card/meridian-logo-ending-clean-9x16.mp4`).

## What Otis asked for along the way

- One fluid motion: no glitch, slams, flashes or fast wipes. Everything eases in and out.
- His laptop clip sits in the CRM spot as the last of the five products.
- His standard logo ending, not an imitation of it.
- Voice (Holden) with music under it; "free" appointment; no captions; no personal name.

## Sound

Voice and one music track were generated in Higgsfield (ElevenLabs engines) and mixed locally:
the voice is cut into its lines and each is placed on its scene, the music ducks under the
voice, and the mix sits at about -16 LUFS with the peak under -1.5 dBFS.

## Backgrounds (22 Nov 2026)

Otis found the plain dark blue ground boring. `film.html` now takes `&bg=<name>` and lays the film
over one of his owned digital-card backgrounds (`bgs/<name>-wide.jpg` and `-tall.jpg`, made from
the card kit's wallpaper plates): `ribbon`, `houston-skyline`, `light-trails`, `sunset`. The
picture drifts slowly, a dark gradient sits behind the words, and the "before" part stays grey
until the line passes. The laptop clip is screen-blended, so on a bright ground it needs the dark
patch drawn behind it. Free: no new generation. `BGQ=<name>` selects it in `render.cjs`.

## Sharpness (22 Nov 2026)

Otis saw "an aura of blurriness" around the laptop. Cause: the clip sits on black, so it was
screen-blended with a soft edge mask and a dark radial patch behind it, and the clip's own ground
has a faint glow. Fix: `matte.cjs` cuts the laptop out of each frame (flood-fills the dark ground
in from the frame edges at a threshold of 30, closes small leaks, feathers one pixel) and writes
RGBA PNGs to `clipa/`; the film draws those with normal blending, no mask and no patch. Frames
are taken from the source with a light unsharp filter. All depth-of-field blur on the far panels
and on the row's neighbours was removed too, and the encode is crf 15.
What cannot be fixed here: the small text on the laptop's own screen is soft in the source clip.
