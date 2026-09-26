# Haven: Where Things Stand

_Last updated: September 26, 2026. Branch `claude/inspiring-fermi-jpi3vh` in `infoallin1eventsllc-sys/all-in-1-events-2`, folder `home-ai/`._

## Links
- Demo A, Futuristic: https://claude.ai/artifact/NHSYrvBSADDcedguH3CBSm
- Demo B, Grounded: https://claude.ai/artifact/J46Rus2S3KzY9CpbpYKyCk

Both are private until shared from each page's Share menu.

## Verified working
`npm run check` runs everything below. Last result: all passing, twice in a row.

- **82 automated tests** (`npm test`)
  - Safety rules: confirmations, hard limits, the leak interlock, garage anti-bounce, owner vs. AI vs. automation permissions
  - Automations: motion lights on and off, leak shutoff, arriving / approaching / leaving, garage reminders, freeze protection, quiet hours
  - Every chat phrase the app and docs suggest (29 phrases), plus questions, scenes and the "which room?" fallback
  - Every HTTP route, including login protection, lockout after wrong tokens, bad input, the live event stream, Siri Shortcut endpoints and path-traversal blocking
  - Home Assistant bridge against a fake Home Assistant: commands out, state back, sensors feeding automations, unreachable devices reported honestly
  - Push alerts: ntfy and Pushover payloads, a failing channel, info-only messages
  - Scheduled briefings firing once, and quiet-hours messages rolling into the next briefing
  - The real `npm start` program: first-run token, and device state plus activity log surviving a restart
  - The Claude agent's tool loop against a mocked API
- **118 browser checks** (`npm run e2e`), at phone size, in both the home-server app and the demo build: every room control, the status-line fixes, Confirm and Cancel, chat, all five scenes, Brief me now, every simulator button, the look switch, and no sideways scrolling.

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
- **The live Claude AI.** No API key here, so it's tested only against a mocked API. First thing to try: put `ANTHROPIC_API_KEY` in `.env`, run `npm start`, and chat.
- **Real hardware.** Tested against a fake Home Assistant, not a real one.
- **Real push to a phone.** Payloads are tested; delivery to an actual iPhone/Watch needs an ntfy topic or Pushover keys.
- **Apple Shortcuts** on a real iPhone (the endpoints they call are tested).
- **Fonts** fall back to system fonts in this container (Google Fonts is blocked here); viewers get the real ones.
- **Concept images** (docs/DEMOS.md) haven't been looked at by me; the image host is blocked here.

## Next steps
1. Live Claude test with an API key.
2. Choose the demo direction with the client (A or B), then a full room set in that style.
3. Move `home-ai/` into its own repository. This repo auto-deploys the All in 1 Events site to Netlify, which would publish these files under that site.
4. Connect a Home Assistant hub and one real device of each type.
5. Native iOS/watchOS app with Confirm on the watch (see ANALYSIS.md roadmap).
