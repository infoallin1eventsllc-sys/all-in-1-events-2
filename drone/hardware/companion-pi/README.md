# Companion computer (Raspberry Pi)

Three services. On the aircraft: the **MAVLink bridge** (fly from any phone, tablet
or laptop) and the **video streamer**. At the venue: the optional **Remote ID
receiver**. They can share a Pi on the bench.

## Parts

| Role | Part | ~Price |
| --- | --- | --- |
| Airborne video | Raspberry Pi Zero 2 W (light) or Pi 4/5 (thermal + EO) | $15 / $60 |
| | Pi Camera Module 3 (EO) — or a UVC camera, or a FLIR Boson / Hadron on USB (thermal) | $25 / $300+ |
| | 5 V 3 A BEC from the flight battery; 32 GB microSD | $10 |
| | Air-side data link: 5.8 GHz Wi-Fi bridge (Ubiquiti / Mikrotik) or LTE HAT with a SIM | $80–150 |
| Venue Remote ID | Raspberry Pi 4 (onboard BLE) + external BLE 5 dongle for long range | $60 + $15 |
| | Weatherproof box, PoE splitter or 5 V supply | $30 |

## Install (Raspberry Pi OS Bookworm, 64-bit)

```bash
sudo apt update && sudo apt install -y python3-pip python3-venv libavdevice-dev libavfilter-dev libopus-dev libvpx-dev ffmpeg bluez
python3 -m venv ~/a1 && source ~/a1/bin/activate
pip install -r requirements.txt
```

Copy this folder to `/opt/a1/` on the Pi, then:

```bash
sudo cp systemd/a1-bridge.service systemd/a1-video.service systemd/a1-remoteid.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now a1-bridge     # aircraft Pi: MAVLink for phones and tablets
sudo systemctl enable --now a1-video      # aircraft Pi
sudo systemctl enable --now a1-remoteid   # venue Pi
journalctl -u a1-video -f
```

## MAVLink bridge → dashboard (phones, tablets, laptops)

iPhones and iPads can't use Bluetooth or USB from a web page, and Android support for
USB is new. The bridge puts the flight controller on the network instead:
`bridge/mavlink_ws.py` reads MAVLink from the controller (Pi UART, or a USB radio)
and serves it as a WebSocket on port **8770**. In the dashboard: **link button →
Network → `wss://<pi-address>:8770/?token=<token>` → Connect**. Several screens can
connect at once (the pilot's laptop and a client's iPad, say).

Wiring: flight controller **TELEM2** → Pi UART (TX→RX, RX→TX, GND), and in ArduPilot
`SERIAL2_PROTOCOL = 2`, `SERIAL2_BAUD = 921`. PX4: `MAV_1_CONFIG = TELEM 2`,
`SER_TEL2_BAUD = 921600`.

**Secure connection (wss).** The dashboard is served over HTTPS, and browsers only
let an HTTPS page open `wss://` sockets. Two ways to give the bridge a certificate:

- **Tailscale (easiest, also works over LTE):** install Tailscale on the Pi and on the
  phone, run `sudo tailscale cert <pi-name>.<tailnet>.ts.net`, and point `--cert/--key`
  at the files. Connect to `wss://<pi-name>.<tailnet>.ts.net:8770/?token=…`.
- **Self-signed (closed field network):** generate a cert, then on each phone open
  `https://<pi-address>:8770/` once and accept it; the page says *Certificate accepted*.

Always set `--token`: anyone who can reach the socket can command the aircraft.

**Bench test with no drone:** `bridge/fake_vehicle.py` is a stand-in autopilot
(ArduCopter by default, `--px4` for PX4). It answers arming, modes, takeoff, go-to,
missions, gimbal, zoom, camera source, relay and photos, and prints every command.
It also sends the health telemetry a real ArduCopter does (motor outputs, vibration,
ESC telemetry, cells, sensors, EKF, firmware version) and can fake a mechanical fault:

```bash
python3 bridge/mavlink_ws.py --udp 127.0.0.1:14550 --token test &
python3 bridge/fake_vehicle.py --to 127.0.0.1:14550        # or --px4, --legacy-gimbal
python3 bridge/fake_vehicle.py --fault prop3                # health screen: prop3, motor2, arm, vibration, cell, compass, oldfw
# dashboard (opened from http://localhost): Network → ws://127.0.0.1:8770/?token=test
```

## Video → dashboard

`stream.py` serves a WebRTC offer/answer endpoint on port 8080. In the dashboard:
**Surveillance → video source → WebRTC → `http://<pi-ip>:8080`**. Latency is
~150–250 ms glass-to-glass on a good link.

- Pi Camera 3: enable the libcamera V4L2 shim (`/dev/video0`) or run
  `rpicam-vid -t 0 --codec mjpeg -o - | ...`; simplest is `--device /dev/video0 --mjpeg`.
- Thermal (FLIR Boson USB): `--device /dev/video1 --size 640x512 --fps 30`, second
  instance on `--port 8081`.
- **HTTPS**: the dashboard is served over HTTPS, so browsers require the Pi endpoint
  to be HTTPS too unless it's `localhost`. Either give the Pi a cert
  (`--cert --key`, e.g. via a Tailscale HTTPS cert or your own CA) or tunnel it
  with Tailscale / Cloudflare Tunnel — both also solve reachability over LTE.
- Across the internet add a TURN relay: `--ice turn:turn.example.com --ice stun:stun.l.google.com:19302`.

**No companion computer?** A USB HDMI capture stick ($20) into the laptop from the
controller's HDMI out works with **video source → Capture device** — that path works
with DJI aircraft too, since it's just video.

## Remote ID → dashboard

`receiver.py` scans BLE for Open Drone ID broadcasts and serves decoded tracks over
WebSocket on port 8765. The Defense dashboard that displayed them has been retired;
the receiver still runs on its own (any WebSocket client can read the tracks) and can
return as an airspace-awareness panel for shows and surveys.

What arrives per aircraft: serial / registration, UA type, position, altitude,
height, speed, direction, status (ground / airborne / emergency), **operator
position**, operator ID, and RSSI. That is enough to plot the drone and the pilot.

Range with the Pi's onboard radio is ~100 m; a BLE 5 dongle on a mast reaches
300–500 m. Put one at each corner of a large site.

## Legal note (US)

Receiving Remote ID is legal for anyone. **Jamming, spoofing, taking over or
shooting down a drone is a federal crime** for anyone who is not one of a few
federal agencies (18 U.S.C. 32, 47 U.S.C. 333, the Aircraft Sabotage Act). A
private venue's counter-drone product is *detect, locate the operator, alert
security and law enforcement*. The dashboard's effector controls are therefore
hidden unless an authorized integrator enables them.
