# "How AI agents work" (12 Nov 2026)

Otis's ask: "a clip or a video on how agents work, for marketing, sales, in a business",
and "don't pay for anything without my approval". Built in-house: HTML motion graphics
rendered frame by frame, an original synthesised score, his logo light-up at the end.
**No Higgsfield credits, no licensed music.** 27.4 s, 30 fps, -14 LUFS. Not posted.

| Time | Scene |
|---|---|
| 0-3.1 | Hook: "What does an AI agent do in your business?" |
| 3.1-7.3 | 1 It watches: website form, inbox, calendar feed the sales agent; a new lead arrives |
| 7.3-12.2 | 2 It does the busywork: scores the lead, looks up the account, drafts the follow-up |
| 12.2-16.3 | 3 You approve: tap Approve; "Nothing goes out until you say yes." |
| 16.3-20.2 | Marketing works the same way: a social post and an email wait for the OK |
| 20.2-23.4 | The loop: Watches, Drafts, You approve; "Agents do the busywork. You stay in charge." |
| 23.0-27.4 | End card: logo light-up, "AI Agents", meridianinterface.com |

Claims follow the agents-ad brief (`../agents-ad/BRIEF.md`): only what the Meridian
system does, and nothing is sent without the owner's approval. The lead and the
messages are marked "Example".

## Build

`./build.sh <work_dir> <python with numpy and scipy>` writes `out/` in four shapes.

- `scenes.html`: everything on a 1080x1080 stage; `#fmt=9x16|4x5|1x1|16x9` sets the
  canvas and where the stage sits, so every shape is rendered natively (no crop, no
  blur). In 9:16 the stage sits at y=240 and all content is inside the Reels safe box
  (y 270-1248). `window.render(t)` sets every style from the time; no CSS animation.
- `render.mjs`: frames at 30 fps. `preview.mjs <fmt> <dir> t1 t2 ...` for stills.
- `end.html`: the end-card text layer, laid over `../end-card/meridian-logo-lightup-9x16.mp4`
  (the settled logo comes from the reference ending's last frame, where the glow has faded).
- `music.py`: the promo score (`../music.py`) re-timed to these cuts.
- `fonts/`, `img/mark.png`: copied from the website and the brand skill; the mark is
  Otis's artwork, never redrawn.
