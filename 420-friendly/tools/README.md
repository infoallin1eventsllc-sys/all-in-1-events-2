# Image and video tooling

Run from this directory. Needs `pillow`, `numpy`, `scipy`, `imageio-ffmpeg`
(`pip install numpy scipy imageio-ffmpeg`) and expects the product tiles at
`../assets/products/picks/`.

- **`compositing.py`** — the shared helpers. `ground()` derives a backdrop from
  a shot's own background; `feathered()` pastes the sharp garment back on top
  through a soft-edged rectangle (no cutout needed — the rectangle's own
  background already matches the blurred ground beneath it); `grade()`,
  `vignette()`, `haze()`, `grain()`; `stamp()` composites the keyed emblem.
- **`build_launch_preview.py`** — renders `../assets/video/420-launch-preview.mp4`.
- **`add_soundtrack.py`** — lays a music track under a finished film.
  `python3 tools/add_soundtrack.py track.wav --start 18.5`. Trims the track to
  the film's exact length from `--start`, pads with silence if it runs short,
  normalises to -16 LUFS, fades both ends, and copies the video stream
  untouched — no re-encode, about a second to run. Writes `-scored.mp4`
  alongside the original so the silent cut survives for an A/B.

## The one thing that is not a technical question

A commercial song on a film we host needs a **sync licence**. Instagram and
TikTok hold blanket deals with the labels, which is why any song works in a
Reel — that licence covers their platform, not this site. Use music Otis owns,
or a production-music subscription (Epidemic Sound, Artlist, Musicbed,
Soundstripe) whose terms name web use, and keep the licence receipt. Pulling
audio out of a Spotify or Apple playlist is not an option regardless: those are
encrypted streams, so there is no file to take.

## Two things that will bite

**Grading.** Green belongs in deep shadows only, weighted `(1-lum)**3`. A
linear push tints the whole frame and heather grey stops reading as grey.
Amber goes in highlights at `lum**1.6`. Clip to 0–255 *before* any
fractional-power gamma or negatives produce NaN and the output gets black
garbage pixels.

**Captions.** Draw them in frame space, not into the oversized plate. Baked-in
captions ride the push-in, so during a cross-dissolve two captions appear at
different sizes and positions at once. `cap_alpha()` fades each one out before
its dissolve begins.

## Keying the emblem

`brand/brand-3d-white.webp` keys cleanly because the mark is dark on a light
ground: flood-fill the light region from the image borders, then erode ~3px to
kill the fringe. The white "FRIENDLY" survives because it is enclosed by dark
and never touches an edge. Do not use the dark-ground variants for this.

## Recovering product shots from Supabase

The bucket is blocked by the environment's network policy (`selective: false`,
no allowlist). vidIQ's `motion_graphics` renderer *can* reach it: composite up
to **9** images (hard cap) into one frame, download the MP4 from its S3 URL,
and slice the frame back into tiles. ~2 credits per call. All 18 recovered
shots are already committed under `../assets/products/picks/`.
