---
name: remotion-video
description: "Render video from React code — load it whenever Otis needs an MP4 that does not exist yet: a brand sting, a product or merch reel from stills, a title card, an ad cut, a looping hero clip, an explainer, or the same video regenerated per client, per event or per drop. It holds: the minimal project scaffold; the two launch flags that are mandatory in a Claude Code sandbox and fail the render without them; why a missing ffmpeg does not matter; the deterministic frame rule that keeps output reproducible; the animation API worth knowing (spring, interpolate, Sequence, Audio, staticFile); the craft rules that separate a cinematic render from a slideshow; measured render cost at 4K; and the licence threshold that turns paid at four people. Use it before writing any video-generating code, before proposing a generation tool for a video Otis could render himself, and before promising a video from images. Skip it for editing existing footage, for live-action, and for a page hero where coded CSS motion already wins."
---

# Video from code

Remotion renders React to MP4: headless Chromium draws every frame, then
ffmpeg encodes them. It is the tool for video that **does not exist yet and
must be exact** — brand type, precise timing, repeatable output, the same cut
regenerated with different content.

It is not an editor. For trimming, captioning or cleaning real footage, reach
for Descript, Adobe or Clipkit. For directing a motion-design canvas by hand,
Raylight.

## The rule that makes it work

**Every visual property derives from the current frame.** No CSS animation, no
`requestAnimationFrame`, no `Date.now()`, no unseeded `Math.random()`. Frame 47
must look identical on every render, on every machine, forever — that is what
lets frames render out of order and in parallel.

If a value cannot be written as a function of `useCurrentFrame()`, it does not
belong in the composition.

## Scaffold

```bash
mkdir -p video/src && cd video
npm install remotion @remotion/cli react react-dom
```

`src/index.ts`
```ts
import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';
registerRoot(RemotionRoot);
```

`src/Root.tsx` — duration is in **frames**, so 150 at 30fps is 5.0s.
```tsx
import { Composition } from 'remotion';
import { Card } from './Card';

export const RemotionRoot: React.FC = () => (
  <Composition id="Card" component={Card}
    durationInFrames={150} fps={30} width={3840} height={2160}
    defaultProps={{ headline: 'Everybody is invited.' }} />
);
```

## The two flags — non-negotiable in a sandbox

```bash
npx remotion render src/index.ts Card out/card.mp4 \
  --browser-executable=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  --chrome-mode=chrome-for-testing \
  --concurrency=4
```

**`--chrome-mode=chrome-for-testing`.** Remotion defaults to `headless-shell`,
Chrome's old headless mode. The Chromium in Claude Code sandboxes has that mode
removed, and the render dies with *"Old Headless mode has been removed from the
Chrome binary"*. This flag is the fix. It is the single most likely reason a
first render fails.

**`--browser-executable`.** Without it Remotion downloads its own Chrome
Headless Shell through the egress proxy — slow, and often blocked. Point it at
the Chromium already on disk. Confirm the path first (`PLAYWRIGHT_BROWSERS_PATH`
is usually `/opt/pw-browsers`, and the version directory changes between
images). **Never run `playwright install`.**

## ffmpeg does not need to be installed

`ffmpeg` is frequently absent from a rebuilt container's PATH. It does not
matter: Remotion ships its own binaries at
`node_modules/@remotion/compositor-linux-x64-gnu/`. Both `ffmpeg` and `ffprobe`
live there — **use that `ffprobe` to verify output rather than trusting the
config**:

```bash
FF=node_modules/@remotion/compositor-linux-x64-gnu/ffprobe
"$FF" -v error -select_streams v:0 \
  -show_entries stream=width,height,r_frame_rate,nb_frames \
  -show_entries format=duration,bit_rate -of default=noprint_wrappers=1 out/card.mp4
```

This is a durability win over a hand-rolled Chromium+ffmpeg script, which
breaks the moment the container loses ffmpeg.

## The API worth knowing

| Need | Use |
|---|---|
| Current frame | `useCurrentFrame()` |
| fps, dimensions, length | `useVideoConfig()` |
| Linear ramp between values | `interpolate(frame, [0, 30], [0, 1])` |
| Natural motion | `spring({ frame, fps, config: { damping: 200, stiffness: 68 } })` |
| Stagger a beat | `spring({ frame: frame - 9, fps, ... })` |
| Scene on a timeline | `<Sequence from={60} durationInFrames={90}>` |
| Full-bleed layer | `<AbsoluteFill>` |
| Image / video / audio | `<Img>`, `<OffthreadVideo>`, `<Audio>` |
| A local asset | `staticFile('shot.png')` — file goes in `public/` |
| Clamp a ramp | `interpolate(..., { extrapolateRight: 'clamp' })` |

Use `<Img>` and `<OffthreadVideo>`, never a bare `<img>` or `<video>` — the
Remotion components make the renderer wait for the asset before capturing.

## Craft — what separates a render from a slideshow

Load `cinematic-web` and `taste` for the full argument. The parts that apply
every time:

- **Brand tokens come from `meridian-stack`**, never invented. On All in 1
  Events and Meridian the hexes are locked.
- **One slow push** across the whole shot — `scale(1 → 1.045)`. Nothing reads
  more expensive for less effort.
- **Grain and vignette** as inline SVG / gradients, so the render stays
  self-contained and fetches nothing.
- **Springs, not fixed easing**, for anything entering the frame.
- **Stagger beats** rather than moving everything at once.
- **Pure black grounds**, and let the subject fall off into it.
- **Timing as a fraction of total duration**, so a 7s and a 20s cut are the
  same film at different lengths — not the same film with dead air.

## Measured

`3840x2160`, 30fps, 150 frames, `--concurrency=4`: **48s, 1.5 MB, 2.4 Mbps.**
A working reference composition lives at `design/remotion/` in
`all-in-1-events-2`. 4K is cheap here; do not talk him down to 1080p on
cost grounds.

## Fonts

`system-ui` renders reliably and looks generic. Real brand faces need
`@remotion/google-fonts`, which **fetches from fonts.gstatic.com at render
time** — untested against the egress proxy, so treat it as a step that may
fail and say so rather than assuming. Self-hosting a woff2 in `public/` and
declaring `@font-face` avoids the network entirely and is the safer route for
anything shipping.

## Before promising a video from images

Remotion cannot see images pasted into chat. **Pasted images never reach the
filesystem; file attachments do.** Confirm the files exist on disk before
writing a composition around them — this exact gap blocked a merch reel for
days while tool after tool got blamed.

## Licence — raise it before the project grows

Remotion is **not** MIT. Free for individuals and for-profit companies with up
to **3 people**, and *contractors and part-timers count toward that number*. At
4+ it needs a Company Licence at **$25/seat/month**. Otis runs two LLCs; flag
this when a build starts leaning on Remotion, not after.
