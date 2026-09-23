#!/usr/bin/env python3
"""A stand-in autopilot for bench tests: no drone, no radio, no simulator install.

Speaks enough ArduCopter (default) or PX4 (--px4) MAVLink to exercise every
command the dashboard sends: heartbeat, GPS, position, battery, arming, flight
modes, takeoff, go-to, RTL/land, the mission upload handshake, gimbal, zoom,
camera source, relay and photos (with CAMERA_FEEDBACK). It flies a point mass,
not physics — for flight dynamics use ArduPilot SITL.

  python3 fake_vehicle.py --to 127.0.0.1:14550          # then: mavlink_ws.py --udp 0.0.0.0:14550
  python3 fake_vehicle.py --to 127.0.0.1:14550 --px4
  python3 fake_vehicle.py --legacy-gimbal               # refuse gimbal v2, to test the fallback
  python3 fake_vehicle.py --fault prop3                  # health screen: chipped prop on motor 3
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
        self.mission: list[m.MAVLink_mission_item_int_message] = []
        self.expect = 0
        self.wp = 0
        self.photos = 0

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

    # --- motion -----------------------------------------------------------------
    def step(self, dt: float) -> None:
        if not self.armed:
            self.speed = 0
            return
        if self.mode == "AUTO" and self.mission:
            items = [i for i in self.mission if i.command == m.MAV_CMD_NAV_WAYPOINT]
            if self.wp < len(items):
                it = items[self.wp]
                self.target = (it.x / 1e7, it.y / 1e7, it.z)
        elif self.mode in ("RTL", "LAND"):
            self.target = (HOME[0], HOME[1], 0.0 if self.mode == "LAND" or self.near_home() else max(self.alt, 15))
        if not self.target:
            self.speed = 0
            return
        tlat, tlon, talt = self.target
        dy = (tlat - self.lat) * M_PER_DEG
        dx = (tlon - self.lon) * M_PER_DEG * math.cos(math.radians(self.lat))
        d = math.hypot(dx, dy)
        v = 8.0
        if d > 0.5:
            s = min(d, v * dt)
            self.lat += (dy / d) * s / M_PER_DEG
            self.lon += (dx / d) * s / (M_PER_DEG * math.cos(math.radians(self.lat)))
            self.heading = (math.degrees(math.atan2(dx, dy)) + 360) % 360
            self.speed = v
        else:
            self.speed = 0
            if self.mode == "AUTO":
                self.wp += 1
        self.alt += max(-3 * dt, min(4 * dt, talt - self.alt))
        self.battery = max(10, self.battery - 0.01 * dt * (2 + self.speed))
        self.cell_wear = min(1.0, self.cell_wear + dt / 900)
        if self.alt <= 0.05 and self.mode in ("LAND", "RTL") and self.near_home():
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
        major, minor, patch = (4, 3, 7) if self.fault == "oldfw" else ((1, 15, 2) if self.px4 else (4, 5, 7))
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
    ap.add_argument("--fault", default="none", choices=["none", "prop3", "motor2", "arm", "vibration", "cell", "compass", "oldfw"],
                    help="simulate a mechanical or setup fault for the health screen")
    args = ap.parse_args()

    link = mavutil.mavlink_connection(f"udpout:{args.to}", source_system=1, source_component=1, dialect="ardupilotmega")
    mav = link.mav
    v = Vehicle(args.px4, args.legacy_gimbal, args.fault)
    say(f"EVT fake {'PX4' if args.px4 else 'ArduCopter'} sending to {args.to}")

    def ack(cmd: int, result: int = m.MAV_RESULT_ACCEPTED) -> None:
        mav.command_ack_send(cmd, result)

    last = time.time()
    tick = 0
    while True:
        now = time.time()
        dt, last = now - last, now
        v.step(dt)
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
                if c == m.MAV_CMD_COMPONENT_ARM_DISARM:
                    if p[0] == 1 and not v.armed and v.mode in ("LAND", "RTL"):
                        v.mode = "LOITER" if v.px4 else "STABILIZE"  # after a landing, arm in a flyable mode
                        v.target = None
                    v.armed = p[0] == 1
                    say(f"CMD arm {v.armed}")
                    ack(c)
                elif c == m.MAV_CMD_DO_SET_MODE:
                    v.mode = v.set_mode_from(p[1], p[2])
                    if v.mode == "AUTO":
                        v.wp = 0
                    say(f"CMD mode {v.mode}")
                    ack(c)
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
                elif c == m.MAV_CMD_REQUEST_AUTOPILOT_CAPABILITIES:
                    ack(c); v.send_version(mav)
                else:
                    say(f"CMD other {c}"); ack(c, m.MAV_RESULT_UNSUPPORTED)
            elif t == "SET_POSITION_TARGET_GLOBAL_INT":
                v.target = (msg.lat_int / 1e7, msg.lon_int / 1e7, msg.alt)
                say(f"CMD goto {msg.lat_int / 1e7:.6f} {msg.lon_int / 1e7:.6f} {msg.alt:.0f} m (mode {v.mode})")
            elif t == "MISSION_CLEAR_ALL":
                v.mission = []
            elif t == "MISSION_COUNT":
                v.mission, v.expect = [], msg.count
                say(f"CMD mission count {msg.count}")
                mav.mission_request_int_send(255, 190, 0)
            elif t == "MISSION_ITEM_INT":
                v.mission.append(msg)
                if msg.seq + 1 < v.expect:
                    mav.mission_request_int_send(255, 190, msg.seq + 1)
                else:
                    first = v.mission[0]
                    say(f"CMD mission done {len(v.mission)} items, item0 cmd {first.command}, commands {sorted(set(i.command for i in v.mission))}")
                    mav.mission_ack_send(255, 190, m.MAV_MISSION_ACCEPTED)
        time.sleep(0.1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
