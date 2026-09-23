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

out = os.path.join(os.path.dirname(__file__), "fixtures", "mavlink.json")
with open(out, "w") as f:
    json.dump(fx, f, indent=1)
print("wrote", out)
