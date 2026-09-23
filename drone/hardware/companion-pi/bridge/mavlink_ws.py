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
  --serial /dev/ttyAMA0 --baud 921600   flight controller TELEM port on the Pi's UART
  --serial /dev/ttyUSB0 --baud 57600    a USB telemetry radio
  --udp 0.0.0.0:14550                   mavlink-router, SITL or fake_vehicle.py sending UDP here
  --tcp 127.0.0.1:5760                  connect out to a TCP MAVLink server (ArduPilot SITL, mavlink-router)

Browser side:
  --port 8770 --token SECRET            ws://<host>:8770/?token=SECRET
  --cert cert.pem --key key.pem         wss:// — required when the dashboard is opened over
                                        https (browsers block ws:// from a secure page). Open
                                        https://<host>:8770/ once to accept a self-signed cert.

Internet (LTE, carrier NAT, no VPN) — see ../relay/README.md:
  --relay wss://relay.example.com/aircraft/A1?token=AIRCRAFT_TOKEN
                                        also keep an outbound socket to a relay server (reconnects
                                        with backoff 1-30 s); phones then connect to the relay at
                                        wss://relay.example.com/fly/A1?token=PILOT_TOKEN. The local
                                        server above keeps working for a laptop on site.

Examples:
  python3 mavlink_ws.py --serial /dev/ttyAMA0 --baud 921600 --token $(cat /opt/a1/token)
  python3 mavlink_ws.py --udp 0.0.0.0:14550 --token test          # bench, with fake_vehicle.py
  python3 mavlink_ws.py --serial /dev/ttyAMA0 --baud 921600 --token $(cat /opt/a1/token) \\
      --relay "wss://relay.example.com/aircraft/A1?token=$(cat /opt/a1/relay-token)"
"""
from __future__ import annotations

import argparse
import asyncio
import hmac
import logging
import ssl
import threading
from http import HTTPStatus
from urllib.parse import parse_qs, urlparse

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

    async def start(self) -> None: ...
    def write(self, data: bytes) -> None: ...


class SerialAutopilot(Autopilot):
    def __init__(self, device: str, baud: int) -> None:
        super().__init__()
        import serial  # pyserial
        self.port = serial.Serial(device, baud, timeout=0.05)
        self.lock = threading.Lock()

    async def start(self) -> None:
        loop = asyncio.get_running_loop()

        def reader() -> None:
            while True:
                data = self.port.read(512)
                if data:
                    self.bytes_in += len(data)
                    loop.call_soon_threadsafe(self.on_bytes, data)

        threading.Thread(target=reader, daemon=True).start()
        log.info("autopilot on %s @ %d", self.port.port, self.port.baudrate)

    def write(self, data: bytes) -> None:
        with self.lock:
            self.port.write(data)
        self.bytes_out += len(data)


class UdpAutopilot(Autopilot, asyncio.DatagramProtocol):
    """Listens on a UDP port; replies go to whoever sent the last packet (mavlink-router style)."""

    def __init__(self, listen: str) -> None:
        Autopilot.__init__(self)
        host, port = listen.rsplit(":", 1)
        self.listen = (host, int(port))
        self.peer: tuple[str, int] | None = None
        self.transport: asyncio.DatagramTransport | None = None

    async def start(self) -> None:
        loop = asyncio.get_running_loop()
        await loop.create_datagram_endpoint(lambda: self, local_addr=self.listen)
        log.info("autopilot on udp %s:%d", *self.listen)

    def connection_made(self, transport) -> None:  # type: ignore[override]
        self.transport = transport

    def datagram_received(self, data: bytes, addr) -> None:  # type: ignore[override]
        if self.peer != addr:
            log.info("autopilot packets from %s:%d", *addr)
        self.peer = addr
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
            if not hmac.compare_digest(got, token):
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


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--serial", help="serial device of the flight controller or radio")
    src.add_argument("--udp", help="listen address for MAVLink UDP, e.g. 0.0.0.0:14550")
    src.add_argument("--tcp", help="TCP MAVLink server to connect to, e.g. 127.0.0.1:5760 (ArduPilot SITL)")
    ap.add_argument("--baud", type=int, default=57600)
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8770)
    ap.add_argument("--token", help="shared secret the dashboard passes as ?token=")
    ap.add_argument("--cert", help="TLS certificate (PEM) for wss://")
    ap.add_argument("--key", help="TLS private key (PEM)")
    ap.add_argument("--relay", help="also connect out to a relay: wss://host/aircraft/<id>?token=… (LTE, no VPN)")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    if not args.token:
        log.warning("no --token: anyone on this network can command the aircraft")

    vehicle: Autopilot = SerialAutopilot(args.serial, args.baud) if args.serial else TcpAutopilot(args.tcp) if args.tcp else UdpAutopilot(args.udp)
    clients: set[ServerConnection] = set()

    async def send_to(c: ServerConnection, data: bytes) -> None:
        try:
            await c.send(data)
        except ConnectionClosed:
            clients.discard(c)  # a dashboard that just left must not stop the others

    outbox: asyncio.Queue[bytes] = asyncio.Queue(maxsize=512)  # to the relay; bounded so a stalled LTE link can't eat memory

    def fan_out(data: bytes) -> None:
        for c in list(clients):
            asyncio.ensure_future(send_to(c, data))
        if args.relay and not outbox.full():
            outbox.put_nowait(data)

    vehicle.on_bytes = fan_out
    await vehicle.start()
    if args.relay:
        asyncio.ensure_future(relay_link(args.relay, vehicle, outbox))

    async def handler(ws: ServerConnection) -> None:
        clients.add(ws)
        log.info("dashboard connected from %s (%d connected)", ws.remote_address, len(clients))
        try:
            async for msg in ws:
                if isinstance(msg, (bytes, bytearray)):
                    vehicle.write(bytes(msg))
        except ConnectionClosed:
            pass  # tab closed or network dropped without a close frame: normal for phones
        finally:
            clients.discard(ws)
            log.info("dashboard left (%d connected)", len(clients))

    tls = None
    if args.cert:
        tls = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        tls.load_cert_chain(args.cert, args.key)

    async with serve(handler, args.host, args.port, ssl=tls, process_request=make_process_request(args.token), max_size=2**20):
        log.info("dashboards connect to %s://<this-host>:%d/%s", "wss" if tls else "ws", args.port, "?token=…" if args.token else "")
        while True:
            await asyncio.sleep(30)
            log.info("autopilot in %d B, out %d B, %d dashboard(s)", vehicle.bytes_in, vehicle.bytes_out, len(clients))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
