#!/usr/bin/env python3
"""
All in 1 Drone Command — companion-computer video streamer.

Runs on the aircraft's Raspberry Pi (4/5, Zero 2 W) or Jetson and pushes the camera
to the dashboard over WebRTC. The dashboard POSTs an SDP offer to /offer and gets an
answer back; media then flows peer-to-peer (or through a TURN relay if configured).

    pip install aiortc aiohttp
    python3 stream.py --device /dev/video0 --size 1280x720 --fps 30 --port 8080

Camera sources:
  --device /dev/video0            USB UVC camera, or the Pi camera via libcamera's V4L2 shim
  --device rtsp://... / file      anything ffmpeg can open (e.g. a thermal camera's RTSP feed)

The dashboard's Surveillance → video source → "WebRTC" takes the URL http://<pi>:8080.
Run one instance per camera (different --port) for EO + thermal.

Access (the port is on 0.0.0.0, so anyone on the network can otherwise watch):
  --token-file FILE / A1_VIDEO_TOKEN / --token SECRET
                                  /offer then needs ?token=SECRET (or Authorization: Bearer);
                                  the dashboard URL becomes http://<pi>:8080/?token=SECRET
  --allow-origin https://allin1events.com
                                  only this page origin may call /offer from a browser (repeatable).
                                  Default: with a token, the caller's origin is echoed back only
                                  when the token is right; with no token, any origin ("*").
  --max-peers 3                   viewers at once; more get 503 (each one costs CPU and uplink)
"""
import os
import argparse
import hmac
import asyncio
import json
import logging
import ssl
import uuid

from aiohttp import web
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCConfiguration, RTCIceServer
from aiortc.contrib.media import MediaPlayer, MediaRelay

log = logging.getLogger("a1-video")
pcs: set[RTCPeerConnection] = set()
relay = MediaRelay()
player: MediaPlayer | None = None


def open_camera(args: argparse.Namespace) -> MediaPlayer:
    if args.device.startswith("/dev/video"):
        opts = {"video_size": args.size, "framerate": str(args.fps)}
        if args.mjpeg:
            opts["input_format"] = "mjpeg"  # most UVC cams do 720p30 only in MJPEG
        return MediaPlayer(args.device, format="v4l2", options=opts)
    return MediaPlayer(args.device)  # rtsp://, file, etc.


def token_ok(request: web.Request) -> bool:
    want = request.app["token"]
    if not want:
        return True
    got = request.query.get("token", "")
    auth = request.headers.get("Authorization", "")
    if not got and auth.startswith("Bearer "):
        got = auth[7:]
    return hmac.compare_digest(got.encode(), want.encode())  # bytes: compare_digest raises on non-ASCII str


async def offer(request: web.Request) -> web.Response:
    if not token_ok(request):
        log.warning("refused /offer from %s: bad token", request.remote)
        return web.Response(status=401, headers=cors_headers(request))
    if len(pcs) >= request.app["args"].max_peers:
        log.warning("refused /offer from %s: %d viewers already", request.remote, len(pcs))
        return web.Response(status=503, text="viewer limit reached", headers=cors_headers(request))
    params = await request.json()
    desc = RTCSessionDescription(sdp=params["sdp"], type=params["type"])

    args = request.app["args"]
    ice = [RTCIceServer(urls=u, username=args.turn_user, credential=args.turn_pass) if u.startswith(("turn:", "turns:")) else RTCIceServer(urls=u)
           for u in request.app["ice_servers"]]
    pc = RTCPeerConnection(RTCConfiguration(iceServers=ice))
    pcs.add(pc)
    pc_id = uuid.uuid4().hex[:8]
    log.info("[%s] new peer from %s", pc_id, request.remote)

    @pc.on("connectionstatechange")
    async def on_state():
        log.info("[%s] %s", pc_id, pc.connectionState)
        if pc.connectionState in ("failed", "closed"):  # "disconnected" is often a Wi-Fi blip that recovers; ICE fails it if not
            await pc.close()
            pcs.discard(pc)

    global player
    if player is None:
        player = open_camera(request.app["args"])
    if player.video:
        pc.addTrack(relay.subscribe(player.video))
    if player.audio and request.app["args"].audio:
        pc.addTrack(relay.subscribe(player.audio))

    async def drop_if_never_connected():
        # An offer whose browser went away never reaches "failed" on its own; don't let it hold a viewer slot.
        await asyncio.sleep(30)
        if pc.connectionState not in ("connected", "closed"):
            log.info("[%s] never connected; closing", pc_id)
            await pc.close()
            pcs.discard(pc)

    try:
        await pc.setRemoteDescription(desc)
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
    except Exception:
        await pc.close()
        pcs.discard(pc)
        raise
    asyncio.ensure_future(drop_if_never_connected())
    return web.json_response(
        {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type},
        headers=cors_headers(request),
    )


def cors_headers(request: web.Request) -> dict:
    """The dashboard is served from another origin (the events site). Which origins may read the answer:
    --allow-origin if given; else, with a token, the caller's own origin only when its token is right
    (the browser's preflight carries the same ?token=); else anyone."""
    allowed, origin = request.app["args"].allow_origin, request.headers.get("Origin", "")
    h = {"Access-Control-Allow-Headers": "Content-Type, Authorization", "Vary": "Origin"}
    if allowed:
        if origin in allowed:
            h["Access-Control-Allow-Origin"] = origin
    elif request.app["token"]:
        if origin and token_ok(request):
            h["Access-Control-Allow-Origin"] = origin
    else:
        h["Access-Control-Allow-Origin"] = "*"
    return h


async def options(request: web.Request) -> web.Response:
    return web.Response(headers=cors_headers(request))


async def health(request: web.Request) -> web.Response:
    return web.json_response({"ok": True, "peers": len(pcs)}, headers=cors_headers(request))


async def on_shutdown(app: web.Application):
    await asyncio.gather(*(pc.close() for pc in pcs))
    pcs.clear()


def main():
    ap = argparse.ArgumentParser(description="A1 companion video streamer")
    ap.add_argument("--device", default="/dev/video0")
    ap.add_argument("--size", default="1280x720")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--mjpeg", action="store_true", help="request MJPEG from a UVC camera")
    ap.add_argument("--audio", action="store_true", help="also send the camera's mic if it has one")
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--ice", action="append", default=[], help="STUN/TURN url, repeatable (e.g. stun:stun.l.google.com:19302)")
    ap.add_argument("--turn-user", default=os.environ.get("A1_TURN_USER"), help="TURN username (or env A1_TURN_USER); needed on LTE / carrier NAT")
    ap.add_argument("--turn-pass", default=os.environ.get("A1_TURN_PASS"), help="TURN password (or env A1_TURN_PASS)")
    ap.add_argument("--cert", help="TLS cert for https (needed when the dashboard page is https and the Pi is not on localhost)")
    ap.add_argument("--key")
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--token", help="shared secret for /offer (visible in ps; prefer --token-file or A1_VIDEO_TOKEN)")
    ap.add_argument("--token-file", help="read the /offer secret from this file (e.g. systemd LoadCredential: %%d/video-token)")
    ap.add_argument("--allow-origin", action="append", default=[], help="page origin allowed to call /offer, repeatable (e.g. https://allin1events.com)")
    ap.add_argument("--max-peers", type=int, default=3, help="viewers at once (default 3)")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(asctime)s %(name)s %(message)s")

    app = web.Application()
    app["args"] = args
    app["ice_servers"] = args.ice
    if args.token_file:
        with open(args.token_file, encoding="utf-8") as f:
            app["token"] = f.read().strip()
    else:
        app["token"] = args.token or os.environ.get("A1_VIDEO_TOKEN", "")
    if not app["token"]:
        log.warning("no --token: anyone who can reach port %d can watch the camera", args.port)
    app.on_shutdown.append(on_shutdown)
    app.router.add_post("/offer", offer)
    app.router.add_options("/offer", options)
    app.router.add_get("/health", health)

    ssl_ctx = None
    if args.cert and args.key:
        ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_ctx.load_cert_chain(args.cert, args.key)

    log.info("A1 video streamer on port %d, camera %s @ %s/%dfps", args.port, args.device, args.size, args.fps)
    web.run_app(app, host=args.host, port=args.port, ssl_context=ssl_ctx, access_log=None)


if __name__ == "__main__":
    main()
