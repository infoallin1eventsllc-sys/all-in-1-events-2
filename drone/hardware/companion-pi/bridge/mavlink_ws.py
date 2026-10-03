#!/usr/bin/env python3
"""MAVLink <-> WebSocket bridge: lets any browser fly the aircraft.

iPhones and iPads have no Web Bluetooth and no Web Serial, so the dashboard can't
talk to a radio from them. This runs on the drone's companion computer (or on a
laptop next to a USB telemetry radio) and exposes the autopilot's MAVLink stream
as a WebSocket. The dashboard's **Network** link connects to it from any browser.

Bytes are passed through untouched in both directions: one binary WebSocket
message per chunk. Several dashboards can connect at once; all see the telemetry,
and any of them can command.

Autopilot side (pick one):
  --serial /dev/serial0 --baud 921600   flight controller TELEM port on the Pi's UART (see README: on a
                                        Pi 3/4/Zero 2 W, /dev/ttyAMA0 is Bluetooth unless disable-bt)
  --serial /dev/ttyUSB0 --baud 57600    a USB telemetry radio
  --udp 0.0.0.0:14550                   mavlink-router, SITL or fake_vehicle.py sending UDP here; the
                                        first sender is pinned, or list them with --udp-peer IP:PORT
  --tcp 127.0.0.1:5760                  connect out to a TCP MAVLink server (ArduPilot SITL, mavlink-router)

A read or write error on the serial port exits with status 1, so systemd restarts the bridge.

Browser side (a token is required; --insecure runs without one):
  --port 8770 --token-file FILE         ws://<host>:8770/?token=<contents of FILE>; also A1_TOKEN=… in the
                                        environment, or --token SECRET (visible to anyone running ps)
  --cert cert.pem --key key.pem         wss:// — required when the dashboard is opened over
                                        https (browsers block ws:// from a secure page). Open
                                        https://<host>:8770/ once to accept a self-signed cert.

Internet (LTE, carrier NAT, no VPN) — see ../relay/README.md:
  --relay wss://relay.example.com/aircraft/A1 --relay-token-file /opt/a1/relay-token
                                        also keep an outbound socket to a relay server (reconnects
                                        with backoff 1-30 s); phones then connect to the relay at
                                        wss://relay.example.com/fly/A1?token=PILOT_TOKEN. The local
                                        server above keeps working for a laptop on site.

Examples:
  python3 mavlink_ws.py --serial /dev/serial0 --baud 921600 --token-file /opt/a1/token
  python3 mavlink_ws.py --udp 127.0.0.1:14550 --token test        # bench, with fake_vehicle.py
  python3 mavlink_ws.py --serial /dev/serial0 --baud 921600 --token-file /opt/a1/token \\
      --relay wss://relay.example.com/aircraft/A1 --relay-token-file /opt/a1/relay-token
"""
from __future__ import annotations

import argparse
import asyncio
import hmac
import logging
import os
import ssl
import threading
import time
from http import HTTPStatus
from urllib.parse import parse_qs, parse_qsl, urlencode, urlparse, urlunparse

from websockets.asyncio.client import connect
from websockets.asyncio.server import ServerConnection, serve
from websockets.http11 import Request, Response
from websockets.datastructures import Headers
from websockets.exceptions import ConnectionClosed, WebSocketException

log = logging.getLogger("a1-bridge")


class Autopilot:
    """The vehicle side. `on_bytes` is called with every chunk read; `write` sends."""

    def __init__(self) -> None:
        self.on_bytes = lambda b: None
        self.bytes_in = 0
        self.bytes_out = 0
        self.failed: asyncio.Future[str] | None = None  # set when the link is gone for good; main() exits non-zero

    async def start(self) -> None: ...
    def write(self, data: bytes) -> None: ...

    def fail(self, why: str) -> None:
        if self.failed and not self.failed.done():
            self.failed.set_result(why)


class SerialAutopilot(Autopilot):
    def __init__(self, device: str, baud: int) -> None:
        super().__init__()
        import serial  # pyserial
        self.errors: tuple[type[BaseException], ...] = (OSError, serial.SerialException)
        self.port = serial.Serial(device, baud, timeout=0.05)
        self.lock = threading.Lock()

    async def start(self) -> None:
        loop = asyncio.get_running_loop()
        self.failed = loop.create_future()

        def reader() -> None:
            # A USB/UART error (cable pulled, adapter reset) ends this thread; without this the process
            # would stay up with no autopilot. Exit instead so systemd (Restart=always) reopens the port.
            try:
                while True:
                    data = self.port.read(512)
                    if data:
                        self.bytes_in += len(data)
                        loop.call_soon_threadsafe(self.on_bytes, data)
            except Exception as e:  # noqa: BLE001 - any read error is fatal for this port
                log.error("serial %s read failed: %s", self.port.port, e)
                loop.call_soon_threadsafe(self.fail, f"serial read: {e}")

        threading.Thread(target=reader, daemon=True).start()
        log.info("autopilot on %s @ %d", self.port.port, self.port.baudrate)

    def write(self, data: bytes) -> None:
        try:
            with self.lock:
                self.port.write(data)
        except self.errors as e:
            log.error("serial %s write failed: %s", self.port.port, e)
            self.fail(f"serial write: {e}")
            return
        self.bytes_out += len(data)


class UdpAutopilot(Autopilot, asyncio.DatagramProtocol):
    """Listens on a UDP port and talks to one autopilot peer (mavlink-router style).

    Anything that can reach the port could otherwise hijack replies (commands) just by sending one
    packet, so the peer is pinned: with --udp-peer only those addresses are accepted; without it the
    first sender is pinned. A pinned peer that has been silent REPIN_S may be replaced by a sender on
    the same IP (fake_vehicle/mavlink-router restarted on a new source port); anyone else is dropped.
    """

    REPIN_S = 3.0

    def __init__(self, listen: str, allow: list[str] | None = None) -> None:
        Autopilot.__init__(self)
        host, port = listen.rsplit(":", 1)
        self.listen = (host, int(port))
        self.allow = {(h, int(p)) for h, p in (a.rsplit(":", 1) for a in allow or [])}
        self.peer: tuple[str, int] | None = None
        self.last_rx = 0.0
        self.refused: set[tuple[str, int]] = set()
        self.transport: asyncio.DatagramTransport | None = None

    async def start(self) -> None:
        loop = asyncio.get_running_loop()
        await loop.create_datagram_endpoint(lambda: self, local_addr=self.listen)
        log.info("autopilot on udp %s:%d%s", *self.listen, f" (only from {', '.join(f'{h}:{p}' for h, p in sorted(self.allow))})" if self.allow else "")

    def connection_made(self, transport) -> None:  # type: ignore[override]
        self.transport = transport

    def datagram_received(self, data: bytes, addr) -> None:  # type: ignore[override]
        addr = (addr[0], addr[1])  # IPv6 addrs carry flowinfo/scope; compare host:port only
        now = time.monotonic()
        if addr != self.peer:
            if self.allow:
                ok = addr in self.allow
            else:
                ok = self.peer is None or (addr[0] == self.peer[0] and now - self.last_rx > self.REPIN_S)
            if not ok:
                if addr not in self.refused and len(self.refused) < 64:  # log each stranger once
                    self.refused.add(addr)
                    log.warning("udp: dropping packets from %s:%d (autopilot is %s)", *addr, "%s:%d" % self.peer if self.peer else "not yet seen")
                return
            log.info("autopilot packets from %s:%d (pinned)", *addr)
            self.peer = addr
        self.last_rx = now
        self.bytes_in += len(data)
        self.on_bytes(data)

    def write(self, data: bytes) -> None:
        if self.transport and self.peer:
            self.transport.sendto(data, self.peer)
            self.bytes_out += len(data)


class TcpAutopilot(Autopilot):
    """Connects out to a TCP MAVLink endpoint and reconnects if it drops (SITL restarts, router reloads)."""

    def __init__(self, target: str) -> None:
        super().__init__()
        host, port = target.rsplit(":", 1)
        self.target = (host, int(port))
        self.writer: asyncio.StreamWriter | None = None

    async def start(self) -> None:
        asyncio.ensure_future(self._run())

    async def _run(self) -> None:
        while True:
            try:
                reader, self.writer = await asyncio.open_connection(*self.target)
                log.info("autopilot on tcp %s:%d", *self.target)
                while True:
                    data = await reader.read(4096)
                    if not data:
                        break
                    self.bytes_in += len(data)
                    self.on_bytes(data)
            except OSError as e:
                log.info("tcp %s:%d not available (%s); retrying", *self.target, e.strerror or e)
            self.writer = None
            await asyncio.sleep(2)

    def write(self, data: bytes) -> None:
        if self.writer:
            self.writer.write(data)
            self.bytes_out += len(data)


def make_process_request(token: str | None):
    """Plain HTTPS requests get a status page (so a phone can accept the certificate); sockets need the token."""

    def process_request(connection: ServerConnection, request: Request) -> Response | None:
        if request.headers.get("Upgrade", "").lower() != "websocket":
            body = b"A1 MAVLink bridge is running. Certificate accepted - go back to the dashboard and connect.\n"
            return Response(HTTPStatus.OK, "OK", Headers({"Content-Type": "text/plain", "Content-Length": str(len(body))}), body)
        if token:
            got = parse_qs(urlparse(request.path).query).get("token", [""])[0]
            if not hmac.compare_digest(got.encode(), token.encode()):  # bytes: compare_digest raises on non-ASCII str
                log.warning("refused %s: bad token", connection.remote_address)
                return Response(HTTPStatus.UNAUTHORIZED, "Unauthorized", Headers({"Content-Length": "0"}), b"")
        return None

    return process_request


async def relay_link(url: str, vehicle: Autopilot, outbox: asyncio.Queue[bytes]) -> None:
    """Keeps an outbound socket to a relay server: autopilot bytes go up, relay bytes go to the autopilot."""
    where = url.split("?", 1)[0]  # never log the token
    delay = 1
    while True:
        try:
            async with connect(url, max_size=2**20, open_timeout=15) as ws:
                log.info("relay connected: %s", where)
                delay = 1
                while not outbox.empty():
                    outbox.get_nowait()  # telemetry queued while offline is stale

                async def pump() -> None:
                    while True:
                        await ws.send(await outbox.get())

                sender = asyncio.ensure_future(pump())
                try:
                    async for msg in ws:
                        if isinstance(msg, (bytes, bytearray)):
                            vehicle.write(bytes(msg))
                except ConnectionClosed:
                    pass  # LTE drop, relay restart or replaced: reported below
                finally:
                    sender.cancel()
            if ws.close_code == 4000:
                log.warning("relay: another connection took this aircraft id (two bridges with one id?)")
            log.info("relay closed (%s); reconnecting in %d s", ws.close_code, delay)
        except (OSError, TimeoutError, WebSocketException) as e:
            log.info("relay %s unavailable (%s); retrying in %d s", where, e, delay)
        await asyncio.sleep(delay)
        delay = min(delay * 2, 30)


def read_secret(path: str) -> str:
    with open(path, encoding="utf-8") as f:
        return f.read().strip()


class Dashboard:
    """One local dashboard socket with its own bounded send queue: a phone that stops reading only
    loses its own oldest telemetry, and never makes the bridge buffer without limit."""

    QUEUE = 512

    def __init__(self, ws: ServerConnection) -> None:
        self.ws = ws
        self.queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=self.QUEUE)
        self.dropped = 0
        self.task = asyncio.ensure_future(self._pump())

    def offer(self, data: bytes) -> None:
        if self.queue.full():
            self.queue.get_nowait()  # drop the oldest: fresh telemetry matters more than stale
            self.dropped += 1
        self.queue.put_nowait(data)

    async def _pump(self) -> None:
        try:
            while True:
                await self.ws.send(await self.queue.get())
        except ConnectionClosed:
            pass


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--serial", help="serial device of the flight controller or radio")
    src.add_argument("--udp", help="listen address for MAVLink UDP, e.g. 0.0.0.0:14550")
    src.add_argument("--tcp", help="TCP MAVLink server to connect to, e.g. 127.0.0.1:5760 (ArduPilot SITL)")
    ap.add_argument("--udp-peer", action="append", metavar="IP:PORT", help="with --udp: accept MAVLink only from this address (repeatable); default: pin the first sender")
    ap.add_argument("--baud", type=int, default=57600)
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8770)
    ap.add_argument("--token", help="shared secret the dashboard passes as ?token= (visible in ps; prefer --token-file or A1_TOKEN)")
    ap.add_argument("--token-file", help="read the shared secret from this file (e.g. systemd LoadCredential: %%d/token)")
    ap.add_argument("--insecure", action="store_true", help="allow running with no token: anyone who can reach the port can command the aircraft")
    ap.add_argument("--cert", help="TLS certificate (PEM) for wss://")
    ap.add_argument("--key", help="TLS private key (PEM)")
    ap.add_argument("--relay", help="also connect out to a relay: wss://host/aircraft/<id>?token=… (LTE, no VPN)")
    ap.add_argument("--relay-token-file", help="read the relay's aircraft token from this file instead of putting it in --relay's URL")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    token = read_secret(args.token_file) if args.token_file else args.token or os.environ.get("A1_TOKEN", "")
    if not token:
        if not args.insecure:
            ap.error("no token (--token-file, A1_TOKEN or --token): refusing to let anyone on this network command the aircraft; pass --insecure to allow it")
        log.warning("--insecure with no token: anyone on this network can command the aircraft")
    if args.udp_peer and not args.udp:
        ap.error("--udp-peer needs --udp")
    relay = args.relay
    if relay and args.relay_token_file:
        u = urlparse(relay)
        q = [(k, v) for k, v in parse_qsl(u.query) if k != "token"] + [("token", read_secret(args.relay_token_file))]
        relay = urlunparse(u._replace(query=urlencode(q)))

    vehicle: Autopilot = SerialAutopilot(args.serial, args.baud) if args.serial else TcpAutopilot(args.tcp) if args.tcp else UdpAutopilot(args.udp, args.udp_peer)
    clients: dict[ServerConnection, Dashboard] = {}
    outbox: asyncio.Queue[bytes] = asyncio.Queue(maxsize=512)  # to the relay; bounded so a stalled LTE link can't eat memory

    def fan_out(data: bytes) -> None:
        for d in list(clients.values()):
            d.offer(data)
        if relay and not outbox.full():
            outbox.put_nowait(data)

    vehicle.on_bytes = fan_out
    await vehicle.start()
    if relay:
        asyncio.ensure_future(relay_link(relay, vehicle, outbox))

    async def handler(ws: ServerConnection) -> None:
        d = clients[ws] = Dashboard(ws)
        log.info("dashboard connected from %s (%d connected)", ws.remote_address, len(clients))
        try:
            async for msg in ws:
                if isinstance(msg, (bytes, bytearray)):
                    try:
                        vehicle.write(bytes(msg))
                    except Exception as e:  # noqa: BLE001 - a failed write must not take this dashboard down
                        log.warning("autopilot write failed: %s", e)
        except ConnectionClosed:
            pass  # tab closed or network dropped without a close frame: normal for phones
        finally:
            clients.pop(ws, None)
            d.task.cancel()
            log.info("dashboard left (%d connected%s)", len(clients), f"; {d.dropped} stale chunks dropped" if d.dropped else "")

    tls = None
    if args.cert:
        tls = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        tls.load_cert_chain(args.cert, args.key)

    async with serve(handler, args.host, args.port, ssl=tls, process_request=make_process_request(token or None), max_size=2**20):
        log.info("dashboards connect to %s://<this-host>:%d/%s", "wss" if tls else "ws", args.port, "?token=…" if token else "")
        while True:
            if vehicle.failed:
                done, _ = await asyncio.wait([vehicle.failed], timeout=30)
                if done:
                    log.error("autopilot link lost (%s); exiting so the service manager restarts the bridge", vehicle.failed.result())
                    raise SystemExit(1)
            else:
                await asyncio.sleep(30)
            log.info("autopilot in %d B, out %d B, %d dashboard(s)", vehicle.bytes_in, vehicle.bytes_out, len(clients))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
