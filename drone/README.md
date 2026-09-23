# All in 1 Drone Command

Operator dashboards for the All in 1 drone platform. One airframe, three verticals,
one build:

| Tab | Dashboard | What the operator sees |
| --- | --- | --- |
| **Light Show** | `src/dashboards/LightShowDashboard.tsx` | Three.js 3D stage, show timeline with cue markers, formation rack, fleet sync / timecode jitter, airfield wind, pre-flight gates (battery, RTK, clock lock, wind, deviation) that gate the ARM button, watch list of highest-deviation airframes, ABORT. |
| **Site survey** | `src/dashboards/SurveyDashboard.tsx` | Mapping and inspection of a venue. Pick the product — **Map** (orthomosaic, nadir grid), **3D model** (crosshatch, camera tilted 25°) or **Inspection** (36-angle orbit of one structure) — and the plan follows from the camera maths: ground detail (cm/px), line spacing, photo spacing, speed limit, flight time and batteries. A **3D stage** (`components/survey/SurveyScanCanvas3D.tsx`) shows the venue constructing itself under the aircraft: unphotographed ground is a survey blueprint, each photo drops from the camera as a tile of the finished map, and buildings, tents, trucks and parked cars rise out of the blueprint when they are photographed. A **Film** camera cuts between chase, crane, orbit, top-down and wide shots with depth of field and grain (drag to take the camera; Overview, Top-down and Follow are the working views); the **Overlap** layer is the in-flight quality report (5+ photos per point is good). Plan view picture-in-picture, gusts that blur photos, automatic battery-swap-and-resume, **Re-fly weak patches**, and a **survey package** export. |
| **Health** | `src/dashboards/HealthView.tsx` | What is wrong with the aircraft, which part, and what to do, live in flight and after landing. See [Aircraft health](#aircraft-health). |
| **Surveillance** | `src/dashboards/SurveillanceDashboard.tsx` | **Live gimbal video feed** from the selected airframe (`DroneFeedCanvas.tsx`: EO / IR white-hot / IR ironbow / night vision, moving heat targets with temperature readout, auto-track lock, DVR) with a strip of the other airframes' feeds; **night protocol** (AUTO / DAY / NIGHT) flips every airborne payload to thermal at night. Patrol map (5-waypoint loop, airframes with sensor footprint and altitude tether, detections), fleet list, live telemetry sparklines, power system, flight control (auto-track, illumination, night vision, thermal scan, survivor detect, RTH, gimbal, zoom, autopilot), navigation route-progress chart, detections queue with dispatch, mission map, event log. |

**How it works** (`src/dashboards/PlatformView.tsx`) is the client-readable front for
everything technical: the three products in one line each, the nine architecture
layers translated into plain sentences (with the real term kept underneath), and a
safety-and-compliance summary a venue actually asks for. The original engineering
tooling — tactical airspace radar, live cockpit / PTT GCS, 3D light-show studio, the
full architecture spec, the fleet telemetry grid, and the DTLS / TimescaleDB / Gazebo
SITL / benchmark / radio / FAA-waiver labs — sits one click further in, under
**Engineering detail**, and keeps its dark tooling chrome.

## Portfolio demo

Opened with no aircraft, the console is a working demo (a Meridian Interface case
study). **Overview** is the front door: a cinematic hero (a fleet of quadcopters in a
dark sky that re-forms as the page scrolls, rendered live in Three.js with bloom and
light trails; a still frame under reduced motion), the three products and what sits
underneath. **Take the tour** (or press
`t`) walks through each screen and can press the one button that brings it to life.
A first visit gets labelled sample content so no page is empty: three recorded
flights with paths, three months of fleet history, and health reports where motor 3
wears out flight by flight. **Remove sample history** in Analytics clears it all.
Build with `VITE_DEMO=off` for an operator install.

**Patrol video.** The patrol feed plays real drone footage over San Francisco, Los
Angeles, New York, mountain ranges and city streets (recorded flights from Pexels;
free for commercial use), with the thermal and night-vision modes applied on top.
Out of the box the clips stream from Pexels. Run `npm run footage` once on a normal
internet connection to download them into `public/footage/` (about 150 MB) so the
site serves them itself; then the sensor modes run in WebGL on the real frames. A
free Pexels API key (`PEXELS_KEY` for the script, `VITE_PEXELS_KEY` for the build)
resolves exact files. If a clip can't load, the feed falls back to a 3D city
simulation with traffic, people and thermal signatures, which is also the offline
option. The clip list is `src/dashboards/feed/footage.ts`. When the footage can't play, the San Francisco feed shows the **opening take** instead (`src/dashboards/feed/sf.ts`): one continuous flight rendered live, low round the Salesforce Tower and the Transamerica Pyramid, out over the Embarcadero, the Golden Gate through rolling fog into the sunset as the hero reveal, then back over the Victorian rooftops and cable-car wires, with a feature grade (teal shadows, warm highlights, grain, lens flare) in the sensor stage. It is also a choice under Video source, and the thermal and night-vision modes run on it.

## Operators, the record and the server

- **Roles.** The operator menu (app bar) sets who is flying and as what: pilot in
  command (commands the aircraft), visual observer (may only abort or bring aircraft
  home) or client (view only). Command buttons follow the role.
- **Tamper-evident record.** Every recorded event carries the operator and is chained
  to the one before with SHA-256 (`src/record/chain.ts`). Records says *Record intact*
  or names the first entry changed after the flight. CSV exports carry the hashes.
- **Server copy.** With a Supabase project configured, operators sign in by email and
  every closed flight uploads; the database re-checks the chain and never lets an
  event be edited or deleted. Setup: [`server/README.md`](server/README.md).
- **Internet relay.** Fly from anywhere without a VPN: the bridge connects out to
  `hardware/companion-pi/relay`, pilots use `/fly/<id>`, clients `/watch/<id>`.

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

## Aircraft health

**Health** (app bar, or press `d`) tells the operator what is wrong with the
aircraft, which part, and what to do, both in the air and after landing. It runs in
the background on every screen. If a fault shows up in flight, a red banner appears
on whatever page is open, and the Health button carries a dot.

It reads the autopilot's own telemetry (`src/diagnostics/`), and needs no extra hardware:

| What goes wrong | How it shows up | What the screen says |
| --- | --- | --- |
| Chipped, bent or loose propeller | one motor worked harder than the others, and it spins faster | *Propeller on motor 3 is damaged or loose — Replace prop 3* |
| Worn bearing, rubbing bell, bad winding | one motor worked harder, draws more current, same rpm, runs hot | *Motor 2 is dragging — Replace motor 2* |
| Twisted arm or tilted motor | all motors of one spin direction work harder all flight | *Twisted arm or tilted motor — Check arms are square* |
| Load off-centre | the motors on one side work harder | *Load sits off-centre* |
| Unbalanced prop, loose motor or FC mount | vibration over 30 m/s², accelerometer clipping | *Vibration is too high* |
| Motor at full power | output saturated, or ArduPilot's "Potential Thrust Loss" | *Motor N ran out of power — Land* |
| Weak battery cell | cells more than 0.1 V apart, a cell under 3.4 V under load | *Battery cells are out of balance — Retire this pack* |
| Sensor, compass, GPS, power rail | SYS_STATUS health bits, EKF / estimator variance, POWER_STATUS | named sensor + *Calibrate* / *Check* |
| Old or test firmware | AUTOPILOT_VERSION | *Firmware is out of date — Update firmware* |

- **Now.** Top-down airframe with each motor coloured by state (autopilot motor
  numbering and spin), a per-motor table (command against the average, rpm,
  temperature, current), the findings with their action, nine system tiles,
  vibration and battery cells, and the autopilot's own warnings.
- **After landing.** A report per flight is saved on disarm (IndexedDB). A motor
  trend across flights flags a motor that is working a little harder every flight,
  which means it is wearing out. There is also the hands-on checklist. The data
  cannot see a fresh crack in an arm or a prop until it changes how the aircraft
  flies, so check by hand.
- **Parts and service.** Hours on the propellers, motor bearings, frame, FC mount
  and firmware since each was last replaced or checked. *Mark replaced* logs it,
  from here or straight from a finding.
- **Simulated quadcopter.** With no aircraft connected, pick a fault (chipped
  prop, worn bearing, twisted arm, vibration, weak cell, compass interference, old
  firmware) and fly a test flight to see exactly where it shows up.

**What the aircraft must send:** ArduPilot sends everything by default. For motor
rpm and temperature (which tell a damaged prop from a failing motor) turn on ESC
telemetry (BLHeli / DShot, `SERVO_BLH_*`). Per-cell voltages need a cell monitor
or a smart battery. Without them the screen says so and still gives every other
check. PX4 works too (ESC_STATUS, ESTIMATOR_STATUS). The app asks for the streams
and the firmware version on connect. Thresholds are in `LIMITS` in
`src/diagnostics/health.ts`. Every decoder is checked against pymavlink, and each
simulated fault is tested end to end in `scripts/diagnostics.test.mjs`. The bench
vehicle has the same faults: `fake_vehicle.py --fault prop3`.

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
