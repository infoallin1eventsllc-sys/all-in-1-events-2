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

## Version 2: over Otis's background film (15 Oct)

Background: his Higgsfield clip `hf_20261007_010907_7a0a3c5a…_1.mp4` (5 s, HEVC
10-bit; dark grid floor, a glowing frame that draws itself). Not in git; ask Otis
for it. Built into 21 s: the clip once (0-5 s, the frame draws behind the hook),
then 2.6-5.0 s played forward and back four times; `fps=30`, then per format
`scale/crop` + `drawbox=...:color=0x0b1222@0.42:t=fill` (do NOT tint with a
`color` source and `overlay=shortest=1`: that cut the track to 20.7-20.9 s).

The ad page renders transparent with `ad.html?clear=1` (no navy, no grid; a soft
navy pool and text shadow behind the hook, the promises and the end card so they
read over the bright frame). `node render-clear.mjs <folder> <name> <w> <h>`
writes PNG frames with alpha; then

    ffmpeg -i bg-<name>.mp4 -framerate 30 -i cframes-<name>/%04d.png \
      -filter_complex "[0:v][1:v]overlay=0:0:eof_action=pass,trim=0:21,format=yuv420p" \
      -c:v libx264 -crf 18 -movflags +faststart meridian-promo-<name>-silent.mp4

and mux the -14 LUFS score as before. Email: GIF 440px, 7 fps, 72 colours
(~2.2 MB); poster `node poster2.mjs <folder>` (needs poster-base.png, a 1200px
frame at 6.9 s, beside poster2.html; a page opened with setContent cannot read
local files).
