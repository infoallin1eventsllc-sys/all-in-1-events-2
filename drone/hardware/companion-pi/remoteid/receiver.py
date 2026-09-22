#!/usr/bin/env python3
"""
All in 1 Drone Command — Remote ID receiver.

Listens for ASTM F3411 / ASD-STAN Open Drone ID broadcasts over Bluetooth LE
(Legacy advertising, the mandatory US/EU format) and publishes decoded tracks as
JSON over a WebSocket the Defense dashboard subscribes to. Receive-only: this is
the legal counter-drone sensor for a private venue.

    pip install bleak websockets
    python3 receiver.py --port 8765

Dashboard: Defense → Sensors → Remote ID receiver → ws://<pi>:8765

Decodes: Basic ID (type 0), Location (1), System (4), Operator ID (5) and Message
Pack (0xF). Bluetooth 5 Long Range and Wi-Fi Beacon / NAN carriers need a scanner
with extended-advertising support or monitor mode; they carry the same messages and
can be added here later.

Validated against the ASTM F3411-22a message layouts; cross-check with
opendroneid-core-c if you change the decoders.
"""
import argparse
import asyncio
import json
import logging
import struct
import time

from bleak import BleakScanner
import websockets

log = logging.getLogger("a1-remoteid")

ODID_UUID_KEY = "0000fffa-0000-1000-8000-00805f9b34fb"  # 16-bit UUID 0xFFFA
ODID_APP_CODE = 0x0D

UA_TYPES = {0: "unknown", 1: "aeroplane", 2: "helicopter/multirotor", 3: "gyroplane", 4: "hybrid lift", 5: "ornithopter",
            6: "glider", 7: "kite", 8: "free balloon", 9: "captive balloon", 10: "airship", 11: "parachute",
            12: "rocket", 13: "tethered powered", 14: "ground obstacle", 15: "other"}
ID_TYPES = {0: "none", 1: "serial", 2: "CAA registration", 3: "UTM UUID", 4: "specific session"}
STATUS = {0: "undeclared", 1: "ground", 2: "airborne", 3: "emergency", 4: "remote id system failure"}


def _alt(raw: int) -> float | None:
    return None if raw == 0 else raw * 0.5 - 1000.0


def decode_message(msg: bytes) -> dict | None:
    """Decode one 25-byte ODID message."""
    if len(msg) < 25:
        return None
    mtype = msg[0] >> 4
    if mtype == 0:  # Basic ID
        id_type, ua_type = msg[1] >> 4, msg[1] & 0x0F
        uas_id = msg[2:22].split(b"\x00", 1)[0].decode("ascii", "replace")
        return {"msg": "basic_id", "id_type": ID_TYPES.get(id_type, id_type), "ua_type": UA_TYPES.get(ua_type, ua_type), "uas_id": uas_id}
    if mtype == 1:  # Location / Vector
        status = msg[1] >> 4
        flags = msg[1] & 0x0F
        height_type = "above takeoff" if (flags & 0x04) == 0 else "AGL"
        ew = (flags & 0x02) != 0
        speed_mult = (flags & 0x01) != 0
        direction = msg[2] + (180 if ew else 0)
        speed_raw = msg[3]
        speed = speed_raw * 0.25 if not speed_mult else speed_raw * 0.75 + 255 * 0.25
        vspeed = struct.unpack("<b", msg[4:5])[0] * 0.5
        lat, lon = struct.unpack("<ii", msg[5:13])
        p_alt, g_alt, height = struct.unpack("<HHH", msg[13:19])
        v_acc, h_acc = msg[19] >> 4, msg[19] & 0x0F
        ts_tenths = struct.unpack("<H", msg[21:23])[0]
        return {
            "msg": "location", "status": STATUS.get(status, status),
            "direction_deg": None if direction == 361 else direction, "speed_mps": None if speed_raw == 255 else round(speed, 2),
            "vspeed_mps": vspeed, "lat": lat / 1e7, "lon": lon / 1e7,
            "pressure_alt_m": _alt(p_alt), "geo_alt_m": _alt(g_alt), "height_m": _alt(height), "height_type": height_type,
            "h_acc": h_acc, "v_acc": v_acc, "ts_since_hour_s": ts_tenths / 10.0,
        }
    if mtype == 4:  # System
        op_lat, op_lon = struct.unpack("<ii", msg[2:10])
        area_count, = struct.unpack("<H", msg[10:12])
        op_alt, = struct.unpack("<H", msg[18:20])
        ts, = struct.unpack("<I", msg[20:24])
        return {"msg": "system", "operator_lat": op_lat / 1e7, "operator_lon": op_lon / 1e7, "area_count": area_count,
                "operator_alt_m": _alt(op_alt), "timestamp": ts + 1546300800}  # seconds since 2019-01-01 → unix
    if mtype == 5:  # Operator ID
        return {"msg": "operator_id", "operator_id": msg[2:22].split(b"\x00", 1)[0].decode("ascii", "replace")}
    return None


def decode_service_data(data: bytes) -> list[dict]:
    """Service data for 0xFFFA: app code, counter, then one message or a message pack."""
    if len(data) < 3 or data[0] != ODID_APP_CODE:
        return []
    body = data[2:]
    out = []
    if len(body) >= 25 and (body[0] >> 4) == 0x0F:  # Message Pack
        size, count = body[1], body[2]
        for i in range(count):
            m = decode_message(body[3 + i * size: 3 + (i + 1) * size])
            if m:
                out.append(m)
    else:
        m = decode_message(body)
        if m:
            out.append(m)
    return out


class Tracks:
    """Merge per-message fragments into one record per aircraft, keyed by BLE address until a UAS ID arrives."""

    def __init__(self, stale_s: float = 30.0):
        self.by_addr: dict[str, dict] = {}
        self.stale_s = stale_s

    def update(self, addr: str, rssi: int, msgs: list[dict]) -> dict | None:
        rec = self.by_addr.setdefault(addr, {"addr": addr, "first_seen": time.time()})
        rec["rssi"] = rssi
        rec["last_seen"] = time.time()
        for m in msgs:
            kind = m.pop("msg")
            rec.setdefault(kind, {}).update(m)
        return rec

    def sweep(self) -> list[str]:
        now = time.time()
        gone = [a for a, r in self.by_addr.items() if now - r["last_seen"] > self.stale_s]
        for a in gone:
            del self.by_addr[a]
        return gone


async def main():
    ap = argparse.ArgumentParser(description="A1 Remote ID receiver")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--adapter", default=None, help="hci0, hci1 … (Linux)")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(asctime)s %(name)s %(message)s")

    clients: set = set()
    tracks = Tracks()
    queue: asyncio.Queue = asyncio.Queue()

    def on_adv(device, adv):
        data = adv.service_data.get(ODID_UUID_KEY)
        if not data:
            return
        msgs = decode_service_data(bytes(data))
        if not msgs:
            return
        rec = tracks.update(device.address, adv.rssi, msgs)
        queue.put_nowait({"event": "track", "track": rec})

    async def ws_handler(ws):
        clients.add(ws)
        log.info("dashboard connected (%d)", len(clients))
        try:
            for rec in tracks.by_addr.values():
                await ws.send(json.dumps({"event": "track", "track": rec}))
            async for _ in ws:
                pass
        finally:
            clients.discard(ws)

    async def broadcaster():
        while True:
            item = await queue.get()
            if clients:
                payload = json.dumps(item)
                await asyncio.gather(*(c.send(payload) for c in clients), return_exceptions=True)

    async def sweeper():
        while True:
            await asyncio.sleep(5)
            for addr in tracks.sweep():
                queue.put_nowait({"event": "lost", "addr": addr})

    scanner_kwargs = {"detection_callback": on_adv, "scanning_mode": "active"}
    if args.adapter:
        scanner_kwargs["adapter"] = args.adapter
    scanner = BleakScanner(**scanner_kwargs)

    log.info("A1 Remote ID receiver: scanning BLE, serving ws://0.0.0.0:%d", args.port)
    async with websockets.serve(ws_handler, "0.0.0.0", args.port):
        await scanner.start()
        try:
            await asyncio.gather(broadcaster(), sweeper())
        finally:
            await scanner.stop()


if __name__ == "__main__":
    asyncio.run(main())
