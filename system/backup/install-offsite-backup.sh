#!/bin/bash
# One-time setup of the weekly off-site backup on this Mac.
#   cd system/backup && bash install-offsite-backup.sh
# It asks for the database address once (kept in the Keychain), installs a
# weekly job (Sundays 10:00), and runs the first backup straight away.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
export PATH="/opt/homebrew/opt/libpq/bin:/usr/local/opt/libpq/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v pg_dump >/dev/null; then
  echo "Installing the Postgres backup tools (Homebrew libpq)..."
  brew install libpq
fi

echo
echo "Paste the database address from Supabase:"
echo "  Dashboard > your project > Connect > Session pooler > URI"
echo "  (it starts with postgresql:// ; put your database password where it says [YOUR-PASSWORD])"
read -r -s -p "Database address: " URL; echo
case "$URL" in postgresql://*|postgres://*) ;; *) echo "That does not look like a postgresql:// address. Nothing saved."; exit 1;; esac
security add-generic-password -U -s meridian-db-url -a meridian -w "$URL"
echo "Saved in the Keychain as 'meridian-db-url'."

PLIST="$HOME/Library/LaunchAgents/com.meridianinterface.backup.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.meridianinterface.backup</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$HERE/offsite-backup.sh</string></array>
  <key>StartCalendarInterval</key><dict><key>Weekday</key><integer>0</integer><key>Hour</key><integer>10</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/meridian-backup.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/meridian-backup.log</string>
</dict></plist>
PL
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Weekly backup scheduled: Sundays at 10:00 (runs at next wake if the Mac was asleep)."
echo
echo "Running the first backup now..."
bash "$HERE/offsite-backup.sh"
echo
echo "Done. Backups are in: $HOME/Meridian Backups"
