# Homepage hero: the laptop film (13 Nov 2026)

Otis asked to see the Agent Dashboard laptop ad (Higgsfield "Monospace Callouts",
see `system/promo-ad/agent-dashboard-ad/`) as the homepage hero picture, then asked
for it to be made "perfect": smooth, with rhythm, one consistent feel with the site.

**Status: preview only. Not on the live site.** Waiting for Otis's yes.

## What it is

A 15.6 s portrait clip (880x1080) that loops with no cut:
rest, the laptop lifts apart into its layers, the camera glides through them past
four labels, it closes, and eases back to exactly where it started.

- Slowed to about three-quarter speed with interpolated in-between frames.
- The ad's black stage is keyed out and the laptop set on the hero's flat navy
  (`#060d1d`) with a soft blue pool of light behind it, so its colours stay true.
- It is a clip, not a full-bleed backdrop. Wide screens centre it on the hero's
  right-hand column at 115% of the hero's height; phones and tablets show it under
  the buttons. No screen shape can crop the opened laptop.
- No credits were spent: everything here is ffmpeg and Python on the existing ad.

## Files

| File | What it does |
|---|---|
| `build.sh <ad.mp4>` | The whole build, from the ad to the six website files |
| `loop_tail.py` | The 48 frames that close the loop |
| `ground.py` | The navy ground with the pool of light, and the two edge fades |
| `website-hero.patch` | The website change (branch `hero-laptop`, not pushed): new `HeroLaptopFilm.tsx`, a ground-only `HeroBackdrop.tsx`, `HomeView.tsx`, `index.html` preloads, the `.hero-film` mask in `index.css` |

The rendered files are not in git here. They live in the Higgsfield sandbox
(`/home/user/hero/`, kept 24 h after last use) and go into the website repo at
`public/video/hero-laptop{,-sm}.{webm,mp4}` and
`public/images/hero/laptop-poster{,-sm}.webp` when Otis approves.
Sizes: wide 3.2 MB webm / 3.0 MB mp4 (the old hero was 6.5 / 7.0 MB),
phone 1.8 / 1.6 MB, posters 20 KB and 12 KB.

## Lessons (each cost a render)

- **A full-bleed 16:9 backdrop crops the opened laptop** on wide monitors, where the
  hero is far wider than 16:9. Sizing a portrait clip from the hero's height fixes it.
- **Screen-blending the black stage onto navy washes the laptop out.** Key it instead.
- **`lumakey threshold=0` leaves video black 13% opaque** (video black is 16, not 0),
  which showed as a faintly darker box. Use `threshold=0.0627`.
- **Fade the edges to the ground, not to black.** Darkening before the key leaves grey,
  hard-looking edges; laying the ground over the composite with an alpha ramp does not.
- In Chromium the clip's flat ground and the CSS colour measure within half a level of
  each other. Safari was not tested (no Safari here); the 5% CSS mask on `.hero-film`
  is there to hide a small difference if one exists.

## Preview (Higgsfield library, video)

- Desktop recording: media `8c157d5b-f4fd-4c15-a3fa-659e2a1b2685`
- Phone recording: media `998d6b74-fba1-48fc-9f42-59c1fa22989a`
- First rough preview (superseded): media `1790d9d4-63de-4d95-9e01-86940d53d43f`

## Still to do if Otis says yes

1. Bring the six files into the website repo. This sandbox cannot reach Higgsfield's
   upload host (`d2ol7oe51mr4n9.cloudfront.net`); it needs adding to the environment's
   allowed hosts, or Otis can upload the files into the chat.
2. Apply `website-hero.patch`, then delete `HeroShowcase.tsx`, the three
   `public/images/hero/hero-*.webp` captures, `showcase-poster.webp` and
   `public/video/hero-showcase.*` if nothing else uses them, and update
   `public/images/CREDITS.md`.
3. Run meridian-prelaunch-qa (both scripts), look at the screenshots, push to main,
   confirm live.
4. Things to tell Otis: the labels describe the Agent Dashboard, not the whole studio;
   on phones the three tappable demo cards leave the hero (the Working demos section
   is directly below); phones now load a 1.8 MB clip after the page has loaded.
