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
study). **Overview** is the front door: a cinematic scroll-reveal hero (a fleet of
quadcopters in a dark sky, rendered live in Three.js with bloom and light trails; the
stage pins while the visitor scrolls, the headline lifts away, the light show, survey
and patrol each take the screen, and the fleet re-forms with the same scroll; a static
hero under reduced motion), the three products and what sits underneath. **Take the tour** (or press
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
option. The clip list is `src/dashboards/feed/footage.ts`. **AI drone footage (Veo).** `npm run veo` generates photoreal FPV drone clips with Google's Veo model (Gemini API) from the prompts in `scripts/veo-prompts.json`: the Pyramids of Giza at sunrise, a glacier valley in the Alps, Central Park down Fifth Avenue, the Golden Gate into San Francisco, and the freeways into downtown Los Angeles. It needs a Google AI Studio API key with billing enabled in `GEMINI_API_KEY` (Veo is billed per second of video) and ffmpeg. Clips are saved sized for hosting in `public/footage/veo` (720p and a 360p copy for thumbnails) with a manifest; the feed plays them first for their place (including Giza, Egypt), labelled as AI-generated, and because the site serves them itself they play wherever the app is hosted. `npm run veo -- --list` shows the Veo models the key can use; `npm run veo -- giza` makes one clip; `--again` makes a new take.

**Drone fly-throughs.** San Francisco, Los Angeles and New York each have an FPV fly-through rendered live (Video source → Drone fly-through), and a city's feed falls back to it when its recorded footage can't play. Each is one continuous take the way an FPV pilot films a city: it starts low, makes a fast climb, weaves between the towers and ends in a climbing orbit of a landmark. San Francisco skims the Bay, climbs the Ferry Building's clock tower, runs down Market Street and through the Financial District past the Transamerica Pyramid, and orbits the Salesforce Tower out to the Bay Bridge. Los Angeles skims the Harbor Freeway's traffic at golden hour, banks into downtown between the Wilshire Grand and the Aon Center, passes City Hall and orbits the US Bank Tower into the sunset. New York starts low over Central Park, climbs to reveal Midtown, dives down Fifth Avenue, banks past the Chrysler Building's crown and orbits the Empire State Building, ending on Lower Manhattan and the harbour. The camera banks into turns at the coordinated-turn angle, keeps the horizon in frame on a climb and carries a little airframe vibration; any building a route would clip is built lower, and the routes are tested clear of every landmark (`scripts/fly.test.mjs`). The route helper is `src/dashboards/feed/fly.ts`; the Los Angeles and New York cities are built by `metro.ts` from `la.ts` and `ny.ts` (street grid, lane-marked roads, facades with lit windows after dark, parks, palms or street trees, rooftop water tanks, freeways, traffic with head and tail lights, the sprawl, water and hills). The eighteen-shot San Francisco aerial tour (`sf.ts`) is still under Video source. The thermal, night-vision and night-operations modes run on all of them.

**Fleet lab.** `lab/fleet.html` (dev server only, not part of the build) shows six
more airframes in the hero's scene, lighting and grade: a cinema heavy-lift
hexacopter, a freestyle FPV quad, an enterprise security quad with thermal and a
searchlight, a light-show drone, a VTOL fixed-wing mapper and a heavy-lift cargo X8.
They are in `src/components/hero/droneVariants.ts`; the app still flies the
Mavic-class model. Ember, an original sample aircraft (gloss-white shell over carbon, gimballed
camera and blue LED bar, folding props, landing legs), is there too, and `lab/hero.html`
shows the real Overview hero flown by it, with a switch back to the current
hero, so a new look can be judged in place before anything changes. Open `/drone/lab/fleet.html?v=cinema` (or `fpv`, `enterprise`,
`show`, `vtol`, `cargo`) under `npm run dev`. With `&capture`, the page renders any
moment of the shot on request (`window.__shot(t)` returns a PNG). That is how the
stills and the 34-second reel in `portfolio/fleet/` were made (1080p, 24 fps).

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

**The site.** A real survey flies the real boundary. The **Site** tab imports it
(KML or KMZ from Google Earth or DJI Pilot 2, GeoJSON, or a list of "lat, lon"
corners) or builds it by walking the aircraft to each corner and marking it. The
boundary is checked (three or more corners, no crossing edges, 20 × 20 m to
25 km²) and kept on the device. The demo venue stays for demonstrations; with an
aircraft connected, **Bench test here** places its shape around the aircraft's
home for a simulator or props-off bench.

**Before take-off** (the **Aircraft** tab, when an aircraft is live): the link's own
gate (heartbeat, 3D fix, 10+ satellites, HDOP, battery, radio) plus what a survey
needs: a real site, the aircraft within 500 m of it, a mission the autopilot can
hold (700 items), height within 120 m, and, as advisories, wind under 10 m/s and
battery for the plan (or a note that it will swap and resume).

**Upload** sends the geofence first (the site, every lead-in and home, pushed out
30 m with rounded corners; mission type 1, then `DO_FENCE_ENABLE`), then the
mission, built for the autopilot the heartbeat reports:
`NAV_TAKEOFF` (at home) → `DO_CHANGE_SPEED` → gimbal pitch (`DO_MOUNT_CONTROL` on
ArduPilot, `DO_GIMBAL_MANAGER_PITCHYAW` on PX4) → for every line a waypoint,
`DO_SET_CAM_TRIGG_DIST` on (one photo now, then every *n* metres), the end
waypoint, trigger off (no photos in the turns) → `RTL`. An inspection orbit keeps
the camera on the structure with `DO_SET_ROI_LOCATION`. The mission protocol
(`src/link/missionClient.ts`) sends no `MISSION_CLEAR_ALL` (ArduPilot acknowledges
it, and that ACK can pass for the end of the upload), resends a lost
`MISSION_COUNT`, answers repeated requests, and only accepts the ACK once every
item has been asked for.

**Start** is press-and-hold, and runs the sequence each autopilot needs:
ArduPilot GUIDED → arm → `MISSION_START` (Copter will not arm in AUTO); PX4
mission mode → arm. If the autopilot refuses, its own words (`PreArm: …`) are shown.

**In flight** the dashboard follows the mission item being flown
(`MISSION_CURRENT`): taking off, capturing line *n* of *N*, returning, landing.
Photos come from whatever the aircraft reports (ArduPilot `CAMERA_FEEDBACK`, PX4
`CAMERA_TRIGGER`, a MAVLink camera's `CAMERA_IMAGE_CAPTURED`), queued so none are
lost and never counted twice; with none of those they are estimated from distance
flown with the trigger on, and flagged as estimated in the export. A battery
return (failsafe or the operator's) records where the survey stopped; after the
swap, **Upload resume** builds a mission from that point on the line, and **Re-fly
weak patches** uploads short passes over anything seen by fewer than five photos.

**Bench test.** `node scripts/bench/survey-flight.mjs` (add `--px4` for PX4) flies
the whole thing against the stand-in autopilot through the network bridge: checks,
upload, hold to start, a battery failsafe mid-survey, resume, finish. The stand-in
(`hardware/companion-pi/bridge/fake_vehicle.py`) flies missions the way the
firmware does: ArduCopter refuses to arm in AUTO and starts on `MISSION_START`,
PX4 starts when armed in mission mode, the camera fires by distance, and a low
battery triggers RTL.

**Export package** writes what the next tools need: `mission.plan` (QGroundControl,
with the geofence), `mission.waypoints` (Mission Planner), `site.kml` (Google Earth,
or DJI Pilot 2 as a mapping area for DJI aircraft), `geotags.csv` and `geo.txt`
(Pix4D / WebODM; rejected and estimated frames flagged), `coverage.csv` (views per
cell) and a manifest. The photos stay on the SD card; processing runs in WebODM,
Pix4D, DroneDeploy or Metashape.

**Results.** On the demo venue, **Results** opens the processed model: orthophoto
or elevation (one sequential ramp over the site's own relief), 0.5 m contours, and
measuring tools. **Area & volume** gives cut, fill and net against a fitted base,
the lowest edge point or a level you set, with tonnage by material, highest and
lowest point, horizontal and surface area, and draws the cut/fill heatmap inside
curtain walls. **Distance & grade** gives each segment's grade (labelled on the
model, checked against a limit such as 5 % for an accessible route), average,
steepest and gentlest, lengths, and a cross-section with a table view. **Spot
height** pins an elevation. Measurements export as GeoJSON. The demo measures the
gravel stockpile, the accessible route across the swale (two segments over 5 %)
and a second-stage pad. For a real site, the same measurements run in the
processing software on its elevation model.

Tests: planning maths, missions, fence, resume, boundaries and package
(`scripts/survey.test.mjs`); the mission protocol and start sequence against a
scripted ArduPilot and PX4 (`scripts/mission.test.mjs`); measurements against
known shapes (`scripts/measure.test.mjs`).

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
| Power lead or ESC too close to the compass | compass variance rises and falls with the battery current (correlation over 0.7) | *Compass is disturbed by motor current — Move power wires away* |
| Old or test firmware | AUTOPILOT_VERSION | *Firmware is out of date — Update firmware* |

- **Now.** A diagnostic deck: the aircraft as a hologram (its own frame type,
  drawn as glowing edges and vertex points over a blueprint floor, with a scan
  line sweeping through it). Each motor has a floor ring, a light column and an
  arc for its output; rings are solid for OK, dashed for Watch, thick and pulsing
  for Fault, and every callout says the level, so colour is never the only signal.
  A finding about another part (compass, battery, frame) lights the body and gets
  a callout. Drag to turn it. Beside it are four instruments: a vibration dial, motor
  load bars, a battery ring with the cells, and sensor agreement (the navigation
  filter's check of compass, position, height and velocity as a radar, with its
  watch and failsafe rings). Below: the findings with their action, the per-motor
  table (command against the average, rpm, temperature, current), **Closest to a
  limit** (every reading scaled so watch is 50% and fault 100%, the tightest one
  each second, and which it is), **Compass against motor current** (the
  compass-motor check as a scatter with a fitted line), nine system tiles,
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

### Fleet health (100 to 500 aircraft)

**Health → Whole fleet** (also *Fleet health* in the light show's Fleet tab) runs
the same diagnosis on every aircraft at once, one monitor per aircraft
(`src/diagnostics/fleet.ts`). On a live link each MAVLink system id is its own
aircraft and its messages never mix with another's; with no aircraft connected it
flies a simulated show fleet of 100, 250 or 500 (`fleetSim.ts`) with the spread a
real fleet has on the night: packs of different ages, a few faults, mixed firmware
and an aircraft that drops off the link.

- **Go or hold** for the show, in one sentence: how many to ground and fly spares
  for, how many packs to swap, who is silent, who is on another firmware.
- **Launch grid:** one cell per pad (A01, A02 …), coloured by health (with a shape
  per state: dot, notched ring, cross, dashed ring) or by battery, vibration, motor
  balance, motor temperature or closeness to a limit. Hover for the readings, click
  to open that aircraft's full health screen, and step through the ones that need
  attention with the arrow keys.
- **Pre-show gates** with the pads that fail each one: every aircraft reporting, no
  faults, battery above 40%, 3D GPS fix, one firmware version.
- **Across the fleet:** findings grouped by kind (chipped props, weak cells,
  compass interference …) with the pads, the battery spread against the show
  minimum, which systems the problems sit in, firmware versions, props and motors
  due for service, and a sortable table of every aircraft.

The fleet simulation only runs while the fleet view is open or the fleet is
flying. Tested in `scripts/fleet.test.mjs`, including no false alarms on the
healthy aircraft of a 500-aircraft fleet.

## Control: one aircraft or 500

**Control** (app bar, or press `c`) flies one aircraft or a whole show fleet over
the same dispatcher (`src/control/`).

- **Fleet.** The field from above and from the side, every aircraft at its real
  position. Select by dragging a box, by launch row, or by state (all, ready, in
  the air, on the ground), then *Take off* (row by row, a set number of seconds
  apart), *Hold position*, *Move or climb* (the whole formation by the same offset),
  *Return home*, *Land* or *Disarm*.
- **One aircraft.** Pick it or click it on the map. Take off, hold, land, return
  home, arm or disarm, nudge it 5 m or 2 m at a time, or click the field to send it
  there. Its readings and its health verdict sit beside the map.
- **Every answer tracked.** Each aircraft's COMMAND_ACK comes back by system id:
  accepted, refused with the autopilot's own reason (e.g. a pre-arm failure), no
  response after retries, or held back before sending. *Retry the ones that
  failed* and *Select these* work on any command. Every command is logged in the
  flight record.
- **Safety.** Take off, arm and stop motors are press-and-hold. *Land everything
  now* is one press and goes to every aircraft in the air, whatever is selected.
  *Stop motors* (a forced disarm) also needs a tick to say the aircraft will fall.
  Interlocks keep aircraft with a fault, packs under 40% and aircraft not reporting
  on the ground unless switched off; they never delay landing, holding or stopping.
  A newer command to an aircraft cancels anything older still waiting for it.

How it talks to the aircraft: each command becomes MAVLink steps, and each step
waits for that aircraft's acknowledgement before the next. ArduCopter takes off
only in GUIDED, so *Take off* is GUIDED, then arm, then TAKEOFF (PX4: arm, then
TAKEOFF). Each aircraft arms just before its own takeoff because a staggered launch
of 500 takes longer than the 10 s ArduCopter waits before disarming an idle
aircraft. A lost acknowledgement is retried, and a refused retry of something the
aircraft has already done ("already flying") counts as done. Sending is limited
to 200 commands a second so a radio link is not swamped. With no aircraft
connected, the simulated show fleet answers the same commands with ArduCopter's
rules, a realistic radio delay and the odd lost packet, and the health checks see
it fly. Tested in `scripts/control.test.mjs` (500 aircraft, lost packets, silent
and refused aircraft, row-staggered launch, a Land replacing a waiting Hold).

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

The show stage flies **Ember** airframes (the white-and-carbon sample aircraft from the hero lab) at hero quality. The 20 aircraft nearest the camera (within 32 m; fewer on a device the frame governor finds struggling) are drawn with the full hero build: every part, blades that spin on their motors (counter-rotating pairs), studio reflections from a room environment, a moon key, a blue rim and SMAA edges. The rest of the fleet, up to 512, is a low-detail Ember, which looks the same at that distance; both are a handful of instanced meshes. Each airframe tilts into its direction of travel and carries its show colour in the LED pod under the belly and in the light bar. **Close-up** (camera menu) follows one aircraft from a few metres, through pre-flight on the pads and the whole show; click another aircraft to follow it. Up close the crowd-view LED halos fade out and the glow threshold rises above the paint, so only the lamps bloom, as on the hero. `emberFleet(capacity, 'lite' | 'full')` in `src/components/hero/droneModel.ts` builds both.

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
