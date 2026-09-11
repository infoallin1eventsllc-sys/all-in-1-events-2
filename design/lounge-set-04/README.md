# Lounge Set 04 — rendered set walkaround

The Apple pipeline applied to All in 1 Events content: model the set at true
scale, render a camera move to frames, scrub the frames on scroll. See the
`cinematic-web` skill for why this beats a generated clip for a hero.

Published: https://claude.ai/code/artifact/edb7a13b-b015-4a65-87c2-92f30be2b181

## Files

| File | What it is |
|---|---|
| `scene.html` | The set, in Three.js. 1 unit = 1 metre, brand hexes only. Exposes `window.renderFrame(t)` where `t` is 0–1 along the camera move. |
| `shoot.mjs` | Headless renderer. Serves `scene.html` over localhost (ES modules are CORS-blocked on `file://`), steps the camera, screenshots each frame. |
| `index.html` | The page. Scroll-scrub canvas, grade/grain/vignette in CSS, weight receipts. |

Frames are **not committed** — they regenerate from `scene.html` and would be
20 MB of PNG in history. Regenerate with:

```
npm install playwright three          # PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 in a remote session
node shoot.mjs                        # writes frames/f000.png … f047.png
for f in frames/f*.png; do
  ffmpeg -y -loglevel error -i "$f" -vf scale=1200:900 \
    -c:v libwebp -quality 74 -compression_level 6 "web/$(basename "$f" .png).webp"
done
```

In a remote session `shoot.mjs` needs the real chromium path
(`/opt/pw-browsers/chromium-<build>/chrome-linux/chrome`) and the swiftshader
flags already in the file — there is no GPU.

## Measured

| | |
|---|---|
| Frames | 48 |
| Total WebP | 619,330 bytes (605 KB) |
| Largest frame | 14.1 KB |
| Page | 16 KB |
| Budget for a hero sequence | 1.5 MB |

Under budget by 60%. The numbers printed on the page are these numbers; if the
render changes, re-measure and update both.

## Honest limits

A blocking render, not photoreal: procedural geometry, no textures, no fabric
simulation. Accurate on layout, scale and lighting design, which is what a
client approves a set from. Photoreal is a longer job.

Lighting was tuned over three passes — the first was unreadable (bloom at 0.52
swallowed the geometry and mid-sequence frames rendered black). If you touch
the lights, re-probe three frames before re-rendering all 48.
