# AI aerial plates

Photoreal aerial stills of San Francisco, generated with Canva's image generator from
prompts written to match a 4K drone tour of the city. The patrol feed cuts them together
with a moving virtual camera (see `src/dashboards/feed/plates.ts`).

## Installing them

1. Open each image below in Canva and download it as JPG (1920 px wide or more).
2. Save it into this folder under the file name shown.
3. Run `npm run plates`. The San Francisco feed now plays them instead of streamed footage.

| File | Shot | Canva |
|---|---|---|
| `01-golden-gate-fog.jpg` | Golden Gate through the fog | https://www.canva.com/M/MAHWDL-3pQM |
| `02-downtown-fog.jpg` | Downtown under the marine layer | https://www.canva.com/M/MAHWDHhXTSs |
| `03-north-beach.jpg` | North Beach and Coit Tower | https://www.canva.com/M/MAHWDOLW8kw |
| `04-lombard.jpg` | Lombard Street | https://www.canva.com/M/MAHWDOqLTV8 |
| `05-downtown-canyon.jpg` | The Financial District canyon | https://www.canva.com/M/MAHWDFpmSSE |
| `06-bay-bridge.jpg` | Along the Bay Bridge | https://www.canva.com/M/MAHWDLw8Mpc |
| `07-container-ship.jpg` | A container ship under the Gate | https://www.canva.com/M/MAHWDDXvyNE |
| `08-golden-gate-deck.jpg` | Straight down over the lanes | https://www.canva.com/M/MAHWDK8cIzk |
| `09-marin-sunset.jpg` | The Marin coast at sunset | https://www.canva.com/M/MAHWDF_f2PQ |
| `10-golden-gate-blue-hour.jpg` | Blue hour at the north tower | https://www.canva.com/M/MAHWDDk27mU |

Images you leave out are skipped; with none installed the feed falls back to streamed
footage and then to the rendered city. The Canva links open only for the account that
generated them.
