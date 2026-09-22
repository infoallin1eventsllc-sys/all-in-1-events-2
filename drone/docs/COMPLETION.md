# What "complete" means for Drone Command — and where it stands

One aircraft platform, three products: **light shows**, **counter-UAS defense**,
**surveillance**. This is the honest state of each layer, what is built in this repo,
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
| Remote ID receiver (the legal counter-drone sensor) + dashboard ingest | ✅ built both ends, decoder unit-tested | `hardware/companion-pi/remoteid`, Defense → Sensors |
| Defense legal posture: detect-and-alert; effectors gated to authorized integrators | ✅ built | Defense action bar |
| Light-show package export (CSV per aircraft + manifest, Skybrush/Blender import) | ✅ built | Light show → Cues → Export |
| CI: typecheck, codec tests, build on every push | ✅ built | `.github/workflows/drone.yml` |
| Deploy under `/drone/` on the events site | ✅ wired, not yet deployed by you | `netlify.toml`, `vercel.json` |
| Bench test against a real flight controller | ⏳ needs hardware | see BOM |
| Video from the aircraft in the field | ⏳ needs companion Pi + data link | `hardware/companion-pi/README.md` |
| Light-show flight (per-aircraft trajectory upload, LED control, RTK, time sync) | ⏳ needs show-control stack | see below |
| RF-spectrum and radar sensors for Defense | ⏳ needs SDR/radar hardware | see below |
| Operator accounts, audit log, multi-tenant | ⏳ not started | needed before a customer logs in |
| FAA waivers, insurance, venue agreements | ⏳ paperwork | see Regulatory |

## Bill of materials to bench-test everything (~$700 without an airframe)

| Item | Purpose | ~Price |
| --- | --- | --- |
| Holybro Pixhawk 6C + M10 GPS + PM02 power module | reference flight controller (ArduCopter) | $250 |
| Holybro SiK 915 MHz telemetry radio pair | USB radio path, km range | $60 |
| ESP32 DevKit V1 | Bluetooth bridge | $8 |
| Raspberry Pi 4 (4 GB) + Camera Module 3 + 5 V BEC | companion: WebRTC video | $110 |
| Raspberry Pi 4 + BLE 5 dongle (or a second Pi) | venue Remote ID receiver | $75 |
| USB HDMI capture stick | video path with no companion (works with DJI too) | $20 |
| ELRS or Wi-Fi 5.8 GHz bridge (Ubiquiti NanoStation pair) | air-side IP link for video | $120 |
| A DJI Mini (any Remote ID drone) | to test Defense detection for real | you may already have one |

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

### Defense — real detection today, legal by design
1. Venue Pi with `a1-remoteid.service` → **Sensors → Remote ID receiver**.
   Every drone sold in the US since 2024 broadcasts Remote ID; you will see the
   aircraft *and its operator's position*.
2. Add RF-spectrum sensing later (HackRF / RTL-SDR + `dronesniffer`-class software
   publishing to the same WebSocket shape) for drones with Remote ID disabled.
3. Effectors: **not for a private company** (see Regulatory). The dashboard ships
   in detect-and-alert posture; the effector bar only appears when an authorized
   integrator flips the flag in Sensors.

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
- **Counter-UAS**: receiving Remote ID is legal for anyone. Jamming, spoofing,
  hacking or downing an aircraft is a federal crime for anyone but a handful of
  federal agencies (18 U.S.C. 32, 47 U.S.C. 302a/333). Sell *detection and
  response coordination* to venues; refer mitigation to law enforcement.
- **Insurance**: aviation liability, typically $1–5M per occurrence for events.

## Next engineering steps, in order

1. Bench-test the link on a Pixhawk (an afternoon). Fix anything the real autopilot
   says differently than the spec.
2. Deploy `/drone/` and test Bluetooth + Serial from the real HTTPS origin.
3. Companion Pi video in the field; add a TURN server for LTE links.
4. Operator login + audit log (every arm, command and effector flag change).
5. Remote ID receiver at one venue for a month; tune the alert thresholds on real
   traffic.
6. Skybrush integration for the light-show flight stack.
