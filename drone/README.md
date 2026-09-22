# All in 1 Drone Command

Operator dashboards for the All in 1 drone platform. One airframe, three verticals,
one build:

| Tab | Dashboard | What the operator sees |
| --- | --- | --- |
| **Light Show** | `src/dashboards/LightShowDashboard.tsx` | Three.js 3D stage, show timeline with cue markers, formation rack, fleet sync / timecode jitter, airfield wind, pre-flight gates (battery, RTK, clock lock, wind, deviation) that gate the ARM button, watch list of highest-deviation airframes, ABORT. |
| **Defense** | `src/dashboards/DefenseDashboard.tsx` | Counter-UAS tactical map (terrain, protected asset, engage / warn rings, sensor coverage, threat tracks with trails and effector cones), selected-track card, disruption control (RF jam / GNSS deny / protocol takeover, power, 2.4 / 5.8 / GNSS band gates, pulse burst, sweep, disrupt target / all, auto-engage), threat board, sensor network with live 2.4 / 5.8 GHz spectrum, event log. |
| **Surveillance** | `src/dashboards/SurveillanceDashboard.tsx` | Patrol map (5-waypoint loop, airframes with sensor footprint and altitude tether, detections), fleet list, live telemetry sparklines, power system, flight control (auto-track, illumination, night vision, thermal scan, survivor detect, RTH, gimbal, zoom, autopilot), navigation route-progress chart, detections queue with dispatch, mission map, event log. |

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

Shared UI (`src/dashboards/ui.tsx`) keeps a single palette: one accent per vertical
(violet / rose / emerald) and a reserved status set (good / warning / serious /
critical) that is never reused for anything else. Map backdrops are procedural
(`src/dashboards/terrain.ts`), rendered once and cached.

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
