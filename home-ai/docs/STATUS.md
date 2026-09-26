# Haven: Where Things Stand

_Last updated: September 26, 2026 (Vivid finish, Studio screen with the agent row, and Model home showcase added, for the builder pitch). Branch `claude/inspiring-fermi-jpi3vh` in `infoallin1eventsllc-sys/all-in-1-events-2`, folder `home-ai/`._

## Links
- Demo A, Futuristic: https://claude.ai/artifact/NHSYrvBSADDcedguH3CBSm
- Demo B, Grounded: https://claude.ai/artifact/J46Rus2S3KzY9CpbpYKyCk
- Vivid (light and dark; Screens → Appearance): https://claude.ai/artifact/9SmqdXDppENdd3uGKZyWiV
- Screen library catalog (all eight screens, every finish, links to open each live): https://claude.ai/artifact/4tyqsjpBgWRi3ds9FwLnb6

Both are private until shared from each page's Share menu.

## Verified working
`npm run check` runs everything below. Last result: all passing, twice in a row.

- **115 automated tests** (`npm test`)
  - Safety rules: confirmations, hard limits, the leak interlock, garage anti-bounce, owner vs. AI vs. automation permissions
  - Automations: motion lights on and off, leak shutoff, arriving / approaching / leaving, garage reminders, freeze protection, quiet hours
  - Every chat phrase the panel and docs suggest, plus questions, scenes and the "which room?" fallback
  - **Learning:** "I'm cold/stuffy/too bright/just right" acting and being remembered per time of day; learned brightness used by motion lights and learned temperature on arrival; a habit on 3 days becoming a suggestion (never an action); dismissed suggestions never repeating; two undone motion lights becoming "stop doing that" and accepting it working; learned routines unable to open, unlock or restore water; likes, dislikes and notes remembered, listed and forgotten; conversations logged for reflection
  - **Reflection agent:** offline pattern notes, and the Claude version requesting JSON-schema output with its findings merged safely (mocked API)
  - **Conversation agent tools:** record_feedback and remember through Claude (mocked API)
  - **Energy:** the estimate follows lights, fans, heating and the water heater; today's kWh adds up and resets at midnight; hourly averages and peak; a real meter replaces the estimate
  - Every HTTP route including the profile, feedback, suggestion, forget, reflect and energy routes
  - Home Assistant bridge, ntfy/Pushover payloads, scheduled briefings, and the real server surviving a restart
  - **Weather:** Open-Meteo and Home Assistant forecasts (stand-in servers with the real response shapes), keeping the last reading on errors, "not connected" everywhere without a source, weather questions vs. "I'm cold", and the forecast in briefings
  - **Voice:** ElevenLabs requests (key, voice, model, words not symbols), cached repeats, fallback and pause after errors, and `/api/speech` returning audio without exposing the key
- **Browser checks** (`npm run e2e`) in both the home-server panel and the demo build: every tile control (switches, brightness slider, fan speeds, climate dial and modes, water heater, valve, garage, locks, Lock up), room tabs, status fixes, Confirm and Cancel, chat, **voice** (a spoken command runs, Haven answers aloud, the speaker button mutes it, the leak alert is read aloud), all five scenes, the feeling buttons, **About you** (learned items, forget one, review my day, a habit suggestion accepted into a routine, forget everything), Brief me now, every simulator button, both styles, the **home map** (every room drawn, tap to open and back, lit rooms glow, the leak room turns red), **energy** (labeled estimated, live power rises when a fan runs, the chart tooltip and table view), and no sideways scrolling at wall-panel or phone width.
- **Browser run totals:** 170 checks on the home-server panel and 165 on the demo, all passing (September 26, after Vivid, Studio and showcase). One run before that had a one-time failure of "About you lists the learned temperature" on the server panel that didn't reproduce on the next full run; watch for it.
- **Vivid, Studio, showcase** in the browser run: the Vivid switch and Appearance (Dark / Auto); Studio's orb, agents, time, lights, climate, electricity and doors; tapping the orb to talk; the Lighting agent glowing while a light is on; the reply under the orb; Goodnight lighting the lines between agents and the lines going quiet after; climate +; the showcase switching on, starting on its own on Studio, running a real scene and saying so, and a touch handing control back. Accessibility audits of the whole home in Vivid light and dark, and Studio in Grounded, Vivid light and Vivid dark.
- **Wallpaper screen** in the browser run: weather card (sample in the demo, "not connected" on a house without a source), the photo following the time of day, a light's icon switch, the pill dimmer, climate +, uploading your own photo and going back, and the panel playing Haven's ElevenLabs voice when the server has a key (stand-in ElevenLabs).
- **Screen library** in the browser run: the library lists seven screens; each screen renders its parts and a real control works on it (Command Center light switch, Family Hub briefing, Nightstand Goodnight, Rooms light tap, Entry turn off); the panel room makes "turn on the lights" mean that room; no sideways scrolling on any screen at 390px.
- **Accessibility:** automated WCAG 2.2 AA audits (axe-core) inside the browser run: sign-in, whole home in both styles, a room, a leak alert, the Updates and About you tabs, phone width, and each library screen (Command Center, Family Hub, Nightstand, Rooms, Entry, Wallpaper, Studio). 0 violations. (The audit caught dark chat and suggestion text on the Wallpaper screen's dark glass; fixed.)

## Added September 26 (late): Nightstand photos
Each bedroom's Nightstand can show its owner's own photo behind the clock (Add your photo on the Nightstand itself). It's kept per room on that panel, so a child's nightstand shows their picture and the primary bedroom shows the parents', and no other room's panel shows it. A night shade keeps the time and buttons readable; Remove photo takes it off.

## Added September 26 (late): the 3D house model
The "Whole home" model (Signature screen, Command Center) is now an architectural cutaway, modeled on a 3D floor-plan render: full-height outside walls with windows, lower walls between rooms with doors, cut-down front walls so you can see in, and floors in wood, tile or concrete. Every room is furnished from its type (car and workbench in the garage, island and fridge in the kitchen, sofas and TV in the living room, bed and nightstands in the bedroom, washer, dryer and water heater in the utility room), laid out from the room's size, so a builder's own floor plan in config/home.json gets furnished too. The garage door on the model opens and closes with the real door. Grounded and Vivid light render it as a warm model; Futuristic and Vivid dark as a lit blueprint. Room labels are one-line chips that never cover each other. Lit rooms still glow, alerts still turn a room red, and tapping a room still opens it.

## Added September 26 (night): the builder pitch
Haven is being pitched to homebuilders as a standard feature in new construction, with the agent layer as a selling point.
- **Vivid finish**, light and dark: keynote-style clarity with vivid accents (light: electric blue, coral, mint; dark: electric blue, cyan, magenta), frosted layers with accent hairlines, bold type. Screens → Appearance switches Auto / Light / Dark.
- **Studio screen** (8th): a large orb (tap to talk) with a voice waveform and the **agent row** (Lighting, Climate, Security, Energy). Agents glow only while working; the lines between them light when one event involves several.
- **Model home showcase**: a per-panel switch for model homes; after a minute untouched Haven runs a short live tour of scenes and says what it's doing; any touch hands control back.
- **Voice waveform** from real signals (recognized words, spoken words, measured ElevenLabs loudness), **lighting previews** (lit tiles glow with their brightness), **animated weather icons**; all motion respects Reduce Motion.
- **Keynote hero renders** (light, dark, builder showcase) from the supplied prompts via the Canva connector; links in DEMOS.md.

## Added September 26 (evening)
- **Wallpaper screen** (7th in the library), modeled on the photo-backed dashboard reference: the home's photo behind frosted tiles, a weather card, indoor temperature and humidity, electricity with a live line, climate, fans, water heater, every light with an icon switch and pill dimmer, doors & water, scenes, updates. The photo follows the time of day; a homeowner can use their own photo (kept on that panel).
- **Photos** made with the ElevenLabs connector (GPT Image 2): evening, then morning and day as edits of it (same house, same camera). The free plan's daily image limit blocked the fourth, so **night is a color grade of the evening photo**. Prompts are in DESIGN.md to regenerate them or to redo them from the client's house.
- **Weather** (`src/weather.js`): Home Assistant weather entity or Open-Meteo (free, no key) once the home's latitude and longitude are in config/home.json. Used by the Wallpaper screen, screen headers, the conversation agent, the offline parser ("is it going to rain today?") and briefings. Without a source, everything says weather isn't connected. The demo shows sample weather, labeled.
- **ElevenLabs voice** (`src/speech.js`): with `ELEVENLABS_API_KEY` on the home server, Haven speaks with a natural voice ("River" by default) on every panel; any failure falls back to the browser voice. Samples in `docs/voice/` (River and Eric).

## Fixed in the debug pass
1. **Demo safety bypass:** the demo shared live device objects with the screen, so the new +/− buttons could push the water heater to 130°F past its 125°F limit. The demo now copies data both ways, like a real network.
2. **Double-tapping +/−** only counted once. Taps now add up.
3. **Brief me now** posted the briefing twice in chat.
4. **"Turn on the lights"** with no room turned on every light in the house, outside ones included. It now uses the room with motion in the last 15 minutes, or asks which room.
5. **"Porch lights"** also turned on the driveway lights. Named devices now win.
6. **"What's the temperature"** without a question mark, **"turn on the heat / AC"** and **"turn the water back on"** (the phrase the leak alert suggests) weren't understood.
7. **No way to turn the water heater back on** from the app after a leak shut it off, and **no thermostat mode button**. Both restored.
8. **Freeze protection** waited up to 30 seconds. It now reacts the moment the temperature drops.
9. **Simulator endpoint** could unlock doors by faking "sensor" data. It now accepts only sensor readings.
10. **Geofence endpoint** accepted any arrival type. It now accepts only approaching, arrived or left.
11. **A quick restart could lose the last change.** State is now saved on shutdown.

## Not yet verified
- **The live Claude AI** (conversation, briefings and the nightly reflection). No API key here, so all three are tested only against a mocked API. First thing to try: put `ANTHROPIC_API_KEY` in `.env` (or the cloud environment's settings) and run `npm run live-check`: seven checks against the simulated house, each failing if Claude didn't actually do it. The API is reachable from the cloud container (checked September 26), so this can run there too.
- **Live weather and the live ElevenLabs voice.** Open-Meteo and the ElevenLabs API are blocked from this cloud container, so both are tested against stand-ins with the real response shapes. First thing to try: set the home's latitude/longitude and `ELEVENLABS_API_KEY`, run `npm start`, and ask "what's the weather?".
- **Real microphones and speakers.** Voice is tested with stand-ins for the browser's speech features. Try it on the actual panel device over HTTPS (docs/APPLE-SETUP.md, section 1b). Voice input doesn't work inside the published demo links (the viewer blocks microphones); speech output should.
- **Real hardware.** Tested against a fake Home Assistant, not a real one.
- **Real push to a phone.** Payloads are tested; delivery to an actual iPhone/Watch needs an ntfy topic or Pushover keys.
- **Apple Shortcuts** on a real iPhone (the endpoints they call are tested).
- **Fonts** fall back to system fonts in this container (Google Fonts is blocked here); viewers get the real ones.
- **Concept images** (docs/DEMOS.md) haven't been looked at by me; the image host is blocked here.

## Next steps
The full enterprise roadmap is in [ENTERPRISE-PLAN.md](ENTERPRISE-PLAN.md). The immediate steps:

1. Live Claude test with an API key: chat, "Review my day", and a briefing. Add the home's location for weather and an ElevenLabs key for the voice at the same time.
2. Pick Haven's voice (River or Eric in `docs/voice/`, or any ElevenLabs voice) and, when the image limit resets, regenerate the night wallpaper (or all four from a photo of the client's house).
3. Try voice on a real tablet or phone over HTTPS.
4. Choose the demo direction with the client (A or B), then a full room set in that style.
5. Move `home-ai/` into its own repository. This repo auto-deploys the All in 1 Events site to Netlify, which would publish these files under that site.
6. Connect a Home Assistant hub and one real device of each type.
7. Native iOS/watchOS app with Confirm on the watch (see ANALYSIS.md roadmap).
