# 420 Friendly — brand film

Deterministic 7.7s spot. Frames rendered headless from `sting.html`, encoded
with ffmpeg. Same input, same 231 frames, every run.

## Calibrated against the reference Otis supplied

He sent an AirPods Pro clip as the quality target. Probed, it is a **screen
recording of Apple's product page**, not the product film:

| | Reference | This spot |
|---|---|---|
| Resolution | 2850 x 1598 | 3840 x 2160 master |
| Frame rate | 30 fps | 30 fps |
| Duration | 7.70 s | 7.70 s |
| Bitrate | 700 kbps | 1.11 Mbps at 4K, 262 kbps at 1080p |
| Size | 0.65 MB | 1.02 MB at 4K, 246 KB at 1080p |

**It is not 4K.** The quality is not coming from resolution or bitrate. What
the reference actually does, and what this copies:

- Pure `#000` ground. No gradient, no coloured pool, no floor wash.
- The object is described by **rim highlights**, not fill light.
- The object is allowed to **dissolve to almost nothing**, to about 9% here.
- A headline then takes the frame in the clear, in its own band.
- No letterbox bars, no visible grain, no heavy vignette.

The first cut had a green light pool, a floor gradient, 2.39:1 bars and 20%
grain. That is music-video language. Apple's is product language: darker,
cleaner, braver. Grain is now 4.5% and the bars are gone.

## Build

```
npm install playwright @fontsource/anton @fontsource/archivo
node film.mjs probe          # 3 frames, for iterating
node film.mjs                # all 231 at 3840x2160

ffmpeg -y -framerate 30 -i film/f%04d.png \
  -c:v libx264 -preset slow -crf 15 -pix_fmt yuv420p -movflags +faststart out-4k.mp4
```

Remote sessions: chromium lives at `/opt/pw-browsers/chromium-<build>/chrome-linux/chrome`,
Google Fonts is blocked so the faces are loaded from `node_modules/@fontsource/*`,
and the frames are captured at viewport 1920x1080 with `deviceScaleFactor: 2`.

## Timeline

| Beat | Window | What |
|---|---|---|
| Assemble | 0.30–2.55 s | Leaf settles, numerals rise, bar opens from the centre |
| Specular | 2.55–3.85 s | One light pass, masked through the glyphs |
| Recede | 4.10–5.35 s | Mark drops to 9% and lifts clear of the type band |
| Line | 4.75–5.95 s | "Everybody's invited." takes the frame |

`renderFrame(p)` takes p in 0–1 and sets every property from it. No CSS
animation and no rAF anywhere, which is what makes the render repeatable.

## Known limits

The mark is type and vector, lit with CSS. It is not a 3D render and there is
no garment in frame. A spot showing the actual hoodie needs either real
photography or a modelled garment, which is a longer job — see the
`cinematic-web` skill for that ranking.
