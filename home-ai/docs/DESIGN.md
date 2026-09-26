# Haven Design System

## Brief
- **Mode:** Operate. The homeowner glances at the app, often on a phone and on the move, to see whether the house is OK and to fix what isn't. The client demo adds a Persuade layer, but the app itself stays task-first.
- **Voice:** calm, plain, trustworthy. The house is handled; Haven reports what happened.
- **Anti-references:** generic "AI SaaS" styling (purple gradients, glow on everything), dashboards of equal-weight tiles, sensors shouting as loudly as controls.

## Structure: the wall panel (both looks)
Modeled on an in-wall touch panel: room first, glass controls, voice along the bottom.

1. **Stage (left).** Room tabs, then the **home map**, a cutaway 3D model of the house drawn from the live device states (see below), the room name set large, a one-line greeting ("Good evening. It's 71°F inside. 2 lights on, 1 person home."), the house status with one-tap fixes, and the clock. Its backdrop follows the light of the day: warm morning, pale daylight, amber evening, deep blue night.
2. **Glass (right)**, with four tabs:
   - **Home:** Haven's suggestions, confirmations, scene cards (each painted with the light it makes), device tiles, and "How does it feel?" buttons (Too cold, Too warm, Too bright, Too dark, Just right).
   - **Updates:** the activity feed and "Brief me now".
   - **About you:** everything Haven has learned, each with Forget; "Review my day"; "Forget everything" (two taps).
   - **Simulator** when no hardware is connected.
3. **Voice bar (bottom).** Haven's orb, the text box, the mic (push-to-talk), the speaker toggle, and the conversation just above it.

Whole home shows Climate (a dial with target, mode and system state), Electricity today (see below), Lights, Security (with Lock up), Water, and the Water Heater. A room shows its own devices as tiles plus one quiet line of sensors.

On a phone the stage becomes a header card and everything stacks; the voice bar stays pinned to the bottom.

## Screen library
Six screens built from the same components on the same live house, each in both finishes. Choose one per panel from **Screens** (on the stage, or the header of any other screen). The choice is remembered on that device; a demo link can open a screen directly with `#screen-id`.

| Screen | id | Best for | What's on it |
|---|---|---|---|
| Signature | `signature` | Great room, main entry | House model, room tabs, glass controls, energy, suggestions, About you |
| Command Center | `command-center` | Office, large wall display | Map (filters the lights list), climate, energy, every light with dimmer, doors & water, room conditions, scenes, updates |
| Family Hub | `family-hub` | Kitchen | Large clock, today's briefing, big scenes, feeling buttons, lights |
| Nightstand | `nightstand` | Bedroom | Dark screen, large clock, Goodnight / Lights off / Warmer / Cooler / Good morning |
| Rooms | `rooms` | Large households | A card per room, each device a big button, sensors per room |
| Entry | `entry` | Mudroom, garage door | I'm leaving / I'm home / Lock up, doors & water, what's still on, conditions |

**This panel is in** (in the library) sets the panel's room. When the homeowner doesn't name a room, requests at that panel mean that room: "turn off the lights", "too bright", and the Nightstand's buttons.

Weather, cameras, calendars and packages are not in the library yet: they'll arrive as cards when connected to real sources, never as placeholder data.

`npm run build:catalog` captures every screen in both finishes from the demo build into a one-page catalog for clients (`dist/catalog/haven-screen-library.html`).

## Home map
An isometric cutaway model of the floor plan (rooms placed by `plan` in config/home.json), drawn in SVG back to front. It shows only real state:
- A room's floor glows where lights are on, stronger for brighter lights.
- A room turns red for anything that needs attention: leak, door open, unlocked, water off.
- Motion shows as a ripple.
- Each room is labeled, with the thermostat temperature in its room.
- Tapping a room opens it; tapping it again returns to the whole home. Rooms are keyboard buttons with spoken labels ("Kitchen, 1 light on").

Grounded draws it as an architect's model in oak and plaster; Futuristic as a glowing cyan wireframe.

## Electricity chart
A single-series area chart of power across the day, with live kW and today's kWh above it.
- The axis is titled in kW, with a recessive grid and times at 12 AM, 6 AM, 12 PM, 6 PM and 12 AM.
- One labeled peak and an emphasized "now" point.
- A crosshair tooltip on hover or touch, and a screen-reader table of hourly averages.
- It's drawn at the tile's real width so text stays full size.
- The series color is `--series`, validated with the dataviz palette validator for each theme's surface: `#b7791f` Grounded light, `#bf8228` Grounded dark, `#0f9fbd` Futuristic.
- The subtitle always says whether the numbers are **estimated** from device states or **measured** by an energy monitor.

## Tiles
- **Light:** switch, and a brightness slider while on.
- **Fan:** switch, and speed 1–3 while on.
- **Climate:** dial (arc = target within 55–85°F; orange heating, blue cooling), − target +, Auto/Heat/Cool/Off.
- **Water heater:** power switch, − target +.
- **Water, garage, lock:** one clear action (Shut off / Turn on, Open / Close, Lock / Unlock). Anything not in its safe state gets a red outline.

## Color
Semantic colors (ok / warn / bad) only ever mean state.

| Token | Grounded light | Grounded dark | Futuristic |
|---|---|---|---|
| `--bg` | `#f1ede6` | `#17130f` | `#06070c` |
| `--surface` | `#fbf9f5` | `#211b16` | `rgba(16,20,33,.84)` |
| `--text` | `#2a241e` | `#f1ebe2` | `#e6f4ff` |
| `--accent` (actions) | `#6b4a2f` walnut | `#c9a27a` | `#40e0ff` cyan |
| `--on` (a light is on) | `#e0a43a` lamp amber | `#f0b64e` | `#40e0ff` |
| `--ok` / `--warn` / `--bad` | `#3f7a52` / `#a8641e` / `#b3362b` | `#7cc593` / `#e3a45a` / `#f07a6b` | `#3df5b0` / `#b592ff` / `#ff4d8d` |

Grounded follows the viewer's light/dark setting. Futuristic is dark only, by design.

## Type
- **Hanken Grotesk** (400–700) for everything in Grounded and for body text in Futuristic.
- **Chakra Petch** (500–600) for headings and numbers in Futuristic: an instrument-panel face.
- Scale: 1.55rem title, 1.15rem status, 1.2rem tile values, 1rem body, 0.85rem secondary, 0.72–0.75rem uppercase labels with 0.08–0.2em tracking. Numbers use tabular figures.
- System fonts are the fallback, so the app still reads well when the house has no internet.

## Motion
- The orb in the voice bar is Haven. Its color is the house state (green/cyan secure, amber/violet waiting, red/magenta alert). It pulses while listening, dips while thinking, and swells while speaking; it's still otherwise, and always still under reduced motion.
- The Futuristic stage shows the orb large, with faint rings behind the room name.
- Nothing else animates beyond switches sliding and button press feedback.

## Accessibility
Automated WCAG 2.2 AA audits (axe-core) run in `npm run e2e`: sign-in, whole home in both styles, a room, a leak alert, the Updates and About you tabs, and phone width. The current result is 0 violations.
- Everything works by keyboard, including the map rooms and the chat log.
- Switches use `role="switch"`.
- Motion stops under reduced-motion settings.
- Button text on red uses `--danger-text`, dark in the dark themes, to keep contrast.

## Components
Room tab, home map, electricity chart, status line, issue chip, ask card (suggestion or confirmation), scene card, device tile, switch, slider, segmented control, climate dial, stepper, feeling chip, feed item, profile item, voice bar, orb, style switch.
