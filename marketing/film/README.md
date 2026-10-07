# Secrets of Cint: 15-second monochrome product film (9:16, 24fps)

- **Watch, edit and export (free, in the browser):** https://www.clipkit.dev/public-editor?id=8ddbc285-b4cf-42a1-93ee-eb372fe2ec5d
- **Built from the client's real products.** The candles were cut out of the real photos (`cutouts/`, background removal with rembg) and converted to true grayscale at the source, so no color can slip into any frame.
- **All lettering is typeset in the editor** (Cormorant Garamond Light and Jost Light), never drawn by AI. The end card uses the brand logo itself: `cutouts/logo-on-black.png`, made from the 480px `assets/images/logo.jpg`. A vector logo from the client would make it sharper; see `ai-video-prompts.md` for the logo rules.
- Note: the Clipkit runtime draws a white-on-transparent RGBA logo as a solid white box, so the logo is a white-on-black RGB plate with `blend_mode: screen` instead.

## Shot list
| Time | Beat |
|---|---|
| 0.0–0.45 | Total darkness |
| 0.45–0.6 | The scratch: a bright streak draws itself along the striker, spitting grit |
| 0.6–0.7 | Ignition: a hot white core blooms, a brief exposure kick lifts the whole frame, the candle catches with a hard jump of light |
| 0.6–2.85 | Three shockwave rings race outward, each larger and slower than the last, the final one dying at 2.85s; an anamorphic streak and a wide soft wash spread the light; 260 sparks, 700 pieces of spinning glitter that rise and fall, and a slow glitter rain across the frame that runs to 6.3s; embers drift and settle; a gentle twinkle of sparkles drifts across the whole film to 14.6s, through the logo card |
| 2.4–4.6 | A puff of smoke, then the camera slowly pulls back from the extreme close-up as the flame takes hold; a silver light sweep crosses the label |
| 4.3–7.4 | **EXOTIC PEACH** (the matte black vessel) on a polished black surface with a reflection. Slow drift and push-in, light sweep across the label. |
| 6.6–9.7 | **BREWED ELIXIR**, with the same treatment and a slow pull-back |
| 8.9–12.0 | **INFERNO DREAMS**, lit, with a flickering glow and rising smoke |
| 10.9–13.6 | All three together in soft, low-key light; the flame glows |
| 12.8–15.0 | Fade to black. The **Secrets of Cint** logo (the script mark, as a white plate on black, screen-blended) fades in with a soft blur-in, then a fine rule and **A NEW LIFE CANDLE EXPERIENCE** |

All transitions are long dissolves with gentle ease-in-out. There are no fast cuts.
Finish: vignette, fine film grain, deep blacks and luminous whites.

## Sound
- `score-ambient-piano.mp3`: ElevenLabs Music, 16s of sparse felt piano over a low pad. No vocals (checked by transcription). **Not used in the current cut**: the film has no music; the bell tree is the score.
- **Fairy Dust (bell tree)**: the licensed "Fairy Dust" sample from Silverplatter Audio (silverplatteraudio.com/products/fairy-dust, $1.99, royalty-free, order #L3E306TE8, 2026-10-05, bought by Otis Williams). Its attack lands on the ignition at 0.6s and its 14.6-second natural ring carries the whole film, fading with the picture at the end. There is no other music. The WAV is **not** in this repository (the licence covers use in productions, not redistribution): it lives with the agency's project files and is `.gitignore`d here. The rendered film in `assets/video/` is the deliverable.
- `sfx-glitter-shimmer.mp3`: ElevenLabs SFX, a twinkling glitter shimmer. Stands in for Fairy Dust in the public Clipkit editor project, which cannot hold the licensed file.
- `sfx-match-strike-v2.mp3`: ElevenLabs SFX, scratch, flare and crackling embers, at 0.45s; `sfx-match-strike.mp3` (the original strike) sits under it at 0.5s, quieter, for body.

## Export
- **9:16, 1080×1920:** use the editor's free in-browser export.
- **4K or 16:9:** use Clipkit's cloud render (needs a free account; 4K is a paid render). For 16:9, change the canvas size in the editor.

## The Higgsfield cut (2026-10-07)
A second version of the same 15 seconds, shot with Higgsfield (Seedance 2.5, 720p, 9:16, 5 s per shot) from the client's real product photos instead of cut-outs. Each product shot starts on the actual photograph (`higgsfield/start-*.jpg`: the real photo, converted to grayscale and cover-cropped to 1080×1920), so the vessel and label are the real product and the lettering is the label's own, not drawn by AI. The prompts are the Cut B prompts from `ai-video-prompts.md`, with the style lock.

| Time | Shot | Source |
|---|---|---|
| 0.0–3.0 | The strike: the match scrapes, sparks burst in slow motion, the flame settles and lights a small candle in a dark glass vessel | job `ac6db511` (text-to-video), clip 0.6–4.0 s |
| 3.0–6.3 | **EXOTIC PEACH**: slow push-in and arc, a silver light sweep across the glass and label, a ribbon of smoke | job `51086d65`, clip 0–3.7 s |
| 6.3–9.6 | **BREWED ELIXIR**: the two wicks ignite one after the other, light blooms over the wax and the coffee beans | job `a64c70f4`, clip 0.5–4.2 s |
| 9.6–12.9 | **INFERNO DREAMS**: the flame sways, the camera pulls back, the light dims to black | job `1b6f62a9`, clip 1.3–5.0 s |
| 12.9–15.0 | The **Secrets of Cint** logo (`cutouts/logo-on-black.png`) fades in over black with a slow 3% grow, then fades out | built in ffmpeg |

Every join is a 0.4 s dissolve; every frame is forced to true grayscale with a touch more contrast. Four generations cost 140 credits.

- **Master:** `higgsfield/master.mp4` (1080×1920, 24 fps, 15.0 s, H.264 crf 12, 17 MB), also in the agency's Higgsfield library as `secrets-of-cint-hero-film-master.mp4` (media id `afa4640e-1bc7-484c-84b3-6c7354a1ff7c`). It was assembled in the Higgsfield sandbox, which is where the shots could be fetched, and brought into the repo by the `Fetch media into the repo` workflow (`.github/workflows/fetch-media.yml`, dispatched with the file's URL) because the cloud session's network policy blocks Higgsfield's download hosts. Its own audio track is only a **preview mix** from the repo's SFX; the website files carry the licensed soundtrack.
- **This cut is live on the website** (since 2026-10-07): `sh marketing/film/higgsfield/finish.sh higgsfield/master.mp4 <mix.wav>` wrote `assets/video/hero-film.mp4` (1.28 MB), `hero-film.webm` (1.12 MB) and `hero-film-poster.jpg`, with the agency's licensed mix (match strikes + Fairy Dust at 0.6 s) replacing the preview audio. To go back to the Clipkit cut, re-run `encode.sh` from the Clipkit frames.

## Generating real camera footage later
See `ai-video-prompts.md` for ready-to-paste text-to-video prompts. They're written for Veo, Kling, Runway or Sora, and follow these rules: strictly monochrome, slow motion language only, and no lettering in the AI footage. The Higgsfield cut above is the first use of them.
