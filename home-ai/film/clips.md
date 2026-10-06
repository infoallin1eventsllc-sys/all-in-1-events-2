# Generated clips (Higgsfield), October 6, 2026

The photoreal and hologram clips for the merged film: the house designs itself as a hologram (our engine, `film/film.js`), becomes real, and the holographic guide walks the client through it to the panel. All 16:9, 10 s, no audio (the River voice track and score go over the top). Each clip's job id is also its reference for further generations (`medias[].value`), so a new shot can match an existing one.

Download links are on Higgsfield's CDN, which this cloud container can't reach; they open in a browser and sit in the account under Generations.

| # | Clip | Model | Job id | Notes |
|---|---|---|---|---|
| A | Hologram flythrough (test) | Kling 3.0 pro, 1080p | `224b0bf4-b461-4e2e-a6bf-a0982a1ca966` | Wireframe house on the projection table, dolly in through the glass to the figure at the panel, pull back and rise. |
| B | Photoreal flythrough (test) | Kling 3.0 pro, 1080p | `49b468d1-97df-4984-8a3c-4bffeaf214ed` | The house at dusk, across the patio, into the living room, back out. **The reference for every later clip.** |
| C | Hologram becomes real | Seedance 2.5, 720p, refs A + B | `4943c9e6-f2cb-4790-b77d-312edea366ed` | A light sweep from the ground up turns the wireframe into the real house; the table becomes the lawn at dusk; dolly out. Good. |
| D | Welcome at the door | Seedance 2.5, 720p, ref B | `fe835ee8-600d-4c66-b0f7-3e62d26ddc0d` | The couple walks up, the door opens, the guide welcomes them in. |
| E | Walkthrough, sensor lines | Seedance 2.5, 720p, ref B | `14bcb0c5-ca71-42a1-875f-9424ea728a8d` | The couple in the living room, cyan lines tracing the ceiling and fireplace wall. **The guide came out child-sized and walking away: redo.** |
| F | The panel | Seedance 2.5, 720p, ref B | `9f7200bf-3910-488b-ad77-559739bb3174` | The guide at the wall panel, turns to the couple, gestures; data lines flow into the panel; dolly in. Good. |

Hero stills (Seedream 4.5 and Cinema Studio 2.5, 16:9): job ids `02c65dd0…`, `c15b0439…`, `85a6d4a0…`, `bed86a41…`, `fc5dc4fc…`, `b8776fef…`, `fbd374de…`, `e92298ae…`.

Credits: 1,200.6 at the start of the day, 873.6 after these.

## The cut
1. 0:00–0:44 our hologram engine: title, plan, structure, detail, furnish (the film as it is).
2. Clip C: the hologram becomes the real house (replaces the engine's "welcome home" exterior).
3. Clip D: the couple arrives, the door opens, the guide welcomes them. Voice: "Welcome home. Come on in."
4. Clip E (redo): the walkthrough. Voice: "I was here from the first line of the sketch…"
5. Clip F: the panel. Voice: "This is where we'll talk…" through "…unless you say so."
6. Clip B's last seconds (the pull-back) or a new pull-back clip. Voice: "You're not just living in a house…"
7. End card.

Assembling the cut needs the clips as files, which means a machine that can reach Higgsfield's CDN: download the six MP4s into `film/clips/` and run the (to be written) `scripts/assemble-film.mjs`, or hand the list above to an editor.
