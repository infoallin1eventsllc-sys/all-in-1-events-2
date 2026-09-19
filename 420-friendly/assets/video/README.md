# Launch video — two cuts

Both are built **entirely from real product photography**. No generated
garments, no models.

| File | Runtime | What it is |
|---|---|---|
| `420-motion-cut.mp4` | 34.3s · 1280×720 · 3.0 MB | More angles, more motion. Current. |
| `420-cinematic-cut.mp4` | 25.8s · 1280×720 · 2.6 MB | The cinematic pass. |
| `420-launch-preview.mp4` | 20.5s · 1280×720 · 2.6 MB | The first cut. Kept — Otis likes it. |

Rebuild with `build_motion_cut.py`, `build_cinematic_cut.py` or
`build_launch_preview.py` in `../../tools/`.

## The motion cut — what "more angles" can and cannot mean here

Every source photograph is a flat-lay shot from one fixed viewpoint. There is
no second camera position hiding in a flat image and no depth to recover, so a
literal new angle is not available at any price. What this cut does instead:

- **Perspective tilt.** A keystone warp leans the garment plane off-axis so a
  flat-lay reads as though the camera sat to one side. Under a dolly it is
  convincing — the "resting 3D tilt" the Raylight craft guide calls a signature.
- **Wide, medium and macro** pulled from the same frame: three different angles
  in every sense an edit cares about.
- **21 beats** against the cinematic cut's 8, most between 1.3s and 2.1s, so the
  cut carries the energy rather than the camera moves.
- **Whip pans** between sections — six frames of lateral smear, the one
  transition that reads as camera rather than software.
- **Speed ramp** on the climax: a slow drift, then the punch lands late and hard.

It is also the first cut to use **C1, C4, C6, H12, H13, P12, P14** — seven
pieces neither earlier version touched.

Run `PREVIEW=1 python3 build_motion_cut.py` to get one still per beat as a
contact sheet. Use it. A full render is about seven minutes and the preview is
two, and it caught three real faults before they cost a render.

### The trap specific to detail crops

A macro crop pasted over a blur of the **whole** photo shows its own rectangle,
because the content behind it does not match. `detail_ground()` blurs the *same
crop region* up to plate size instead, so the feathered edge has nothing to
contrast against. Where the subject does not fill the frame, the ground also
needs a much heavier blur (about 110 rather than 54) or the backdrop reads as a
second, ghostly garment behind the real one.

## What changed in the cinematic cut

The first cut put the **same slow push-in on every shot**. That is the move the
Raylight craft guide names outright: a camera that wobbles instead of deciding.
Everything else followed from fixing it.

| # | Shot | Camera | Pieces |
|---|---|---|---|
| 1 | Cold open | pull-back reveal, 1.85× → 1.0, ease-out-expo | emblem |
| 2 | Haze snapback | ambient drift + lateral, **linear** | snapback |
| 3 | Heather grey set | lateral track, constant zoom | H10 + P10 |
| 4 | Clean white set | **held** — layers move, camera does not | P4 + H8 |
| 5 | Crimson family | drift + **rack focus**, soft ground → sharp product | H5 + P5 + C3 + C5 |
| 6 | Midnight black set | held, then a late push onto the chest print | H11 + P11 |
| 7 | The signature | committed punch-in to 1.80×, ease-in-expo, bloom swell | H7 |
| 8 | End card | settle-in from 0.94× | emblem |

Also: **parallax** (ground and subject are separate layers moving at different
rates, so a push has depth rather than being a flat zoom), **motion blur** on
the fast moves by averaging sub-frames across each frame's own slice of time,
**gate weave** (sub-pixel drift, low-pass filtered), one **grade spine** —
teal shadows, warm highlights, gentle S-curve — with per-shot intensity instead
of eight unrelated looks, and a **2.39:1 letterbox** inside a 16:9 container so
it plays anywhere.

## Three traps this hit, in case the layout is ever changed

**Only the centre of the plate is visible.** The plate is 2048×1152 so the
camera has room to move, but at zoom 1.0 the frame shows only the middle
1280×720 — and the letterbox takes another 184px off the height. Lay subjects
out with `at(fx, fy)` in **frame** coordinates against a band of 1280×536, not
across the plate. The first render sliced every garment in half.

**A darkened ground under an undarkened tile reads as a rectangle.** The
backdrop is derived from the shot's own background so a feathered paste has no
seam — but only if their brightness matches. Keep `dark` near 1.0 and get the
mood from the vignette and grade instead.

**The emblem has to fit the band.** Sized against the full frame it overflows
the 2.39 bars and the wordmark gets cut.

## Relationship to the Raylight edit

Still not the Raylight project's own render. That one has to be exported from
the Raylight tab by hand — the connector exposes no video export, only stills
and filmstrips, and as of 18 Sep 2026 it also needs re-authorising.
