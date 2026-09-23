# All in 1 Drone Command

Operator dashboards for the All in 1 drone platform. One airframe, three verticals,
one build:

| Tab | Dashboard | What the operator sees |
| --- | --- | --- |
| **Light Show** | `src/dashboards/LightShowDashboard.tsx` | Three.js 3D stage, show timeline with cue markers, formation rack, fleet sync / timecode jitter, airfield wind, pre-flight gates (battery, RTK, clock lock, wind, deviation) that gate the ARM button, watch list of highest-deviation airframes, ABORT. |
| **Site survey** | `src/dashboards/SurveyDashboard.tsx` | Mapping and inspection of a venue. Pick the product — **Map** (orthomosaic, nadir grid), **3D model** (crosshatch, camera tilted 25°) or **Inspection** (36-angle orbit of one structure) — and the plan follows from the camera maths: ground detail (cm/px), line spacing, photo spacing, speed limit, flight time and batteries. A **3D stage** (`components/survey/SurveyScanCanvas3D.tsx`) shows the venue developing under the aircraft as photos are accepted, with its camera frustum and footprint; the **Overlap** layer is the in-flight quality report (5+ photos per point is good). Plan view picture-in-picture, gusts that blur photos, automatic battery-swap-and-resume, **Re-fly weak patches**, and a **survey package** export. |
| **Surveillance** | `src/dashboards/SurveillanceDashboard.tsx` | **Live gimbal video feed** from the selected airframe (`DroneFeedCanvas.tsx`: EO / IR white-hot / IR ironbow / night vision, moving heat targets with temperature readout, auto-track lock, DVR) with a strip of the other airframes' feeds; **night protocol** (AUTO / DAY / NIGHT) flips every airborne payload to thermal at night. Patrol map (5-waypoint loop, airframes with sensor footprint and altitude tether, detections), fleet list, live telemetry sparklines, power system, flight control (auto-track, illumination, night vision, thermal scan, survivor detect, RTH, gimbal, zoom, autopilot), navigation route-progress chart, detections queue with dispatch, mission map, event log. |

**How it works** (`src/dashboards/PlatformView.tsx`) is the client-readable front for
everything technical: the three products in one line each, the nine architecture
layers translated into plain sentences (with the real term kept underneath), and a
safety-and-compliance summary a venue actually asks for. The original engineering
tooling — tactical airspace radar, live cockpit / PTT GCS, 3D light-show studio, the
full architecture spec, the fleet telemetry grid, and the DTLS / TimescaleDB / Gazebo
SITL / benchmark / radio / FAA-waiver labs — sits one click further in, under
**Engineering detail**, and keeps its dark tooling chrome.

## Which drones work

Any aircraft whose flight controller runs **ArduPilot** (recommended) or **PX4** — they
speak **MAVLink**. The autopilot is detected from its heartbeat and every command is
encoded for it (flight-mode numbering, takeoff altitude reference and mission item 0
differ between the two).

| Aircraft | Works? |
| --- | --- |
| ArduPilot: Pixhawk / Cube / Matek controllers (e.g. Holybro X500 V2 + Pixhawk 6C) | ✅ every feature |
| PX4 on the same hardware | ✅ flight, missions, payload |
| Skybrush show drones (ArduPilot show firmware) | ✅ via the show-package export; Skybrush flies the fleet |
| DJI (Mini, Mavic, Mavic 3 Enterprise, Matrice), Autel, Skydio | ❌ closed systems, no MAVLink |

For **all features** on one airframe: ArduPilot, a Raspberry Pi companion computer
(network link + video), a MAVLink gimbal camera (Siyi A8 mini; ZT6 / ZT30 for thermal),
a mapping camera on the autopilot's shutter output, and a spotlight on relay 1.
Payload commands the dashboard sends: gimbal (`DO_GIMBAL_MANAGER_PITCHYAW`, falling back
to `DO_MOUNT_CONTROL`), zoom (`SET_CAMERA_ZOOM`), thermal/colour (`SET_CAMERA_SOURCE`),
spotlight (`DO_SET_RELAY`) and photo (`IMAGE_START_CAPTURE`); it reads the gimbal's
reported angle and every photo's `CAMERA_FEEDBACK`. The codec is checked byte for byte
against pymavlink (`scripts/fixtures/mavlink.json`).

Still simulation-only: person/vehicle detection and auto-track (need onboard AI on the
companion computer) and thermal palettes / night vision (no standard command).

## Phone, tablet or laptop

Drone Command is an installable web app: **Install app** in the app bar (Chrome / Edge
on Android, Windows, macOS) or **Share → Add to Home Screen** on iPhone and iPad. It
opens full-screen from its own icon and reloads offline. Home-screen shortcuts open
straight into Light show, Site survey, Surveillance or Analytics.

| Device | Bluetooth | USB radio | Network |
| --- | --- | --- | --- |
| Laptop, Chrome / Edge | ✅ | ✅ | ✅ |
| Android phone / tablet, Chrome | ✅ | Chrome 148+, some devices | ✅ |
| iPhone / iPad (any browser) | ❌ Apple doesn't allow it | ❌ | ✅ |
| Firefox | ❌ | ❌ | ✅ |

## Talking to a real aircraft

The **link button** in the app bar connects the browser to a flight controller over
**MAVLink**:

| Transport | Browser API | Hardware | Range |
| --- | --- | --- | --- |
| **Bluetooth** | Web Bluetooth (BLE) | A BLE bridge on the flight controller's TELEM port exposing the Nordic UART Service — an ESP32 running a MAVLink-to-NUS sketch is the usual part. | ~30 m: pairing, pre-flight, pad checks |
| **USB telemetry radio** | Web Serial, 57600 baud | SiK 915 MHz, mLRS or ELRS radio plugged into the laptop, or the controller's own USB port | kilometres |
| **Network** | WebSocket | The companion computer's bridge (`hardware/companion-pi/bridge/mavlink_ws.py`) on Wi-Fi, LTE or Tailscale; `wss://` with a token | wherever the network reaches |
| **Simulation** | — | none | — |

Bluetooth and USB need **Chrome or Edge** over **HTTPS** and a click — the browser shows
its own device picker and never connects silently. Network works in every browser. To
bench-test the whole chain with no drone, run the bridge with
`bridge/fake_vehicle.py` (ArduCopter, or `--px4`); see `hardware/companion-pi/README.md`.

Once linked, every vehicle heard on the radio takes over an aircraft slot in the
Surveillance dashboard (routing by MAVLink system id), driven by live telemetry —
position, altitude, heading, speed, battery, GPS, radio RSSI. The link popover shows a
**pre-flight gate** (heartbeat, 3D fix, ≥10 satellites, HDOP, battery, link) and the
flight commands: **Arm · Take off · Land · Return to launch**. In the Route tab,
clicking a waypoint sends a GUIDED go-to, and **Upload patrol** pushes the five
waypoints as a MAVLink mission and starts AUTO. The codec is `src/link/mavlink.ts`
(v2 framing with CRC, decoders, heartbeat / command / mission encoders; `npm test`);
the transports and handshakes are `src/link/useAircraftLink.tsx`. ArduCopter is the
reference autopilot for mode numbers.

**Not DJI.** DJI consumer and enterprise aircraft don't expose Bluetooth or MAVLink;
they only connect through DJI's Mobile SDK or Cloud API. A custom-built aircraft on
a Pixhawk / Cube / Holybro-class controller is what this link is for.

**Video** does not travel over MAVLink. The action bar's **Video** button switches the
feed to a **capture device** (HDMI capture stick or USB camera on this computer —
works with DJI aircraft too) or to **WebRTC from the aircraft's companion computer**
(`hardware/companion-pi/video`). The HUD stays; the synthetic renderer is replaced.

## Hardware kit

| Folder | What |
| --- | --- |
| `hardware/esp32-ble-bridge/` | Arduino sketch + wiring: MAVLink TELEM port → Bluetooth LE (Nordic UART) |
| `hardware/companion-pi/video/` | aiortc WebRTC streamer for the aircraft's camera(s) |
| `hardware/companion-pi/remoteid/` | ASTM F3411 Remote ID receiver → WebSocket. Standalone since the Defense dashboard was retired (see below). |
| `hardware/companion-pi/systemd/` | services for both |

## Site survey on a real aircraft

The plan is a real mission. **Upload to aircraft** (or **Upload & start** once
telemetry is live) sends it over the same MAVLink link as everything else:
`NAV_TAKEOFF` → `DO_CHANGE_SPEED` → `DO_MOUNT_CONTROL` (gimbal pitch) → for every
line a waypoint, `DO_SET_CAM_TRIGG_DIST` on (one photo now, then every *n* metres),
the end waypoint, trigger off — so no photos are wasted in the turns — and `RTL`.
An inspection orbit uses `DO_SET_ROI_LOCATION` to keep the camera on the structure.
The autopilot fires the camera; the dashboard follows the telemetry and estimates
the coverage from distance flown in AUTO at survey height.

**Export package** writes what the next tools need: `mission.plan`
(QGroundControl), `mission.waypoints` (Mission Planner), `geotags.csv` and `geo.txt`
(Pix4D / WebODM, rejected frames flagged), `coverage.csv` (views per 5 m cell) and a
manifest. The photos stay on the SD card; processing runs in WebODM, Pix4D,
DroneDeploy or Metashape. The planning maths, mission and package are unit-tested
(`scripts/survey.test.mjs`).

The Defense (counter-UAS) dashboard was retired in favour of Site survey. Flight
records made with it still open in Records; the Remote ID receiver in `hardware/`
still works on its own and can be brought back as an airspace-awareness panel.

## Analytics

**Analytics** (app bar, or press `a`) answers four questions from the flight
records: how much the fleet flew (flight hours per day or week, against the
previous period), for which product, which aircraft need attention, and what went
wrong.

- **Rollups.** When a recording closes, the recorder condenses it into one small
  summary per flight (`src/analytics/rollup.ts`): time airborne, distance, battery
  used and packs swapped, drain rate, alerts, and per-product numbers (photos and
  coverage, show drift, detections). Raw telemetry is still pruned after 50 flights;
  rollups are kept, so trends cover the whole history. Older recordings are
  back-filled the first time Analytics opens.
- **Fleet health.** Hours since the last logged service (due every 25 flight hours)
  and each aircraft's battery drain rate flight by flight — a pack that now uses
  15% more per minute than on its first flights is flagged *Check battery*.
  **Log service** writes to a maintenance log on the device.
- **Honest numbers.** A session where nothing left the ground is a record, not a
  flight. The alert rate needs an hour of flying before it shows. Real aircraft and
  simulation can be filtered apart. Periods are calendar days, so the headline and
  the chart always agree.
- **Sample history.** On a fresh install, *Load sample history* adds three months of
  example operations (marked as samples, with a banner and a one-click remove) so the
  page can be shown before the fleet has flown.
- **Export flight log** — one CSV row per flight in the current view.

The maths is unit-tested in `scripts/analytics.test.mjs`. The chart colours were
validated for colour-blind separation and contrast in both themes.

## Light show handoff

**Cues → Export show package** downloads a zip with one CSV per aircraft
(`Time [msec],x,y,z,Red,Green,Blue`, z up) and a manifest — the format Skybrush
Studio / Blender and Verge Aero import. The show-control stack flies it.

## Flight records

Every dashboard run is recorded — position and telemetry sampled each second, plus
every command, detection, alert and authorisation — into the browser's IndexedDB.
The **Records** tab (or `r`) browses them, and each one exports as CSV or JSON or
prints as a one-page report for an insurer, a venue or an investigator. Sessions
where nothing happened are discarded; the last 50 are kept. A session is labelled
**Sim** or **Live** so a simulated run can never be mistaken for a flight.

## Operating details

- **Keyboard**: `1` `2` `3` switch verticals, `r` records, `h` how it works, `Esc`
  closes dialogs, `?` lists the shortcuts.
- **Crash isolation**: each view is wrapped in an error boundary, so a failing
  canvas is contained instead of white-screening the console mid-show. The failure
  is written into the flight record.
- **Offline**: a service worker caches the console, so a reload at a venue with no
  signal still opens. Flight commands never depend on it — they go over Bluetooth
  or the radio.
- **Accessibility**: visible focus rings, a skip link, `prefers-reduced-motion`
  support, and a print stylesheet for the report.

## Where this stands

[`docs/COMPLETION.md`](docs/COMPLETION.md): what's built, what needs hardware, the
bill of materials, the regulatory path, and the next engineering steps in order.

## Simulation, not hardware (yet)

Every dashboard runs against a client-side simulation so it can be exercised without a
fleet on the ground:

- `src/hooks/useLightShowSimulation.ts` — formations, transitions, conductor clock.
- `src/hooks/useSurveyMission.ts` — survey flight: capture by distance, coverage grid, gusts and blur, battery swaps.
- `src/hooks/useSurveillanceSimulation.ts` — patrol route, telemetry, power, detections.

The shapes those hooks return are the contract for the real feeds (MAVLink telemetry,
RF sensor fusion, payload classifiers). Swap a hook's internals for a WebSocket / Zenoh
subscriber and the dashboard above it does not change.

Design system: see [`DESIGN.md`](DESIGN.md). Light chrome by default (client-facing),
dark for night operations (toggle in the app bar, persisted). Every screen is the same
shape: headline → hero (camera / map / 3D, with picture-in-picture) → action bar →
one tabbed inspector rail. Tokens live in `src/index.css`, components in
`src/dashboards/ui.tsx`. Map backdrops are procedural (`src/dashboards/terrain.ts`),
rendered once and cached.

## Run

```bash
cd drone
npm install
npm run dev        # http://localhost:3000/drone/
npm run lint       # tsc --noEmit
npm run build      # -> drone/dist
```

## Deploy

The app is built on deploy by the root `npm run build:drone` and served under
`/drone/` of the events site (see `../netlify.toml` and `../vercel.json`). Vite's
`base` is `/drone/` for that reason.
