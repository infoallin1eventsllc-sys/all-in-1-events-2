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
"""
import os
import argparse
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


async def offer(request: web.Request) -> web.Response:
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
        if pc.connectionState in ("failed", "closed", "disconnected"):
            await pc.close()
            pcs.discard(pc)

    global player
    if player is None:
        player = open_camera(request.app["args"])
    if player.video:
        pc.addTrack(relay.subscribe(player.video))
    if player.audio and request.app["args"].audio:
        pc.addTrack(relay.subscribe(player.audio))

    await pc.setRemoteDescription(desc)
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    return web.json_response(
        {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type},
        headers=cors_headers(),
    )


def cors_headers() -> dict:
    # The dashboard is served from another origin (the events site); allow it.
    return {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type"}


async def options(_: web.Request) -> web.Response:
    return web.Response(headers=cors_headers())


async def health(_: web.Request) -> web.Response:
    return web.json_response({"ok": True, "peers": len(pcs)}, headers=cors_headers())


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
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(asctime)s %(name)s %(message)s")

    app = web.Application()
    app["args"] = args
    app["ice_servers"] = args.ice
    app.on_shutdown.append(on_shutdown)
    app.router.add_post("/offer", offer)
    app.router.add_options("/offer", options)
    app.router.add_get("/health", health)

    ssl_ctx = None
    if args.cert and args.key:
        ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_ctx.load_cert_chain(args.cert, args.key)

    log.info("A1 video streamer on port %d, camera %s @ %s/%dfps", args.port, args.device, args.size, args.fps)
    web.run_app(app, host="0.0.0.0", port=args.port, ssl_context=ssl_ctx, access_log=None)


if __name__ == "__main__":
    main()
