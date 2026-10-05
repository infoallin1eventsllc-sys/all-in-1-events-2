# Drone Command: custom build setup checklist

For customers connecting their own drone to Meridian Interface Drone Command. The shareable,
editable copy lives in Claude Docs; this file is the version kept with the code. What it says
each setup can do comes from `capabilitiesOf` in `src/link/mavlink.ts`; keep the two in step.

## The short answer

Your custom drone connects to Drone Command if its flight controller speaks MAVLink, the open
drone language used by ArduPilot and PX4. The flight software, not who built the drone, decides
how much you can do from the screen. Drone Command detects it automatically and only offers the
commands your drone can take.

- **Full control:** ArduPilot or PX4 on any frame: multirotor, helicopter, fixed wing, VTOL, rover or boat.
- **Watch and send routes:** INAV. You see the drone live, send it a route and fly it to a point.
  Arming, takeoff and starting the route stay on your radio.
- **Watch only:** Betaflight (FPV racing firmware). Re-flash the board with ArduPilot or INAV to fly routes.
- **Cannot connect:** DJI, Autel, Skydio and toy drones. They are closed systems.

## Step 1: Flight controller and firmware

- [ ] Flight controller that runs ArduPilot or PX4 (for example Pixhawk 6C/6X, Cube Orange,
      Holybro Durandal, Matek H743, SpeedyBee F405 Wing, Kakute H7). Most cost $40 to $250.
- [ ] Firmware installed: ArduPilot (ArduCopter, ArduPlane, ArduRover) 4.5 or newer, or PX4 1.15
      or newer. Older versions connect, but the health screen flags them for an update. INAV
      connects on its current release, with fewer features.
- [ ] GPS module with compass, mounted away from power wires and motors.
- [ ] Each drone has its own MAVLink system ID (1, 2, 3, ...) if you fly more than one on the same
      radio. ArduPilot: `SYSID_THISMAV`. PX4: `MAV_SYS_ID`. INAV: `mavlink_sysid`.
- [ ] A telemetry port (TELEM1, TELEM2 or a spare UART) set to MAVLink. ArduPilot:
      `SERIALx_PROTOCOL = 2` (MAVLink 2). INAV: the port's Telemetry function set to MAVLink.
- [ ] INAV only: leave the MAVLink autopilot type at GENERIC (the default), and set up a GCS NAV
      mode switch on your radio if you want to send the drone to a point from the screen.

## Step 2: Connection to your computer

| Connection | What you need | Range | Works on |
| --- | --- | --- | --- |
| USB cable | The flight controller's USB port and a cable | Bench only | Chrome or Edge on a laptop |
| Telemetry radio | A radio pair (SiK 915 MHz, mLRS, or an ELRS module in MAVLink mode), about $30 to $60 | 1 to 5+ km | Chrome or Edge on a laptop |
| Bluetooth | The ESP32 Bluetooth bridge from the hardware kit (about $10) on the telemetry port | About 30 m | Chrome or Edge on a laptop or Android |
| Wi-Fi or network | A Raspberry Pi on the drone running the bridge, or an ELRS / ESP Wi-Fi bridge plus the bridge on the laptop | Wi-Fi, LTE or internet | Any browser, including iPhone and iPad |

- [ ] One connection above chosen and wired to a telemetry port set to MAVLink.
- [ ] Radio baud rate known (57,600 is the usual default). Drone Command finds 57,600, 115,200,
      460,800 and 921,600 on its own.
- [ ] Google Chrome or Microsoft Edge for USB or Bluetooth. Safari and Firefox can only use the
      Wi-Fi or network option.
- [ ] Drone Command opened from its secure (https) address.

## Step 3: First-time setup and safety

Drone Command flies a drone that is already set up; it does not load firmware or calibrate
sensors. Do this once in Mission Planner or QGroundControl (INAV Configurator for INAV), and
test-fly by hand before connecting.

- [ ] Frame type and motor order set, and every motor spins the right way.
- [ ] Accelerometer, compass and radio calibrated.
- [ ] Flight modes on the radio include a manual mode and Return to Launch.
- [ ] Battery monitor set up (voltage and, ideally, current).
- [ ] Failsafes on: radio loss and low battery both return home or land, not just warn.
- [ ] Return-home height set above the tallest obstacle at your sites.
- [ ] GPS gets a 3D fix with at least 10 satellites outdoors.
- [ ] Drone hovered (or flown, for a plane) by hand in a manual mode and in a GPS hold mode.

## Step 4 (optional): Camera, gimbal and video

- [ ] Gimbal camera that speaks MAVLink on the flight controller (Siyi A8 mini; ZT6 or ZT30 for thermal).
- [ ] Mapping camera on the flight controller's camera trigger output, for site surveys.
- [ ] Spotlight or beacon on relay 1 of the flight controller.
- [ ] Live video: an HDMI or analog FPV receiver into a USB capture stick, or a Raspberry Pi on
      the drone streaming its camera.

## What works on your setup

| Feature | ArduPilot multirotor | ArduPilot fixed wing | ArduPilot VTOL | ArduPilot rover or boat | PX4 | INAV | Betaflight |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Live map, battery, GPS, recording | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Arm, disarm, change mode | Yes | Yes | Yes | Yes | Yes | From radio | From radio |
| Take off | Yes | Yes, Takeoff mode | Yes, vertical | No | Yes | From radio | From radio |
| Land | Yes | Via mission landing | Yes, vertical | Stops (Hold) | Yes | From radio | From radio |
| Return home, hold position | Yes | Yes, circles | Yes | Yes | Yes | From radio | From radio |
| Fly to a point | Yes | Yes | Yes | Yes | Yes | With GCS NAV mode | No |
| Upload a route | Yes | Yes | Yes | Yes | Yes | Waypoints only | No |
| Start the route from the screen | Yes | Yes | Yes | Yes | Yes | From radio | No |
| Site survey missions | Yes | Yes | Yes | No | Yes | No | No |
| Geofence, safety settings check | Yes | Yes | Yes | Yes | Yes | No | No |
| Gimbal, zoom, thermal, spotlight | Yes | Yes | Yes | Yes | Yes | No | No |
| Health diagnostics | Full | Full | Full | Full | Full | Battery and GPS | Battery and GPS |
| Live video | Yes | Yes | Yes | Yes | Yes | Yes | Yes |

## Setups that cannot connect

- DJI, Autel and Skydio drones (live video still works through an HDMI capture stick).
- Toy and ready-to-fly hobby drones whose controllers can't load ArduPilot, PX4 or INAV.
- KISS and other FPV firmware without MAVLink.
- A homemade controller running its own code, unless it sends MAVLink heartbeats and telemetry.

## Before the first flight with Drone Command

1. Props off. Connect, and check the link button shows your firmware, airframe and "Live".
2. Props off. Check the pre-flight list turns to Go.
3. Props off. Open "What this aircraft can do from here" and confirm it matches the table above.
4. Props on, open field. Take off by hand, switch to a GPS hold mode, then send one short go-to.
5. Upload a two-waypoint route and fly it while the pilot watches, ready to take over.
6. Test Return home from the screen, then from the radio.

- [ ] Pilot holds an FAA Part 107 certificate for commercial flights.
- [ ] Drone registered with the FAA and broadcasting Remote ID.
- [ ] Airspace authorization (LAANC) for controlled airspace, and the site owner's permission.
- [ ] A visual observer while the pilot watches the screen: the drone stays in sight under Part 107.
