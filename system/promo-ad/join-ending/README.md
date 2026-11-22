# Join a generated clip to the Meridian logo ending

Used for the Higgsfield "Wheatpaste Wall" video (22 Nov 2026). Otis wanted the whole generated
clip kept, then his ending, "one fluid" piece. Free; no generation.

What it does (9:16, 24 fps, the generated clip's own rate so its motion does not stutter):

1. `render-ending.cjs PAD N OUT`, run from the launch film folder: renders the film's ending alone
   (his logo clip from `endf/`, then "We put the future in your hands.", the free 1-on-1 button,
   meridianinterface.com and phone) with PAD seconds of the clip's plain navy first frame held
   first. Used `0.8 154 B2`.
2. `blend.cjs`: over the clip's last 43 frames the poster pushes in 9 percent and dims, and fades
   over 30 frames into that navy hold. The logo lights up only after the fade, so its words never
   sit on top of the clip's own text (the first try did, at 9.3 s: double "MERIDIAN INTERFACE").
3. Frames: A 0 to 199, blended 200 to 242, ending 30 to 153. Encode at 24 fps.
4. Sound: the clip's audio at -3.8 dB with a 1.25 s qsin fade from 8.875 s; the film mix from
   25.9 s, delayed 9.025 s so the voice lands with the logo, 0.9 s fade in; out at 14.5 s.
   Result -16.0 LUFS, peak -3.8 dBFS, 15.3 s.

Rule learned: fade into the ending's empty navy first, never straight onto the logo.

## Quiet ending (replaces the film ending for generated clips)

Otis: the film's ending brings its own music, so two songs clash. He asked for a new ending: his
logo coming in slowly with the appointment details, no music of its own.

- `quiet-ending.html` + `render-quiet-ending.cjs N OUT`: navy plate (first frame of his logo clip),
  his real `meridian-mark.png` easing in from 1.15 s to 3.15 s with a soft blue glow, live wordmark
  MERIDIAN (Hanken Grotesk 800) / INTERFACE (Inter), then "We put the future in your hands.", the
  free 1-on-1 button and meridianinterface.com · 281-882-9198. All text between y 300 and 1180.
  Needs hk.woff2, in.woff2, plate.jpg and mark.png next to it.
- `extend-music.py`: the generated clip's own music carries the ending by repeating one beat in
  the quiet gaps before hits (no clicks measured at the joins), and ends on the clip's own last hit.
- `blend.cjs` reads the quiet ending frames from `B3/`. Wheatpaste Wall result: 15.46 s, 24 fps,
  -16.1 LUFS, peak -3.8 dBFS.

## Other shapes (4:5, 1:1, 16:9)

`shapes.html` + `render-shapes.cjs "<query>" W H OUT` renders the whole 371-frame video per shape
(clip, push-in melt, quiet ending laid out for that shape; content centred vertically):
- 4:5 `mode=crop&cy=250` 1080 1350: straight crop, the poster fits.
- 1:1 and 16:9 `mode=card&card=960`: the clip is a busy wall with no plain ground and Otis does not
  want blurred sides, so it sits as a 540 x 960 rounded card on the navy plate; the card melts away
  and the ending fills the frame.
Needs `A/` (clip frames at 1080x1920, 24 fps) next to it. Encode at 24 fps with the extended music.
