# All in 1 Drone Command

Operator dashboards for the All in 1 drone platform. One airframe, three verticals,
one build:

| Tab | Dashboard | What the operator sees |
| --- | --- | --- |
| **Light Show** | `src/dashboards/LightShowDashboard.tsx` | Three.js 3D stage, show timeline with cue markers, formation rack, fleet sync / timecode jitter, airfield wind, pre-flight gates (battery, RTK, clock lock, wind, deviation) that gate the ARM button, watch list of highest-deviation airframes, ABORT. |
| **Defense** | `src/dashboards/DefenseDashboard.tsx` | Counter-UAS tactical map (terrain, protected asset, engage / warn rings, sensor coverage, threat tracks with trails and effector cones), selected-track card, disruption control (RF jam / GNSS deny / protocol takeover, power, 2.4 / 5.8 / GNSS band gates, pulse burst, sweep, disrupt target / all, auto-engage), threat board, sensor network with live 2.4 / 5.8 GHz spectrum, **EO/IR-1 camera feed** slewed onto the selected track (`EoIrFeedCanvas.tsx`: four motor hot-spots in IR confirm a quad before engaging), event log. |
| **Surveillance** | `src/dashboards/SurveillanceDashboard.tsx` | **Live gimbal video feed** from the selected airframe (`DroneFeedCanvas.tsx`: EO / IR white-hot / IR ironbow / night vision, moving heat targets with temperature readout, auto-track lock, DVR) with a strip of the other airframes' feeds; **night protocol** (AUTO / DAY / NIGHT) flips every airborne payload to thermal at night. Patrol map (5-waypoint loop, airframes with sensor footprint and altitude tether, detections), fleet list, live telemetry sparklines, power system, flight control (auto-track, illumination, night vision, thermal scan, survivor detect, RTH, gimbal, zoom, autopilot), navigation route-progress chart, detections queue with dispatch, mission map, event log. |

**How it works** (`src/dashboards/PlatformView.tsx`) is the client-readable front for
everything technical: the three products in one line each, the nine architecture
layers translated into plain sentences (with the real term kept underneath), and a
safety-and-compliance summary a venue actually asks for. The original engineering
tooling — tactical airspace radar, live cockpit / PTT GCS, 3D light-show studio, the
full architecture spec, the fleet telemetry grid, and the DTLS / TimescaleDB / Gazebo
SITL / benchmark / radio / FAA-waiver labs — sits one click further in, under
**Engineering detail**, and keeps its dark tooling chrome.

## Talking to a real aircraft

The **link button** in the app bar (next to the theme toggle) connects the browser to a
flight controller over **MAVLink** — the protocol PX4 and ArduPilot speak:

| Transport | Browser API | Hardware | Range |
| --- | --- | --- | --- |
| **Bluetooth** | Web Bluetooth (BLE) | A BLE bridge on the flight controller's TELEM port exposing the Nordic UART Service — an ESP32 running a MAVLink-to-NUS sketch is the usual part. | ~30 m: pairing, pre-flight, pad checks |
| **USB telemetry radio** | Web Serial, 57600 baud | SiK 915 MHz, mLRS or ELRS radio plugged into the laptop, or the controller's own USB port | kilometres |
| **Simulation** | — | none | — |

Both need **Chrome or Edge** (desktop, or Android for Bluetooth) over **HTTPS**, and a
click — the browser shows its own device picker and never connects silently.

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
| `hardware/companion-pi/remoteid/` | ASTM F3411 Remote ID receiver → WebSocket, the legal counter-drone sensor |
| `hardware/companion-pi/systemd/` | services for both |

## Defense on real data, legally

**Sensors → Remote ID receiver** connects to the venue Pi and plots every Remote ID
broadcast — the aircraft *and the operator's position* — relative to the **venue
position** you set. The action bar's default posture is **detect & alert**: mark
priority, notify security, export the track log. Effector controls (jam / GNSS deny /
takeover) are a federal crime for anyone but a few US agencies and stay hidden unless
an authorized integrator enables them in Sensors; every effector command is logged.

## Light show handoff

**Cues → Export show package** downloads a zip with one CSV per aircraft
(`Time [msec],x,y,z,Red,Green,Blue`, z up) and a manifest — the format Skybrush
Studio / Blender and Verge Aero import. The show-control stack flies it.

## Where this stands

[`docs/COMPLETION.md`](docs/COMPLETION.md): what's built, what needs hardware, the
bill of materials, the regulatory path, and the next engineering steps in order.

## Simulation, not hardware (yet)

Every dashboard runs against a client-side simulation so it can be exercised without a
fleet on the ground:

- `src/hooks/useLightShowSimulation.ts` — formations, transitions, conductor clock.
- `src/hooks/useDefenseSimulation.ts` — threat tracks, sensors, effectors, spectrum.
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
