# ESP32 Bluetooth bridge

Puts the flight controller's MAVLink telemetry port on Bluetooth LE so the dashboard
can connect from Chrome/Edge with one click. Receive-and-forward only — it does not
interpret MAVLink.

## Parts (~$12)

| Qty | Part | Note |
| --- | --- | --- |
| 1 | ESP32 DevKit V1 (ESP-WROOM-32) | any 30/38-pin DevKit with the PCB antenna |
| 1 | 6-pin JST-GH cable, one end bare | Pixhawk-standard TELEM pigtail |
| — | heat-shrink, double-sided foam tape | mount away from the GPS puck |

## Wiring

```
Pixhawk TELEM1 (JST-GH 6p)      ESP32 DevKit
  1  VCC 5V   ───────────────►  VIN (5V)
  2  TX       ───────────────►  GPIO16 (RX2)
  3  RX       ◄───────────────  GPIO17 (TX2)
  4  CTS      ─ n/c
  5  RTS      ─ n/c
  6  GND      ───────────────── GND
```

Pin 1 is the red wire. TELEM ports supply 5 V at up to ~1 A; the DevKit's onboard
regulator takes it to 3.3 V. Never feed 5 V into a GPIO.

## Autopilot settings

**ArduPilot** (Mission Planner / QGC → Parameters), for TELEM1:

```
SERIAL1_PROTOCOL   2      MAVLink 2
SERIAL1_BAUD       57     57600
SERIAL1_OPTIONS    0
BRD_SER1_RTSCTS    0      no flow control
```

**PX4**, for TELEM1:

```
MAV_0_CONFIG       101    TELEM1
MAV_0_MODE         0      Normal
MAV_0_RATE         0      unlimited
SER_TEL1_BAUD      57600
MAV_0_FLOW_CTRL    0
```

Reboot the flight controller after changing serial parameters.

## Flash

1. Arduino IDE 2.x → Boards Manager → install **esp32 by Espressif Systems**.
2. Tools → Board → **ESP32 Dev Module**; Upload Speed 921600; pick the USB port.
3. Open `esp32_ble_bridge.ino` → Upload. Hold **BOOT** on the DevKit if the upload
   stalls at "Connecting…".
4. Serial Monitor at 115200 shows `A1 bridge advertising as A1-Drone-Bridge`.

The onboard blue LED blinks while advertising and goes solid when the dashboard is
connected.

## Connect

Open the dashboard over HTTPS in Chrome or Edge → link button (top-right) →
**Bluetooth** → choose **A1-Drone-Bridge**. Within a second the popover shows the
flight mode, GPS fix and battery, and the stream rate (expect 10–30 msg/s).

## Range and use

~30 m line of sight. This is the pad link: pre-flight checks, arming, uploading the
patrol, pairing. For flight use the USB telemetry radio path (SiK / mLRS) which
reaches kilometres.

## Troubleshooting

- **Not in the picker** — the DevKit must be advertising (blinking). The picker only
  lists devices exposing the NUS service UUID; other BLE serial bridges won't show.
- **Connected, no heartbeat** — TX/RX swapped, wrong baud, or `SERIALn_PROTOCOL` not
  MAVLink. Watch the Serial Monitor: nothing arriving on Serial2 means wiring.
- **Stream stalls after a few seconds** — the autopilot stopped seeing our heartbeat.
  The dashboard sends one every second; check the RX wire (bridge → autopilot).
- **Dropped bytes at high rates** — lower SR1_* stream rates, or use the radio path.
