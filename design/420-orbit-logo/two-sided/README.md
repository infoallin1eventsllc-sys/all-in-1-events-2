# Two-sided orbit logo

The Higgsfield video has a plain silver back. This rebuilds the badge as a
real 3D object (Three.js) with the Higgsfield front on both faces, so a full
spin shows "420 FRIENDLY" front and back. No Higgsfield credits used.

- `prep.py` — takes frame 150 of `../Midnight-Orbit-420-Friendly.mp4`, builds
  the face texture (`face.jpg`) and traces the outline (`shape.json`).
- `badge.html` — the model: two logo plates back to back, green edges, a thin
  silver core between them. `window.__badge.draw(t)` renders any moment.
- `render3d.cjs` — renders the 5.6 s spin as transparent PNG frames. It reads
  Three.js from `../tour/node_modules/three` in the session it ran in; point
  it at any `three@0.181` install.
- `make-E.py`, `shoot-E.cjs` — home-page mockup and recording.
- `final-frame.png` — the frame it settles on.

The faces are the Higgsfield image with its lighting baked in. The edges and
the turn are real 3D. Preview only; nothing in `420-friendly/` uses it yet.
