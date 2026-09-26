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
Seven screens built from the same components on the same live house, each in both finishes. Choose one per panel from **Screens** (on the stage, or the header of any other screen). The choice is remembered on that device; a demo link can open a screen directly with `#screen-id`.

| Screen | id | Best for | What's on it |
|---|---|---|---|
| Signature | `signature` | Great room, main entry | House model, room tabs, glass controls, energy, suggestions, About you |
| Wallpaper | `wallpaper` | Living room, large wall display | The home's photo behind frosted tiles in columns: weather, indoor temperature and humidity, electricity with a live line, climate, fans, water heater, every light (icon switch and pill dimmer), doors & water, scenes, updates |
| Command Center | `command-center` | Office, large wall display | Map (filters the lights list), climate, energy, every light with dimmer, doors & water, room conditions, scenes, updates |
| Family Hub | `family-hub` | Kitchen | Large clock, today's briefing, big scenes, feeling buttons, lights |
| Nightstand | `nightstand` | Bedroom | Dark screen, large clock, Goodnight / Lights off / Warmer / Cooler / Good morning |
| Rooms | `rooms` | Large households | A card per room, each device a big button, sensors per room |
| Entry | `entry` | Mudroom, garage door | I'm leaving / I'm home / Lock up, doors & water, what's still on, conditions |

**This panel is in** (in the library) sets the panel's room. When the homeowner doesn't name a room, requests at that panel mean that room: "turn off the lights", "too bright", and the Nightstand's buttons.

Weather is built in (src/weather.js): Home Assistant's weather entity, or Open-Meteo once `weather.latitude` and `weather.longitude` are set in config/home.json. Without either, the Wallpaper screen says the forecast isn't connected and shows the outdoor sensor; the other screens simply leave it out. The demo shows sample weather labeled as a sample. Cameras, calendars and packages are not in the library yet: they'll arrive as cards when connected to real sources, never as placeholder data.

### Wallpaper screen
Modeled on photo-backed Home Assistant dashboards. It sets its own dark tokens in both finishes (Futuristic swaps the accent to cyan), because it always sits on a photo.
- **Photo:** `web/wallpapers/{morning,day,evening,night}.webp`, chosen by the house's time of day, on a fixed layer behind the page (`background-attachment: fixed` doesn't work on iPhone/iPad). A darker overlay at dusk and a lighter one by day keep the section titles readable without turning day into night.
- **Own photo:** Screens → Wallpaper photo → Use my own photo. It's resized to 1920 px, saved as JPEG on that panel only (localStorage), and "Use Haven's photos" removes it.
- **Tiles:** dark frosted glass (76% opaque, so text stays readable over any photo) with a round icon in each kind's color: amber lights, green fans, orange heat, blue cooling, violet garage, green/red locks, blue water, yellow electricity. A light's round icon is its on/off switch; the thick pill is its dimmer.
- **Weather card:** clock and date, current conditions, four days with low-to-high range bars, the next six hours with rain chance, and where the forecast came from.

The four photos were made with ElevenLabs (GPT Image 2): the evening photo first, then morning and day as edits of it so it's the same house and camera. The free plan's daily image limit stopped the fourth, so **night is a color grade of the evening photo** (sky replaced, lights kept warm, moon and stars added). Regenerate it, or all four, with a photo of the client's own home. The prompts:
- Evening: "A modern single-story new-build home seen from across a calm, freshly cut lawn at dusk. Low flat roofline, warm cedar siding with dark charcoal panels, large floor-to-ceiling windows glowing warm amber from inside, a few low landscape path lights along a stone walkway. A young ornamental tree to one side. Sky: deep blue at the top fading to a band of orange and soft rose sunset just above the horizon… The house sits in the lower third; the upper two thirds is mostly sky with smooth gradients. Eye-level camera, 24mm lens, realistic photograph… no people, no cars, no text."
- Morning / day / night: "Change: the time of day to [early morning just after sunrise, low pale-gold sun and mist / a clear early afternoon / late night with stars and a crescent moon]… Preserve: the same house, architecture, materials, camera position, lens, framing and composition…" with the evening photo as the reference image.

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
