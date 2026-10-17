# Logo ad: "Is your website working for you?"

27 s, educational. Otis's Higgsfield clip (monolith in the wooden room) with the
glowing hand replaced by the real Meridian mark forming out of light on the
screen, then three quick website checks, the answer, and the end card.

- `out/meridian-logo-ad-reels.mp4` 1080x1920, the Reels file: Instagram Reels,
  Facebook Reels, TikTok, YouTube Shorts (and Stories)
- `out/meridian-logo-ad-wide.mp4` 1920x1080, for YouTube, Facebook feed, LinkedIn.
  Not for Reels: Reels plays vertical full screen, a wide video shows as a strip.
- `out/meridian-logo-ad-3d-{reels,wide}.mp4` the same ad with the 3D M from
  Otis's "custom studio" image (just the M: no grid, no tagline), with blue
  light, on the screen, the end card and the contact bar. Cut-out:
  `m3d/meridian-m-3d.png`, made by `m3d/cut.py` from `m3d/source-custom-studio.webp`.

## Landing-page cut (previews)

`out/meridian-page-ad-{still,moving}-{wide,reels}.mp4`, 12 s. The same clip
with the hand replaced by the Meridian Interface landing page popping up on the
monolith screen as the clip's own voice says "we put the future in your hands"
(the website headline), then the end card. `still` holds the hero; `moving`
scrolls the page the way a visitor would. Built by `build-page.sh` with the
website served locally; `composite-page.py` does the screen replacement,
`music.py ... voice` the bed (ducked under the voice).

## Reels safe zone

Each Reels app lays its own buttons over the video, so everything that matters
in the reels cut sits inside the area none of them covers, checked frame by
frame with the zones drawn on:

- top 14% (269 px) clear: app header, "Reels", "Following | For You"
- bottom 35% (672 px) clear: caption, username, music, and the ad button when
  boosted (Meta's Reels-ads rule; stricter than TikTok and Shorts)
- 120 px each side clear: like / comment / share column

Safe box x 120-960, y 270-1248. The contact bar sits at the top of it. Encoded
1080x1920, H.264 High 4.1, 24 fps, 2 s keyframes, BT.709, AAC 48 kHz 192k,
-14 LUFS, 27 s: inside every platform's limits.

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
