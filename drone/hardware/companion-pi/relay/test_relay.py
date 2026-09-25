#!/usr/bin/env python3
"""End-to-end test: fake_vehicle.py -> mavlink_ws.py --relay -> relay.py -> fly/watch clients.

  python3 test_relay.py          # needs websockets and pymavlink; exits 1 on any failure

Starts the three processes on free local ports, then checks telemetry fan-out,
pilot commands, the read-only watch role, token rejection, the status page, the
aircraft going offline and coming back, the bridge reconnecting after a relay
restart, the bridge still serving local dashboards without --relay, and the bridge's
own guards (token required, --token-file, pinned UDP peer, exit on a serial error).
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request

os.environ.setdefault("MAVLINK20", "1")
from pymavlink.dialects.v20 import ardupilotmega as mavlink  # noqa: E402
from websockets.asyncio.client import connect  # noqa: E402
from websockets.exceptions import InvalidStatus  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
BRIDGE = os.path.join(HERE, "..", "bridge", "mavlink_ws.py")
VEHICLE = os.path.join(HERE, "..", "bridge", "fake_vehicle.py")
RELAY = os.path.join(HERE, "relay.py")

results: list[tuple[bool, str]] = []
procs: dict[str, subprocess.Popen] = {}
logs = tempfile.mkdtemp(prefix="a1-relay-test-")
vehicle_lines: list[str] = []
http = urllib.request.build_opener(urllib.request.ProxyHandler({}))  # localhost: never via a proxy


def check(ok: bool, name: str, detail: str = "") -> bool:
    results.append((ok, name))
    print(f"{'PASS' if ok else 'FAIL'} {name}{'' if ok or not detail else ' — ' + detail}", flush=True)
    return ok


def free_port(kind: int = socket.SOCK_STREAM) -> int:
    with socket.socket(socket.AF_INET, kind) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start(name: str, *args: str) -> subprocess.Popen:
    env = dict(os.environ, PYTHONUNBUFFERED="1")
    if name == "vehicle":
        p = subprocess.Popen([sys.executable, VEHICLE, *args], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
        threading.Thread(target=lambda: [vehicle_lines.append(line.strip()) for line in p.stdout], daemon=True).start()  # type: ignore[union-attr]
    else:
        out = open(os.path.join(logs, f"{name}.log"), "a")
        p = subprocess.Popen([sys.executable, *args], stdout=out, stderr=subprocess.STDOUT, env=env)
    procs[name] = p
    return p


def stop(name: str) -> None:
    p = procs.pop(name, None)
    if p and p.poll() is None:
        os.kill(p.pid, 15)  # by PID, never by name
        try:
            p.wait(5)
        except subprocess.TimeoutExpired:
            os.kill(p.pid, 9)
            p.wait()


def get(url: str) -> tuple[int, str]:
    try:
        with http.open(url, timeout=3) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, ""
    except OSError:
        return 0, ""


def status(rp: int) -> dict:
    code, body = get(f"http://127.0.0.1:{rp}/")
    return json.loads(body) if code == 200 else {}


async def until(pred, timeout: float, step: float = 0.1) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        if pred():
            return True
        await asyncio.sleep(step)
    return bool(pred())


class Client:
    """A dashboard stand-in: keeps reading (so the relay never sees it as slow) and counts HEARTBEATs."""

    def __init__(self, ws) -> None:
        self.ws = ws
        self.parser = mavlink.MAVLink(None)
        self.parser.robust_parsing = True
        self.encoder = mavlink.MAVLink(None, srcSystem=255, srcComponent=190)
        self.heartbeats = 0
        self.types: set[str] = set()
        self.task = asyncio.ensure_future(self._read())

    async def _read(self) -> None:
        try:
            async for msg in self.ws:
                for m in self.parser.parse_buffer(msg) or []:
                    self.types.add(m.get_type())
                    if m.get_type() == "HEARTBEAT":
                        self.heartbeats += 1
        except Exception:
            pass

    async def fresh_heartbeat(self, timeout: float = 8) -> bool:
        n = self.heartbeats
        return await until(lambda: self.heartbeats > n, timeout)

    async def command(self, cmd: int, p1: float = 0) -> None:
        msg = self.encoder.command_long_encode(1, 1, cmd, 0, p1, 0, 0, 0, 0, 0, 0)
        await self.ws.send(msg.pack(self.encoder))

    async def close(self) -> None:
        self.task.cancel()
        await self.ws.close()


def saw(text: str) -> bool:
    return any(text in line for line in vehicle_lines)


async def run() -> None:
    udp, bp, rp = free_port(socket.SOCK_DGRAM), free_port(), free_port()
    relay_args = (RELAY, "--host", "127.0.0.1", "--port", str(rp), "--aircraft-token", "air", "--pilot-token", "pilot", "--viewer-token", "view")
    bridge_args = (BRIDGE, "--udp", f"127.0.0.1:{udp}", "--host", "127.0.0.1", "--port", str(bp), "--token", "local")
    relay_url = f"ws://127.0.0.1:{rp}/aircraft/A1?token=air"
    base = f"ws://127.0.0.1:{rp}"

    start("relay", *relay_args)
    check(await until(lambda: get(f"http://127.0.0.1:{rp}/healthz") == (200, "ok\n"), 10), "relay /healthz returns ok")
    start("vehicle", "--to", f"127.0.0.1:{udp}")
    start("bridge", *bridge_args, "--relay", relay_url)
    check(await until(lambda: status(rp).get("aircraft", {}).get("A1", {}).get("online") is True, 10), "bridge connects out; status shows A1 online")

    fly = Client(await connect(f"{base}/fly/A1?token=pilot", proxy=None))
    watch = Client(await connect(f"{base}/watch/A1?token=view", proxy=None))
    check(await fly.fresh_heartbeat(), "fly client receives HEARTBEAT through the relay")
    check(await watch.fresh_heartbeat(), "watch client receives HEARTBEAT through the relay")
    check({"GLOBAL_POSITION_INT", "SYS_STATUS"} <= fly.types, "fly client receives position and status telemetry", str(sorted(fly.types)))

    await fly.command(mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 1)
    check(await until(lambda: saw("CMD arm True"), 5), "ARM from fly client reaches the vehicle (CMD arm True)")
    await watch.command(mavlink.MAV_CMD_NAV_LAND)
    await asyncio.sleep(3)
    check(not saw("CMD land"), "LAND from watch client is dropped (vehicle printed no CMD land)")
    await fly.command(mavlink.MAV_CMD_NAV_LAND)
    check(await until(lambda: saw("CMD land"), 5), "control: same LAND from fly client does reach the vehicle")

    for label, url in (("bad pilot token", f"{base}/fly/A1?token=wrong"), ("missing token", f"{base}/fly/A1"),
                       ("viewer token on /fly", f"{base}/fly/A1?token=view"), ("pilot token on /aircraft", f"{base}/aircraft/A1?token=pilot")):
        try:
            ws = await connect(url, proxy=None)
            await ws.close()
            check(False, f"{label} rejected with 401", "connection was accepted")
        except InvalidStatus as e:
            check(e.response.status_code == 401, f"{label} rejected with 401", f"got {e.response.status_code}")

    st = status(rp)
    a1 = st.get("aircraft", {}).get("A1", {})
    check(a1 == {"online": True, "pilots": 1, "viewers": 1}, "GET / status: A1 online, 1 pilot, 1 viewer", json.dumps(st))
    raw = get(f"http://127.0.0.1:{rp}/")[1]
    check("air" not in raw.replace("aircraft", "") and "pilot\"" not in raw and "127.0.0.1" not in raw, "status page has no tokens or IPs")

    stop("bridge")
    check(await until(lambda: status(rp).get("aircraft", {}).get("A1", {}).get("online") is False, 10), "bridge killed: status shows A1 offline (clients stay connected)", json.dumps(status(rp)))
    await asyncio.sleep(1.5)
    n = fly.heartbeats
    await asyncio.sleep(2)
    check(fly.heartbeats == n, "no telemetry while the aircraft is offline")
    start("bridge", *bridge_args, "--relay", relay_url)
    check(await until(lambda: status(rp).get("aircraft", {}).get("A1", {}).get("online") is True, 10), "bridge restarted: A1 back online")
    check(await fly.fresh_heartbeat(), "telemetry flows again to the still-connected fly client")
    check(await watch.fresh_heartbeat(), "telemetry flows again to the still-connected watch client")

    # A second aircraft connection with the same id replaces the first (close code 4000).
    imposter = await connect(relay_url, proxy=None)
    await asyncio.sleep(0.5)
    check(await until(lambda: "another connection took this aircraft id" in open(os.path.join(logs, "bridge.log")).read(), 5),
          "second aircraft connection replaces the first (bridge sees close 4000)")
    await imposter.close()
    check(await until(lambda: status(rp).get("aircraft", {}).get("A1", {}).get("online") is True, 10) and await fly.fresh_heartbeat(),
          "bridge reconnects after being replaced; telemetry flows")

    # Relay restart: the bridge must reconnect on its own (backoff 1-2-4 s).
    await fly.close()
    await watch.close()
    stop("relay")
    await asyncio.sleep(2)
    start("relay", *relay_args)
    check(await until(lambda: status(rp).get("aircraft", {}).get("A1", {}).get("online") is True, 20), "relay restarted: bridge reconnects by itself")
    fly2 = Client(await connect(f"{base}/fly/A1?token=pilot", proxy=None))
    check(await fly2.fresh_heartbeat(), "new fly client gets telemetry after relay restart")
    await fly2.command(mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0)
    check(await until(lambda: saw("CMD arm False"), 5), "DISARM from new fly client reaches the vehicle")
    local = Client(await connect(f"ws://127.0.0.1:{bp}/?token=local", proxy=None))
    check(await local.fresh_heartbeat(), "relay mode: bridge's local port still serves a dashboard directly")
    await local.close()
    await fly2.close()

    # Without --relay the bridge is unchanged.
    stop("bridge")
    start("bridge", *bridge_args)
    await asyncio.sleep(1)
    local = Client(await connect(f"ws://127.0.0.1:{bp}/?token=local", proxy=None))
    check(await local.fresh_heartbeat(), "without --relay: local dashboard receives HEARTBEAT")
    await local.close()
    check(status(rp).get("aircraft", {}).get("A1") is None, "without --relay: nothing connects to the relay")

    # Bridge hardening: token required, token from a file, bytes-safe compare, pinned UDP peer, serial errors exit.
    stop("bridge")
    p = subprocess.run([sys.executable, BRIDGE, "--udp", f"127.0.0.1:{udp}", "--host", "127.0.0.1", "--port", str(bp)], capture_output=True, text=True, timeout=10)
    check(p.returncode != 0 and "--insecure" in p.stderr, "bridge refuses to start without a token", p.stderr[-200:])
    tf = os.path.join(logs, "token")
    with open(tf, "w") as f:
        f.write("from-file\n")
    start("bridge", BRIDGE, "--udp", f"127.0.0.1:{udp}", "--host", "127.0.0.1", "--port", str(bp), "--token-file", tf)
    await asyncio.sleep(1)
    local = Client(await connect(f"ws://127.0.0.1:{bp}/?token=from-file", proxy=None))
    check(await local.fresh_heartbeat(), "--token-file: dashboard with the file's token receives HEARTBEAT")
    try:
        ws = await connect(f"ws://127.0.0.1:{bp}/?token=%C3%A9t%C3%A9", proxy=None)
        await ws.close()
        check(False, "non-ASCII token rejected with 401", "connection was accepted")
    except InvalidStatus as e:
        check(e.response.status_code == 401, "non-ASCII token rejected with 401", f"got {e.response.status_code}")
    stranger = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    stranger.bind(("127.0.0.2", 0))  # another host: must not take over the autopilot link
    stranger.settimeout(0.5)
    stranger.sendto(b"\xfd\x09\x00\x00\x00\xff\xbe\x00\x00\x00", ("127.0.0.1", udp))
    await asyncio.sleep(0.3)
    arms = sum("CMD arm True" in line for line in vehicle_lines)
    await local.command(mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 1)
    check(await until(lambda: sum("CMD arm True" in line for line in vehicle_lines) > arms, 5), "udp: commands still reach the pinned autopilot after a stranger sends")
    try:
        got = stranger.recv(4096)
    except (socket.timeout, OSError):
        got = b""
    stranger.close()
    check(got == b"", "udp: a stranger's packet does not redirect commands to it", repr(got[:20]))
    await local.close()

    import pty  # a pseudo-terminal stands in for the flight controller's UART; closing it is a pulled cable
    master, slave = pty.openpty()
    p = subprocess.Popen([sys.executable, BRIDGE, "--serial", os.ttyname(slave), "--host", "127.0.0.1", "--port", str(free_port()), "--insecure"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(1.5)
    os.close(master)
    os.close(slave)
    await until(lambda: p.poll() is not None, 10)
    if p.poll() is None:
        p.kill()
    check(p.wait() == 1, "serial read error: bridge exits with status 1 (systemd restarts it)", f"returncode {p.returncode}")


def main() -> int:
    try:
        asyncio.run(asyncio.wait_for(run(), 180))
    except Exception as e:  # a crash is a failure, not a traceback-and-hang
        check(False, "test run completed", repr(e))
    finally:
        for name in list(procs):
            stop(name)
    failed = [n for ok, n in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed" + (f"; logs in {logs}" if failed else ""))
    if not failed:
        shutil.rmtree(logs, ignore_errors=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
