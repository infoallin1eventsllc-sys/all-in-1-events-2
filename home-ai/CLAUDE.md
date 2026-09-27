# Haven (home-ai/)

An AI agent for a new home: Node 20+, ES modules, one runtime dependency (`@anthropic-ai/sdk`). Start with `docs/STATUS.md` for where things stand, `docs/ENTERPRISE-PLAN.md` for where it's going, and `docs/AGENTS.md` for how the parts fit (conversation agent, reflection agent, learner, automations, safety controller, briefings).

## Commands
- `npm start`: home server on :8787 (simulator unless `HAVEN_ADAPTER=homeassistant`)
- `npm test`: unit, API, integration and restart tests (node:test)
- `npm run build:demo`: browser-only demos in `dist/demo/` (gitignored)
- `npm run e2e`: browser checks of every control (needs Chromium; uses /opt/pw-browsers/chromium if present, or `CHROMIUM_PATH`)
- `npm run check`: all of the above. Run it before every commit.
- `npm run build:catalog`: client catalog of every screen in both finishes (after build:demo)
- `npm run build:vendor`: rebuilds `web/vendor/three.js` (the parts of Three.js the hologram uses, committed so panels work offline). Run it after changing which `THREE.*` names `web/holo.js` uses; the script's export list must include them.
- `npm run build:film` / `npm run render:film`: the Meridian Interface film (`film/`, see film/README.md) as one page (`dist/film/meridian-film.html`) and as an MP4. Needs ffmpeg (or `FFMPEG=`) and Python 3 with numpy. The film is a pure function of time (`film.render(t)`); keep it that way so the page and the frame-by-frame render match.
- `npm run live-check`: the real Claude agent against the simulated house (chat, a device, the garage confirmation, "I'm cold", a briefing, a reflection). Needs `ANTHROPIC_API_KEY`; spends a few cents; fails if any step falls back to offline mode.

## Rules that matter
- Nothing touches hardware except `src/core/controller.js`, which runs `src/safety.js`. The AI's tools never take a "confirmed" flag.
- `/api/sim/sensor` may only change sensor readings, never controllable devices.
- The demo (`web/demo/setup.js`) must copy data in and out of the in-page house, like a network. Sharing objects let the UI bypass safety once.
- Routes live in `src/api.js`, shared by the server and the demo.
- The demo never loads the Claude agent (no API keys in public pages).
- Nothing learned acts without the homeowner's yes: habits and reflection findings become suggestions; accepted routines run with origin "automation" so safety still applies. Only direct comfort feedback ("I'm cold") changes a device immediately.
- Panel devices come from `state.rooms[].devices` and carry no `room`; `allDevices()` in `web/app.js` adds it. Tiles have `data-device` for tests.
- Voice is push-to-talk (`web/voice.js`) and needs a secure page; e2e replaces speech APIs with stand-ins.
- Energy is labeled "estimated" unless a `power` device (a real meter) exists. Never show an estimate as measured. Only the demo seeds a simulated day.
- Setpoint +/- keeps pending values in `pendingTarget` until a refresh *after* the request settles; never mutate `state`, and never drop the pending value on completion (the panel would briefly redraw from a stale snapshot and a quick second tap would step from it).
- Screens: `signature` uses the stage/glass DOM; the other seven render into `#alt` via `renderAlt()`. Use classes, not ids, inside `#alt`. `panelRoom` (Screens → This panel is in) is sent with chat and feelings.
- Weather (`src/weather.js`) comes only from Home Assistant or Open-Meteo; with neither it reports `available: false` and every surface says it isn't connected. Only the demo seeds sample weather, labeled "sample". Never show made-up weather.
- ElevenLabs voice (`src/speech.js`): the API key stays on the server; panels call `/api/speech` and fall back to the browser voice on any failure (503). The demo never uses it. CSP allows `media-src blob:` for the clips.
- Wallpaper screen: its own dark tokens on `.panel[data-screen="wallpaper"]`; the photo is on a fixed `::before` layer (not `background-attachment: fixed`, which iOS ignores). The demo build inlines `web/wallpapers/*.webp` as data URIs. A homeowner's own photo lives in localStorage `haven.wallpaper`.
- Nightstand photos are per bedroom: localStorage `haven.nightstand.<room>` (room = Screens → This panel is in, default `primary`), set from the Nightstand's own Add/Change/Remove photo buttons through the hidden `#night-file` input. Another room's panel never shows it. `readPhoto()` resizes both kinds of photo.
- The house is a hologram (`web/holo.js`, Three.js from `web/vendor/three.js`), in the Drone Command "Aircraft Health" style: rim-lit solids, glowing edges, surface dust, grid-and-rings floor, bloom. `houseView()` in `web/app.js` picks it for `#map`, the Command Center's `altMapBox` and `#explorer-map`, and falls back to the drawn model when WebGL is missing, the module fails, or Screens → House view is "Drawn model" (`haven.houseView`, reloads). Room tags are real `<button class="map-room">`s with `lit`/`alert`/`selected`; device tags use `data-pin`. It renders only while something changes (a flight, damping, the one scan sweep after a device change, a red alert pulse, explorer auto-orbit); `haven.holoMotion=still` or Reduce Motion makes flights instant and stops sweeps and pulses (e2e and the catalog set it). e2e and the catalog launch Chromium with SwiftShader WebGL flags.
- Any home (`web/building.js`, docs/HOME-PLAN.md): `config/home.json` → `building` {style, floors, roof, pitch, features} and rooms with `plan`, `shape` (any outline), `floor`, `kind`; `normalizeHome()` turns it into floors (stacked by level, basements below), room outlines, auto-layout for rooms with no plan (marked estimated), and warnings. The hologram builds walls from shared edges (`sharedStretches`: inner walls with doorways drawn once, by the room whose id sorts first; outside walls get the style's windows, shutters, arches or clerestory), roofs per floor (flat/shed/gable/hip, chimney), porches, stairs, deck/patio/pool/driveway, and furniture by room kind. `/api/state` carries `building`; the registry passes `shape`/`floor`/`kind`. Screens → Home style (`haven.homePreview`) previews the `web/homes.js` samples with this home's devices; the drawn model shows one floor (the explorer's floor buttons pick it, or the selected room's floor) and draws a shaped room as its largest rectangle (`mainRect`). `normalizeHome()` must never throw on a bad home.json: it skips entries that aren't rooms or floors and always returns at least a ground floor. Every sample must keep the device rooms (kitchen, living, primary, hallway, garage, utility); `test/building.test.js` checks that and that rooms don't overlap.
- House model touch (`web/mapzoom.js`, the drawn model): pinch, drag, trackpad pinch, +/−/Fit buttons and keys zoom the SVG viewBox; zoom state lives on the container (`container.__zoom`), so `renderMap` replaces only the `svg.map-svg` child and the Command Center reuses one `altMapBox`. A drag or pinch suppresses the click that follows. Device pins (`data-pin`, not `data-device`) show from 160% zoom. The expand button opens the `#explorer` dialog: tapping a room flies the camera in (`focusRoom`) and shows its `roomCard`.
- Finishes: `grounded`, `futuristic`, `vivid` (html `data-look`); appearance via html `data-theme` (light/dark, absent = follow the device). Vivid's colors are token-only; keep its text pairs at WCAG AA and re-run the dataviz validator if `--series` changes.
- Studio's agent row, orb and waveform show only real signals: agents from action/scene events (`noteAgents`), waveform from recognition results, TTS word boundaries or measured ElevenLabs loudness. Never add a looping "AI" animation that isn't tied to something happening.
- Model home showcase runs only scenes (never garage/unlock), through the normal API and safety, never while an alert or confirmation is open; any pointerdown/keydown stops it. `haven.showcaseIdleMs` in localStorage shortens the wait for tests.
- e2e runs axe-core WCAG 2.2 AA audits; keep them at 0 violations. Chart colors were validated with the dataviz validator; re-run it if you change `--series`.
- A full `npm run e2e` (both targets) takes over 10 minutes: run it in the background, or run `server` and `demo` separately.

## Published demos
Republish after `npm run build:demo` by passing the Artifact URL:
- Futuristic: https://claude.ai/artifact/NHSYrvBSADDcedguH3CBSm (`dist/demo/haven-futuristic.html`)
- Grounded: https://claude.ai/artifact/J46Rus2S3KzY9CpbpYKyCk (`dist/demo/haven-grounded.html`)
- Vivid: https://claude.ai/artifact/9SmqdXDppENdd3uGKZyWiV (`dist/demo/haven-vivid.html`)
- Screen library catalog: https://claude.ai/artifact/4tyqsjpBgWRi3ds9FwLnb6 (`dist/catalog/haven-screen-library.html`; rebuild with `DEMO_URL_GROUNDED=… DEMO_URL_FUTURISTIC=… DEMO_URL_VIVID=… npm run build:catalog`)
- Each demo opens a specific screen with `#signature`, `#studio`, `#wallpaper`, `#command-center`, `#family-hub`, `#nightstand`, `#rooms` or `#entry`.

## Environment gotchas (cloud sessions)
- Google Fonts and the Higgsfield image host (`d8j0ntlcm91z4.cloudfront.net`) are blocked by the network policy.
- Mobbin needs a paid plan. The free Higgsfield plan allows only the Z Image model (0.6 credits left).
- Canva connector: generate-image works, but only a 199px preview reaches this container (canva.com is blocked); the full image opens from its Canva link.
- ElevenLabs connector: images and speech download fine (storage.googleapis.com is reachable), but elevenlabs.io and api.open-meteo.com are blocked here. The free ElevenLabs plan allows about 3 image generations a day (hit on Sept 26: the night wallpaper is a color grade of the evening one, see docs/DESIGN.md).
