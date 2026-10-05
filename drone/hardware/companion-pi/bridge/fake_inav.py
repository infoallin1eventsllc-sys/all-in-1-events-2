#!/usr/bin/env python3
"""A stand-in INAV flight controller for bench tests: the hobby-build case.

Speaks MAVLink the way INAV's telemetry does (src/main/telemetry/mavlink.c), over
MAVLink 1 by default (INAV's `mavlink_version = 1`) or 2 with --v2:

  sends     HEARTBEAT as MAV_AUTOPILOT_GENERIC, its modes in ArduCopter's numbers with the
            custom-mode flag; GPS_RAW_INT, GLOBAL_POSITION_INT, ATTITUDE, SYS_STATUS, VFR_HUD
  takes     the mission upload as MISSION_COUNT -> MISSION_REQUEST -> MISSION_ITEM (not _INT),
            waypoints and RTL in GLOBAL_RELATIVE_ALT only; COMMAND_INT DO_REPOSITION in
            MAV_FRAME_GLOBAL, accepted only with GCS NAV mode on (--gcs-nav), DENIED otherwise
  ignores   COMMAND_LONG (INAV has no handler: arming and modes are the pilot's radio),
            MISSION_ITEM_INT, PARAM_* beyond nothing

Every message it acts on or ignores is printed as one line, which the bench test reads.

  python3 fake_inav.py --to 127.0.0.1:14552                 # then: mavlink_ws.py --udp 127.0.0.1:14552
  python3 fake_inav.py --to 127.0.0.1:14552 --flying --gcs-nav --v2
"""
from __future__ import annotations

import argparse
import math
import os
import sys
import time

ap_ = argparse.ArgumentParser()
ap_.add_argument("--to", default="127.0.0.1:14552", help="where the bridge listens for UDP")
ap_.add_argument("--gcs-nav", action="store_true", help="GCS NAV mode switched on from the radio (go-to accepted)")
ap_.add_argument("--v2", action="store_true", help="MAVLink 2 instead of INAV's MAVLink 1 setting")
ap_.add_argument("--flying", action="store_true", help="armed and holding at 30 m (the pilot launched it from the radio)")
args = ap_.parse_args()
if args.v2:
    os.environ["MAVLINK20"] = "1"
else:
    os.environ.pop("MAVLINK20", None)
from pymavlink import mavutil  # noqa: E402

HOME = (33.7701, -118.1937)
POSHOLD, AUTO = 16, 3          # ArduCopter numbers, as INAV maps its modes (inavToArduCopterMap)


def say(s: str) -> None:
    print(s, flush=True)


def main() -> None:
    link = mavutil.mavlink_connection(f"udpout:{args.to}", source_system=1, source_component=1, dialect="common")
    mav = link.mav
    say(f"EVT fake INAV (MAVLink {2 if args.v2 else 1}) sending to {args.to}")
    expect, mission = 0, {}
    lat, lon, alt = HOME[0], HOME[1], (30.0 if args.flying else 0.0)
    last_hb = last_fast = 0.0
    t0 = time.time()
    while True:
        now = time.time()
        if now - last_hb >= 1:
            last_hb = now
            base = mavutil.mavlink.MAV_MODE_FLAG_MANUAL_INPUT_ENABLED | mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED
            if args.flying:
                base |= mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED
            mav.heartbeat_send(mavutil.mavlink.MAV_TYPE_QUADROTOR, mavutil.mavlink.MAV_AUTOPILOT_GENERIC, base, POSHOLD, mavutil.mavlink.MAV_STATE_STANDBY)
            mav.sys_status_send(0, 0, 0, 500, 16200, 1200, 82, 0, 0, 0, 0, 0, 0)
        if now - last_fast >= 0.2:
            last_fast = now
            us = int((now - t0) * 1e6)
            mav.gps_raw_int_send(us, 3, int(lat * 1e7), int(lon * 1e7), int((11 + alt) * 1000), 80, 120, 0, 0, 14)
            mav.global_position_int_send(int((now - t0) * 1000), int(lat * 1e7), int(lon * 1e7), int((11 + alt) * 1000), int(alt * 1000), 0, 0, 0, 9000)
            mav.attitude_send(int((now - t0) * 1000), 0.01, -0.02, math.pi / 2, 0, 0, 0)
            mav.vfr_hud_send(0, 0, 90, 0, alt + 11, 0)
        msg = link.recv_match(blocking=True, timeout=0.05)
        if msg is None:
            continue
        t = msg.get_type()
        if t == "MISSION_COUNT":
            expect, mission = msg.count, {}
            say(f"MIS count {expect}")
            mav.mission_request_send(255, 190, 0)
        elif t == "MISSION_ITEM":
            frame_ok = msg.frame == mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT or (msg.frame == mavutil.mavlink.MAV_FRAME_MISSION and msg.command == 20)
            if not frame_ok:
                say(f"MIS item {msg.seq} refused frame {msg.frame}")
                mav.mission_ack_send(255, 190, mavutil.mavlink.MAV_MISSION_UNSUPPORTED_FRAME)
                continue
            if msg.command not in (16, 20):
                say(f"MIS item {msg.seq} refused command {msg.command}")
                mav.mission_ack_send(255, 190, mavutil.mavlink.MAV_MISSION_UNSUPPORTED)
                continue
            mission[msg.seq] = (msg.x, msg.y, msg.z, msg.command)
            say(f"MIS item {msg.seq} cmd {msg.command} {msg.x:.6f},{msg.y:.6f} alt {msg.z:.0f}")
            if msg.seq + 1 < expect:
                mav.mission_request_send(255, 190, msg.seq + 1)
            else:
                say(f"MIS stored {len(mission)} waypoints")
                mav.mission_ack_send(255, 190, mavutil.mavlink.MAV_MISSION_ACCEPTED)
        elif t == "MISSION_ITEM_INT":
            say(f"IGNORED MISSION_ITEM_INT {msg.seq}")
        elif t == "COMMAND_INT":
            if msg.command != mavutil.mavlink.MAV_CMD_DO_REPOSITION:
                mav.command_ack_send(msg.command, mavutil.mavlink.MAV_RESULT_UNSUPPORTED)
            elif msg.frame != mavutil.mavlink.MAV_FRAME_GLOBAL:
                say(f"CMD reposition refused frame {msg.frame}")
                mav.command_ack_send(msg.command, mavutil.mavlink.MAV_RESULT_UNSUPPORTED)
            elif not args.gcs_nav:
                say("CMD reposition denied (GCS NAV off)")
                mav.command_ack_send(msg.command, mavutil.mavlink.MAV_RESULT_DENIED)
            else:
                say(f"CMD reposition {msg.x / 1e7:.6f},{msg.y / 1e7:.6f} alt {msg.z:.0f}")
                mav.command_ack_send(msg.command, mavutil.mavlink.MAV_RESULT_ACCEPTED)
        elif t == "COMMAND_LONG":
            say(f"IGNORED COMMAND_LONG {msg.command}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
