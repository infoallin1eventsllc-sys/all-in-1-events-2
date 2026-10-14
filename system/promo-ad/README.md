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

## The commercial cut of the website ad (14 Oct)

The services-page brand ad (`public/video/meridian-brand-ad.mp4`, 12 s, original
voice and music untouched) with contact details added: a corner strip
(meridianinterface.com · 281-882-9198) 0.8–9.3 s, and under the logo from 9.9 s
the appointment button, site, phone and email; the last frame holds 3 s more
(the original audio has faded by then). Overlays: `node commercial-overlays.mjs
<folder>` (needs `commercial-overlays.html` as `overlays.html`, `fonts/`,
`img/meridian-mark.png`), then:

    ffmpeg -i meridian-brand-ad.mp4 -loop 1 -framerate 24 -t 15.1 -i ov-lower.png -loop 1 -framerate 24 -t 15.1 -i ov-end.png \
      -filter_complex "[0:v]tpad=stop_mode=clone:stop_duration=3[base];[1:v]format=rgba,fade=t=in:st=0.8:d=0.4:alpha=1,fade=t=out:st=8.9:d=0.4:alpha=1[lo];[2:v]format=rgba,fade=t=in:st=9.9:d=0.6:alpha=1[en];[base][lo]overlay=0:0:shortest=0[v1];[v1][en]overlay=0:0,trim=0:15.06,format=yuv420p[v];[0:a]apad=pad_dur=3,atrim=0:15.06[a]" \
      -map "[v]" -map "[a]" -c:v libx264 -crf 18 -c:a aac -b:a 192k -movflags +faststart meridian-commercial-wide.mp4
