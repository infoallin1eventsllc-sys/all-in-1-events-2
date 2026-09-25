# Companion computer (Raspberry Pi)

Three services. On the aircraft: the **MAVLink bridge** (fly from any phone, tablet
or laptop) and the **video streamer**. At the venue: the optional **Remote ID
receiver**. They can share a Pi on the bench.

## Install: one command (Raspberry Pi OS Bookworm, 64-bit)

```bash
git clone --depth 1 https://github.com/infoallin1eventsllc-sys/all-in-1-events-2.git
sudo all-in-1-events-2/drone/hardware/companion-pi/install.sh --uart     # aircraft Pi; then sudo reboot
sudo all-in-1-events-2/drone/hardware/companion-pi/install.sh --services remoteid   # venue Pi
```

[`install.sh`](install.sh) installs the bridge, video streamer and Remote ID receiver
into `/opt/a1` (Python in `/opt/a1/venv`), creates the `a1` system user they run as,
generates the bridge token into `/opt/a1/token` (root-only, handed to the bridge as a
systemd credential) and a self-signed certificate if there is none, installs the
systemd units and starts the chosen services (`--services bridge,video` by default).
It prints the token and a dashboard link with this Pi's address filled in
(`…/drone/#bridge=wss://…`; the token rides in the `#` fragment, which never reaches
the web server). Run it again after pulling changes: it only touches what differs,
keeps the token and certificate, and restarts a service only when its code changed.

| Flag | |
| --- | --- |
| `--uart` | the Pi's PL011 UART for the flight controller: `enable_uart=1`, `dtoverlay=disable-bt`, serial console off (backs up `config.txt` and `cmdline.txt`; reboot) — see *Flight controller UART* below |
| `--uart-keep-bt` | the same with `dtoverlay=miniuart-bt` and `core_freq=250`, for a Pi that also runs Remote ID |
| `--services bridge,video,remoteid` | which to enable and start |
| `--dashboard URL` | where your console is served (default `https://allin1events.com/drone/`) |
| `--dry-run` | print every action, change nothing |

By hand, the same thing: `apt install python3-venv ffmpeg bluez libavdevice-dev libavfilter-dev
libopus-dev libvpx-dev`, `python3 -m venv /opt/a1/venv && /opt/a1/venv/bin/pip install -r
requirements.txt`, copy `bridge/ video/ remoteid/` to `/opt/a1/`, `useradd --system a1` (in
`dialout`, `video`, `bluetooth`), write the token, copy `systemd/*.service` to
`/etc/systemd/system/` and `systemctl enable --now a1-bridge a1-video` (`a1-remoteid` on
the venue Pi). `journalctl -u a1-bridge -f` shows what the bridge is doing.

## Parts

| Role | Part | ~Price |
| --- | --- | --- |
| Airborne video | Raspberry Pi Zero 2 W (light) or Pi 4/5 (thermal + EO) | $15 / $60 |
| | Pi Camera Module 3 (EO) — or a UVC camera, or a FLIR Boson / Hadron on USB (thermal) | $25 / $300+ |
| | 5 V 3 A BEC from the flight battery; 32 GB microSD | $10 |
| | Air-side data link: 5.8 GHz Wi-Fi bridge (Ubiquiti / Mikrotik) or LTE HAT with a SIM | $80–150 |
| Venue Remote ID | Raspberry Pi 4 (onboard BLE) + external BLE 5 dongle for long range | $60 + $15 |
| | Weatherproof box, PoE splitter or 5 V supply | $30 |

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

**Flight controller UART.** The unit uses `/dev/serial0`, the GPIO 14/15 UART, not
`/dev/ttyAMA0`: on a Pi 3, 4 and Zero 2 W, `ttyAMA0` (the full PL011 UART) is wired to
the onboard Bluetooth, and `serial0` is the mini-UART, whose baud rate drifts with
the CPU clock and drops bytes at 921600. Give the GPIO pins the PL011:

```bash
sudo raspi-config nonint do_serial_cons 1   # no login console on the UART (it would talk to the autopilot)
sudo raspi-config nonint do_serial_hw 0     # UART hardware on
printf 'enable_uart=1\ndtoverlay=disable-bt\n' | sudo tee -a /boot/firmware/config.txt
sudo systemctl disable --now hciuart
sudo reboot                                  # then: ls -l /dev/serial0  ->  ttyAMA0
```

`disable-bt` turns the onboard Bluetooth off. That is fine on the aircraft Pi, but the
**Remote ID receiver needs BLE**: on a Pi that does both, either use
`dtoverlay=miniuart-bt` (Bluetooth keeps working on the mini-UART with a fixed core
clock, `core_freq=250`) or leave the UART alone and put the flight controller on a
USB-UART adapter (`--serial /dev/ttyUSB0`). A Pi 5 has a separate UART for Bluetooth
and needs none of this (`/dev/ttyAMA0` on GPIO 14/15 with `enable_uart=1`).

**Secure connection (wss).** The dashboard is served over HTTPS, and browsers only
let an HTTPS page open `wss://` sockets. Two ways to give the bridge a certificate:

- **Tailscale (easiest, also works over LTE):** install Tailscale on the Pi and on the
  phone, run `sudo tailscale cert <pi-name>.<tailnet>.ts.net`, and point `--cert/--key`
  at the files. Connect to `wss://<pi-name>.<tailnet>.ts.net:8770/?token=…`.
- **Self-signed (closed field network):** generate a cert, then on each phone open
  `https://<pi-address>:8770/` once and accept it; the page says *Certificate accepted*.

A token is required: anyone who can reach the socket can command the aircraft, so the
bridge refuses to start without one (`--insecure` overrides, for a sealed bench only).
The unit passes it as a systemd credential (`--token-file`), which keeps it out of
`ps`; `A1_TOKEN=…` in the environment also works. With `--udp`, the bridge pins the
first autopilot that sends to it and drops packets from anywhere else; list the
expected sender with `--udp-peer 127.0.0.1:14555` to be strict. If the serial port
fails (cable, USB adapter reset), the bridge exits with status 1 and systemd restarts it.

**Over LTE / the internet, no VPN:** add `--relay wss://<relay>/aircraft/<id>?token=…`
and the bridge also connects *out* to a small relay server you host; phones then
connect to `wss://<relay>/fly/<id>?token=…` (or `/watch/<id>` read-only) from
anywhere. Setup, deploy (Fly.io, Render, any VPS) and security notes:
[`relay/README.md`](relay/README.md).

**Bench test with no drone:** `bridge/fake_vehicle.py` is a stand-in autopilot
(ArduCopter by default, `--px4` for PX4). It answers arming, modes, takeoff, go-to,
missions, gimbal, zoom, camera source, relay and photos, and prints every command.
It answers parameter reads and writes for the fence, battery failsafe and RTL
altitude with the firmware defaults (`--param FENCE_RADIUS=150` to start from
another value) and enforces the fence and failsafe the way the firmware does.
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
- **Who can watch**: the streamer listens on every interface. Start it with
  `--token-file` (see `systemd/a1-video.service`) and put the token in the dashboard's
  URL, `http://<pi-ip>:8080/?token=…`; `--allow-origin https://<dashboard host>` limits
  which page may call it, and `--max-peers` (default 3) caps viewers.
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


## Test against the real ArduPilot firmware (SITL)

The stand-in autopilot is quick, but the real firmware is the truth. ArduCopter's
software-in-the-loop build runs the actual flight code on a laptop:

```bash
git clone --depth 1 --branch Copter-4.5.7 https://github.com/ArduPilot/ardupilot.git && cd ardupilot
git submodule update --init --recursive --depth 1
pip install empy==3.3.4 pexpect future   # if empy fails to build, copy em.py from its sdist into site-packages
./waf configure --board sitl && ./waf copter                   # about 4 minutes
printf "FRAME_CLASS 1\nFRAME_TYPE 1\n" > x.parm
build/sitl/bin/arducopter --model X --defaults Tools/autotest/default_params/copter.parm,x.parm -I0 --home 33.7701,-118.1937,10,0 &
python3 bridge/mavlink_ws.py --tcp 127.0.0.1:5760 --port 8770 --token test
# dashboard: Network → ws://127.0.0.1:8770/?token=test
```

To see the Health screen catch a failing corner on the real autopilot, add
`SIM_ENGINE_FAIL 2` and `SIM_ENGINE_MUL 0.8` to `x.parm` (motor 3 at 80% thrust).

Results with ArduCopter 4.5.7 through the bridge and the real app:

| Case | In flight | After landing |
| --- | --- | --- |
| Healthy | All systems normal; motors within 0.1% | Fit to fly |
| Motor 3 at 80% thrust | Land as soon as it is safe: motor 3 or its propeller (motor 3 +17.4%) | Ground it |

It also showed a real bug the stand-in hid: ArduCopter refuses takeoff until the
switch to GUIDED has landed, so the console now waits for the mode before sending it.
