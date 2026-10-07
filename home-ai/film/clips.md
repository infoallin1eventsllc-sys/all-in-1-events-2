# Generated clips (Higgsfield), October 6, 2026

The photoreal and hologram clips for the merged film: the house designs itself as a hologram (our engine, `film/film.js`), becomes real, and the holographic guide walks the client through it to the panel. All 16:9, 10 s, no audio (the River voice track and score go over the top). Each clip's job id is also its reference for further generations (`medias[].value`), so a new shot can match an existing one.

Download links are on Higgsfield's CDN, which this cloud container can't reach; they open in a browser and sit in the account under Generations.

| # | Clip | Model | Job id | Notes |
|---|---|---|---|---|
| A | Hologram flythrough (test) | Kling 3.0 pro, 1080p | `224b0bf4-b461-4e2e-a6bf-a0982a1ca966` | Wireframe house on the projection table, dolly in through the glass to the figure at the panel, pull back and rise. |
| B | Photoreal flythrough (test) | Kling 3.0 pro, 1080p | `49b468d1-97df-4984-8a3c-4bffeaf214ed` | The house at dusk, across the patio, into the living room, back out. **The reference for every later clip.** |
| C | Hologram becomes real | Seedance 2.5, 720p, refs A + B | `4943c9e6-f2cb-4790-b77d-312edea366ed` | A light sweep from the ground up turns the wireframe into the real house; the table becomes the lawn at dusk; dolly out. Good. |
| D | Welcome at the door | Seedance 2.5, 720p, refs B + F | `d0f4f8c4-958e-4aff-a91f-e26d3576e7c1` | The couple walks up, the door opens, and the guide, with a clear face, looks at them, smiles and gestures them in; the camera pushes in to her face. Replaces `fe835ee8…` (October 7: the guide had no face, `D-welcome-v1.mp4`). The other variant, `32f0dfd5…` (`D-welcome-alt.mp4`), opens wide on the house but keeps her small. |
| E | Walkthrough, sensor lines | Seedance 2.5, 720p, refs B + F | `df5c2bec-6b15-431c-bed1-d8e6825152c6` | The adult guide walks beside the couple, cyan lines tracing the walls. (First try `14bcb0c5…` had a child-sized guide walking away.) |
| F | The panel | Seedance 2.5, 720p, ref B | `9f7200bf-3910-488b-ad77-559739bb3174` | The guide at the wall panel, turns to the couple, gestures; data lines flow into the panel; dolly in. Good. |

Hero stills (Seedream 4.5 and Cinema Studio 2.5, 16:9): job ids `02c65dd0…`, `c15b0439…`, `85a6d4a0…`, `bed86a41…`, `fc5dc4fc…`, `b8776fef…`, `fbd374de…`, `e92298ae…`.

Credits: 1,200.6 at the start of the day, 803.6 after these (the redo of E was 70).

## The cut
1. 0:00–0:44 our hologram engine: title, plan, structure, detail, furnish (the film as it is).
2. Clip C: the hologram becomes the real house (replaces the engine's "welcome home" exterior).
3. Clip D: the couple arrives, the door opens, the guide welcomes them. Voice: "Welcome home. Come on in."
4. Clip E (redo): the walkthrough. Voice: "I was here from the first line of the sketch…"
5. Clip F: the panel. Voice: "This is where we'll talk…" through "…unless you say so."
6. Clip B's last seconds (the pull-back) or a new pull-back clip. Voice: "You're not just living in a house…"
7. End card.

## Getting the clips as files
Higgsfield's CDN is blocked from the cloud container, but ElevenLabs can fetch a direct link into a flow (`creative_attach_reference_file`), and a free `eleven_composition` pass of that asset gives a `master_url` on storage.googleapis.com, which is reachable. The six files are in `film/clips/` (gitignored: 55 MB) and `npm run assemble:film` cuts them with the engine render into `dist/film/meridian-film-merged.mp4`.
