# Haven: an AI Agent for the Whole House

Haven runs a new home: lights, ceiling fans, heating and air conditioning, the water heater, the main water shutoff, the garage door and door locks, with motion, leak, door and light sensors. It talks to the homeowner on iPhone, iPad, Apple Watch and in the car, and sends short updates through the day.

- **Full analysis** of integrating a home with AI agents, hardware choices, costs and a new-build checklist: [docs/ANALYSIS.md](docs/ANALYSIS.md)
- **Prompts**, both the build spec and the agent's own system prompt: [PROMPT.md](PROMPT.md)
- **iPhone, Apple Watch and car setup**: [docs/APPLE-SETUP.md](docs/APPLE-SETUP.md)

## Try it now (no hardware needed)

Requires Node.js 20 or newer.

```bash
cd home-ai
npm install
npm start
```

Open `http://localhost:8787` and enter the owner token printed in the terminal. The **Simulator** panel at the bottom lets you trigger motion, a leak, a cold snap, arriving and leaving, and watch the house react.

Try typing: `turn on the kitchen lights`, `set the thermostat to 70`, `open the garage` (it waits for you to confirm), `goodnight`, `status`.

## Turn on the full AI

Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`. Haven then uses Claude (`claude-opus-5` by default; change `HAVEN_MODEL` / `HAVEN_EFFORT`) for conversation and for writing the daily briefings. Without a key, or if the internet is down, it uses a built-in command parser, and every automation keeps running.

Refusal fallbacks are enabled (`fallbacks: "default"`): if the model declines a request, the API retries it on a fallback model automatically.

## Connect real devices

1. Set up a Home Assistant hub with your devices (see the analysis for recommended hardware).
2. In `.env`: `HAVEN_ADAPTER=homeassistant`, `HA_URL`, and `HA_TOKEN` (a long-lived access token from your Home Assistant profile).
3. In `config/home.json`, set each device's `ha_entity` to its Home Assistant entity id. Rename rooms and devices to match the house.

## How it's built

```
src/
  server.js            entry point
  home.js              wires everything together
  http.js              API for the app, Siri Shortcuts, geofences, car
  safety.js            risk tiers, hard limits, who may do what
  automations.js       motion, leak, arrival/away, garage, freeze, energy rules
  briefings.js         morning / midday / evening / night updates
  notify.js            app feed, ntfy, Pushover, quiet hours
  core/                event bus, device registry, controller, storage, time
  adapters/            simulator, Home Assistant
  agent/               Claude agent, tools, offline parser
prompts/agent-system.md  the AI's system prompt
config/home.json         rooms, devices, scenes, limits, schedule
web/                     the phone/tablet app
test/                    safety, automation and agent tests (npm test)
```

**The one rule that matters:** the AI never touches hardware. Every request, from the AI, an automation or a person, goes through `core/controller.js` and `safety.js`. The AI can adjust comfort on its own, but opening the garage, unlocking a door or turning the water back on always waits for the homeowner's tap.

## API

All routes need `Authorization: Bearer <owner token>` except `/api/health`.

| Method | Path | Body | Use |
|---|---|---|---|
| GET | `/api/state` | | Everything the app shows |
| GET | `/api/events?limit=100` | | Activity log |
| GET | `/api/stream?token=` | | Live events (server-sent events) |
| POST | `/api/devices/:id` | `{command}` | Control a device as the owner |
| POST | `/api/scenes/:name` | | morning, away, home, goodnight, movie |
| POST | `/api/chat` | `{text}` | Talk to Haven |
| POST | `/api/confirm/:id` | `{approve}` | Confirm or cancel a pending action |
| POST | `/api/presence` | `{person, kind}` | approaching / arrived / left |
| POST | `/api/briefing` | | Send a briefing now |
| POST | `/api/shortcut/ask` | `{text}` | Siri: returns `{text}` to speak |
| POST | `/api/shortcut/garage` | `{action}` | Car/watch button: open, close, toggle |
| POST | `/api/sim/sensor` | `{device, state}` | Simulator only |

## Run it in the house

Use a small always-on computer (a mini PC, Raspberry Pi 5, or the same box as Home Assistant) on a UPS battery. Run it with a process manager such as systemd or pm2 so it restarts on boot. For access away from home use Tailscale; don't open ports on the router.
