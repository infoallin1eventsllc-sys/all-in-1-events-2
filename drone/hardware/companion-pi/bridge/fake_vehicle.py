#!/usr/bin/env python3
"""A stand-in autopilot for bench tests: no drone, no radio, no simulator install.

Speaks enough ArduCopter (default) or PX4 (--px4) MAVLink to exercise every
command the dashboard sends: heartbeat, GPS, position, battery, arming, flight
modes, takeoff, go-to, RTL/land, the mission and geofence upload handshakes,
gimbal, zoom, camera source, relay and photos. It flies a point mass, not
physics — for flight dynamics use ArduPilot SITL.

Missions run the way the autopilots run them: ArduCopter refuses to arm in AUTO
and starts on MISSION_START; PX4 arms in mission mode and goes. Takeoff,
waypoints, speed, gimbal, distance camera triggering (CAMERA_FEEDBACK on
ArduPilot, CAMERA_TRIGGER on PX4) and RTL execute in order; MISSION_CURRENT,
HOME_POSITION, WIND and FENCE_STATUS are reported. A low battery triggers the
battery failsafe (BATT_FS_LOW_ACT / COM_LOW_BAT_ACT), and a landed, disarmed
aircraft gets a fresh pack after a few seconds, as a crew would swap it.

Parameters: PARAM_REQUEST_READ and PARAM_SET for the fence, battery failsafe and
RTL altitude, with the firmware's own defaults (ArduCopter 4.5: FENCE_TYPE 7,
a 300 m circle and 100 m ceiling, warn-only battery failsafe, RTL_ALT in cm;
PX4: GF_ACTION hold, no distance limits, warn-only battery failsafe). PX4 values
are bytewise (an INT32's bytes in the float field), ArduPilot's are cast. The
fences are enforced as the firmware does: ArduCopter 4.5's DO_FENCE_ENABLE
switches on every type in FENCE_TYPE, so a survey that leaves the circle is
turned round by FENCE_ACTION. Unknown names get no answer (4.5 has no PARAM_ERROR).

  python3 fake_vehicle.py --to 127.0.0.1:14550          # then: mavlink_ws.py --udp 0.0.0.0:14550
  python3 fake_vehicle.py --to 127.0.0.1:14550 --px4
  python3 fake_vehicle.py --legacy-gimbal               # refuse gimbal v2, to test the fallback
  python3 fake_vehicle.py --fault prop3                  # health screen: chipped prop on motor 3
  python3 fake_vehicle.py --time 8                       # run the world 8× faster (long survey missions)
  python3 fake_vehicle.py --param BATT_FS_LOW_ACT=2      # start with a parameter changed from its default
      (faults: prop3, motor2, arm, vibration, cell, compass, oldfw)

Health telemetry is sent like a real ArduCopter's: motor outputs (SERVO_OUTPUT_RAW),
VIBRATION, ESC telemetry, per-cell BATTERY_STATUS, sensor health in SYS_STATUS,
EKF_STATUS_REPORT, POWER_STATUS, and AUTOPILOT_VERSION when asked for it.

Every command received is printed as one line (`CMD name …`), which the bench
test reads back.
"""
from __future__ import annotations

import argparse
import math
import os
import random
import struct
import time

os.environ.setdefault("MAVLINK20", "1")
from pymavlink import mavutil  # noqa: E402
from pymavlink.dialects.v20 import ardupilotmega as m  # noqa: E402

HOME = (33.7701, -118.1937)
M_PER_DEG = 111_320.0

# ArduCopter custom modes / PX4 (main, sub)
ARDU = {"STABILIZE": 0, "AUTO": 3, "GUIDED": 4, "LOITER": 5, "RTL": 6, "LAND": 9}
PX4 = {"TAKEOFF": (4, 2), "LOITER": (4, 3), "AUTO": (4, 4), "RTL": (4, 5), "LAND": (4, 6), "POSCTL": (3, 0)}


def say(*a) -> None:
    print(*a, flush=True)


I8, I32, F32 = m.MAV_PARAM_TYPE_INT8, m.MAV_PARAM_TYPE_INT32, m.MAV_PARAM_TYPE_REAL32
# name: [default, MAV_PARAM_TYPE]. ArduCopter 4.5 (libraries/AC_Fence/AC_Fence.cpp, AP_BattMonitor_Params.cpp,
# ArduCopter/Parameters.cpp); PX4 main (navigator/geofence_params.yaml, rtl_params.yaml, commander/commander_params.yaml).
ARDU_PARAMS = {"FENCE_ENABLE": (0, I8), "FENCE_TYPE": (7, I8), "FENCE_ACTION": (1, I8), "FENCE_RADIUS": (300.0, F32),
               "FENCE_ALT_MAX": (100.0, F32), "FENCE_MARGIN": (2.0, F32), "BATT_FS_LOW_ACT": (0, I8), "RTL_ALT": (1500, I32)}
PX4_PARAMS = {"GF_ACTION": (2, I32), "GF_MAX_HOR_DIST": (0.0, F32), "GF_MAX_VER_DIST": (0.0, F32), "COM_LOW_BAT_ACT": (0, I32),
              "RTL_RETURN_ALT": (60.0, F32)}
FENCE_ALT_MAX_BIT, FENCE_CIRCLE_BIT, FENCE_POLYGON_BIT, FENCE_ALT_MIN_BIT = 1, 2, 4, 8


class Vehicle:
    def __init__(self, px4: bool, legacy_gimbal: bool, fault: str = "none") -> None:
        self.px4 = px4
        self.fault = fault
        self.clip = 0
        self.cell_wear = 0.0
        self.legacy_gimbal = legacy_gimbal
        self.lat, self.lon, self.alt = HOME[0], HOME[1], 0.0
        self.target: tuple[float, float, float] | None = None
        self.mode = "LOITER" if px4 else "STABILIZE"
        self.armed = False
        self.battery = 96.0
        self.heading = 0.0
        self.speed = 0.0
        self.gimbal_pitch = 0.0
        self.mission: list = []
        self.fence: list = []
        self.fence_on = False
        self.expect = 0
        self.upload_type = 0
        self.upload: list = []
        self.cur = 0            # mission item being flown (MISSION_CURRENT)
        self.photos = 0
        self.cruise = 8.0
        self.trig_dist = 0.0
        self.trig_acc = 0.0
        self.batt_fs = 25.0     # battery failsafe below this, action from BATT_FS_LOW_ACT / COM_LOW_BAT_ACT
        self.batt_warned = False
        self.params = {k: list(v) for k, v in (PX4_PARAMS if px4 else ARDU_PARAMS).items()}
        self.version = (1, 15, 2) if px4 else (4, 5, 7)
        # ArduPilot fence types switched on (FENCE_ENABLE 1 switches on all of FENCE_TYPE at boot); PX4 applies GF_ limits always.
        self.fence_types = 0
        self.fence_breach = 0   # FENCE_STATUS breach_type while outside
        self.landed_since = 0.0
        self.events: list[tuple[str, object]] = []  # things for the main loop to send

    def p(self, name: str) -> float:
        return self.params[name][0]

    def boot(self) -> None:
        if not self.px4 and int(self.p("FENCE_ENABLE")) == 1:
            self.fence_types = int(self.p("FENCE_TYPE")) & ~FENCE_ALT_MIN_BIT

    def fence_enable(self, on: bool, mask: int) -> int:
        """DO_FENCE_ENABLE as ArduPilot's GCS_Fence.cpp: 4.6+ takes param2 as a type mask, 4.5 enables all of FENCE_TYPE."""
        configured = int(self.p("FENCE_TYPE"))
        present = configured & (FENCE_ALT_MAX_BIT | FENCE_CIRCLE_BIT | FENCE_ALT_MIN_BIT | (FENCE_POLYGON_BIT if self.fence else 0))
        mask = mask if self.version >= (4, 6, 0) and mask else 0xF
        if on and not present & mask:
            return m.MAV_RESULT_FAILED
        self.fence_types = (self.fence_types | (configured & mask)) if on else (self.fence_types & ~mask)
        return m.MAV_RESULT_ACCEPTED

    def rtl_alt(self) -> float:
        return self.p("RTL_RETURN_ALT") if self.px4 else self.p("RTL_ALT") / 100

    def check_fence(self) -> None:
        """Circle and ceiling (ArduPilot) or distance limits (PX4) round home; the breach action takes over once."""
        if not self.armed or self.alt < 0.5 or self.mode in ("RTL", "LAND"):
            return
        dist = math.hypot((self.lat - HOME[0]) * M_PER_DEG, (self.lon - HOME[1]) * M_PER_DEG * math.cos(math.radians(self.lat)))
        if self.px4:
            h, z, act = self.p("GF_MAX_HOR_DIST"), self.p("GF_MAX_VER_DIST"), int(self.p("GF_ACTION"))
            out = (0 < h < dist) or (0 < z < self.alt)
            modes = {2: "LOITER", 3: "RTL", 5: "LAND"}
        else:
            on = self.fence_types & int(self.p("FENCE_TYPE"))
            out = bool(on & FENCE_CIRCLE_BIT and dist > self.p("FENCE_RADIUS")) or bool(on & FENCE_ALT_MAX_BIT and self.alt > self.p("FENCE_ALT_MAX"))
            act = int(self.p("FENCE_ACTION"))
            modes = {1: "RTL", 2: "LAND", 3: "RTL", 4: "LAND", 5: "RTL"}
        was, self.fence_breach = self.fence_breach, (m.FENCE_BREACH_BOUNDARY if out else 0)
        if out and not was:
            self.events.append(("text", f"Fence breached {dist:.0f} m from home"))
            say(f"EVT fence breach at {dist:.0f} m, {self.alt:.0f} m up")
            if act in modes:
                self.mode = modes[act]
                self.target = (self.lat, self.lon, self.alt) if self.mode == "LOITER" else None
                self.trig_dist = 0.0

    def battery_failsafe(self) -> None:
        act = int(self.p("COM_LOW_BAT_ACT" if self.px4 else "BATT_FS_LOW_ACT"))
        mode = ({2: "LAND", 3: "RTL", 4: "RTL"} if self.px4 else {1: "LAND", 2: "RTL", 3: "RTL", 4: "RTL", 5: "LAND", 6: "RTL", 7: "LAND"}).get(act)
        if mode is None:
            if not self.batt_warned:
                self.batt_warned = True
                self.events.append(("text", "Battery low (failsafe action: warn only)"))
                say("EVT battery low, warn only")
            return
        self.mode = mode
        self.trig_dist = 0.0
        self.events.append(("text", f"Battery failsafe: {mode}"))
        say(f"EVT battery failsafe {mode}")

    # --- parameters -------------------------------------------------------------
    def param_value(self, mav, name: str) -> None:
        value, ptype = self.params[name]
        wire = struct.unpack("<f", struct.pack("<i", int(value)))[0] if self.px4 and ptype != F32 else float(value)
        mav.param_value_send(name.encode(), wire, ptype, len(self.params), list(self.params).index(name))

    def param_set(self, mav, msg) -> None:
        name = msg.param_id if isinstance(msg.param_id, str) else msg.param_id.decode()
        if name not in self.params:
            say(f"PARAM set {name} unknown")
            return
        ptype = self.params[name][1]
        if self.px4 and msg.param_type != (F32 if ptype == F32 else I32):
            say(f"PARAM set {name} REFUSED: type {msg.param_type} is not the parameter's own")  # PX4 answers PARAM_ERROR type mismatch
            return
        if self.px4 and ptype != F32:
            value = struct.unpack("<i", struct.pack("<f", msg.param_value))[0]
        else:
            value = round(msg.param_value) if ptype != F32 else msg.param_value
        self.params[name][0] = value
        say(f"PARAM set {name} {value:g}")
        self.param_value(mav, name)

    def first_item(self) -> int:
        return 0 if self.px4 else 1  # ArduPilot's item 0 is home

    def start_mission(self) -> None:
        self.mode = "AUTO"
        self.cur = self.first_item()
        self.target = None
        self.run_do_items()

    def item(self):
        return self.mission[self.cur] if 0 <= self.cur < len(self.mission) else None

    def run_do_items(self) -> None:
        """Execute DO_ commands at the current position until the next NAV command."""
        while True:
            it = self.item()
            if it is None or it.command < 80 or it.command in (m.MAV_CMD_NAV_TAKEOFF, m.MAV_CMD_NAV_WAYPOINT, m.MAV_CMD_NAV_RETURN_TO_LAUNCH):
                return
            c = it.command
            if c == m.MAV_CMD_DO_CHANGE_SPEED and it.param2 > 0:
                self.cruise = it.param2
            elif c in (m.MAV_CMD_DO_MOUNT_CONTROL, m.MAV_CMD_DO_GIMBAL_MANAGER_PITCHYAW):
                self.gimbal_pitch = it.param1
            elif c == m.MAV_CMD_DO_SET_CAM_TRIGG_DIST:
                self.trig_dist, self.trig_acc = it.param1, 0.0
                if it.param3 == 1 and it.param1 > 0:
                    self.photo()
            say(f"MIS do {c} {it.param1:.1f}")
            self.cur += 1

    # --- modes ------------------------------------------------------------------
    def custom_mode(self) -> int:
        if self.px4:
            main, sub = PX4.get(self.mode, (4, 3))
            return (main << 16) | (sub << 24)
        return ARDU.get(self.mode, 0)

    def set_mode_from(self, p2: float, p3: float) -> str:
        if self.px4:
            for name, (main, sub) in PX4.items():
                if main == int(p2) and sub == int(p3):
                    return name
            return self.mode
        for name, num in ARDU.items():
            if num == int(p2):
                return name
        return self.mode

    def photo(self) -> None:
        self.photos += 1
        self.events.append(("photo", self.photos))

    # --- motion -----------------------------------------------------------------
    def step(self, dt: float) -> None:
        if not self.armed:
            self.speed = 0
            self.landed_since += dt
            if self.landed_since > 4 and self.battery < 80:
                self.battery = 96.0
                self.batt_warned = False
                say("EVT battery swapped")
            return
        self.landed_since = 0.0
        if self.battery < self.batt_fs and self.mode not in ("RTL", "LAND"):
            self.battery_failsafe()
        self.check_fence()
        if self.mode == "AUTO" and self.mission:
            it = self.item()
            if it is None:
                self.target = None
            elif it.command == m.MAV_CMD_NAV_TAKEOFF:
                self.target = (self.lat, self.lon, it.z)
                if self.alt >= it.z - 0.5:
                    self.cur += 1
                    self.run_do_items()
            elif it.command == m.MAV_CMD_NAV_WAYPOINT:
                self.target = (it.x / 1e7, it.y / 1e7, it.z)
            elif it.command == m.MAV_CMD_NAV_RETURN_TO_LAUNCH and self.px4:
                # PX4 flies a mission RTL item by switching to Return mode (MISSION_CURRENT stays on the item);
                # ArduCopter flies it inside AUTO. The dashboard must read both as the survey finishing.
                self.mode = "RTL"
                say("MIS rtl item: Return mode")
            elif it.command == m.MAV_CMD_NAV_RETURN_TO_LAUNCH:
                self.target = (HOME[0], HOME[1], 0.0 if self.near_home() else max(self.alt, self.rtl_alt()))
        elif self.mode in ("RTL", "LAND"):
            self.target = (HOME[0], HOME[1], 0.0 if self.mode == "LAND" or self.near_home() else max(self.alt, self.rtl_alt()))
        if not self.target:
            self.speed = 0
            return
        tlat, tlon, talt = self.target
        dy = (tlat - self.lat) * M_PER_DEG
        dx = (tlon - self.lon) * M_PER_DEG * math.cos(math.radians(self.lat))
        d = math.hypot(dx, dy)
        v = self.cruise if self.mode == "AUTO" else 8.0
        if d > 0.5:
            s = min(d, v * dt)
            if self.trig_dist > 0 and self.mode == "AUTO":
                self.trig_acc += s
                while self.trig_acc >= self.trig_dist:
                    self.trig_acc -= self.trig_dist
                    self.photo()
            self.lat += (dy / d) * s / M_PER_DEG
            self.lon += (dx / d) * s / (M_PER_DEG * math.cos(math.radians(self.lat)))
            self.heading = (math.degrees(math.atan2(dx, dy)) + 360) % 360
            self.speed = v
        else:
            self.speed = 0
            it = self.item()
            if self.mode == "AUTO" and it is not None and it.command == m.MAV_CMD_NAV_WAYPOINT and abs(self.alt - it.z) < 1:
                say(f"MIS reached {self.cur}")
                self.cur += 1
                self.run_do_items()
        self.alt += max(-3 * dt, min(4 * dt, talt - self.alt))
        self.battery = max(10, self.battery - 0.01 * dt * (2 + self.speed))
        self.cell_wear = min(1.0, self.cell_wear + dt / 900)
        it = self.item()
        rtl_item = self.mode == "AUTO" and it is not None and it.command == m.MAV_CMD_NAV_RETURN_TO_LAUNCH
        if self.alt <= 0.05 and (self.mode in ("LAND", "RTL") or rtl_item) and self.near_home():
            self.armed = False
            say("EVT landed and disarmed")

    # --- health ---------------------------------------------------------------
    SPIN_CW = (False, False, True, True)  # quad X, ArduPilot numbering: motors 3 and 4 spin clockwise

    def motor_mult(self) -> list[float]:
        f = self.fault
        if f == "prop3":
            return [0.98, 0.98, 1.25, 0.98]
        if f == "motor2":
            return [0.99, 1.12, 0.99, 0.99]
        if f == "arm":
            return [1.045 if cw else 0.955 for cw in self.SPIN_CW]
        return [1.0, 1.0, 1.0, 1.0]

    def outputs_pct(self) -> list[float]:
        if not self.armed:
            return [0.0] * 4
        base = 48.0 if self.alt > 0.5 else 22.0
        fwd = 3.5 if self.speed > 6 else self.speed * 0.3
        return [max(0.0, min(100.0, (base + (-fwd if i in (0, 2) else fwd)) * k + random.uniform(-1.2, 1.2)))
                for i, k in enumerate(self.motor_mult())]

    def send_health(self, mav, tick: int, now: float) -> None:
        out = self.outputs_pct()
        flying = self.armed and self.alt > 0.5
        us = [int(1000 + p * 10) if self.armed else 1000 for p in out]
        if tick % 2 == 0:  # 5 Hz
            mav.servo_output_raw_send(int(now * 1e6) & 0xFFFFFFFF, 0, *us, 0, 0, 0, 0)
        if tick % 5 == 0:  # 2 Hz
            v = 11 + random.uniform(-3, 3) if flying else 0.5
            vz = 16 + random.uniform(-4, 4) if flying else 0.6
            if flying and self.fault == "prop3":
                vz += 12
            if flying and self.fault == "vibration":
                vz, v = 48 + random.uniform(-14, 14), 34 + random.uniform(-9, 9)
                if vz > 58:
                    self.clip += random.randint(1, 4)
            mav.vibration_send(int(now * 1e6), abs(v), abs(v * 0.9), abs(vz), self.clip, 0, 0)
            mult = self.motor_mult()
            rpm_mult = [1.0, 1.0, 1.09 if self.fault == "prop3" else 1.0, 1.0]
            cur_mult = [1.0, 1.3 if self.fault == "motor2" else 1.0, 1.0, 1.0]
            hot = [0, 21 if self.fault == "motor2" and flying else 0, 0, 0]
            rpm = [int((1800 + (p if self.fault == "arm" else p / mult[i]) * 98) * rpm_mult[i]) if self.armed else 0 for i, p in enumerate(out)]
            cur = [int((0.3 + (p / 100) ** 2 * 24) * cur_mult[i] * 100) if self.armed else 0 for i, p in enumerate(out)]
            temp = [int(31 + (p * 0.28 if flying else 0) + hot[i]) for i, p in enumerate(out)]
            mav.esc_telemetry_1_to_4_send(temp, [1560] * 4, cur, [0] * 4, rpm, [tick & 0xFFFF] * 4)
        if tick % 10 == 0:  # 1 Hz
            load = 1.0 if flying else 0.4 if self.armed else 0.0
            rest = 4.17 - self.cell_wear * 0.42
            cells = []
            for i in range(4):
                c = rest - load * 0.13 + random.uniform(-0.006, 0.006)
                if self.fault == "cell" and i == 2:
                    c -= 0.05 + load * 0.2
                cells.append(int(c * 1000))
            current = int((21 if flying else 4 if self.armed else 0.4) * 100)
            mav.battery_status_send(0, 1, 1, int((27 + self.cell_wear * 13) * 100), cells + [65535] * 6, current, -1, -1, int(self.battery), 0, 0, [0, 0, 0, 0], 0, 0)
            comp = 0.56 + random.uniform(0, 0.14) if self.fault == "compass" and flying else 0.06 + random.uniform(0, 0.05)
            mav.ekf_status_report_send(0x1FF, 0.08, 0.07, 0.05, comp, 0.0, 0.0)
            mav.power_status_send(5120, 0, 1)

    def send_version(self, mav) -> None:
        major, minor, patch = self.version
        fw = (major << 24) | (minor << 16) | (patch << 8) | 255
        mav.autopilot_version_send(0, fw, 0, 0, 0x8C0000, list(b"fa4e0001"), [0] * 8, [0] * 8, 0x1209, 0x5740, 0)
        say(f"CMD version sent {major}.{minor}.{patch}")

    def near_home(self) -> bool:
        return abs(self.lat - HOME[0]) * M_PER_DEG < 2 and abs(self.lon - HOME[1]) * M_PER_DEG < 2


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--to", default="127.0.0.1:14550", help="where the bridge listens for UDP")
    ap.add_argument("--px4", action="store_true")
    ap.add_argument("--legacy-gimbal", action="store_true")
    ap.add_argument("--time", type=float, default=1.0, help="world speed-up (a long survey mission in minutes)")
    ap.add_argument("--param", action="append", default=[], metavar="NAME=VALUE", help="a parameter changed from its default (repeatable)")
    ap.add_argument("--fault", default="none", choices=["none", "prop3", "motor2", "arm", "vibration", "cell", "compass", "oldfw"],
                    help="simulate a mechanical or setup fault for the health screen")
    args = ap.parse_args()

    link = mavutil.mavlink_connection(f"udpout:{args.to}", source_system=1, source_component=1, dialect="ardupilotmega")
    mav = link.mav
    v = Vehicle(args.px4, args.legacy_gimbal, args.fault)
    if args.fault == "oldfw":
        v.version = (4, 3, 7)
    for kv in args.param:
        name, _, val = kv.partition("=")
        if name not in v.params:
            ap.error(f"--param {name}: not one of {', '.join(v.params)}")
        v.params[name][0] = float(val) if v.params[name][1] == F32 else int(float(val))
    v.boot()
    say(f"EVT fake {'PX4' if args.px4 else 'ArduCopter'} sending to {args.to}")

    def ack(cmd: int, result: int = m.MAV_RESULT_ACCEPTED) -> None:
        mav.command_ack_send(cmd, result)

    last = time.time()
    tick = 0
    while True:
        now = time.time()
        dt, last = now - last, now
        v.step(dt * args.time)
        for kind, val in v.events:
            if kind == "photo":
                if v.px4:
                    mav.camera_trigger_send(int(now * 1e6), val)
                else:
                    mav.camera_feedback_send(int(now * 1e6), 1, 0, val, int(v.lat * 1e7), int(v.lon * 1e7), 10 + v.alt, v.alt, 0, v.gimbal_pitch, v.heading, 12.29, 0)
            elif kind == "text":
                mav.statustext_send(m.MAV_SEVERITY_WARNING, str(val).encode())
        v.events.clear()
        tick += 1
        # 10 Hz loop: position 5 Hz, the rest 1–2 Hz.
        if tick % 10 == 0:
            base = m.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED | (m.MAV_MODE_FLAG_SAFETY_ARMED if v.armed else 0)
            mav.heartbeat_send(m.MAV_TYPE_QUADROTOR, m.MAV_AUTOPILOT_PX4 if v.px4 else m.MAV_AUTOPILOT_ARDUPILOTMEGA, base, v.custom_mode(), m.MAV_STATE_ACTIVE if v.armed else m.MAV_STATE_STANDBY)
            sensors = 0x1 | 0x2 | 0x4 | 0x8 | 0x20 | 0x8000 | 0x10000 | 0x200000 | 0x1000000 | 0x2000000
            mav.sys_status_send(sensors, sensors, sensors, 500, int((13.2 + v.battery * 0.039) * 1000), 1800, int(v.battery), 0, 0, 0, 0, 0, 0)
            mav.gps_raw_int_send(int(now * 1e6), 3, int(v.lat * 1e7), int(v.lon * 1e7), int(v.alt * 1000), 80, 120, 0, 0, 14)
            q = [math.cos(math.radians(v.gimbal_pitch) / 2), 0, math.sin(math.radians(v.gimbal_pitch) / 2), 0]
            mav.gimbal_device_attitude_status_send(0, 0, int(now * 1000) & 0xFFFFFFFF, 0, q, 0, 0, 0, 0)
            mav.mission_current_send(v.cur, len(v.mission))
            if not v.px4:
                mav.wind_send(250.0, 4.2, 0.0)
            mav.fence_status_send(1 if v.fence_breach else 0, 0, v.fence_breach, 0)
        if tick % 50 == 0:
            mav.home_position_send(int(HOME[0] * 1e7), int(HOME[1] * 1e7), 10000, 0, 0, 0, [1, 0, 0, 0], 0, 0, 0)
        if tick % 2 == 0:
            mav.global_position_int_send(int(now * 1000) & 0xFFFFFFFF, int(v.lat * 1e7), int(v.lon * 1e7), int((10 + v.alt) * 1000), int(v.alt * 1000), 0, 0, 0, int(v.heading * 100))
            mav.vfr_hud_send(v.speed, v.speed, int(v.heading), 48 if v.armed else 0, v.alt, 0)
            mav.attitude_send(int(now * 1000) & 0xFFFFFFFF, 0.0, -0.05 * v.speed / 8, math.radians(v.heading), 0, 0, 0)
        v.send_health(mav, tick, now)

        while True:
            msg = link.recv_msg()
            if msg is None:
                break
            t = msg.get_type()
            if t == "COMMAND_LONG" or t == "COMMAND_INT":
                c = msg.command
                p = [msg.param1, msg.param2, msg.param3, msg.param4]
                if c == m.MAV_CMD_COMPONENT_ARM_DISARM and p[0] == 1 and not v.px4 and v.mode == "AUTO":
                    mav.statustext_send(m.MAV_SEVERITY_CRITICAL, b"Arm: Mode not armable")
                    say("CMD arm DENIED (ArduCopter does not arm in AUTO)")
                    ack(c, m.MAV_RESULT_FAILED)
                elif c == m.MAV_CMD_COMPONENT_ARM_DISARM:
                    if p[0] == 1 and not v.armed and v.mode in ("LAND", "RTL"):
                        v.mode = "LOITER" if v.px4 else "STABILIZE"  # after a landing, arm in a flyable mode
                        v.target = None
                    v.armed = p[0] == 1
                    say(f"CMD arm {v.armed}")
                    ack(c)
                    if v.armed and v.px4 and v.mode == "AUTO" and v.mission:
                        v.start_mission()  # PX4 flies its mission once armed in mission mode
                        say("MIS start (PX4 armed in mission mode)")
                elif c == m.MAV_CMD_DO_SET_MODE:
                    was = v.mode
                    v.mode = v.set_mode_from(p[1], p[2])
                    if v.mode == "AUTO" and was != "AUTO" and v.armed and v.alt > 1:
                        v.start_mission()  # AUTO in the air starts (continues) the mission
                    say(f"CMD mode {v.mode}")
                    ack(c)
                elif c == m.MAV_CMD_MISSION_START:
                    ok = v.armed and bool(v.mission)
                    if ok:
                        v.start_mission()
                    say(f"CMD mission start {'accepted' if ok else 'DENIED (not armed)'}")
                    ack(c, m.MAV_RESULT_ACCEPTED if ok else m.MAV_RESULT_FAILED)
                elif c == m.MAV_CMD_DO_FENCE_ENABLE and v.px4:
                    say("CMD fence enable UNSUPPORTED (PX4 enforces an uploaded fence per GF_ACTION)"); ack(c, m.MAV_RESULT_UNSUPPORTED)
                elif c == m.MAV_CMD_DO_FENCE_ENABLE:
                    r = v.fence_enable(p[0] == 1, int(p[1]))
                    v.fence_on = r == m.MAV_RESULT_ACCEPTED and p[0] == 1
                    say(f"CMD fence {'on' if p[0] == 1 else 'off'} types {v.fence_types} ({len(v.fence)} vertices){'' if r == m.MAV_RESULT_ACCEPTED else ' FAILED'}")
                    ack(c, r)
                elif c == m.MAV_CMD_NAV_TAKEOFF:
                    alt = msg.param7 if t == "COMMAND_LONG" else msg.z
                    rel = (alt - 10) if v.px4 else alt  # PX4 sends AMSL; field is 10 m above sea level here
                    ok = v.armed and (v.px4 or v.mode == "GUIDED")
                    if ok:
                        v.target = (v.lat, v.lon, rel)
                        if v.px4:
                            v.mode = "TAKEOFF"
                    say(f"CMD takeoff {rel:.1f} m {'accepted' if ok else 'DENIED (ArduCopter needs GUIDED and armed)'}")
                    ack(c, m.MAV_RESULT_ACCEPTED if ok else m.MAV_RESULT_DENIED)
                elif c == m.MAV_CMD_DO_REPOSITION and t == "COMMAND_INT":
                    v.target = (msg.x / 1e7, msg.y / 1e7, msg.z)
                    v.mode = "LOITER"
                    say(f"CMD reposition {msg.x / 1e7:.6f} {msg.y / 1e7:.6f} {msg.z:.0f} m")
                    ack(c)
                elif c == m.MAV_CMD_NAV_RETURN_TO_LAUNCH:
                    v.mode = "RTL"; say("CMD rtl"); ack(c)
                elif c == m.MAV_CMD_NAV_LAND:
                    v.mode = "LAND"; say("CMD land"); ack(c)
                elif c == m.MAV_CMD_DO_GIMBAL_MANAGER_PITCHYAW:
                    if v.legacy_gimbal:
                        say("CMD gimbal-v2 refused"); ack(c, m.MAV_RESULT_UNSUPPORTED)
                    else:
                        v.gimbal_pitch = p[0]; say(f"CMD gimbal pitch {p[0]:.0f}"); ack(c)
                elif c == m.MAV_CMD_DO_MOUNT_CONTROL:
                    v.gimbal_pitch = p[0]; say(f"CMD mount pitch {p[0]:.0f}"); ack(c)
                elif c == m.MAV_CMD_SET_CAMERA_ZOOM:
                    say(f"CMD zoom {p[1]:.0f}%"); ack(c)
                elif c == m.MAV_CMD_SET_CAMERA_SOURCE:
                    say(f"CMD camera source {'IR' if int(p[1]) == 2 else 'RGB'}"); ack(c)
                elif c == m.MAV_CMD_DO_SET_RELAY:
                    say(f"CMD relay {int(p[0])} {'on' if p[1] else 'off'}"); ack(c)
                elif c == m.MAV_CMD_IMAGE_START_CAPTURE:
                    v.photos += 1
                    mav.camera_feedback_send(int(now * 1e6), 1, 0, v.photos, int(v.lat * 1e7), int(v.lon * 1e7), 10 + v.alt, v.alt, 0, v.gimbal_pitch, v.heading, 12.29, 0)
                    say(f"CMD photo {v.photos}"); ack(c)
                elif c == m.MAV_CMD_SET_MESSAGE_INTERVAL:
                    ack(c)
                elif c == m.MAV_CMD_REQUEST_MESSAGE and int(p[0]) == 148:
                    ack(c); v.send_version(mav)
                elif c == m.MAV_CMD_REQUEST_MESSAGE and int(p[0]) == 242:
                    ack(c); mav.home_position_send(int(HOME[0] * 1e7), int(HOME[1] * 1e7), 10000, 0, 0, 0, [1, 0, 0, 0], 0, 0, 0)
                elif c == m.MAV_CMD_REQUEST_AUTOPILOT_CAPABILITIES:
                    ack(c); v.send_version(mav)
                else:
                    say(f"CMD other {c}"); ack(c, m.MAV_RESULT_UNSUPPORTED)
            elif t == "PARAM_REQUEST_READ":
                name = msg.param_id if isinstance(msg.param_id, str) else msg.param_id.decode()
                if name in v.params:
                    v.param_value(mav, name)
                    say(f"PARAM read {name} {v.p(name):g}")
                else:
                    say(f"PARAM read {name} unknown (no answer)")
            elif t == "PARAM_SET":
                v.param_set(mav, msg)
            elif t == "SET_POSITION_TARGET_GLOBAL_INT":
                v.target = (msg.lat_int / 1e7, msg.lon_int / 1e7, msg.alt)
                say(f"CMD goto {msg.lat_int / 1e7:.6f} {msg.lon_int / 1e7:.6f} {msg.alt:.0f} m (mode {v.mode})")
            elif t == "MISSION_CLEAR_ALL":
                # Like ArduPilot: clear, and acknowledge the clear.
                if msg.mission_type == 1:
                    v.fence = []
                else:
                    v.mission = []
                mav.mission_ack_send(255, 190, m.MAV_MISSION_ACCEPTED, msg.mission_type)
            elif t == "MISSION_COUNT":
                v.upload, v.expect, v.upload_type = [], msg.count, msg.mission_type
                say(f"CMD {'fence' if msg.mission_type == 1 else 'mission'} count {msg.count}")
                mav.mission_request_int_send(255, 190, 0, msg.mission_type)
            elif t == "MISSION_ITEM_INT":
                if msg.mission_type != v.upload_type or msg.seq != len(v.upload):
                    continue
                v.upload.append(msg)
                if msg.seq + 1 < v.expect:
                    mav.mission_request_int_send(255, 190, msg.seq + 1, v.upload_type)
                else:
                    if v.upload_type == 1:
                        v.fence = v.upload
                        say(f"CMD fence done {len(v.fence)} vertices")
                    else:
                        v.mission, v.cur = v.upload, 0
                        say(f"CMD mission done {len(v.mission)} items, item0 cmd {v.mission[0].command}, commands {sorted(set(i.command for i in v.mission))}")
                    mav.mission_ack_send(255, 190, m.MAV_MISSION_ACCEPTED, v.upload_type)
        time.sleep(0.1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
