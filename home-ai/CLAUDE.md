# Haven (home-ai/)

An AI agent for a new home: Node 20+, ES modules, one runtime dependency (`@anthropic-ai/sdk`). Start with `docs/STATUS.md` for where things stand, `docs/ENTERPRISE-PLAN.md` for where it's going, and `docs/AGENTS.md` for how the parts fit (conversation agent, reflection agent, learner, automations, safety controller, briefings).

## Commands
- `npm start`: home server on :8787 (simulator unless `HAVEN_ADAPTER=homeassistant`)
- `npm test`: unit, API, integration and restart tests (node:test)
- `npm run build:demo`: browser-only demos in `dist/demo/` (gitignored)
- `npm run e2e`: browser checks of every control (needs Chromium; uses /opt/pw-browsers/chromium if present, or `CHROMIUM_PATH`)
- `npm run check`: all of the above. Run it before every commit.

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
- Setpoint +/- keeps pending values in `pendingTarget`, never mutating `state` (a refresh between taps once made taps step from stale values).
- e2e runs axe-core WCAG 2.2 AA audits; keep them at 0 violations. Chart colors were validated with the dataviz validator; re-run it if you change `--series`.
- A full `npm run e2e` (both targets) takes over 10 minutes: run it in the background, or run `server` and `demo` separately.

## Published demos
Republish after `npm run build:demo` by passing the Artifact URL:
- Futuristic: https://claude.ai/artifact/NHSYrvBSADDcedguH3CBSm (`dist/demo/haven-futuristic.html`)
- Grounded: https://claude.ai/artifact/J46Rus2S3KzY9CpbpYKyCk (`dist/demo/haven-grounded.html`)

## Environment gotchas (cloud sessions)
- Google Fonts and the Higgsfield image host (`d8j0ntlcm91z4.cloudfront.net`) are blocked by the network policy.
- Mobbin needs a paid plan. The free Higgsfield plan allows only the Z Image model (0.6 credits left).
