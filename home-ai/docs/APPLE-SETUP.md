# Apple Setup: iPhone, iPad, Apple Watch and the Car

Everything here uses built-in Apple apps (Shortcuts, Safari) plus one free notification app. No App Store app is required.

In each Shortcut, replace:
- `HAVEN` with your Haven address, e.g. `http://192.168.1.50:8787`, or your Tailscale address for use away from home (for example `http://haven-box:8787`)
- `TOKEN` with your owner token

> **Away from home:** install **Tailscale** on the Haven computer and on your iPhone, iPad and watch's paired phone. Your devices then reach Haven privately from anywhere, with no ports opened on your router.

---

## 1. The app on iPhone and iPad

1. Open Safari and go to `HAVEN`.
2. Tap **Share → Add to Home Screen**.
3. Open Haven from the home screen and enter your owner token once.

## 2. Push alerts on iPhone and Apple Watch

Pick one (or both).

**ntfy (free)**
1. Install **ntfy** from the App Store.
2. Tap **+** and subscribe to a long, random topic name, e.g. `haven-7f3k9q2m`.
3. In Haven's `.env`: `NTFY_TOPIC=haven-7f3k9q2m` (use `NTFY_URL` and `NTFY_TOKEN` if you self-host ntfy).

**Pushover (one-time purchase)**
1. Install **Pushover**, create an application at pushover.net.
2. In `.env`: `PUSHOVER_TOKEN=` (app token) and `PUSHOVER_USER=` (your user key).

**Apple Watch:** open the Watch app on iPhone → **Notifications** → turn on mirroring for ntfy/Pushover. Alerts show on your wrist whenever your phone is locked. Urgent alerts (leaks, freeze risk) use high priority so they come through Focus modes. Allow that for the app in **Settings → Focus**.

## 3. "Hey Siri, ask Haven" (iPhone, Apple Watch, CarPlay, HomePod)

Create a Shortcut named **Ask Haven**:

1. **Dictate Text**
2. **Get Contents of URL**
   - URL: `HAVEN/api/shortcut/ask`
   - Method: **POST**
   - Headers: `Authorization` = `Bearer TOKEN`
   - Request Body: **JSON**, key `text` = *Dictated Text*
3. **Get Dictionary Value** for key `text`
4. **Speak Text** (or **Show Result**)

Now say: *"Hey Siri, Ask Haven"* → *"Is the garage closed?"* / *"Set the house to 70"* / *"Goodnight."*

On Apple Watch, the Shortcut also appears in the Shortcuts app and can be added as a watch face complication.

## 4. Garage button for the car and the watch

Create a Shortcut named **Garage**:

1. **Get Contents of URL**
   - URL: `HAVEN/api/shortcut/garage`
   - Method: **POST**
   - Headers: `Authorization` = `Bearer TOKEN`
   - Request Body: **JSON**, key `action` = `toggle` (or `open` / `close`)
2. **Get Dictionary Value** for key `text`
3. **Speak Text**

- **CarPlay:** Shortcuts appear in the CarPlay Shortcuts app, and *"Hey Siri, Garage"* works hands-free.
- **Apple Watch:** add it as a complication for one-tap garage control.
- Because you ran it yourself, it counts as an owner action and doesn't ask for extra confirmation.

## 5. Arrival and departure (turns on lights, secures the house)

In **Shortcuts → Automation → + → Arrive / Leave**, set your home location. Choose **Run Immediately**.

| Automation | Radius | Body (JSON) to `HAVEN/api/presence` |
|---|---|---|
| Arrive, large radius (~0.5 mile) | Large | `{"person":"owner","kind":"approaching"}` |
| Arrive, home | Small | `{"person":"owner","kind":"arrived"}` |
| Leave, home | Small | `{"person":"owner","kind":"left"}` |

Each uses **Get Contents of URL**, POST, header `Authorization: Bearer TOKEN`.

What happens:
- **Approaching** at night: driveway and porch lights come on. The garage opens automatically only if you set `"autoOpenGarageOnArrival": true` in `config/home.json` (off by default).
- **Arrived:** climate comes back from away setback; at night, the welcome-home scene runs.
- **Left** (and nobody else home): lights and fans off, garage closed, doors locked, thermostat on setback, and a "House secured" alert.

For more than one person, add each to `home.owners` in `config/home.json` and use their `id` in these Shortcuts. Away mode only runs when everyone has left.

## 6. Native Apple Home, Siri and CarPlay garage tile (optional)

If you use Home Assistant as the hub, turn on its **HomeKit Bridge** integration and add the bridge in Apple's Home app. Your lights, fans, thermostat, locks and garage then also appear in:
- the **Home** app on iPhone, iPad, Mac and Apple Watch
- Siri everywhere ("Hey Siri, turn off the kitchen lights")
- **CarPlay**, which offers the garage door automatically as you approach home

Haven still sees every change, logs it, and keeps its safety rules and briefings. With **Apple Home Key** locks (e.g. Schlage Encode Plus), your iPhone or Apple Watch unlocks the front door with a tap.
