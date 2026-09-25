# Internet relay — fly from a phone anywhere, no VPN

`relay.py` is a tiny public WebSocket server that joins an aircraft and its
dashboards when they can't reach each other directly.

**Why.** On the field the dashboard talks straight to the Pi's bridge
(`wss://<pi>:8770`). Over LTE that stops working: the aircraft's SIM sits behind
carrier NAT, so nothing on the internet can connect *to* it, and an iPhone can't
join a VPN just for one web page without installing an app (Tailscale works, but
every phone and every client's iPad needs it). With the relay, the bridge connects
**out** to a server you host, the phone connects to the same server, and the relay
passes MAVLink bytes between them untouched.

```
flight controller ─UART─ Pi: mavlink_ws.py ──wss (outbound, LTE)──▶ relay ◀──wss── phone / iPad / laptop
                               └─ :8770 still serves a laptop on site directly
```

## The three URLs

| Who | URL | Can |
| --- | --- | --- |
| The aircraft (bridge) | `wss://relay.example.com/aircraft/<id>?token=<AIRCRAFT_TOKEN>` | send telemetry, receive commands |
| Pilot dashboards | `wss://relay.example.com/fly/<id>?token=<PILOT_TOKEN>` | see telemetry **and command** |
| Viewers (client, spotter) | `wss://relay.example.com/watch/<id>?token=<VIEWER_TOKEN>` | see telemetry only; anything they send is dropped |

`<id>` is any name for the aircraft (`A1`, `survey-2`; letters, digits, `.`, `_`, `-`).
One relay serves many aircraft. Telemetry from the aircraft goes to every `fly` and
`watch` client of that id; bytes from `fly` clients go to the aircraft.

In the dashboard: **link button → Network →** paste the `fly` (or `watch`) URL →
**Connect**. Nothing else changes: it's the same raw-MAVLink WebSocket the bridge serves.

Plain HTTP on the same port:

- `GET /` — JSON status: each aircraft id, whether it's online, and how many pilots
  and viewers are connected. No tokens, no IP addresses.
- `GET /healthz` — `ok` (point the platform's health check here).

Behaviour worth knowing:

- **One aircraft connection per id.** A new one replaces the old (closed with code
  `4000`). If the bridge log says *another connection took this aircraft id*, two
  bridges are using the same id.
- **Aircraft drops (LTE fade):** dashboards stay connected and simply see no
  telemetry until the bridge reconnects (it retries after 1, 2, 4 … 30 s).
- **Slow clients are dropped, not waited for.** Each connection has its own send
  queue (512 chunks, ~5–10 s of telemetry). A phone that stops reading is closed
  with code `4001` and reconnects; it never stalls the aircraft or other screens.
- Messages are capped at 1 MiB; WebSocket pings every 20 s keep platform proxies
  from closing idle connections.

## Run it locally

```bash
pip install "websockets>=15"
python3 relay.py --port 8780 --aircraft-token air --pilot-token pilot --viewer-token view

# bench aircraft, in two more terminals (from hardware/companion-pi/):
python3 bridge/fake_vehicle.py --to 127.0.0.1:14550
python3 bridge/mavlink_ws.py --udp 127.0.0.1:14550 --token local \
    --relay "ws://127.0.0.1:8780/aircraft/A1?token=air"

# dashboard (opened from http://localhost): Network → ws://127.0.0.1:8780/fly/A1?token=pilot
curl http://127.0.0.1:8780/          # {"aircraft": {"A1": {"online": true, "pilots": 1, ...}}}
```

End-to-end test (starts all three, checks telemetry, commands, the read-only role,
bad tokens, status, the aircraft dropping and coming back, a relay restart, and the
bridge without `--relay`):

```bash
python3 relay/test_relay.py          # needs websockets + pymavlink; exit code 1 on failure
```

## Configuration

| Flag | Env | Default |
| --- | --- | --- |
| `--aircraft-token` | `RELAY_AIRCRAFT_TOKEN` | **required** |
| `--pilot-token` | `RELAY_PILOT_TOKEN` | **required** |
| `--viewer-token` | `RELAY_VIEWER_TOKEN` | none: `/watch` then accepts only the pilot token |
| `--port` | `PORT` | 8780 |
| `--host` | | `0.0.0.0` |
| `--cert` / `--key` | | none — only if nothing in front terminates TLS |

The relay refuses to start without an aircraft token and a pilot token, or if two
roles share a token. The pilot token also works on `/watch`. Generate tokens with
`openssl rand -hex 24`.

## Deploy

The relay keeps its state in memory, so run **exactly one instance** (the aircraft
and the phone must land on the same process). It needs almost nothing: a few KB/s
per aircraft and ~30 MB of RAM. Pick a region close to where you fly, since every
byte makes a round trip through it.

Every platform below terminates TLS for you and forwards plain WebSocket traffic to
the container, so don't pass `--cert/--key`; give dashboards the platform's `wss://`
address.

### Fly.io

```bash
cd hardware/companion-pi/relay
fly launch --no-deploy --name a1-relay        # accept the Dockerfile
fly secrets set RELAY_AIRCRAFT_TOKEN=$(openssl rand -hex 24) RELAY_PILOT_TOKEN=$(openssl rand -hex 24) RELAY_VIEWER_TOKEN=$(openssl rand -hex 24)
fly deploy && fly scale count 1
```

In `fly.toml`:

```toml
[http_service]
  internal_port = 8780
  force_https = true
  auto_stop_machines = "off"    # the aircraft must always find it running
  min_machines_running = 1

[[http_service.checks]]
  path = "/healthz"
  interval = "30s"
  timeout = "5s"
```

URLs: `wss://a1-relay.fly.dev/aircraft/A1?token=…`, `wss://a1-relay.fly.dev/fly/A1?token=…`.

### Render

New **Web Service** → this repo, root directory `drone/hardware/companion-pi/relay`,
runtime **Docker**. Environment: the three `RELAY_*_TOKEN` variables (Render sets
`PORT` itself; the relay uses it). Health check path `/healthz`. Use a paid instance:
free services sleep when idle and the aircraft would find nothing to connect to.
URLs: `wss://<service>.onrender.com/fly/A1?token=…`.

### Any VPS (with Caddy for TLS)

```bash
docker build -t a1-relay . && docker run -d --restart=always --name a1-relay \
  -p 127.0.0.1:8780:8780 --env-file /etc/a1-relay.env a1-relay   # RELAY_*_TOKEN=… lines
```

`/etc/caddy/Caddyfile` (Caddy gets the certificate and proxies WebSockets as-is):

```
relay.example.com {
    reverse_proxy 127.0.0.1:8780
}
```

nginx works too; it needs `proxy_http_version 1.1`, the `Upgrade`/`Connection`
headers, and `proxy_read_timeout 300s`.

## Bridge in relay mode (systemd)

Give the aircraft its token on the Pi:

```bash
echo -n '<AIRCRAFT_TOKEN>' | sudo tee /opt/a1/relay-token && sudo chmod 600 /opt/a1/relay-token
```

Then in `/etc/systemd/system/a1-bridge.service` (from `../systemd/a1-bridge.service`)
add a second credential and `--relay` to `ExecStart`; everything else stays. The
local `:8770` server keeps working for a laptop on site. The token is read from the
credential file, so it is never on the command line (`ps`).

```ini
# before
LoadCredential=token:/opt/a1/token
ExecStart=/home/pi/a1/bin/python3 /opt/a1/bridge/mavlink_ws.py --serial /dev/serial0 --baud 921600 --port 8770 --token-file %d/token --cert /opt/a1/tls/cert.pem --key /opt/a1/tls/key.pem

# after: also connect out to the relay as aircraft A1
LoadCredential=token:/opt/a1/token
LoadCredential=relay-token:/opt/a1/relay-token
ExecStart=/home/pi/a1/bin/python3 /opt/a1/bridge/mavlink_ws.py --serial /dev/serial0 --baud 921600 --port 8770 --token-file %d/token --cert /opt/a1/tls/cert.pem --key /opt/a1/tls/key.pem --relay wss://relay.example.com/aircraft/A1 --relay-token-file %d/relay-token
```

```bash
sudo systemctl daemon-reload && sudo systemctl restart a1-bridge
journalctl -u a1-bridge -f     # "relay connected: wss://relay.example.com/aircraft/A1"
```

The unit already waits for `network-online.target` and restarts on failure; the
bridge itself retries the relay forever (1 → 2 → 4 … 30 s), so an LTE modem that
comes up late or a relay redeploy needs no intervention. The token is never logged.

## Security

- **Tokens are shared secrets.** Anyone with the pilot token can command the
  aircraft from anywhere in the world. Share viewer links (`/watch`) with clients,
  never the pilot link. Use a different random token per role.
- **Rotate** when a phone is lost, a contractor leaves, or a link was pasted
  somewhere: change the env var on the relay and restart it (all sessions drop),
  update `/opt/a1/relay-token` on the aircraft, and send pilots the new URL.
- The token rides in the URL query (browsers can't set headers on a WebSocket), so
  it may appear in your platform's request logs. Keep those private. The relay's own
  logs and status page never contain tokens.
- Always use `wss://` on the internet: TLS protects the tokens and telemetry in
  transit. The relay itself still sees **MAVLink in the clear** — it's a
  pass-through, not end-to-end encrypted. Whoever runs the relay host (or breaks
  into it) could read telemetry and inject commands.
- **Next step: MAVLink2 message signing.** ArduPilot can require every MAVLink2
  packet to carry an HMAC-SHA256 signature from a 32-byte secret key shared only by
  the autopilot and the ground station (set up from Mission Planner's *MAVLink
  Signing* page or MAVProxy's `signing setup <passphrase>`). With signing on, a
  compromised relay or leaked relay token can no longer command the aircraft. The
  dashboard does not sign its packets yet, so turning signing on today would lock
  it out — it needs signing support first.
