# Logo ad: "Is your website working for you?"

27 s, educational. Otis's Higgsfield clip (monolith in the wooden room) with the
glowing hand replaced by the real Meridian mark forming out of light on the
screen, then three quick website checks, the answer, and the end card.

- `out/meridian-logo-ad-wide.mp4` 1920x1080, for YouTube, Facebook feed, LinkedIn
- `out/meridian-logo-ad-story.mp4` 1080x1920, for Reels, TikTok, Stories
- `out/meridian-logo-ad-3d-{wide,story}.mp4` the same ad with the 3D M from
  Otis's "custom studio" image (just the M: no grid, no tagline), with blue
  light, on the screen, the end card and the contact bar. Cut-out:
  `m3d/meridian-m-3d.png`, made by `m3d/cut.py` from `m3d/source-custom-studio.webp`.

Contact details are on screen the whole time: a bar with meridianinterface.com
and 281-882-9198 from 0.6 s to the end card, which carries the site, phone,
email and "Book your 1-on-1 appointment".

| Time | What |
|---|---|
| 0-6.3 s | The film. Mark forms on the screen 1.55-3.4 s, glint 4.2 s, flash 6.0 s |
| 6.3 s | Hook: "Is your website working for you, or just sitting there?" |
| 9.3 / 12.5 / 15.7 s | Check 1 load fast on a phone, check 2 call or book in one tap, check 3 show up on Google |
| 18.9 s | "Meridian Interface builds sites that pass all three." |
| 21.7-27.3 s | End card |

Build: `./build.sh <clip.mp4> <work_dir> <python> [flat|3d]` (python needs opencv, numpy,
scipy). `track.py` finds the screen in every frame, `composite.py` puts the mark
on it (the artwork is `meridian-mark.png` itself; only the light is generated),
`scenes.html` + `render.mjs` draw the scenes and the contact bar, `music.py` is an
original score synthesised from scratch (no licensed music). No Higgsfield
credits used.
