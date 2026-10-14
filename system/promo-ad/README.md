# Meridian Interface promo ad (14 Oct 2026)

A 21-second ad for social and email, made without paid generation: Otis's logo
and fonts, real screens from the portfolio, motion rendered frame by frame, and
an original synthesised score (no licence needed).

Scenes (times in `ad.html`): hook "Your business isn't a template." / four
products on real screens (Websites: Secrets of Cint, Dashboards: CarePulse,
CRM: Meridian CRM, Logos: Fog City Roasters) / montage / three promises / end
card with meridianinterface.com, 281-882-9198, otis@meridianinterface.com.
The site address stays on screen from the first product to the end card.

## Rebuild

1. Make a work folder with `ad.html`, `fonts/` (the website's
   `public/fonts/hanken-grotesk-var-latin.woff2`, `inter-var-latin.woff2`) and
   `img/` (`public/brand/meridian-mark.png` and the portfolio JPGs named in
   `PRODUCTS` / `MONTAGE` in `ad.html`).
2. Mockups: `node mock.mjs <folder> [times]`, then `bash sheet.sh <folder> <ffmpeg>`.
3. Frames per format: `node render.mjs <folder> square 1080 1080` (and
   `vertical 1080 1920`, `wide 1920 1080`); encode with
   `ffmpeg -framerate 30 -i frames-<name>/%04d.jpg -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart`.
4. Music: `python music.py out.wav` (numpy + scipy), then normalise
   `loudnorm=I=-14:TP=-1.5` and mux as AAC 192k.
5. Email: GIF from the wide cut (products + end card, 480px, 8 fps, ~2 MB);
   poster with a play button: `node poster.mjs <folder>`.

Playwright: `/opt/node22/lib/node_modules/playwright` in the cloud sandbox;
ffmpeg: `pip install imageio-ffmpeg`.
