# Motion graphics — screen-capture clips for social

Cuts a vertical (1080x1920) clip from a hosted demo: brand title card, the real
product being used with captions over it, Meridian end card. No Shotstack key
needed — this path is entirely local, and complements `_shared/video.ts` (which
renders from a script through Shotstack) rather than replacing it.

Nothing here publishes. Output is an MP4 for owner approval, per the standing
rule that all social content is approved before release.

## Run

```bash
# serve the built demos on :4600 first (the website repo's dist)
node capture.mjs big-boy-subs raw-bbs           # zoom mode (default)
node capture.mjs modern-street raw-ms mobile    # true-mobile mode
python3 make-cards.py
./compose.sh raw-bbs assets/bbs big-boy-subs-social.mp4
```

Needs `playwright-core`, Pillow, and ffmpeg; `.ffmpeg` holds the ffmpeg path
(`python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"`).
`cards.py` wants `UI-700.ttf` / `UI-400.ttf` (InstrumentSans Bold/Regular, from
`/mnt/skills/examples/canvas-design/canvas-fonts/`) and `meridian-mark.png` from
the `meridian-brand` skill — never a redrawn mark.

## Three traps, each of which cost a rebuild

1. **Playwright does not scale the page up to `recordVideo.size`.** A 540x960
   viewport recorded at 1080x1920 lands in the top-left corner with flat grey
   `(128,128,128)` filling the rest, and `deviceScaleFactor` does not change it —
   the screencast captures CSS pixels. Record at a true 1080x1920 viewport.

2. **`html{zoom:2}` gets phone proportions back at full resolution, but media
   queries still see 1080px.** Fine for a mobile-first app (Big Boy Subs); a site
   with desktop breakpoints (MODERN_STREET) renders its desktop layout. That is
   what `mobile` mode is for: a real 540x960 viewport, upscaled with lanczos at
   compose time. Slightly softer, correct layout.

3. **Captions must be placed from recorded beat times, not guessed offsets.**
   `capture.mjs` timestamps each beat into `beats.json` and holds it still;
   `compose.sh` builds the overlay graph from that file. Guessed offsets put
   "Merch that sells itself" over the menu screen, because a tap landed later
   than assumed.

## Verifying

Rendering is not verification — look at frames. Sample the caption strip at its
left/right margins (`x=100` / `x=990`), never mid-strip: the caption text is
white, so a centre sample reads as white and looks like a missing overlay. The
strip's alpha bbox from the PNG gives the exact band.

## Dynamic cut (`compose-dynamic.py`)

The second-generation cut. `make-layers.py` renders the title and end card as
separate RGBA layers; `compose-dynamic.py` animates each one with ffmpeg
overlay expressions (slide, rise, a rule that draws itself, a slow push-in),
joins the segments with real `xfade` transitions (swipe in, fade-to-black
out), and mixes an optional voice-over over music that ducks under it via
`sidechaincompress`, then loudness-normalises.

```bash
python3 make-layers.py
python3 compose-dynamic.py raw-bbs assets/bbs bbs big-boy-subs-dynamic.mp4 \
    audio/building-the-future.wav audio/vo-brian-bbs.mp3
```

Two more traps it carries:
- **Playwright starts recording before the script's clock**, so the webm is
  longer than `beats.total` and its first ~2 s are the page loading un-zoomed.
  The script measures that lead-in from the file and skips it.
- **In a filtergraph, `[v]` is a stream specifier, not a label**, and one pad
  cannot feed two filters — name labels distinctly and `asplit`. The ducker
  ends when its shorter sidechain ends, so `apad` the voice-over to full length
  or the clip is silently truncated.

## The three-product reel (`compose-reel.py`)

Title → phone app → two dashboards → end card, ~31 s, one voice-over across
all of it. `make-reel-assets.py` renders the title layers, the band captions
and the panel background, and the tech-stack still (`tech-stack-promo.png`).

```bash
HOLD=2800 node capture.mjs big-boy-subs raw-bbs2
HOLD=3000 node capture.mjs finsight raw-fin tablet
HOLD=3000 node capture.mjs stack-planner raw-stack tablet
python3 make-reel-assets.py && python3 compose-reel.py
```

**Dashboards must be recorded at 760 px wide (`tablet` mode), not desktop.**
A 1200 px desktop layout scaled into a 1080-wide phone frame leaves the type a
few pixels tall — it read as a thumbnail. At 760 the grids and charts survive
and the 1.42x scale keeps the numbers legible; at 540 the KPI tiles stack into
a single column and stop looking like a dashboard. Each product segment is a
window of its recording, sped up 1.3–1.5x, framed on the slate-to-ink panel
background with a caption in the band underneath.

Each segment in `compose-reel.py` also carries a **start offset** into its
recording. The Big Boy Subs window starts at the menu, not the hero, so the
9 s reaches the merch screen the narration mentions — the title card already
sets the scene. When a voice-over names something, the window must show it;
shift the window before re-recording the voice.

## The "drive" template (`compose-drive.py`)

The punchier single-product cut Otis asked for after keeping the reel:
word-by-word title with a band that sweeps in, a white flash into the
footage, a corner tag and a top progress bar, a small zoom punch on each beat,
captions and feature chips that pop with a spring, and an end card that pops.
Music: Adobe Stock 449240428 "In Your Blood" (licensed, free tier).

```bash
python3 make-drive-assets.py
python3 compose-drive.py raw-bbs bbs big-boy-subs-drive.mp4 audio/in-your-blood.wav 1.25
python3 compose-drive.py raw-ms  ms  modern-street-drive.mp4 audio/in-your-blood.wav 1.2
```

**How the pops work, and why.** ffmpeg cannot scale an overlay per frame and
keep its alpha, so anything that pops is rendered by PIL as an 14–22 frame
PNG sequence (scale 0.72 → overshoot → 1, alpha 0 → 1), fed with
`-framerate 30 -i name_%03d.png`, time-shifted with `setpts=PTS+start/TB`,
gated with `enable=between(...)` and `eof_action=pass`, then the static
frame takes over. Without the `enable` gate the sequence's first frame can
show early; without `eof_action=pass` its last frame repeats forever.
Rendering is slow (~2 min a clip): every chip is two more inputs.

## The Clipkit sizzle (`clipkit/meridian-sizzle.json`, `sound-design.py`)

Otis's brief: dark navy, glowing blue/violet, a wireframe that assembles and
snaps into a finished site, a dashboard animating up, CRM cards sliding in,
code flying in and resolving to UI, the wordmark pulsing. Authored as one
Clipkit JSON (no footage) — project `1dbefc73-fa7a-462c-89fb-0c371af00d44`,
editor: https://www.clipkit.dev/public-editor?id=1dbefc73-fa7a-462c-89fb-0c371af00d44
Music in the project: Adobe Stock 513024064 (looped). The full sound design
(clicks per wireframe line, chimes on snaps, risers, bass swell, hit) cannot
be hosted for Clipkit from this sandbox, so `sound-design.py` builds it
locally as `reel-sound-design.wav`, cue-for-cue against the element times;
mux it under the exported picture:

```bash
ffmpeg -i clipkit-export.mp4 -i reel-sound-design.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest meridian-sizzle.mp4
```

Clipkit rules that bit: row keys `t`, `c`, `r` are reserved (time and
expression names) — use `txt`, `col`, `row`; children of a group with
`time: 0` take absolute times; keep every scene as a group whose opacity
track fades it in/out; blur on ≤3 elements, one particle emitter.
