# 420 Friendly — seed to logo

A 12.5 s coded animation proposed for the storefront landing page: the ground
opens, a seed drops in, it is watered, a plant grows and becomes the logo.
Preview only. Nothing in `420-friendly/` uses it yet.

- `grow.html` — the built, self-contained page (about 430 KB). Open it and press "Play with sound".
- `grow.src.html` — the source. Canvas 2D, every frame a pure function of time.
- `sound.py` → `sound.mp3` — the soundtrack, synthesized in code (numpy + scipy). No licensed audio.
- `build.py` — inlines the logo and sound into `grow.html`.
- `render.cjs`, `stills.cjs` — render MP4 previews and stills with Playwright + ffmpeg.

Open decisions before it ships: sound needs a tap (browsers block autoplay
audio), the logo lands at 9.4 s so it should play once per visitor with a
skip, and reduced-motion visitors get the finished logo only.
