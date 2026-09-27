# The film: "The future, in your hands"

A 1:32 Meridian Interface film. An AI sketches a home as a hologram, builds it through to paint, floors and furniture, and then becomes a holographic guide. The guide welcomes the client in, walks them through the house and explains, at the control panel, how the home keeps them safe.

It comes in two halves:

1. **The hologram film (done).** Rendered from code in the same hologram style as Haven's panel, with the house laid out by Haven's any-home code (`web/building.js`). It plays live in a browser and renders to MP4.
2. **Photoreal shots (waiting on a paid video plan).** Ten AI-video prompts, below, for the moments that should look like live action. They drop into the same cut on the same timecodes.

## Build and render
```bash
npm run build:film     # dist/film/meridian-film.html: the film as one page, soundtrack inlined
npm run render:film    # dist/film/meridian-film.mp4: 1280x720, 24 fps (about 17 minutes in software WebGL)
```
Both need ffmpeg on PATH (or `FFMPEG=/path/to/ffmpeg`). The soundtrack also needs Python 3 with numpy. `FROM=40 TO=50 npm run render:film` renders just part of it.

## Files
- `film.js`: the whole film as a function of time. Its header lists every scene and when it happens.
- `main.js` and `index.html`: the player page and its overlays (room labels, chapter marks, the guide's words, title and end cards).
- `audio.py`: the soundtrack. It places the guide's voice on its cues over a synthesized score and adds the door chime, the lock and the panel tap. It also writes the voice's loudness per frame, so the guide glows with its own voice.
- `guide-voice.mp3`: the guide's lines, spoken by the ElevenLabs "River" voice (one of the two voices proposed for Haven, `docs/voice/`).

## The script
| Time | Scene |
|---|---|
| 0:00 | Title: *Meridian Interface presents* |
| 0:05 | **01 Design.** The floor plan is drawn in light on a projection table, and room names appear. |
| 0:13 | **02 Structure.** Walls, stairs, the upper floor and the roof rise as a wireframe hologram, and the camera orbits. |
| 0:24 | **03 Build.** Foundation, frame, glass, siding and roof turn real at golden hour. The lawn, drive and trees appear. |
| 0:33 | **04 Finish.** In a cutaway, a band of light paints each room, lays oak floors and brings in the furniture, and then the lights come on. |
| 0:44 | **05 Welcome home.** At dusk, light gathers at the front door into the AI guide. |
| 0:50 | The door's light strip glows, a chime plays, the lock ring turns green and the door opens. *"Welcome home. Come on in."* |
| 0:56 | The walkthrough. The guide leads the client into the living room while sensor lines light up in the walls. *"I was here from the first line of the sketch. I know every wall, every window, every pipe."* |
| 1:03 | The panel. *"This is where we'll talk. I watch the doors, the water, the heat and the air, day and night. If something's wrong, I'll tell you right away. And I'll never unlock a door or open the garage unless you say so."* |
| 1:16 | *"You're not just living in a house. You're living with something that looks out for you. Welcome home."* The guide dissolves into the panel, the panel is tapped, and the camera pulls back to the house at dusk. |
| 1:26 | End card: *Meridian Interface. The future, in your hands.* |

"Never unlock a door or open the garage unless you say so" is how Haven actually works (`src/safety.js`): the film makes no claim the product doesn't keep.

## Photoreal shots (to generate)
Blocked for now. ElevenLabs video needs a paid plan, and Higgsfield has 0.6 free credits, far less than one clip costs. With a paid plan, generate each shot below as an 8-second, 16:9 clip. Veo 3.1 is the strongest at following a prompt; Runway Gen-4.5 is better at keeping the guide consistent from shot to shot. Cut each clip in over the hologram film at the timecode given; the soundtrack stays as it is.

Paste these three descriptions into every prompt:
- **The house:** a two-story modern home with warm oak siding upstairs, white render and floor-to-ceiling glass downstairs, a dark stone entry wall and garage, and a flat roof with a deep overhang.
- **The guide:** a calm, friendly holographic AI guide, human proportions, translucent blue-white light with a soft inner glow, faint horizontal scan lines, gentle natural gestures.
- **The look:** cinematic, Apple keynote meets sci-fi architectural visualization, cool cyan hologram light against warm amber interior light, volumetric haze, slow smooth camera, photoreal, 4K.

| # | Replaces | Prompt |
|---|---|---|
| P1 | 0:05-0:13 (optional; the hologram version is already strong) | A dark, modern design studio at night. A glass table projects a circle of blue light, and a single glowing point draws a house floor plan on it room by room, like an architect's pen made of light. An architect's hand gestures and the plan responds. Slow push-in. |
| P2 | 0:27-0:33 | Golden hour. [house], just completed, on a landscaped lot with a concrete driveway, a stone path to the door and mature trees. Slow crane pull-back revealing the whole home, warm sun raking across the oak siding. |
| P3 | 0:36-0:44 | Inside [house], a bright open living room. Warm white walls, wide-plank oak floors, a stone fireplace wall, a linen sofa, a walnut coffee table, plants, then warm pendant lights coming on over a marble kitchen island. Slow dolly through the room. |
| P4 | 0:44-0:50 | Dusk at the front entrance of [house]. Light particles gather in a column on the doorstep and form [guide], who turns toward the camera and smiles. A thin light strip glows along the doorframe. |
| P5 | 0:50-0:56 | A couple in their thirties walks up the stone path at dusk. A soft chime, the door's light strip glows, the smart lock shows a green ring and clicks, and the door swings open. [guide] steps aside and gestures warmly: come in. The camera follows them over the threshold. |
| P6 | 0:56-1:03 | Steadicam. [guide] walks beside the couple through the warm living room, gesturing at the space. Faint glowing cyan lines appear inside the walls and ceiling like a nervous system, running from the doors, windows and kitchen toward the hallway. |
| P7 | 1:03-1:10 | [guide] stops beside a slim wall-mounted control panel showing a tiny glowing hologram of this same house, turns to the couple and speaks. Sensor lines converge on the panel. Medium close-up, shallow depth of field. |
| P8 | 1:10-1:16 | Reverse shot: the couple listening to [guide], reassured, warm interior light, the panel glowing softly on the wall behind them. |
| P9 | 1:19-1:23 | [guide] makes a small reassuring gesture, then dissolves into light that flows into the control panel. The panel glows warm and steady, and one of the couple reaches out and taps the screen. |
| P10 | 1:23-1:26 | The camera pulls back through the living room's glass wall and rises to reveal the whole of [house] at dusk, lit from within. |

For the most consistent guide, first generate one still image of the guide and use it as the reference image for P4-P9. For the house, use a still from the hologram film at 0:31 (the finished exterior) as the reference image for P2 and P10.
