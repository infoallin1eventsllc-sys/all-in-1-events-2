# Remotion — programmatic 4K video

React in, MP4 out. Each frame is rendered by headless Chromium, then encoded by
Remotion's own bundled ffmpeg. Same architecture as `design/420-friendly/film/
merchfilm.mjs`, but with a live timeline and real primitives instead of
hand-computed fractions.

## Run it

```bash
cd design/remotion && npm install          # node_modules is gitignored
npm run studio                             # live timeline, local only
```

Render — **both flags are required in this sandbox**:

```bash
npx remotion render src/index.ts BrandCard out/card.mp4 \
  --browser-executable=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  --chrome-mode=chrome-for-testing \
  --concurrency=4
```

## Two gotchas, both already paid for

**`--chrome-mode=chrome-for-testing` is not optional.** Remotion defaults to
`headless-shell` (Chrome's old headless). The Playwright Chromium on this box
has that mode removed, so the default fails with "Old Headless mode has been
removed from the Chrome binary". The flag switches it to new headless.

**`--browser-executable` points at the Chromium already on disk.** Without it
Remotion downloads its own Chrome Headless Shell, which is slow and may be
blocked by the egress proxy. Never run `playwright install` here.

`ffmpeg` is NOT on this container's PATH. That does not matter — Remotion ships
its own binaries under `node_modules/@remotion/compositor-linux-x64-gnu/`
(`ffmpeg` and `ffprobe` both live there, useful for verifying output).

## Measured

`BrandCard` at 3840x2160, 30fps, 150 frames: **48s to render, 1.5 MB, 2.4 Mbps**,
verified with the bundled ffprobe.

## Brand

Colors come from `.claude/skills/meridian-stack/references/design-tokens.md`
and are the shipped All in 1 Events values. Do not invent hexes here.

Type is currently `system-ui`. Sora and Plus Jakarta Sans are the real brand
faces — loading them needs `@remotion/google-fonts`, which fetches from
fonts.gstatic.com at render time and has not been tested against the egress
proxy yet. That is the next step, not a finished part.

## Licence — check before this grows

Remotion is not MIT. Free for individuals and for-profit companies with up to
3 people; **contractors and part-timers count**. At 4+ it needs a paid Company
Licence ($25/seat/month). https://www.remotion.dev/docs/license/faq
