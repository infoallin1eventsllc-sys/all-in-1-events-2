# Haven: Where Things Stand

_Last updated: September 26, 2026 (screen library with six screens, and panel rooms, added). Branch `claude/inspiring-fermi-jpi3vh` in `infoallin1eventsllc-sys/all-in-1-events-2`, folder `home-ai/`._

## Links
- Demo A, Futuristic: https://claude.ai/artifact/NHSYrvBSADDcedguH3CBSm
- Demo B, Grounded: https://claude.ai/artifact/J46Rus2S3KzY9CpbpYKyCk
- Screen library catalog (all six screens, both finishes, links to open each live): https://claude.ai/artifact/4tyqsjpBgWRi3ds9FwLnb6

Both are private until shared from each page's Share menu.

## Verified working
`npm run check` runs everything below. Last result: all passing, twice in a row.

- **104 automated tests** (`npm test`)
  - Safety rules: confirmations, hard limits, the leak interlock, garage anti-bounce, owner vs. AI vs. automation permissions
  - Automations: motion lights on and off, leak shutoff, arriving / approaching / leaving, garage reminders, freeze protection, quiet hours
  - Every chat phrase the panel and docs suggest, plus questions, scenes and the "which room?" fallback
  - **Learning:** "I'm cold/stuffy/too bright/just right" acting and being remembered per time of day; learned brightness used by motion lights and learned temperature on arrival; a habit on 3 days becoming a suggestion (never an action); dismissed suggestions never repeating; two undone motion lights becoming "stop doing that" and accepting it working; learned routines unable to open, unlock or restore water; likes, dislikes and notes remembered, listed and forgotten; conversations logged for reflection
  - **Reflection agent:** offline pattern notes, and the Claude version requesting JSON-schema output with its findings merged safely (mocked API)
  - **Conversation agent tools:** record_feedback and remember through Claude (mocked API)
  - **Energy:** the estimate follows lights, fans, heating and the water heater; today's kWh adds up and resets at midnight; hourly averages and peak; a real meter replaces the estimate
  - Every HTTP route including the profile, feedback, suggestion, forget, reflect and energy routes
  - Home Assistant bridge, ntfy/Pushover payloads, scheduled briefings, and the real server surviving a restart
- **Browser checks** (`npm run e2e`) in both the home-server panel and the demo build: every tile control (switches, brightness slider, fan speeds, climate dial and modes, water heater, valve, garage, locks, Lock up), room tabs, status fixes, Confirm and Cancel, chat, **voice** (a spoken command runs, Haven answers aloud, the speaker button mutes it, the leak alert is read aloud), all five scenes, the feeling buttons, **About you** (learned items, forget one, review my day, a habit suggestion accepted into a routine, forget everything), Brief me now, every simulator button, both styles, the **home map** (every room drawn, tap to open and back, lit rooms glow, the leak room turns red), **energy** (labeled estimated, live power rises when a fan runs, the chart tooltip and table view), and no sideways scrolling at wall-panel or phone width.
- **Screen library** in the browser run: the library lists six screens; each screen renders its parts and a real control works on it (Command Center light switch, Family Hub briefing, Nightstand Goodnight, Rooms light tap, Entry turn off); the panel room makes "turn on the lights" mean that room; no sideways scrolling on any screen at 390px.
- **Accessibility:** automated WCAG 2.2 AA audits (axe-core) inside the browser run: sign-in, whole home in both styles, a room, a leak alert, the Updates and About you tabs, phone width, and each library screen (Command Center, Family Hub, Nightstand, Rooms, Entry). 0 violations.

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
- **The live Claude AI** (conversation, briefings and the nightly reflection). No API key here, so all three are tested only against a mocked API. First thing to try: put `ANTHROPIC_API_KEY` in `.env`, run `npm start`, and chat.
- **Real microphones and speakers.** Voice is tested with stand-ins for the browser's speech features. Try it on the actual panel device over HTTPS (docs/APPLE-SETUP.md, section 1b). Voice input doesn't work inside the published demo links (the viewer blocks microphones); speech output should.
- **Real hardware.** Tested against a fake Home Assistant, not a real one.
- **Real push to a phone.** Payloads are tested; delivery to an actual iPhone/Watch needs an ntfy topic or Pushover keys.
- **Apple Shortcuts** on a real iPhone (the endpoints they call are tested).
- **Fonts** fall back to system fonts in this container (Google Fonts is blocked here); viewers get the real ones.
- **Concept images** (docs/DEMOS.md) haven't been looked at by me; the image host is blocked here.

## Next steps
The full enterprise roadmap is in [ENTERPRISE-PLAN.md](ENTERPRISE-PLAN.md). The immediate steps:

1. Live Claude test with an API key: chat, "Review my day", and a briefing.
2. Try voice on a real tablet or phone over HTTPS.
3. Choose the demo direction with the client (A or B), then a full room set in that style.
4. Move `home-ai/` into its own repository. This repo auto-deploys the All in 1 Events site to Netlify, which would publish these files under that site.
5. Connect a Home Assistant hub and one real device of each type.
6. Native iOS/watchOS app with Confirm on the watch (see ANALYSIS.md roadmap).
