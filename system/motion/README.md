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
