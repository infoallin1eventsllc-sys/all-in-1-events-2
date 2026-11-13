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
| `website-hero.patch` | The website change (branch `hero-laptop`, not pushed): new `HeroLaptopFilm.tsx`, `HeroSoundButton.tsx` and `lib/heroSound.ts`, a ground-only `HeroBackdrop.tsx`, `HomeView.tsx`, `index.html` preloads, the `.hero-film` mask in `index.css` |

The rendered files are not in git here. They live in the Higgsfield sandbox
(`/home/user/hero/`, kept 24 h after last use) and go into the website repo at
`public/video/hero-laptop{,-sm}.{webm,mp4}` and
`public/images/hero/laptop-poster{,-sm}.webp` when Otis approves.
Sizes: wide 3.2 MB webm / 3.0 MB mp4 (the old hero was 6.5 / 7.0 MB),
phone 1.8 / 1.6 MB, posters 20 KB and 12 KB.

## Sound (13 Nov)

Otis asked "Where's the sound?" and wants the film heard with sound.

**First attempt, rejected.** A soundtrack written in code for the film (a four-bar
phrase in A minor, `score.py`, now deleted; it is in git history at 5de17a8).
Otis: "I do not like that sound... the original sound that Higgsfield produced for
the video, I want to use that one." Do not offer a composed score again unless he asks.

**What he wants: the ad's own Higgsfield audio** (from `raw.mp4`: AAC 32 kHz stereo,
10.14 s, -12.2 LUFS, peak -0.4 dBFS; quiet for the first 0.75 s, then a steady
bass-heavy cinematic bed, fading from 9.0 s). It is 10 s long and the hero film is
slowed to 15.6 s, so two versions were sent for him to choose between:

- **A. Slow film (the look he approved), sound stretched to fit.** `atempo=0.719424`,
  pitch kept. Envelope stays within 0.4 dB of the original and the stereo image is
  kept (L-R correlation 0.94). Do not use `rubberband` with its default independent
  channels here: it flipped the stereo phase (correlation -0.24) and the low end
  cancelled in mono.
- **B. Film at the ad's own speed, sound untouched.** 10.03 s of film plus the 1.6 s
  settle = 11.63 s loop. The film would need re-rendering without step 2 of `build.sh`.

Both at -16 LUFS by one fixed gain (A -3.4 dB, B -3.8 dB), with a short fade on the
last 0.2 s so the file never ends on a step. The loop seam falls in silence either way.

On the site the film still starts silent. Browsers refuse to start sound a visitor
did not ask for, so `HeroSoundButton` ("Play sound", lower right of the hero) turns
it on through `src/lib/heroSound.ts`. The patch carries this.

**Waiting for Otis to pick A or B.** The website working copy still has the rejected
score in its four video files; replace the audio before anything ships.

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

## Where it stands (13 Nov, evening)

- Otis: "I like the way it looks." Then asked for sound; the soundtrack and the
  previews with sound were sent. **Waiting for his yes on the sound and on going live.**
- He approved the Higgsfield upload host for the Default environment and then chose
  "Download files here", so the six files are in the website working copy, branch
  `hero-laptop` (local, not pushed), with the old hero (showcase film, three demo
  captures, `HeroShowcase.tsx`) removed and `CREDITS.md` updated.
- Pre-launch QA on that tree: see `system/SESSION.md`.
- To go live: merge `hero-laptop` into `main` (fast-forward), push, confirm on the
  live site from the Higgsfield sandbox.

Things Otis has been told: the labels describe the Agent Dashboard, not the whole
studio; on phones the three tappable demo cards leave the hero; sound needs one tap
because browsers do not allow a page to start audio; Safari and a real iPhone were
not tested.
