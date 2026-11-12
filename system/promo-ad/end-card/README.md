# Meridian end card: the logo light-up

Otis's standard ending for every Meridian video (he chose it on 12 Nov 2026). It comes
from the end of his Agent CRM "Back to your weekend" ad (sent in chat, 18.7 s, 1080x1920,
30 fps): the screen fades to navy, the M lights up with a blue glow and a light streak,
"MERIDIAN INTERFACE" appears under it, then a product line and the website button.

- `meridian-logo-lightup-9x16.mp4`: the logo part only, 2.53 s. Source 14.80-15.75 s,
  then the last clean frame held 1.55 s; the audio fades out. Use this at the end of
  every ad, and put that ad's own product line under it.
- `reference-agent-crm-ending-9x16.mp4`: the full ending from 14.8 s (3.9 s), kept as
  the reference for the product-line layout: product name (bold, white), one or two
  short lines (grey), and a blue "meridianinterface.com" pill.

The mark is Otis's own artwork: never redraw or recolour it. For the 4:5, 1:1 and 16:9
cuts, lay the clip on matching navy rather than cropping the logo.

## Use the clean ending (12 Nov 2026)

Otis heard "an error and a glitch in the ending" of the agents video. Three causes, all from
dropping the raw cut into another film:

1. **Sound.** The raw cut's audio is the tail of the Agent CRM ad's soundtrack. Mixed under
   another score it is a chopped scrap of someone else's music. Never use it.
2. **Picture.** Its first six frames still carry the fading pool footage, and the logo is
   already lighting up on frame one, so it started glowing while the wipe was still moving.
3. **Timing.** The score's final hit sat 0.1 s after a kick (a flam). Put the hit on the beat grid.

`build_clean_ending.py <work_dir> [seconds]` makes `meridian-logo-ending-clean-9x16.mp4`
(silent) and `meridian-ending-plate-9x16.png`: 0.4 s of clean navy for the transition to land
on, the logo fades in, his light-up plays through a soft mask over the clean plate, and it
settles to the fully faded logo. His logo and its light are untouched; only the ground around
them is cleaned. **Use this file, not the raw cut, for every ending.** Put the text layer in
from 2.0 s. Score the ending in the video's own music: a soft hit as the logo arrives, a held
chord, a long fade. Also: ffmpeg's `alimiter` threw a full-scale spike on a kick; use a fixed
gain to -14 LUFS and check the encoded peak instead.
