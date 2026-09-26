# Haven (home-ai/)

An AI agent for a new home: Node 20+, ES modules, one runtime dependency (`@anthropic-ai/sdk`). Start with `docs/STATUS.md` for where things stand, `docs/ENTERPRISE-PLAN.md` for where it's going, and `docs/AGENTS.md` for how the parts fit (conversation agent, reflection agent, learner, automations, safety controller, briefings).

## Commands
- `npm start`: home server on :8787 (simulator unless `HAVEN_ADAPTER=homeassistant`)
- `npm test`: unit, API, integration and restart tests (node:test)
- `npm run build:demo`: browser-only demos in `dist/demo/` (gitignored)
- `npm run e2e`: browser checks of every control (needs Chromium; uses /opt/pw-browsers/chromium if present, or `CHROMIUM_PATH`)
- `npm run check`: all of the above. Run it before every commit.
- `npm run build:catalog`: client catalog of every screen in both finishes (after build:demo)

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
