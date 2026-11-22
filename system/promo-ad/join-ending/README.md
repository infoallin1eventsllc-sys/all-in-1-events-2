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
