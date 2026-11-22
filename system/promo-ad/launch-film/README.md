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
until the line passes. The laptop clip sits in its own black card (see "Laptop clean-up"). Free: no new generation. `BGQ=<name>` selects it in `render.cjs`.

## Sharpness (22 Nov 2026)

Otis saw "an aura of blurriness" around the laptop. Cause: the clip sits on black, so it was
screen-blended with a soft edge mask and a dark radial patch behind it, and the clip's own ground
has a faint glow. Fix: `matte.cjs` cuts the laptop out of each frame (flood-fills the dark ground
in from the frame edges at a threshold of 30, closes small leaks, feathers one pixel) and writes
RGBA PNGs to `clipa/`; the film draws those with normal blending, no mask and no patch. Frames
are taken from the source with a light unsharp filter. All depth-of-field blur on the far panels
and on the row's neighbours was removed too, and the encode is crf 15.
What cannot be fixed here: the small text on the laptop's own screen is soft in the source clip.

## Laptop clean-up (22 Nov 2026, replaces the cut-out above)

Otis said the laptop was still "breaking up". Looking at the cut-out frame by frame showed why:
the laptop's black screen frame and its dark circuit boards are the same black as the clip's
ground, so any cut-out eats them, and the skyline showed through the holes. Three more faults:
the frames had been cropped to 908 px wide, which sliced the sides off the laptop while it is
large; the clip was resampled and played at 23 of its frames per second on a 30 fps film, which
stutters; and in the source itself the dashboard text smears for about half a second while the
laptop comes apart.

What the film does now (all free, nothing generated):

1. No cut-out. The clip is shown whole, on its own black ground, inside a rounded black card
   (680 x 793 at scale `clipS`), like the other product cards. `matte.cjs` is gone.
2. `clean.cjs` repairs the screen. It finds the screen's four corners in every frame (line fits
   on the bright edges, smoothed over time), takes the sharp dashboard from frame 16 of the same
   clip, and warps it onto the screen of all 89 frames. The text is now identical and sharp in
   every frame, including the ones that smeared.
3. The faint glow behind the exploded laptop had visible rings (banding). The black point is
   raised by 7 percent so the ground is pure black:
   `ffmpeg -start_number 0 -i clipc/c%03d.png -vf colorlevels=rimin=0.07:gimin=0.07:bimin=0.07 -start_number 0 clipd/c%03d.png`
4. One clip frame per film frame (source frames 0 to 88 at 30 fps), so the motion is smooth.

To rebuild: `ffmpeg -i clip/agent-crm-source.mp4 -t 3.4 -start_number 0 full/s%03d.png`, then
`node clean.cjs detect`, `node clean.cjs all`, then the colorlevels line. The film reads
`clipd/c000.png` to `c088.png`. After frame 88 the source zooms into its labelled close-ups, so
the film holds the last frame.

Rule learned: do not key dark footage that has black parts. Keep it on a dark card.

## Laptop removed, real Agent Dashboard in (22 Nov 2026)

Otis: "Let's take the laptop out. I don't like it. And use my Meridian Agent dashboard. Make it
really smooth and clean and professional, Fortune 500 ready." The laptop clip, `clean.cjs` and
the `clipd/` frames are no longer used; the two laptop sections above are history.

The CRM scene (item 5 of the row) is now his real Meridian Agent Dashboard, captured from the
working demo in the website repo, so every pixel is his product and nothing is generated:

- `capture-dashboard.cjs`: serve the website's `public/` folder on port 4823
  (`python3 -m http.server 4823`), then run it. Viewport 1200 x 760 at 2x. It hides the demo
  toast, crops the dark demo banner off the top (46 px) and saves the Overview, Agents and
  Pipeline views and each agent card. Below 1200 px wide the sidebar collapses to icons, so stay
  at 1200.
- The film uses two files: `dash/overview.png` (Overview scaled to 1600 wide) and
  `dash/agent.png` (the Pipeline Analyst card, 640 wide). Shot 1's small dashboard panel uses the
  same capture (`tx/dash2.jpg`).
- Motion, on purpose very little: the window glides in with the row and lands at 19.1 s, one
  agent card rises in front of its lower left corner, and the whole thing pushes in 3.5 percent
  until it leaves. No flashes, no cuts.
- The window is fully solid while it moves (a see-through white dashboard over a skyline looks
  dirty); it only dissolves for 0.65 s on the way out.
- `gpos` has a small smooth time warp (0.5 s over 16.8 to 19.1 s) so the dashboard holds for
  1.6 s; Booking keeps its timing with the voice.
- Per shape: `dw` (window width), `ac` (agent card left, top from the window's bottom, width),
  and for 1:1 `d4x`, `d4y`, `ty4`, which centre the window under the heading.
