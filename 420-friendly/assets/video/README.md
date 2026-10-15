# Launch video — the lookbook cuts and the ad

All of it is built **entirely from real product photography**. No generated
garments, no models.

| File | Runtime | What it is |
|---|---|---|
| `420-ad-9x16.mp4` | 16.9s · 1080×1920 · 10.2 MB | **The consumer ad.** Vertical, for Reels / TikTok / Stories. |
| `420-ad-16x9.mp4` | 16.9s · 1280×720 · 4.5 MB | The same ad for the website and YouTube. |
| `420-motion-cut.mp4` | 34.3s · 1280×720 · 3.0 MB | The lookbook film. On the homepage and every product page. |
| `420-cinematic-cut.mp4` | 25.8s · 1280×720 · 2.6 MB | The cinematic pass. |
| `420-launch-preview.mp4` | 20.5s · 1280×720 · 2.6 MB | The first cut. Kept — Otis likes it. |

Rebuild with `build_ad_cut.py`, `build_motion_cut.py`, `build_cinematic_cut.py`
or `build_launch_preview.py` in `../../tools/`.

## The ad — how it differs from the lookbook, and why

The motion cut is a lookbook: it unfolds, it has room, it assumes someone
chose to watch. An ad is interrupting someone who was doing something else,
so it is built to a different set of rules:

| | Lookbook film | The ad |
|---|---|---|
| Format | 16:9 letterboxed | **9:16 first** — it is watched upright in a feed. 16:9 is the website copy. |
| Length | 34s | 17s (18s of beats, six 0.2s crossfades overlapping) |
| First second | slow pull-back | the mark is already landing and the line is readable by 0.5s |
| Argument | none — it shows | one beat on the spec: *450GSM loopwheel fleece*, because a number sells a $148 hoodie and "nice hoodie" does not |
| Price | none | **stated** — *Hoodies from $135*, *Headwear from $44*. It pre-qualifies the click. |
| Ending | the logo | an instruction: *Shop the Archive* |
| Cuts | 0.42s crossfades | 0.20s — an ad cuts, it does not drift |

Seven beats: hook (2.6s) → grey set → crimson family → black set (2.4s each)
→ the spec (2.6s) → headwear (2.0s) → the ask (3.6s, longest, because it is
the only frame that has to be *read*).

Every price and spec in the type is taken from `products.js`, so the ad
cannot promise what the store does not sell. There is no URL in the CTA
because the site has no custom domain yet — add one when there is.

Run `python3 tools/build_ad_cut.py --preview` first. One still per beat for
both formats in about a minute; the full render is several. The preview
caught the emblem colliding with the copy at 16:9 and a cap sitting on the
price line at 9:16 before either cost a render.

**Music.** Both files are silent. When a licensed track arrives, score them
with `tools/add_soundtrack.py` — the tool and the licensing note are in
`tools/README.md`.

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
