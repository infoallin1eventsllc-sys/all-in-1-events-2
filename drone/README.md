# All in 1 Drone Command

Operator dashboards for the All in 1 drone platform. One airframe, three verticals,
one build:

| Tab | Dashboard | What the operator sees |
| --- | --- | --- |
| **Light Show** | `src/dashboards/LightShowDashboard.tsx` | Three.js 3D stage, show timeline with cue markers, formation rack, fleet sync / timecode jitter, airfield wind, pre-flight gates (battery, RTK, clock lock, wind, deviation) that gate the ARM button, watch list of highest-deviation airframes, ABORT. |
| **Defense** | `src/dashboards/DefenseDashboard.tsx` | Counter-UAS tactical map (terrain, protected asset, engage / warn rings, sensor coverage, threat tracks with trails and effector cones), selected-track card, disruption control (RF jam / GNSS deny / protocol takeover, power, 2.4 / 5.8 / GNSS band gates, pulse burst, sweep, disrupt target / all, auto-engage), threat board, sensor network with live 2.4 / 5.8 GHz spectrum, **EO/IR-1 camera feed** slewed onto the selected track (`EoIrFeedCanvas.tsx`: four motor hot-spots in IR confirm a quad before engaging), event log. |
| **Surveillance** | `src/dashboards/SurveillanceDashboard.tsx` | **Live gimbal video feed** from the selected airframe (`DroneFeedCanvas.tsx`: EO / IR white-hot / IR ironbow / night vision, moving heat targets with temperature readout, auto-track lock, DVR) with a strip of the other airframes' feeds; **night protocol** (AUTO / DAY / NIGHT) flips every airborne payload to thermal at night. Patrol map (5-waypoint loop, airframes with sensor footprint and altitude tether, detections), fleet list, live telemetry sparklines, power system, flight control (auto-track, illumination, night vision, thermal scan, survivor detect, RTH, gimbal, zoom, autopilot), navigation route-progress chart, detections queue with dispatch, mission map, event log. |

The **Engineering** toggle exposes the views behind the dashboards: tactical airspace
radar (100–500 unit swarm sim), live cockpit / PTT GCS, 3D light-show studio, the
software architecture spec, and the fleet telemetry grid, plus the DTLS / TimescaleDB /
Gazebo SITL / benchmark / radio / FAA-waiver labs.

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

Once linked, the Surveillance dashboard drives the selected aircraft from live
telemetry (position, altitude, heading, speed, battery, GPS, radio RSSI) and
**Return home** sends `MAV_CMD_NAV_RETURN_TO_LAUNCH` to the aircraft. The codec is
`src/link/mavlink.ts` (v2 framing with CRC, the messages the dashboards read, and
heartbeat / command encoding); the transports are `src/link/useAircraftLink.tsx`.

**Not DJI.** DJI consumer and enterprise aircraft don't expose Bluetooth or MAVLink;
they only connect through DJI's Mobile SDK or Cloud API. A custom-built aircraft on
a Pixhawk / Cube / Holybro-class controller is what this link is for.

**Video** does not travel over MAVLink. The feed panel stays synthetic until a video
path exists (WebRTC from a companion computer, or an HDMI capture card via
`getUserMedia`) — that's the next integration.

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
