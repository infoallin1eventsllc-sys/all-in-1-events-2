# Showcase backdrop (the Higgsfield glass panes)

The homepage hero is Otis's own Higgsfield clip (three aluminium-rimmed glass
panes, threads of light, a slow camera swing), untouched except for what shows
inside the three glass faces: the large pane shows meridianinterface.com, and
the phone and tablet panes scroll through all ten products, each rising into the
next. The 8 s clip plays forward then back, easing to a stop at each end, so the
18 s loop has no jump and no bounce.

Nothing in the clip is redrawn. Every pixel outside the glass faces is the
original frame; inside them, the original threads, their pulses and the sheen
are laid back over the screens, and the car interior that Higgsfield printed on
the glass is subtracted first so it does not ghost over the website.

Rebuild (after the site or a demo changes):

1. Serve the website build: `npx vite preview --port 4799` in meridian-interface-website.
2. Capture: `node tools/capture-scroll.mjs http://localhost:4799 shots`. For the home page
   (desktop) and every product (phone and tablet) it saves the page at full height with
   its pinned bars hidden, plus the pinned bars on their own (`-with/-without.png` and
   `-pin.json`); apps that scroll inside a panel are unrolled. Then
   `python clip/pins.py shots` builds each `-pin.png` layer.
3. Extract the clip's frames (the source mp4 is in Otis's Higgsfield history,
   `hf_20261007_021215_3cdc7ab7`): `ffmpeg -i clip.mp4 -pix_fmt rgb24 full/%03d.png`
4. The tracked faces are in `clip/track2.json` (locked to each pane's rim every frame)
   and their proportions in `clip/faces.json`; they only change if the clip does. To
   redo them: `track.py`, `post.py`, `faces.py`, `edgeon.py` (the tablet pane's
   edge-on frames), then `rimlock.py <dir> track2.json track3.json` and copy track3
   over track2. `anchorcheck.py` crops the frames anchored on a tracked corner: if
   the rim sits still in every crop, the screen will too.
5. `python clip/still.py <dir>` builds each pane's printed-glass picture.
6. Render: `python clip/composite2.py <dir> shots out` (frame numbers to preview a few;
   several copies with different frame lists to use every core). The loop is 438
   frames (18.25 s at 24 fps): the camera runs source frames 1-190 forward then back,
   easing to a stop at each end (in-between frames are blended from their neighbours
   by optical flow); the phone pane scrolls through six products and the tablet pane
   four, each rising into the next as one continuous scroll; the large pane scrolls
   down the home page and back. Output frame 0 is the poster.
7. Encode:
   `ffmpeg -framerate 24 -i out/%03d.png -c:v libx264 -preset veryslow -crf 21 -maxrate 3200k -bufsize 6400k -pix_fmt yuv420p -profile:v high -movflags +faststart -an hero-showcase.mp4`
   `ffmpeg -framerate 24 -i out/%03d.png -c:v libvpx-vp9 -b:v 2400k -tune-content screen -pass 1 -an -f null /dev/null` then `-pass 2 -row-mt 1 -cpu-used 1 hero-showcase.webm`
   Poster: `out/000.png` as webp, quality 84.

Needs Python with opencv-python-headless and numpy (OpenCV 5: the ECC mask
marks the target image). The earlier three.js rebuild (scene.html, tools/render.mjs,
tools/measure.mjs) is kept for reference; it was replaced because its panes did not
match the clip.
