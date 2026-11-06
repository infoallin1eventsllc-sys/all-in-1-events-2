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

## Presenter 1 version (5 Nov 2026)

Same ad with a fictional presenter in place of Otis's likeness (late 40s,
salt-and-pepper beard, glasses, navy suit). Finished file: Higgsfield media
`024c2497-ffe2-4267-bc76-d094af1f8e87`. The original stays at `ad2a5319-...`.

Stills (gpt_image_2_6, medium 2K, edits of the originals): wide
`8bab3950-a79f-43f7-8832-abdb6bcef92f`, close `661214ae-ef7e-4ddc-a5b5-9f8d3c755a5f`.
Clips (minimax_h3, 9:16, 5 s, original prompts): c1 `32175b7b-5618-4cfb-b47c-f8a86d089c3e`,
c2 `b5f0d300-4d6c-468d-9e3f-ca040e49ba89`, c3 `72fae113-6b50-4f23-9e1b-33434c7bfc62`.
Rebuilt with the steps above unchanged (fresh screen captures of the live site);
-16.4 LUFS. Cost: 33 credits (2 previews, 1 close-up, 3 clips at 10).
End card without "Houston, TX" (5 Nov): Higgsfield media
`1291358f-810d-436e-a5d5-eb961a586fc1`; `panel.html` now ends the contact line
at the phone number. Re-render only (`render.mjs` + `final.sh`), no credits.

## Social formats (6 Nov 2026)

`formats.sh` builds four shapes from one render (skill: meridian-social-video).
Presenter 1 version, no Houston, TX, captions off over the full-frame reel:
- 9:16 Reels/TikTok/Shorts `d44f54b8-47dc-45b2-a06d-c29254f8b869`
- 4:5 Instagram/Facebook feed `a49b62bd-89e6-49ec-9690-55b8fc84e89a`
- 1:1 square `273b8f55-9a97-4b4d-9d53-e08d2abee6a7`
- 16:9 YouTube/LinkedIn/X/web `1fb69f82-b0b3-474c-9991-effd2ee78718`
(`e8091a44-...` is an empty upload slot from a failed PUT; ignore it.)
