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
| 0.6–1.3 | A shockwave ring races outward; an anamorphic streak and a wide soft wash spread the light across the frame; 260 sparks (bright fast ones and a few large slow ones) with a rain of grit |
| 0.6–3.2 | Glowing embers drift up and settle for two seconds, a puff of smoke, then the camera slowly pulls back from the extreme close-up as the flame takes hold; a silver light sweep crosses the label |
| 4.3–7.4 | **EXOTIC PEACH** (the matte black vessel) on a polished black surface with a reflection. Slow drift and push-in, light sweep across the label. |
| 6.6–9.7 | **BREWED ELIXIR**, with the same treatment and a slow pull-back |
| 8.9–12.0 | **INFERNO DREAMS**, lit, with a flickering glow and rising smoke |
| 10.9–13.6 | All three together in soft, low-key light; the flame glows |
| 12.8–15.0 | Fade to black. The **Secrets of Cint** logo (the script mark, as a white plate on black, screen-blended) fades in with a soft blur-in, then a fine rule and **A NEW LIFE CANDLE EXPERIENCE** |

All transitions are long dissolves with gentle ease-in-out. There are no fast cuts.
Finish: vignette, fine film grain, deep blacks and luminous whites.

## Sound
- `score-ambient-piano.mp3`: ElevenLabs Music, 16s of sparse felt piano over a low pad. No vocals (checked by transcription).
- `sfx-match-strike-v2.mp3`: ElevenLabs SFX, scratch, flare and crackling embers, at 0.45s; `sfx-match-strike.mp3` (the original strike) sits under it at 0.5s, quieter, for body.

## Export
- **9:16, 1080×1920:** use the editor's free in-browser export.
- **4K or 16:9:** use Clipkit's cloud render (needs a free account; 4K is a paid render). For 16:9, change the canvas size in the editor.

## Generating real camera footage later
See `ai-video-prompts.md` for ready-to-paste text-to-video prompts. They're written for Veo, Kling, Runway or Sora once a paid video plan is available, and follow these rules: strictly monochrome, slow motion language only, and no lettering in the AI footage.
