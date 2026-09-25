"""Reference MAVLink frames from pymavlink, the official implementation.

scripts/mavlink.test.mjs checks the app's codec against these byte for byte:
payloads the app encodes must match pymavlink's field layout, and frames
pymavlink encodes must decode to the same values in the app.

Regenerate:  pip install pymavlink && python3 scripts/gen_mavlink_fixtures.py
"""
import json, math, os
from pymavlink.dialects.v20 import ardupilotmega as m

class Sink:
    def write(self, b): pass

def mav(sys=1, comp=1):
    x = m.MAVLink(Sink(), srcSystem=sys, srcComponent=comp)
    x.robust_parsing = True
    return x

def payload(msg, sender):
    """Encoded frame -> (msgId, payload hex with v2 trailing-zero trim)."""
    buf = msg.pack(sender)
    n = buf[1]
    return {"msgId": msg.id, "payload": buf[10:10 + n].hex()}

fx = {"decode": {}, "encode": {}}
v = mav()

# --- frames the app must decode -------------------------------------------------
cy, sy = math.cos(math.radians(30) / 2), math.sin(math.radians(30) / 2)   # yaw 30°
cp, sp = math.cos(math.radians(-45) / 2), math.sin(math.radians(-45) / 2)  # pitch -45°
q = [cp * cy, -sp * sy, sp * cy, cp * sy]  # ZYX with roll 0
fx["decode"]["gimbal_attitude"] = {"frame": m.MAVLink_gimbal_device_attitude_status_message(1, 154, 1234, 0, q, 0, 0, 0, 0).pack(mav(1, 154)).hex(), "pitch": -45, "yaw": 30}
fx["decode"]["camera_feedback"] = {"frame": m.MAVLink_camera_feedback_message(1_000_000, 1, 0, 42, 337748940, -1184090000, 105.5, 60.25, 0, -90, 90, 12.29, 0).pack(v).hex(), "idx": 42, "lat": 33.774894, "lon": -118.409, "altRel": 60.25}
fx["decode"]["mount_status"] = {"frame": m.MAVLink_mount_status_message(255, 190, -3000, 0, 4500).pack(v).hex(), "pitch": -30, "yaw": 45}
px4_mission = (4 << 16) | (4 << 24)
fx["decode"]["heartbeat_px4_mission"] = {"frame": m.MAVLink_heartbeat_message(2, 12, 129, px4_mission, 4, 3).pack(v).hex(), "autopilot": 12, "mode": "AUTO"}
fx["decode"]["heartbeat_px4_rtl"] = {"frame": m.MAVLink_heartbeat_message(2, 12, 129, (4 << 16) | (5 << 24), 4, 3).pack(v).hex(), "mode": "RTL"}
fx["decode"]["heartbeat_ardupilot_guided"] = {"frame": m.MAVLink_heartbeat_message(2, 3, 129, 4, 4, 3).pack(v).hex(), "autopilot": 3, "mode": "GUIDED"}

# --- payloads the app encodes (GCS 255/190) -------------------------------------
g = mav(255, 190)
L = lambda cmd, p: payload(m.MAVLink_command_long_message(1, 1, cmd, 0, *p), g)
nan = float("nan")
fx["encode"]["gimbal_pitchyaw"] = L(m.MAV_CMD_DO_GIMBAL_MANAGER_PITCHYAW, [-30, nan, nan, nan, 0, 0, 0])
fx["encode"]["mount_control"] = L(m.MAV_CMD_DO_MOUNT_CONTROL, [-30, 0, 0, 0, 0, 0, 2])
fx["encode"]["zoom"] = L(m.MAV_CMD_SET_CAMERA_ZOOM, [2, 50, 0, 0, 0, 0, 0])
fx["encode"]["source_ir"] = L(m.MAV_CMD_SET_CAMERA_SOURCE, [0, 2, 0, 0, 0, 0, 0])
fx["encode"]["relay_on"] = L(m.MAV_CMD_DO_SET_RELAY, [0, 1, 0, 0, 0, 0, 0])
fx["encode"]["photo"] = L(m.MAV_CMD_IMAGE_START_CAPTURE, [0, 0, 1, 0, 0, 0, 0])
fx["encode"]["px4_mode_mission"] = L(m.MAV_CMD_DO_SET_MODE, [1, 4, 4, 0, 0, 0, 0])
fx["encode"]["ardu_mode_guided"] = L(m.MAV_CMD_DO_SET_MODE, [1, 4, 0, 0, 0, 0, 0])
fx["encode"]["reposition"] = payload(m.MAVLink_command_int_message(1, 1, 6, m.MAV_CMD_DO_REPOSITION, 0, 0, -1, 1, 0, nan, 337748940, -1184090000, 40.0), g)  # target sys, comp, frame, command, current, autocontinue, params, x, y, z

# --- health messages the diagnostics screen decodes -----------------------------
h = fx["health"] = {}
outs = [1480, 1520, 1610, 1495, 1100, 0, 0, 0]
h["servo_output_raw"] = {"frame": m.MAVLink_servo_output_raw_message(123456, 0, *outs, 1000, 0, 0, 0, 0, 0, 0, 0).pack(v).hex(), "us": outs[:4]}
h["vibration"] = {"frame": m.MAVLink_vibration_message(1, 12.5, 11.25, 31.5, 3, 0, 7).pack(v).hex(), "x": 12.5, "y": 11.25, "z": 31.5, "clip": [3, 0, 7]}
h["esc_1_to_4"] = {"frame": m.MAVLink_esc_telemetry_1_to_4_message([48, 51, 55, 47], [1560, 1558, 1555, 1561], [812, 1034, 1275, 790], [120, 135, 160, 118], [6400, 6500, 7010, 6390], [10, 10, 10, 10]).pack(v).hex(),
                   "tempC": [48, 51, 55, 47], "voltageV": [15.6, 15.58, 15.55, 15.61], "currentA": [8.12, 10.34, 12.75, 7.9], "rpm": [6400, 6500, 7010, 6390]}
cells = [3912, 3905, 3701, 3910] + [65535] * 6
h["battery_cells"] = {"frame": m.MAVLink_battery_status_message(0, 1, 1, 3150, cells, 2150, 800, 12000, 64, 900, 1, [0, 0, 0, 0], 0, 4).pack(v).hex(),
                      "cells": [3.912, 3.905, 3.701, 3.91], "tempC": 31.5, "currentA": 21.5, "remaining": 64, "faults": 4}
pack = [15600] + [65535] * 9
h["battery_pack_only"] = {"frame": m.MAVLink_battery_status_message(0, 1, 1, 32767, pack, -1, -1, -1, -1, 0, 0, [0, 0, 0, 0], 0, 0).pack(v).hex(), "packV": 15.6}
present = 0x1 | 0x2 | 0x4 | 0x8 | 0x20
h["sys_status"] = {"frame": m.MAVLink_sys_status_message(present, present, present & ~0x4, 350, 15600, 2150, 64, 250, 0, 0, 0, 0, 0).pack(v).hex(),
                   "present": present, "health": present & ~0x4, "drop": 2.5}
h["ekf_status"] = {"frame": m.MAVLink_ekf_status_report_message(0x1ff, 0.12, 0.25, 0.08, 0.61, 0.0, 0.0).pack(v).hex(), "velocity": 0.12, "posHoriz": 0.25, "posVert": 0.08, "compass": 0.61, "flags": 0x1ff}
h["estimator_status"] = {"frame": m.MAVLink_estimator_status_message(1, 0x3ff, 0.2, 0.3, 0.1, 0.9, 0, 0, 0.5, 0.8).pack(v).hex(), "velocity": 0.2, "posHoriz": 0.3, "posVert": 0.1, "compass": 0.9}
h["power_status"] = {"frame": m.MAVLink_power_status_message(5120, 0, 1 | 8).pack(v).hex(), "vcc": 5.12, "flags": 9}
fw = (4 << 24) | (5 << 16) | (7 << 8) | 255
h["autopilot_version"] = {"frame": m.MAVLink_autopilot_version_message(0, fw, 0, 0, 0x8c0000, list(b"2a3dc4b7"), [0] * 8, [0] * 8, 0x1209, 0x5740, 0).pack(v).hex(),
                          "major": 4, "minor": 5, "patch": 7, "type": 255, "git": "2a3dc4b7"}
h["statustext"] = {"frame": m.MAVLink_statustext_message(2, b"Potential Thrust Loss (3)").pack(v).hex(), "severity": 2, "text": "Potential Thrust Loss (3)"}

# PX4 ESC_STATUS: generated from its XML definition (not in pymavlink's ArduPilot dialect).
import importlib.util, tempfile
from pymavlink.generator import mavgen, mavparse
xml = os.path.join(os.path.dirname(__file__), "fixtures", "px4_esc_status.xml")
with tempfile.TemporaryDirectory() as d:
    mod = os.path.join(d, "escdialect.py")
    mavgen.mavgen(mavgen.Opts(mod, wire_protocol=mavparse.PROTOCOL_2_0, language="Python3", validate=False), [xml])
    spec = importlib.util.spec_from_file_location("escdialect", mod); e = importlib.util.module_from_spec(spec); spec.loader.exec_module(e)
    ev = e.MAVLink(Sink(), srcSystem=1, srcComponent=1)
    h["px4_esc_status"] = {"frame": e.MAVLink_esc_status_message(0, 99, [6400, 6500, 7010, 6390], [15.5, 15.5, 15.25, 15.5], [8.0, 10.5, 12.75, 7.5]).pack(ev).hex(),
                           "rpm": [6400, 6500, 7010, 6390], "currentA": [8.0, 10.5, 12.75, 7.5]}

# --- mode numbering per ArduPilot firmware, fence state, the radio's own link report ---
# (fresh senders, so the frames above keep their sequence numbers and bytes)
w = mav()
d = fx["decode"]
d["fence_breached"] = {"frame": m.MAVLink_fence_status_message(1, 3, 1, 123456, 0).pack(w).hex(), "breached": True}
d["fence_clear_after_breach"] = {"frame": m.MAVLink_fence_status_message(0, 3, 1, 123456, 0).pack(w).hex(), "breached": False}  # breach_type stays set
d["heartbeat_plane_guided"] = {"frame": m.MAVLink_heartbeat_message(m.MAV_TYPE_FIXED_WING, 3, 129, 15, 4, 3).pack(w).hex(), "mode": "GUIDED"}
d["heartbeat_plane_rtl"] = {"frame": m.MAVLink_heartbeat_message(m.MAV_TYPE_FIXED_WING, 3, 129, 11, 4, 3).pack(w).hex(), "mode": "RTL"}
d["heartbeat_quadplane_qland"] = {"frame": m.MAVLink_heartbeat_message(m.MAV_TYPE_VTOL_QUADROTOR, 3, 129, 20, 4, 3).pack(w).hex(), "mode": "LAND"}
d["heartbeat_rover_guided"] = {"frame": m.MAVLink_heartbeat_message(m.MAV_TYPE_GROUND_ROVER, 3, 129, 15, 4, 3).pack(w).hex(), "mode": "GUIDED"}
d["heartbeat_copter_guided_sys2"] = {"frame": m.MAVLink_heartbeat_message(m.MAV_TYPE_QUADROTOR, 3, 129, 4, 4, 3).pack(mav(2, 1)).hex(), "sys": 2}
d["radio_status_sik"] = {"frame": m.MAVLink_radio_status_message(180, 172, 100, 40, 38, 0, 0).pack(mav(51, 68)).hex(), "rssi": 180, "remrssi": 172, "noise": 40}
e = fx["encode"]
e["plane_mode_guided"] = L(m.MAV_CMD_DO_SET_MODE, [1, 15, 0, 0, 0, 0, 0])
e["rover_mode_rtl"] = L(m.MAV_CMD_DO_SET_MODE, [1, 11, 0, 0, 0, 0, 0])
e["quadplane_mode_qland"] = L(m.MAV_CMD_DO_SET_MODE, [1, 20, 0, 0, 0, 0, 0])
# PX4 reposition: MAV_FRAME_GLOBAL_INT (AMSL), 105 m field + 40 m.
e["px4_reposition_amsl"] = payload(m.MAVLink_command_int_message(1, 1, 5, m.MAV_CMD_DO_REPOSITION, 0, 0, -1, 1, 0, nan, 337748940, -1184090000, 145.0), g)
e["set_interval_sys2"] = payload(m.MAVLink_command_long_message(2, 1, m.MAV_CMD_SET_MESSAGE_INTERVAL, 0, 33, 200000, 0, 0, 0, 0, 0), g)

# --- parameters: ArduPilot casts integers to the float field, PX4 copies their bytes (bytewise) ---
import struct
bw = lambda i: struct.unpack("<f", struct.pack("<i", i))[0]  # PX4: an int32's bytes read as a float
ap_, px_ = mav(), mav()
pv = fx["param"] = {}
pv["ap_fence_type"] = {"frame": m.MAVLink_param_value_message(b"FENCE_TYPE", 7.0, m.MAV_PARAM_TYPE_INT8, 1210, 403).pack(ap_).hex(), "name": "FENCE_TYPE", "value": 7, "type": 2, "enc": "CAST"}
pv["ap_fence_radius"] = {"frame": m.MAVLink_param_value_message(b"FENCE_RADIUS", 300.0, m.MAV_PARAM_TYPE_REAL32, 1210, 405).pack(ap_).hex(), "name": "FENCE_RADIUS", "value": 300, "type": 9, "enc": "CAST"}
pv["ap_16_chars"] = {"frame": m.MAVLink_param_value_message(b"FENCE_ALT_MAX_TP", 1.0, m.MAV_PARAM_TYPE_INT8, 1210, 414).pack(ap_).hex(), "name": "FENCE_ALT_MAX_TP", "value": 1, "type": 2, "enc": "CAST"}
pv["px4_gf_action"] = {"frame": m.MAVLink_param_value_message(b"GF_ACTION", bw(2), m.MAV_PARAM_TYPE_INT32, 980, 312).pack(px_).hex(), "name": "GF_ACTION", "value": 2, "type": 6, "enc": "BYTEWISE"}
pv["px4_negative"] = {"frame": m.MAVLink_param_value_message(b"COM_FLTMODE1", bw(-1), m.MAV_PARAM_TYPE_INT32, 980, 100).pack(px_).hex(), "name": "COM_FLTMODE1", "value": -1, "type": 6, "enc": "BYTEWISE"}
pv["px4_float"] = {"frame": m.MAVLink_param_value_message(b"GF_MAX_HOR_DIST", 0.0, m.MAV_PARAM_TYPE_REAL32, 980, 315).pack(px_).hex(), "name": "GF_MAX_HOR_DIST", "value": 0, "type": 9, "enc": "BYTEWISE"}
e["param_read_radius"] = payload(m.MAVLink_param_request_read_message(1, 1, b"FENCE_RADIUS", -1), g)
e["param_read_16_chars"] = payload(m.MAVLink_param_request_read_message(1, 1, b"FENCE_ALT_MAX_TP", -1), g)
e["param_set_ap_radius"] = payload(m.MAVLink_param_set_message(1, 1, b"FENCE_RADIUS", 450.0, m.MAV_PARAM_TYPE_REAL32), g)
e["param_set_ap_type"] = payload(m.MAVLink_param_set_message(1, 1, b"FENCE_TYPE", 5.0, m.MAV_PARAM_TYPE_INT8), g)
e["param_set_px4_action"] = payload(m.MAVLink_param_set_message(1, 1, b"GF_ACTION", bw(3), m.MAV_PARAM_TYPE_INT32), g)
e["param_set_px4_dist"] = payload(m.MAVLink_param_set_message(1, 1, b"GF_MAX_HOR_DIST", 450.0, m.MAV_PARAM_TYPE_REAL32), g)
e["fence_enable_polygon"] = L(m.MAV_CMD_DO_FENCE_ENABLE, [1, 4, 0, 0, 0, 0, 0])
# PARAM_ERROR (common.xml, not in this pymavlink build): ArduPilot master and PX4 answer an unknown name with it.
xml = os.path.join(os.path.dirname(__file__), "fixtures", "param_error.xml")
with tempfile.TemporaryDirectory() as d:
    mod = os.path.join(d, "perrdialect.py")
    mavgen.mavgen(mavgen.Opts(mod, wire_protocol=mavparse.PROTOCOL_2_0, language="Python3", validate=False), [xml])
    spec = importlib.util.spec_from_file_location("perrdialect", mod); pe = importlib.util.module_from_spec(spec); spec.loader.exec_module(pe)
    pv["error_missing"] = {"frame": pe.MAVLink_param_error_message(255, 190, b"RTL_ALT", -1, 1).pack(pe.MAVLink(Sink(), srcSystem=1, srcComponent=1)).hex(), "name": "RTL_ALT", "error": 1}

out = os.path.join(os.path.dirname(__file__), "fixtures", "mavlink.json")
with open(out, "w") as f:
    json.dump(fx, f, indent=1)
print("wrote", out)
