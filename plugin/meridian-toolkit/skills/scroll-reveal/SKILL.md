---
name: scroll-reveal
description: "The hero where scrolling drives a transformation — an empty venue dressing itself, a house building itself, a bare product assembling. Load it whenever a landing page needs a hero that earns attention, whenever a request mentions scroll-triggered, scrollytelling, scroll animation or a timelapse on a site, and whenever a video is about to be used as a hero. It holds: the one rule that decides whether a generated clip is safe to use here or will wreck the brand; the three sources of frames ranked by control; the exact Higgsfield/Seedance call that anchors a transformation on a real photo of the finished state, and the tempting parameter that fails; why scrubbing an MP4 breaks on mobile Safari and what to do instead; the frame-conversion command; the proven scrub implementation with the four things that stop it stuttering; the measured weight budget; and recipes for All in 1 Events and client work. Use it before building any scroll-driven hero and before putting a video on a landing page. Skip it for app surfaces, dashboards and anything behind a login."
---

# Scroll as the playhead

The user scrolls; a transformation plays. Done right this is the most
attention-holding hero on the open web and it costs less than a video.
`cinematic-web` ranks hero media and holds the surrounding craft — grade,
grain, depth, load choreography. This skill is the pipeline.

## The rule that decides everything

**Generation is excellent at process. It is bad at identity.**

| Safe to generate | Never generate |
|---|---|
| A room filling with light and furniture | A logo or wordmark |
| A house assembling from foundations | Any lettering at all |
| Fabric, smoke, water, weather, crowds | A specific product someone can compare |
| Seasons, day to night, empty to full | A real person's face |

A construction timelapse works because **nothing in frame has to match
something real**. The moment the shot contains type or a product with an exact
identity, a model will invent a near-miss — this is what produced a 420 Friendly
mockup reading FOUR HUNDRED FRIENDLY. If identity is in frame, render or
photograph it instead. Do not prompt harder; the category will not bend.

## Three sources of frames, ranked by control

1. **Rendered from 3D** — total control, exact brand hexes, repeatable.
   `design/lounge-set-04/` in `all-in-1-events-2` is the worked example, and
   `img2threejs` covers building the scene.
2. **Generated transformation** — fast, no modelling, only when the rule above
   allows it.
3. **Real footage on a locked-off tripod** — honest, but needs the shoot.

## Generating the transformation

Via **Higgsfield**, which is connected. The finished state is the one that has
to be right, so **anchor on it**: pass the photo of the finished setup as the
**`end_image`** and prompt for the process that arrives there. The model
generates toward your real photo, so the last frame is guaranteed to be
something you shot rather than something it invented.

| Model | Use |
|---|---|
| `seedance_2_5` | `mode: "omni_reference"`, finished photo as `end_image`, 4–30s, max 1080p |
| `seedance_2_0` | finished photo as `end_image`, `mode: "std"` for **4K** |

**Do not use `video_extension` for this.** Its `extension_mode: "backward"`
looks like the obvious fit and is not: it extends an existing *reference
video*, so it cannot start from a single photo. It is the right tool only once
you already have a clip and want more of it.

Confirm model ids with `models_explore` before spending — Higgsfield's
catalogue changes.

Set `generate_audio: false` — a hero is muted, and the audio is wasted spend.
Keep the camera locked: a moving camera plus a scrubbing playhead reads as
seasickness. Ask for the transformation only.

## Never scrub an MP4

The obvious implementation — a `<video>` whose `currentTime` follows scroll —
stutters badly on mobile Safari, which will not seek reliably frame by frame.
It lurches between keyframes. **Export to an image sequence and scrub that.**

```bash
mkdir -p web
for f in frames/f*.png; do
  ffmpeg -y -loglevel error -i "$f" -vf scale=1200:900 \
    -c:v libwebp -quality 74 -compression_level 6 "web/$(basename "$f" .png).webp"
done
```

40–60 frames is the working range. Fewer reads as a slideshow; more costs
weight without reading smoother.

## The scrub, with the four things that stop it stuttering

Reuse `design/lounge-set-04/index.html` rather than rewriting. What matters:

```js
// 1. decode() before paint — a half-decoded frame IS the stutter
if (img.decode) img.decode().then(done, function () { img.onload = done; });

// 2. cap devicePixelRatio at 2 — retina without the memory blowup
var dpr = Math.min(window.devicePixelRatio || 1, 2);

// 3. coalesce scroll into one rAF — never draw per scroll event
var queued = false;
function onScroll() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(function () { queued = false; draw(frameFor(progress())); });
}

// 4. bail out entirely when asked to
var conn = navigator.connection || {};
var still = matchMedia('(prefers-reduced-motion: reduce)').matches
  || conn.saveData === true
  || /(^|\W)(slow-)?2g$/.test(conn.effectiveType || '');
```

That last one is not optional. A request for reduced motion or less data is a
request **not to download 48 images** — show the final frame as a still and
stop. The page must be complete and make sense without a single frame loading.

Draw with `ctx.getContext('2d', { alpha: false })` and cover-fit the frame:
`s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight)`.

## Budget — measured, not estimated

`design/lounge-set-04/`, 48 frames at 1200x900:

| | |
|---|---|
| Total WebP | 605 KB |
| Largest single frame | 14.1 KB |
| Page itself | 16 KB |

Under `cinematic-web`'s 1 MB above-the-fold cap with room to spare. Load the
first frame eagerly, the next few on idle, the rest as the user approaches.
Never commit frames to git — they regenerate.

## Recipes

- **All in 1 Events** — bare room, house lights up, folded tables. Scroll and
  the event assembles: uplighting, lounge set, drape, dance floor, photo booth.
  A photo of a real finished setup is the `end_image`.
- **A venue or wedding client** — empty hall to full reception.
- **A construction or trades client** — the original: finished build backwards
  to foundations.
- **A product** — exploded parts assembling. Only if the product is generic;
  if it is the client's actual SKU, render or shoot it.

## Before shipping

Check it on a phone, on a throttled connection, and with reduced motion on.
Then run `awesome-design`'s squint test on the first and last frame — those two
carry the whole idea, and if they do not read, no amount of frames in between
will save it.
