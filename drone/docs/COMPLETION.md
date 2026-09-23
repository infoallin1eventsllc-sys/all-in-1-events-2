# What "complete" means for Drone Command — and where it stands

One aircraft platform, three products: **light shows**, **site survey** (mapping,
3D models, inspection), **surveillance**. This is the honest state of each layer, what is built in this repo,
what needs hardware in your hands, and what needs a permit rather than code.

## Status

| Layer | State | Where |
| --- | --- | --- |
| Operator dashboards (3) with a client-facing design system | ✅ built | `src/dashboards`, `DESIGN.md` |
| Simulation for every dashboard (so it demos without hardware) | ✅ built | `src/hooks` |
| Aircraft link: Bluetooth LE + USB telemetry radio, MAVLink v2 codec with CRC | ✅ built, codec unit-tested | `src/link`, `npm test` |
| Flight control: arm / takeoff / land / RTL / mode / go-to / **mission upload** | ✅ built | `src/link/useAircraftLink.tsx` |
| Pre-flight gate on real aircraft (heartbeat, GPS fix, sats, HDOP, battery, link) | ✅ built | link popover |
| Multi-aircraft on one radio (routing by MAVLink system id) | ✅ built | link → Surveillance aircraft slots |
| Real video: capture device (HDMI stick / USB cam) and WebRTC from the aircraft | ✅ built both ends | `src/link/useVideoSource.ts`, `hardware/companion-pi/video` |
| Bluetooth bridge firmware for the aircraft | ✅ built | `hardware/esp32-ble-bridge` |
| Site survey: camera maths, grid / crosshatch / orbit plans, coverage grid, re-fly of weak patches | ✅ built, unit-tested | `src/survey`, `npm test` |
| Survey mission upload (camera trigger by distance, gimbal, ROI) over MAVLink | ✅ built, encoder unit-tested | Site survey → Upload |
| Survey package: QGC plan, Mission Planner waypoints, geotags, ODM geo.txt, coverage | ✅ built, unit-tested | Site survey → Export package |
| Remote ID receiver | ✅ built, standalone | `hardware/companion-pi/remoteid` (no dashboard since Defense was retired) |
| Light-show package export (CSV per aircraft + manifest, Skybrush/Blender import) | ✅ built | Light show → Cues → Export |
| CI: typecheck, codec tests, build on every push | ✅ built | `.github/workflows/drone.yml` |
| Flight recorder: every session recorded, browsable, exportable, printable | ✅ built, unit-tested | `src/record`, Records tab |
| Analytics: flight hours, products, fleet health (service interval, battery drain), safety, flight-log export | ✅ built, unit-tested | Analytics tab, `src/analytics` |
| Network link: any browser incl. iPhone/iPad, via the companion computer's WebSocket bridge | ✅ built, tested end to end against a stand-in autopilot | link → Network, `hardware/companion-pi/bridge` |
| PX4 as well as ArduPilot: modes, takeoff, go-to, missions | ✅ built, tested end to end | `src/link/mavlink.ts` |
| Payload on real aircraft: gimbal, zoom, thermal source, spotlight, photo, photo feedback | ✅ built, codec checked against pymavlink | Surveillance action bar |
| Installable app (home screen, offline, shortcuts) on phone, tablet and laptop | ✅ built | Install app button, `public/manifest.webmanifest` |
| Aircraft health: which part is failing, in flight and after landing; parts life | ✅ built, tested against real ArduCopter 4.5.7 SITL (a weakened motor 3 is caught) | Health tab, `src/diagnostics` |
| Tested against the real ArduPilot firmware, not only a stand-in | ✅ ArduCopter 4.5.7 SITL built from source; arm, takeoff, hover, land and health through the bridge | `hardware/companion-pi/README.md` → SITL |
| Portfolio demo: Overview with live hero, guided tour, labelled sample data | ✅ built | Overview, `src/demo` |
| Patrol feed: real drone footage over real cities and mountains, sensor modes on top; 3D city simulation as fallback and offline option | ✅ built; clips stream from Pexels until `npm run footage` self-hosts them | `src/dashboards/feed` |
| Operator roles (pilot in command / observer / client view-only) stamped on every event | ✅ built | operator menu, `src/operator` |
| Tamper-evident record: every event SHA-256 chained, verified in Records | ✅ built, unit-tested | `src/record/chain.ts` |
| Accounts and a server copy the device can't clear (append-only, chain-checked by the database) | ✅ built and tested against real Postgres; ⏳ needs your Supabase project | `server/`, `src/sync` |
| Remote relay for flying over the internet (fly / watch-only / aircraft roles) | ✅ built, 27-check end-to-end test; ⏳ needs hosting | `hardware/companion-pi/relay` |
| Light show on real aircraft: live-fleet gates, fleet list, abort lands every aircraft | ✅ built | Light show → Fleet |
| TURN relay for video over LTE, both ends | ✅ built; ⏳ needs a TURN server | video source → TURN, `stream.py --turn-user` |
| Crash isolation: one view failing cannot take down the console | ✅ built | `src/dashboards/ErrorBoundary.tsx` |
| Keyboard operation, visible focus, reduced motion, print stylesheet | ✅ built | `src/index.css`, App shortcuts |
| Offline reload at a venue with no signal | ✅ built | `public/sw.js` |
| Deploy under `/drone/` on the events site | ✅ wired, not yet deployed by you | `netlify.toml`, `vercel.json` |
| Bench test against a real flight controller | ⏳ needs hardware | see BOM |
| Video from the aircraft in the field | ⏳ needs companion Pi + data link | `hardware/companion-pi/README.md` |
| Light-show flight (per-aircraft trajectory upload, LED control, RTK, time sync) | ⏳ needs show-control stack | see below |
| Photogrammetry processing (orthomosaic, 3D mesh) | ⏳ external tool | WebODM / Pix4D / DroneDeploy, fed by the package |
| Real camera feedback in coverage (CAMERA_FEEDBACK) | ⏳ needs a mapping camera on the bench | coverage is estimated from distance until then |
| Operator accounts and server-side audit trail | ✅ built (see accounts row above); ⏳ needs your Supabase project | `server/README.md` |
| FAA waivers, insurance, venue agreements | ⏳ paperwork | see Regulatory |

## Bill of materials to bench-test everything (~$700 without an airframe)

| Item | Purpose | ~Price |
| --- | --- | --- |
| Holybro Pixhawk 6C + M10 GPS + PM02 power module | reference flight controller (ArduCopter) | $250 |
| Holybro SiK 915 MHz telemetry radio pair | USB radio path, km range | $60 |
| ESP32 DevKit V1 | Bluetooth bridge | $8 |
| Raspberry Pi 4 (4 GB) + Camera Module 3 + 5 V BEC | companion: WebRTC video | $110 |
| Seagull #MAP2 or a PWM shutter cable + mapping camera | autopilot-triggered photos on the Pixhawk path | $60 + camera |
| USB HDMI capture stick | video path with no companion (works with DJI too) | $20 |
| ELRS or Wi-Fi 5.8 GHz bridge (Ubiquiti NanoStation pair) | air-side IP link for video | $120 |
| DJI Mavic 3 Enterprise | the turnkey mapping aircraft (mechanical shutter, RTK option) | $3,000–4,500 |
| WebODM on any PC with 16 GB RAM, or a Pix4D / DroneDeploy seat | processing | free / $150–350 per month |

A complete surveillance airframe on this controller (frame, motors, ESCs, props,
batteries, gimbal camera) is another $800–2,500 depending on payload; a thermal
payload (FLIR Boson / Hadron) is $1,500–4,000.

## How each vertical becomes real

### Surveillance — closest to done
1. Bench: Pixhawk on USB → link button → USB radio → watch telemetry in the popover.
2. Pad: ESP32 bridge → link button → Bluetooth → pre-flight gate → Arm → Takeoff 30 m.
3. Field: SiK radios, **Route → Upload patrol** sends the five waypoints as a MAVLink
   mission and starts AUTO; the map follows the real aircraft.
4. Video: Pi + camera on the aircraft, `a1-video.service`, **video source → WebRTC**.
   Thermal payload on a second streamer port.

### Site survey — flies today, processes elsewhere
1. Plan in the dashboard: pick Map, 3D model or Inspection; the camera maths sets
   height, spacing and speed. The flight time says how many batteries to bring.
2. Pixhawk path: mapping camera on a shutter cable, **Upload to aircraft** sends the
   survey with `DO_SET_CAM_TRIGG_DIST`, and the autopilot fires the camera by distance.
   DJI path: enter the same height, overlaps and speed from the Plan tab in DJI Pilot 2
   or DroneDeploy — DJI aircraft are not reachable over MAVLink.
3. After landing: **Export package**, copy the SD card, drop both into WebODM (free)
   or Pix4D. A 13 ha venue at 1.6 cm/px is 1–3 hours of processing on a desktop.
4. Before leaving the venue: the Coverage tab flags anything seen by fewer than five
   photos; **Re-fly weak patches** fixes it in minutes instead of a return trip.
5. Add RTK (Mavic 3E RTK module or a Here3+ on the Pixhawk) when a client needs
   survey-grade accuracy (±3 cm) rather than map-grade (±1–2 m).

### Light show — conductor built, flight stack to integrate
The industry flies shows with a dedicated stack: **Skybrush** (open source: Skybrush
Server + Live + the ArduCopter show firmware) or **Verge Aero**. They handle
per-aircraft trajectory upload, RTK positioning, LED programs and the show clock.
This dashboard is the *conductor and client view*; **Export show package** hands the
choreography to that stack. Recommended path: Skybrush on the same Pixhawk/ArduCopter
hardware, this dashboard as the front of house.

## Regulatory (US)

- **Part 107** remote pilot certificate for every operator.
- **Night operations**: allowed under Part 107 with anti-collision lighting visible
  3 statute miles and the night training module.
- **Light shows**: a **107.35 waiver** (one pilot, multiple aircraft) and usually
  **107.39** (over people) — 6–12 weeks; the build's FAA-waiver modal drafts the
  packet. Skybrush/Verge operators often hold these already.
- **Surveillance over people / BVLOS**: 107.39 and, if beyond line of sight,
  107.31 waivers or Part 108 once final.
- **Mapping and inspection**: ordinary Part 107 work — no waiver for a daytime
  survey inside line of sight. Over a crowd needs 107.39; survey before gates open.
  Maps sold as *survey-grade* for boundaries or engineering may need a licensed
  surveyor's sign-off in some states; sell *site planning maps* otherwise.
- **Insurance**: aviation liability, typically $1–5M per occurrence for events.

## Next engineering steps, in order

1. Merge and deploy `/drone/` to the HTTPS site; test Bluetooth and USB from there.
2. Bench-test on a Pixhawk (an afternoon). The same code already flew real
   ArduCopter firmware in SITL, which caught one real bug (takeoff before the mode
   change landed) that the stand-in autopilot hid; hardware may show more.
3. Create the Supabase project and apply `server/supabase/migrations` (15 minutes,
   `server/README.md`); build with `VITE_SYNC_URL`/`VITE_SYNC_ANON_KEY` and `VITE_DEMO=off`.
4. Host the relay (`hardware/companion-pi/relay`, Fly.io or a VPS) and a TURN server
   (coturn) for flying and video over LTE. Then MAVLink2 signing end to end.
5. Fly fault-free baseline flights on your own airframe and tune `LIMITS` in
   `src/diagnostics/health.ts`; turn on ESC telemetry.
6. Fly one real survey with a mapping camera; compare coverage with the processing report.
7. Skybrush integration for show trajectories; this console stays front of house.
