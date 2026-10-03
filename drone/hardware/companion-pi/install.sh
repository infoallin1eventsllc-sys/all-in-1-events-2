#!/usr/bin/env bash
# One-command install of the companion computer (Raspberry Pi OS Bookworm, 64-bit):
#
#   git clone --depth 1 https://github.com/infoallin1eventsllc-sys/all-in-1-events-2.git
#   sudo all-in-1-events-2/drone/hardware/companion-pi/install.sh --uart
#
# Installs the MAVLink bridge, the video streamer and the Remote ID receiver into /opt/a1
# (code root-owned, Python in /opt/a1/venv), runs them as the `a1` system user, generates
# the bridge token (/opt/a1/token, 0600, read by systemd as a credential) and a self-signed
# certificate if there is none, installs the systemd units and starts the chosen ones.
# Safe to run again: it only changes what differs, never replaces the token or a
# certificate you put there (Tailscale), and restarts the services only when their code
# or unit changed. Do not run it while the aircraft is flying.
#
#   --uart           give the flight controller the Pi's PL011 UART on GPIO 14/15: enable_uart=1,
#                    dtoverlay=disable-bt, serial console off (README "Flight controller UART").
#                    Backs up config.txt and cmdline.txt first. Needs a reboot.
#   --uart-keep-bt   the same, keeping Bluetooth on the mini-UART (dtoverlay=miniuart-bt, core_freq=250),
#                    for a Pi that also runs the Remote ID receiver
#   --services LIST  which to enable and start: bridge,video,remoteid (default bridge,video: the aircraft
#                    Pi; the venue Pi runs remoteid). All three are installed either way.
#   --dashboard URL  where the console is served (default https://allin1events.com/drone/)
#   --no-apt         skip apt (packages already there)
#   --dry-run        print what would be done, change nothing (no root needed)
set -euo pipefail

PREFIX=/opt/a1
SRC=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DRY=0 UART="" SERVICES="bridge,video" DASHBOARD="https://allin1events.com/drone/" APT=1
CHANGED=""

usage() { sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed -e '$d' -e 's/^# \{0,1\}//'; }
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --uart) UART=disable-bt ;;
    --uart-keep-bt) UART=miniuart-bt ;;
    --services) SERVICES=${2:?--services needs a list}; shift ;;
    --services=*) SERVICES=${1#*=} ;;
    --dashboard) DASHBOARD=${2:?--dashboard needs a URL}; shift ;;
    --dashboard=*) DASHBOARD=${1#*=} ;;
    --no-apt) APT=0 ;;
    -h | --help) usage; exit 0 ;;
    *) echo "install.sh: unknown option $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done
for s in ${SERVICES//,/ }; do
  case "$s" in bridge | video | remoteid) ;; *) echo "install.sh: unknown service '$s' (bridge, video, remoteid)" >&2; exit 2 ;; esac
done

say() { printf '==> %s\n' "$*"; }
# Every change goes through run (a command) or put (a file from stdin): --dry-run prints instead.
run() {
  if [ "$DRY" = 1 ]; then printf '    would run: %s\n' "$*"; else "$@"; fi
}
# put PATH MODE OWNER:GROUP < content. Writes only when the content, mode or owner differs; returns 1 when unchanged.
put() {
  local path=$1 mode=$2 owner=$3 tmp
  tmp=$(mktemp)
  cat >"$tmp"
  if [ -f "$path" ] && cmp -s "$tmp" "$path" && [ "$(stat -c '%a %U:%G' "$path")" = "${mode#0} $owner" ]; then
    rm -f "$tmp"; return 1
  fi
  if [ "$DRY" = 1 ]; then printf '    would write: %s (%s %s)\n' "$path" "$mode" "$owner"; rm -f "$tmp"; return 0; fi
  install -D -m "$mode" -o "${owner%:*}" -g "${owner#*:}" "$tmp" "$path"
  rm -f "$tmp"
}
# put_boot PATH < content: the boot partition is FAT (no owners or modes to set), so only the content is written.
put_boot() {
  local path=$1 tmp
  tmp=$(mktemp)
  cat >"$tmp"
  if cmp -s "$tmp" "$path"; then rm -f "$tmp"; return 1; fi
  if [ "$DRY" = 1 ]; then printf '    would write: %s\n' "$path"; rm -f "$tmp"; return 0; fi
  cat "$tmp" >"$path"
  rm -f "$tmp"
}

if [ "$DRY" = 0 ] && [ "$(id -u)" != 0 ]; then echo "install.sh: run it with sudo (or --dry-run to see what it would do)" >&2; exit 1; fi
[ "$DRY" = 1 ] && say "Dry run: nothing is changed"

# LoadCredential (the token as a credential file) needs systemd 248+: Bookworm has 252.
sd=$(systemctl --version 2>/dev/null | awk 'NR==1 {print $2}') || true
if [ -n "${sd:-}" ] && [ "$sd" -lt 248 ] 2>/dev/null; then echo "install.sh: systemd $sd is too old for LoadCredential (needs 248+, Raspberry Pi OS Bookworm)" >&2; exit 1; fi

if [ "$APT" = 1 ]; then
  say "System packages"
  run apt-get update -q
  run env DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends \
    python3-venv python3-pip python3-dev build-essential pkg-config ffmpeg bluez openssl \
    libavdevice-dev libavfilter-dev libopus-dev libvpx-dev libsrtp2-dev
fi

say "User a1"
if id -u a1 >/dev/null 2>&1; then echo "    a1 exists"; else run useradd --system --user-group --home-dir "$PREFIX" --no-create-home --shell /usr/sbin/nologin a1; fi
# dialout: the flight controller's serial port; video: cameras; bluetooth: BlueZ over D-Bus (Remote ID).
for g in dialout video bluetooth; do
  if ! getent group "$g" >/dev/null; then echo "    no $g group here (skipped)"; continue; fi
  if id -nG a1 2>/dev/null | tr ' ' '\n' | grep -qx "$g"; then continue; fi
  run usermod -aG "$g" a1
done

say "Code in $PREFIX"
run install -d -m 0755 -o root -g root "$PREFIX"
for f in bridge/mavlink_ws.py bridge/fake_vehicle.py video/stream.py remoteid/receiver.py requirements.txt; do
  # Root-owned: the services run as a1 and cannot rewrite their own code.
  if put "$PREFIX/$f" 0644 root:root <"$SRC/$f"; then CHANGED="$CHANGED ${f%%/*}"; fi
done

say "Python environment $PREFIX/venv"
if [ -x "$PREFIX/venv/bin/python3" ]; then echo "    venv exists"; else run python3 -m venv "$PREFIX/venv"; fi
# pip only installs what is missing or older than requirements.txt asks for.
run "$PREFIX/venv/bin/pip" install -q --disable-pip-version-check -r "$PREFIX/requirements.txt"

say "Bridge token $PREFIX/token"
if [ -s "$PREFIX/token" ]; then
  echo "    kept (exists)"
else
  # 128 bits from the OS; root-only, systemd hands it to the bridge (LoadCredential).
  python3 -c 'import secrets; print(secrets.token_hex(16))' | put "$PREFIX/token" 0600 root:root || true
fi

say "TLS certificate $PREFIX/tls"
host=$(hostname -s 2>/dev/null || hostname)
ip=$(hostname -I 2>/dev/null | awk '{print $1}') || true
if [ -s "$PREFIX/tls/cert.pem" ] && [ -s "$PREFIX/tls/key.pem" ]; then
  echo "    kept (exists; put a Tailscale certificate here to replace the self-signed one)"
else
  # Self-signed, so the bridge serves wss:// (an https dashboard may open no other). Each phone accepts it once.
  san="DNS:$host.local,DNS:$host${ip:+,IP:$ip}"
  run install -d -m 0750 -o root -g a1 "$PREFIX/tls"
  run openssl req -x509 -newkey rsa:2048 -nodes -days 825 -subj "/CN=$host.local" -addext "subjectAltName=$san" \
    -keyout "$PREFIX/tls/key.pem" -out "$PREFIX/tls/cert.pem"
  run chown root:a1 "$PREFIX/tls/key.pem" "$PREFIX/tls/cert.pem"
  run chmod 0640 "$PREFIX/tls/key.pem"
  run chmod 0644 "$PREFIX/tls/cert.pem"
  CHANGED="$CHANGED bridge"
fi

say "systemd units"
for s in bridge video remoteid; do
  if put "/etc/systemd/system/a1-$s.service" 0644 root:root <"$SRC/systemd/a1-$s.service"; then CHANGED="$CHANGED $s"; fi
done
run systemctl daemon-reload
for s in ${SERVICES//,/ }; do
  run systemctl enable "a1-$s"
  # Start it, or restart it when its code or unit changed; an unchanged running service is left alone.
  if [[ " $CHANGED " == *" $s "* || " $CHANGED " == *" requirements.txt "* ]]; then
    run systemctl restart "a1-$s"
  else
    run systemctl start "a1-$s"
  fi
done

if [ -n "$UART" ]; then
  say "Flight controller UART ($UART)"
  boot=/boot/firmware
  [ -f "$boot/config.txt" ] || boot=/boot
  cfg="$boot/config.txt" cmdline="$boot/cmdline.txt" stamp=$(date +%Y%m%d-%H%M%S)
  if [ ! -f "$cfg" ]; then
    if [ "$DRY" = 1 ]; then echo "    no $cfg here (not a Raspberry Pi): on the Pi it would add enable_uart=1 and dtoverlay=$UART"; else echo "install.sh: no $cfg: is this a Raspberry Pi?" >&2; exit 1; fi
  else
    want=("enable_uart=1" "dtoverlay=$UART")
    [ "$UART" = miniuart-bt ] && want+=("core_freq=250")  # the mini-UART's baud follows the core clock
    other=$([ "$UART" = disable-bt ] && echo miniuart-bt || echo disable-bt)
    grep -q "^dtoverlay=$other" "$cfg" && echo "    note: $cfg also has dtoverlay=$other; remove one of them"
    missing=()
    for l in "${want[@]}"; do grep -qx "$l" "$cfg" || missing+=("$l"); done
    if [ ${#missing[@]} = 0 ]; then
      echo "    $cfg already set"
    else
      run cp -p "$cfg" "$cfg.a1-backup-$stamp"
      { cat "$cfg"; printf '\n# All in 1 companion: flight controller on the GPIO 14/15 UART (install.sh --uart)\n[all]\n'; printf '%s\n' "${missing[@]}"; } | put_boot "$cfg" || true
    fi
    # The serial console would talk to the autopilot: drop it from the kernel command line.
    if [ -f "$cmdline" ] && grep -Eq 'console=(serial0|ttyAMA0|ttyS0),[0-9]+' "$cmdline"; then
      run cp -p "$cmdline" "$cmdline.a1-backup-$stamp"
      sed -E 's/ ?console=(serial0|ttyAMA0|ttyS0),[0-9]+//g' "$cmdline" | put_boot "$cmdline" || true
    else
      echo "    serial console already off"
    fi
    if [ "$UART" = disable-bt ] && systemctl list-unit-files hciuart.service >/dev/null 2>&1; then run systemctl disable --now hciuart; fi
    echo "    reboot to apply: sudo reboot   (then ls -l /dev/serial0 shows ttyAMA0)"
  fi
fi

token="<the token generated on install>"
[ -r "$PREFIX/token" ] && token=$(cat "$PREFIX/token")
addr="$host.local"
bridge="wss://$addr:8770/?token=$token"
enc=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$bridge")
echo
if [ "$DRY" = 1 ]; then echo "Done (dry run: nothing was changed)."; else echo "Done."; fi
echo
printf '  %-14s %s\n' "Bridge token" "$token"
printf '  %-14s %s\n' "Bridge" "$bridge${ip:+   (or wss://$ip:8770/?token=…)}"
printf '  %-14s %s\n' "Dashboard" "${DASHBOARD%#*}#bridge=$enc"
printf '  %-14s %s\n' "" "opens the console with this Pi's address filled in (link button → Network → Connect);" \
  "" "the token is in the #fragment, which the browser does not send to the web server."
[[ ",$SERVICES," == *",video,"* ]] && printf '  %-14s %s\n' "Video" "http://$addr:8080   (Surveillance → video source → WebRTC)"
[[ ",$SERVICES," == *",remoteid,"* ]] && printf '  %-14s %s\n' "Remote ID" "ws://$addr:8765"
printf '  %-14s %s\n' "Logs" "journalctl -u a1-bridge -f"
echo
echo "  First time on each phone or laptop: open https://$addr:8770/ and accept the self-signed certificate"
echo "  (or put a Tailscale certificate in $PREFIX/tls: README \"Secure connection\")."
[ -n "$UART" ] && echo "  Reboot for the UART change: sudo reboot"
exit 0
