# Live card background (experiment, 24 Nov 2026)

`preview.html` (needs `ribbon.jpg` and `mark.png` beside it) shows Otis's card, layout 1, with a moving background:

- **Sunrise (default, added at Otis's request):** dawn sky over three layers of hills; the sun climbs for about 14 s and stops in clear sky below the round buttons (it hid behind them at first), then clouds and birds drift. Finger shifts the hills for depth; a tap sends a warm pulse of light. Pressing Sunrise replays it.
- **Live ribbon:** layered blue bands with lime and cyan glow lines, drawn on a canvas every frame. They drift on their own, rise toward the pointer or finger, and a tap on the background sends a ripple. Free: no generated art, no video file.
- **Living photo:** the owned ribbon.jpg with slight parallax that follows the finger and a soft light passing along it.
- **Today's card:** the still version, for comparison.

Respects reduced motion. Preview only, shared with Otis as a private artifact; not on the website. To ship: move the canvas into build_card.py as an optional background, keep the top 55 percent calm for text, run meridian-prelaunch-qa, and get Otis's OK.

## Realistic sunrise, still free (24 Nov 2026)
Otis asked for "more realistic, more amazing" at 1080 and chose to spend no credits (quotes he declined: 0.75 for a photo, 14 more for an 8 s video). The sunrise is now all code: stars fading at dawn, clouds from tileable noise textures tinted by the sun, three misty mountain ridges, a lake with a sun-glitter path, pine shoreline, vignette and fine grain. Sun climbs for 16 s and stops at 0.75 of the card height, between the round buttons (which sit near 0.69) and the ridge line. Tap sky = light pulse, tap lake = ripple.
Speed notes: a canvas blur filter and 3x device pixels halved the frame rate in testing; the canvas is capped at 2x and the cloud layer at 1.25x.

## Collection (24 Nov 2026)
The preview now has a theme picker fed by a `THEMES` list: Sunrise, Rocket launch, Sailing, Aurora, Dance party, Live ribbon, Living photo, Today's card. Each theme is `{id, name, canvas, draw(t, now), start?, tap?, hint}`. Product plan: `system/products/live-cards/PLAN.md`.
Trap: a tap's timestamp can be later than the frame's timestamp, so ages can be slightly negative; clamp before using them as a radius.
