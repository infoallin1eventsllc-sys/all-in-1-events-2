# Showcase backdrop (the Higgsfield glass panes)

The homepage hero is Otis's own Higgsfield clip (three aluminium-rimmed glass
panes, threads of light, a slow camera swing), untouched except for what shows
inside the three glass faces: the large pane shows meridianinterface.com, and
the phone and tablet panes cut through all ten products, one every 0.8 s. The
8 s clip is played forward then back, so the 16 s loop has no jump.

Nothing in the clip is redrawn. Every pixel outside the glass faces is the
original frame; inside them, the original threads, their pulses and the sheen
are laid back over the screens, and the car interior that Higgsfield printed on
the glass is subtracted first so it does not ghost over the website.

Rebuild (after the site or a demo changes):

1. Serve the website build: `npx vite preview --port 4799` in meridian-interface-website.
2. Capture: `node tools/capture.mjs http://localhost:4799 shots` (phone + tablet of
   every demo) and `node tools/site-capture.mjs http://localhost:4799 shots` (the
   home page at 1440x900, 1.333x, demo bar hidden; `site-poster.png` keeps the
   hero's still frame and is the one `faces.json` names under `_site`).
3. Extract the clip's frames (the source mp4 is in Otis's Higgsfield history,
   `hf_20261007_021215_3cdc7ab7`): `ffmpeg -i clip.mp4 -pix_fmt rgb24 full/%03d.png`
4. `clip/track2.json` already holds the tracked pane corners for this clip, and
   `clip/faces.json` the face proportions, so steps 5 and 6 only run again if the
   clip itself changes: `python clip/track.py <dir>`, `python clip/post.py <dir>`,
   `python clip/faces.py <dir>` (then set the corner radii by eye in faces.json), and
   `python clip/edgeon.py <dir>` for the tablet pane's last 68 frames, where it turns
   edge-on and the image tracker loses it: that one reads the face off the column profile.
5. `python clip/still.py <dir>` builds each pane's printed-glass picture.
6. Render: `python clip/composite.py <dir> shots out` (pass frame numbers to preview
   a few first; run several copies with different frame lists to use every core).
   Screens are drawn at 2x and shrunk with area averaging so small text stays crisp;
   `_glass` in faces.json is how much of the original glass shows through them.
7. Encode:
   `ffmpeg -framerate 24 -i out/%03d.png -c:v libx264 -preset veryslow -crf 22 -maxrate 2600k -bufsize 5200k -pix_fmt yuv420p -profile:v high -movflags +faststart -an hero-showcase.mp4`
   `ffmpeg -framerate 24 -i out/%03d.png -c:v libvpx-vp9 -b:v 1700k -pass 1 -an -f null /dev/null` then `-pass 2 -row-mt 1 hero-showcase.webm`
   The loop is rotated to open on source frame 149, which is also the poster (frame 000 of the output), so the still and the first video frame agree.

Needs Python with opencv-python-headless and numpy (OpenCV 5: the ECC mask
marks the target image). The earlier three.js rebuild (scene.html, tools/render.mjs,
tools/measure.mjs) is kept for reference; it was replaced because its panes did not
match the clip.
