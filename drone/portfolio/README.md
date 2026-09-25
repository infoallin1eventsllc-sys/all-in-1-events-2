# Portfolio kit: All in 1 Drone Command

Everything needed to show this project on the Meridian Interface site.

| File | Use |
| --- | --- |
| `cover.jpg` (1600×1000) | Portfolio card image. Also served with the app at `/drone/demo/cover.jpg`. |
| `entry.json` | The portfolio entry in the site's own format. On meridianinterface.com it is card `p11` in `src/data/mockData.ts`, with the demo hosted at `/demos/drone-command/` (see that repo's `public/demos/README.txt` for the refresh steps). |
| `case-study.html` + `gallery/` | The long-form case study: the brief, the three products, the health test on real ArduPilot firmware, before/after of the redesign, trust features, deliverables. |
| `gallery/*.jpg` (1600×1000) | Screens for a gallery or slideshow. |

The demo itself is the app: deployed under `/drone/`, a first visit lands on
**Overview** and `?tour` opens the guided tour straight away. `/drone/demo/og.jpg`
is the social preview when the link is shared.

Regenerating the images: they are real screens of the running app, captured with
Playwright (the capture scripts live with the session, not the repo); re-take them
after a visual change so the portfolio never shows a screen the app no longer has.
