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
