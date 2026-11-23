# Meridian live logo

Otis's real mark (`.claude/skills/meridian-brand/assets/logo/meridian-mark.png`, 342 x 333) moved, never redrawn or recolored. It is split along its own centre line (columns 165 to 176); the halves are cut 2 px clear of the line, and when fully joined the untouched file is shown.

## Moving loop (`loop.html`, `render.cjs`)
6 s seamless loop, 30 fps: halves glide in and lock, the M turns slightly, a light runs down the centre line, a sheen crosses, then the halves part and the loop starts again.

    cp <mark.png> mark.png   # next to loop.html, plus plate.jpg (navy plate)
    NODE_PATH=/opt/node22/lib/node_modules node render.cjs 1080 1080 "mw=430" Meridian-Live-Logo-1x1.mp4
    # 9:16: 1080 1920 "mw=520&cy=0.45"   16:9: 1920 1080
    # email GIF: ffmpeg from the 1:1 at 200 px, 15 fps (about 480 KB)

## Interactive version (`interactive.html`)
Needs `mark.png` next to it. The M tilts toward the mouse or finger, the light follows along the centre line, the halves part slightly while hovered, and a tap or Enter replays the lock-in. Idle drift when nobody touches it; respects reduced motion. Preview link given to Otis 23 Nov 2026. Not on the website: that needs his OK and meridian-prelaunch-qa first.

Instagram profile pictures cannot move. Use the loop for the Facebook cover video, Reels, website and the email signature GIF.

## Ribbon Zipper, white (23 Nov 2026, after Otis turned down the blue version)
`ribbon-zipper.html` + `render-ribbon-zipper.cjs` (needs `mark.png` next to them). 8 s seamless loop on a white studio ground with a soft floor reflection. Each half is cut into one-pixel ribbons that ripple apart top first like silk, then lock back bottom first; a light climbs the centre line with the lock front, then a wash of light crosses the M and the glow fades back to rest.

    NODE_PATH=/opt/node22/lib/node_modules node render-ribbon-zipper.cjs 1080 1080 "mw=460" Meridian-Live-Logo-White-1x1.mp4
