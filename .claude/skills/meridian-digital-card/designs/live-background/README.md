# Live card background (experiment, 24 Nov 2026)

`preview.html` (needs `ribbon.jpg` and `mark.png` beside it) shows Otis's card, layout 1, with a moving background:

- **Live ribbon:** layered blue bands with lime and cyan glow lines, drawn on a canvas every frame. They drift on their own, rise toward the pointer or finger, and a tap on the background sends a ripple. Free: no generated art, no video file.
- **Living photo:** the owned ribbon.jpg with slight parallax that follows the finger and a soft light passing along it.
- **Today's card:** the still version, for comparison.

Respects reduced motion. Preview only, shared with Otis as a private artifact; not on the website. To ship: move the canvas into build_card.py as an optional background, keep the top 55 percent calm for text, run meridian-prelaunch-qa, and get Otis's OK.
