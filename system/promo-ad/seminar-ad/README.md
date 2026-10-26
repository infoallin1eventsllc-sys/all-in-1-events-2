# Meridian seminar ad (23 Oct 2026)

37 s vertical ad: a generated likeness of Otis on a seminar stage presenting the
five products on the screen behind him (website, online store, booking system,
CRM, video ads), the leads reel v7 playing in a phone on the screen as "Video
Ads", then full-frame, then the end card. Narration by the Higgsfield seed_audio
voice "Desmond". Finished file: Otis's Higgsfield library, media
`ad2a5319-03a6-4eb2-8cd9-90bac82c22c9`.

Sources (Higgsfield jobs): stills `a93442f5-5a27-42b8-a115-c84cc6c27d30` (wide),
`b475d879-9765-42f6-bad9-c4e1aaa6ea1e` (close); clips `fc71f0f2-...` (wide,
speaking), `b1de4b86-...` (close, pointing), `ee80cc0e-...` (applause);
narration `2c2f4b62-b7ee-4e90-85e5-de17fb3425d0`. Full ids in
`samples/meridian-clip-preview/SEMINAR-AD.md` while that folder exists.

## Rebuild (in the Higgsfield sandbox; its result CDN is blocked from Claude's)

1. Download c1/c2/c3.mp4 and nar.wav from the job result URLs; the reel from
   `https://meridianinterface.com/video/share/meridian/leads-reel-v7.mp4`;
   the music bed from `/audio/share/meridian/bed.m4a`.
2. Fonts and logo: `fonts/hk.woff2`, `fonts/inter.woff2` (website
   `public/fonts/`), `img/lockup.png`, `img/mark.png` (`public/brand/`).
3. Screen captures: `node capture.mjs <dir>` (home, booking, Big Boy Subs store,
   Meridian CRM). The Book tab is the button whose text is "Book".
4. Words: transcribe nar.wav with faster-whisper (word timestamps) to
   `words.json`. `render.mjs` expects the script's 79 words; it renames word 28
   to "Interface", merges "meridianinterface" + ".com." into one caption, and
   shifts everything after 28.4 s by 3.2 s.
5. `node render.mjs <dir>` (panel and caption frames, 1110 PNGs), `bash segs.sh`,
   `BED=-15 bash final.sh`. Result -16.4 LUFS, peak about -3 dBFS.

Traps: the xfade chain needs each input padded (`tpad`), or the video stops
early; `alimiter level=true` pushed peaks over 0 dBFS once, keep `level=false`.
