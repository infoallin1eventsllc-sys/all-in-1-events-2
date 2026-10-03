#!/usr/bin/env python3
"""Internet relay: fly the aircraft from a phone anywhere, with no VPN.

On LTE the aircraft sits behind carrier NAT, so nothing can connect *to* its
bridge. Instead the bridge connects *out* to this relay (a small public server),
and dashboards connect to the relay too. The relay pairs them by aircraft id and
passes MAVLink bytes through untouched: one binary WebSocket message per chunk.

URLs (one aircraft connection per id; a new one replaces the old, closed with 4000):
  wss://<relay>/aircraft/<id>?token=AIRCRAFT_TOKEN   the bridge (mavlink_ws.py --relay …)
  wss://<relay>/fly/<id>?token=PILOT_TOKEN           dashboards that command the aircraft
  wss://<relay>/watch/<id>?token=VIEWER_TOKEN        read-only: telemetry in, anything sent is dropped
                                                     (the pilot token is accepted here too)
  https://<relay>/          status JSON: which aircraft are online and how many clients each has
  https://<relay>/healthz   "ok", for the host's health check

Aircraft bytes fan out to every fly/watch client of that aircraft; fly bytes go to
the aircraft. A client that stops reading (a phone in a tunnel) is dropped with
code 4001 once its send queue fills, so it can never stall the aircraft or the others.

Tokens come from flags or the environment (RELAY_AIRCRAFT_TOKEN, RELAY_PILOT_TOKEN,
RELAY_VIEWER_TOKEN). The relay refuses to start without an aircraft and a pilot token;
without a viewer token the /watch role accepts only the pilot token.

TLS: Fly.io, Render, Railway, Cloud Run and a Caddy/nginx reverse proxy all terminate
TLS for you and forward plain ws:// to --port, so usually run without --cert/--key and
give the dashboard the platform's wss:// address. Use --cert/--key only when this
process faces the internet directly.

Examples:
  RELAY_AIRCRAFT_TOKEN=… RELAY_PILOT_TOKEN=… python3 relay.py                # port $PORT or 8780
  python3 relay.py --port 8780 --aircraft-token air --pilot-token pilot --viewer-token view
  python3 relay.py --cert fullchain.pem --key privkey.pem --port 443 …      # no proxy in front
"""
from __future__ import annotations

import argparse
import asyncio
import hmac
import json
import logging
import os
import re
import signal
import ssl
import time
from http import HTTPStatus
from urllib.parse import parse_qs, urlparse

from websockets.asyncio.server import ServerConnection, serve
from websockets.datastructures import Headers
from websockets.exceptions import ConnectionClosed
from websockets.http11 import Request, Response

log = logging.getLogger("a1-relay")

ROUTE = re.compile(r"^/(aircraft|fly|watch)/([A-Za-z0-9_.-]{1,64})/?$")
QUEUE = 512          # chunks buffered per connection (~5-10 s of telemetry) before a client is dropped
REPLACED = 4000      # close code: a newer aircraft connection took this id
TOO_SLOW = 4001      # close code: the client stopped reading and its queue filled


class Peer:
    """One WebSocket plus its own send queue and writer task, so a slow socket only ever blocks itself."""

    def __init__(self, ws: ServerConnection, role: str, aircraft: str) -> None:
        self.ws, self.role, self.aircraft = ws, role, aircraft
        self.queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=QUEUE)
        self.task = asyncio.ensure_future(self._pump())

    def offer(self, data: bytes) -> bool:
        try:
            self.queue.put_nowait(data)
            return True
        except asyncio.QueueFull:
            return False

    async def _pump(self) -> None:
        try:
            while True:
                await self.ws.send(await self.queue.get())
        except ConnectionClosed:
            pass

    def drop(self, code: int, reason: str) -> None:
        self.task.cancel()
        asyncio.ensure_future(self.ws.close(code, reason))


class Room:
    def __init__(self) -> None:
        self.aircraft: Peer | None = None
        self.clients: set[Peer] = set()

    def empty(self) -> bool:
        return self.aircraft is None and not self.clients


def text(status: HTTPStatus, body: bytes, kind: str = "text/plain") -> Response:
    return Response(status, status.phrase, Headers({"Content-Type": kind, "Content-Length": str(len(body)), "Cache-Control": "no-store"}), body)


def token_ok(got: str, *allowed: str | None) -> bool:
    # bytes, not str: compare_digest raises on non-ASCII str, and a query string can hold anything
    return any(t and hmac.compare_digest(got.encode(), t.encode()) for t in allowed)


class Relay:
    def __init__(self, aircraft_token: str, pilot_token: str, viewer_token: str | None) -> None:
        self.tokens = {"aircraft": (aircraft_token,), "fly": (pilot_token,), "watch": (viewer_token, pilot_token)}
        self.rooms: dict[str, Room] = {}
        self.started = time.time()

    def status(self) -> dict:
        return {
            "service": "a1-relay",
            "uptime_s": int(time.time() - self.started),
            "aircraft": {
                aid: {
                    "online": room.aircraft is not None,
                    "pilots": sum(1 for p in room.clients if p.role == "fly"),
                    "viewers": sum(1 for p in room.clients if p.role == "watch"),
                }
                for aid, room in sorted(self.rooms.items())
            },
        }

    def process_request(self, connection: ServerConnection, request: Request) -> Response | None:
        url = urlparse(request.path)
        if request.headers.get("Upgrade", "").lower() != "websocket":
            if url.path == "/healthz":
                return text(HTTPStatus.OK, b"ok\n")
            if url.path == "/":
                return text(HTTPStatus.OK, json.dumps(self.status(), indent=1).encode() + b"\n", "application/json")
            return text(HTTPStatus.NOT_FOUND, b"not found\n")
        m = ROUTE.match(url.path)
        if not m:
            return text(HTTPStatus.NOT_FOUND, b"use /aircraft/<id>, /fly/<id> or /watch/<id>\n")
        role, aid = m.groups()
        got = parse_qs(url.query).get("token", [""])[0]
        if not token_ok(got, *self.tokens[role]):
            log.warning("refused %s/%s from %s: bad token", role, aid, peer_addr(connection, request))
            return text(HTTPStatus.UNAUTHORIZED, b"")
        return None

    async def handler(self, ws: ServerConnection) -> None:
        role, aid = ROUTE.match(urlparse(ws.request.path).path).groups()  # type: ignore[union-attr]  # checked in process_request
        peer = Peer(ws, role, aid)
        room = self.rooms.setdefault(aid, Room())
        if role == "aircraft":
            old, room.aircraft = room.aircraft, peer
            if old:
                log.warning("aircraft %s: new connection replaces the old one", aid)
                old.drop(REPLACED, "replaced by a newer aircraft connection")
        else:
            room.clients.add(peer)
        log.info("%s %s connected from %s (%s)", role, aid, peer_addr(ws, ws.request), self.summary(aid))
        try:
            async for msg in ws:
                if not isinstance(msg, bytes):
                    continue  # MAVLink is binary; ignore text frames
                if role == "aircraft":
                    for c in list(room.clients):
                        if not c.offer(msg):
                            room.clients.discard(c)
                            log.warning("%s %s dropped: not reading (send queue full)", c.role, aid)
                            c.drop(TOO_SLOW, "too slow: send queue full")
                elif role == "fly" and room.aircraft:
                    if not room.aircraft.offer(msg):
                        log.warning("aircraft %s: link backed up, command chunk dropped", aid)
                # watch: read-only, dropped
        except ConnectionClosed:
            pass  # phones vanish without a close frame; normal
        finally:
            peer.task.cancel()
            if room.aircraft is peer:
                room.aircraft = None
            room.clients.discard(peer)
            if room.empty() and self.rooms.get(aid) is room:
                del self.rooms[aid]
            log.info("%s %s left (%s)", role, aid, self.summary(aid))

    def summary(self, aid: str) -> str:
        s = self.status()["aircraft"].get(aid, {"online": False, "pilots": 0, "viewers": 0})
        return f"aircraft {'online' if s['online'] else 'offline'}, {s['pilots']} pilot(s), {s['viewers']} viewer(s)"


def peer_addr(connection: ServerConnection, request: Request | None) -> str:
    """Client address for the log. Behind a platform proxy that's the proxy, so prefer X-Forwarded-For."""
    fwd = request.headers.get("X-Forwarded-For") if request else None
    if fwd:
        return fwd.split(",")[0].strip()
    addr = connection.remote_address
    return str(addr[0]) if addr else "?"


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8780)), help="default $PORT or 8780")
    ap.add_argument("--aircraft-token", default=os.environ.get("RELAY_AIRCRAFT_TOKEN"), help="secret the bridge uses (env RELAY_AIRCRAFT_TOKEN)")
    ap.add_argument("--pilot-token", default=os.environ.get("RELAY_PILOT_TOKEN"), help="secret for /fly (env RELAY_PILOT_TOKEN)")
    ap.add_argument("--viewer-token", default=os.environ.get("RELAY_VIEWER_TOKEN"), help="secret for /watch (env RELAY_VIEWER_TOKEN, optional)")
    ap.add_argument("--cert", help="TLS certificate (PEM) — only when no platform/proxy terminates TLS")
    ap.add_argument("--key", help="TLS private key (PEM)")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    logging.getLogger("websockets").setLevel(logging.WARNING)  # platform health checks would flood INFO
    if not args.aircraft_token or not args.pilot_token:
        ap.error("an aircraft token and a pilot token are required (--aircraft-token/--pilot-token or RELAY_AIRCRAFT_TOKEN/RELAY_PILOT_TOKEN)")
    if args.aircraft_token == args.pilot_token or args.viewer_token in (args.aircraft_token, args.pilot_token):
        ap.error("use a different token for each role")

    relay = Relay(args.aircraft_token, args.pilot_token, args.viewer_token)
    tls = None
    if args.cert:
        tls = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        tls.load_cert_chain(args.cert, args.key)

    stop = asyncio.get_running_loop().create_future()
    for sig in (signal.SIGTERM, signal.SIGINT):
        asyncio.get_running_loop().add_signal_handler(sig, lambda: stop.done() or stop.set_result(None))

    async with serve(relay.handler, args.host, args.port, ssl=tls, process_request=relay.process_request, max_size=2**20):
        log.info("relay on %s://<this-host>:%d  (aircraft|fly|watch)/<id>?token=…%s", "wss" if tls else "ws", args.port,
                 "" if args.viewer_token else "  — no viewer token: /watch takes the pilot token only")
        await stop
    log.info("relay stopped")


if __name__ == "__main__":
    asyncio.run(main())
