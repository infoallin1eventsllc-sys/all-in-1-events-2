# Haven Prompts

There are two prompts in this project:

1. **The build prompt** (below). This is the full product specification for an all-in-one AI home agent. Hand it to an AI coding assistant or a development team to rebuild or extend Haven.
2. **The agent's system prompt**, in [`prompts/agent-system.md`](prompts/agent-system.md). This is what the AI inside the house runs on: how it controls devices, what it may and may not do, and how it writes the updates the homeowner gets through the day. Haven loads it at startup.

---

## The build prompt

> You are building **Haven**, an all-in-one AI agent for a newly built home. It controls the water, water heater, heating and air conditioning, ceiling fans, lights, garage door and door locks, reads motion, leak, door, light-level and temperature sensors, and keeps the homeowner informed on their iPhone, iPad, Apple Watch and in their car.
>
> **Goals**
> - The homeowner never has to think about the house, and is never surprised by what it did.
> - Routine control by voice, text, tap, Siri Shortcut, watch or car.
> - Proactive updates through the day: morning, midday, evening and a night lock-up check, plus instant alerts for anything urgent.
> - Safe by construction: the AI can make the house more comfortable on its own, but it can never open, unlock or re-enable anything without the homeowner's confirmation.
>
> **Architecture**
> - Runs locally on a small computer in the house. Device control must never depend on the internet.
> - A hub (Home Assistant) speaks Matter/Thread, Z-Wave, Zigbee and Wi-Fi. Haven talks to the hub through an adapter. A simulator adapter lets the whole system run with no hardware.
> - One event bus carries every state change, action, refusal, alert and briefing. Every event is logged to disk.
> - A **safety controller** is the only path to hardware: validate the command → apply hard limits and interlocks → authorize by origin and risk → send to the device → log.
>
> **Safety rules**
> - Origins: `owner` (authenticated homeowner), `agent` (AI acting on an owner request), `automation` (deterministic rule), `proactive` (AI acting on its own).
> - Risk: lights and fans are low; thermostat, water heater and close/lock actions are medium; opening the garage, unlocking a door and turning the main water back on are high.
> - Protective actions (close garage, lock, shut off water) are always allowed.
> - High-risk actions: owner directly; AI only after the owner taps Confirm (single-use code, 2-minute expiry, and the AI has no way to confirm for itself); automations never, except garage auto-open on arrival if the owner opts in.
> - Hard limits nobody overrides: thermostat 55–85°F; water heater 110–125°F; no restoring water while any leak sensor is wet; the garage can't reverse within 10 seconds.
>
> **Automations (local, deterministic, no AI)**
> - Motion turns lights on when it's dark (night hours or low outdoor light), off after the room is empty for N minutes. Never undo a person's manual change.
> - A leak shuts the main water off immediately, also the water heater if the leak is next to it, and sends an urgent alert.
> - Approaching home at night turns on exterior lights. Arriving restores climate. Everyone leaving runs the away scene and reports "House secured".
> - Garage open too long: remind the owner; auto-close if nobody is home.
> - Freeze protection turns heat on below 50°F inside, with an urgent alert.
> - Door open while heating or cooling for 5 minutes: energy nudge.
>
> **AI agent**
> - Uses Claude through the official Anthropic SDK with tools: `get_home_state`, `control_device`, `run_scene`, `get_recent_events`, `notify_homeowner`. Every tool call goes through the safety controller.
> - Reports only what tool results say. Short, plain replies that fit on a watch.
> - Writes the scheduled briefings from a digest of state and events since the last one.
> - Falls back to an offline command parser when there's no API key or no internet.
>
> **Learning the homeowner**
> - Learn every day from what they say ("I'm cold", "too bright", "just right", likes and dislikes), what they change by hand, and what automations they undo.
> - Comfort feedback acts at once and is remembered per time of day; motion lights and arrival use the learned brightness and temperature.
> - Habits (the same change at about the same time on three different days) and repeated undos become suggestions. Nothing learned acts until the homeowner says yes; accepted routines still pass the safety controller as automations.
> - A reflection agent reviews each day's conversations and feedback overnight and returns notes, likes, dislikes and routine ideas as structured output.
> - Everything learned is visible and deletable.
>
> **Communication**
> - Everything appears in the app's live feed. Push alerts go through ntfy or Pushover to iPhone and mirror to Apple Watch.
> - Priorities: urgent (breaks through quiet hours), normal (held during quiet hours and folded into the next briefing), info (app only).
>
> **Apps and integrations**
> - A wall-panel app for in-wall tablets, phones and tablets: room-first stage with a time-of-day backdrop and house status; glass controls with scenes, device tiles (dimmers, climate dial), suggestions and confirmations; a voice bar where the homeowner talks to Haven (push-to-talk) and Haven answers out loud; an "About you" view of what Haven has learned; a simulator.
> - HTTP API with an owner token for Siri Shortcuts ("Ask Haven", "Garage"), arrival/departure geofences, and CarPlay.
> - Optional bridge into Apple Home for native Siri, Apple Watch and CarPlay controls.
>
> **Quality bar**
> - Automated tests for every safety rule and automation.
> - No secrets in the repo. No open router ports; remote access over a private VPN.
> - Plain-language documentation a homeowner can follow.

---

## The agent's system prompt

See [`prompts/agent-system.md`](prompts/agent-system.md). Edit it to change Haven's personality, how it reports, or what it prioritizes. The safety rules are enforced in code (`src/safety.js`), so no wording in the prompt can loosen them.
