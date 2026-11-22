# 420 Friendly — HQ walkthrough film (version 2)

Source for the 3 min 18 s narrated 3D walkthrough made for the board meeting.
`PACKAGE-READ-ME.txt` is the note that shipped with the delivered zip and
explains every file, the checks run and the licence findings.

## Not in this folder

The rendered videos are not committed: the master is 197 MB, over GitHub's
100 MB file limit, and renders rebuild from source. They were delivered to
Otis as `420-Friendly-HQ-Walkthrough.mp4` and `420-Friendly-HQ-Walkthrough-v2.zip`.

The original beat ("Chill Rap Beat" by Turning_Pages, Pixabay) is also left
out. Pixabay's licence does not allow passing the track on by itself, and this
repo deploys publicly. It is inside `audio/soundtrack-voice-and-beat.m4a` as
part of the mix.

## What is here

- `full.js` + `build.cjs` + `merch-patch.js` + `people-patch.js` → `v2.js`, the scene as rendered
- `v2.html`, `render-v2.mjs`, `assemble-v2.sh` — render and assembly
- `audio/` — the 12 narration clips (Higgsfield "Julian"; paid generations, keep), script, mixes
- `stills/` — hoodie samples, closing card, stills with people

Scripts hold absolute paths from the cloud session they ran in. Update them
before re-rendering.

The film describes a dispensary and is labelled a concept visualization.
Keep it apart from marketing for the clothing line.
