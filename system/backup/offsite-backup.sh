#!/bin/bash
# Weekly off-site backup of the Meridian Interface database and stored files,
# onto this Mac. Run by launchd (see install-offsite-backup.sh); safe to run by
# hand at any time:  bash offsite-backup.sh
#
# Why this exists: the nightly snapshot (take_crm_snapshot, 3:15 am Houston)
# lives inside the Supabase project, so it is lost with the project. This copy
# is not. Each run makes one dated folder:
#   database.dump   every table in public + backup (pg_dump custom format)
#   files/          every file in Storage (photos, social videos, cards)
#   files.tsv       the list of stored files, as the database saw it
#   backup.log      what happened
# and keeps the newest $KEEP folders (default 8 = two months of Sundays).
#
# Restore (with Claude, or by hand):
#   pg_restore --list database.dump            # see what is inside
#   pg_restore -d "<db url>" --data-only -t contacts database.dump
set -euo pipefail

# launchd starts jobs with a bare PATH; Homebrew's libpq (pg_dump, psql) lives here.
export PATH="/opt/homebrew/opt/libpq/bin:/usr/local/opt/libpq/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

PROJECT="glzodwhyavexpuusbqjy"
DEST="${MERIDIAN_BACKUP_DIR:-$HOME/Meridian Backups}"
KEEP="${MERIDIAN_BACKUP_KEEP:-8}"
STAMP="$(date +%Y-%m-%d)"
OUT="$DEST/$STAMP"
mkdir -p "$OUT/files"
LOG="$OUT/backup.log"
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG"; }

# The connection string is kept in the macOS Keychain, never in a file.
DB_URL="$(security find-generic-password -s meridian-db-url -w 2>/dev/null || true)"
if [ -z "$DB_URL" ]; then log "FAILED: no database address in the Keychain. Run install-offsite-backup.sh."; exit 1; fi
command -v pg_dump >/dev/null || { log "FAILED: pg_dump not found. Run: brew install libpq"; exit 1; }

log "Backing up the database"
# Credentials stay out (structure kept, rows not): channel keys and the
# two-step secret are re-entered after a disaster, never restored from a copy.
pg_dump "$DB_URL" --format=custom --no-owner --no-privileges \
  --schema=public --schema=backup \
  --exclude-table-data=public.channels --exclude-table-data=public.owner_security \
  --file="$OUT/database.dump"
log "Database: $(du -h "$OUT/database.dump" | cut -f1)"

log "Listing stored files"
# Tab-separated (no header): a file name can hold a comma, never a tab.
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "\\copy (select bucket_id, name, (metadata->>'size')::bigint as bytes, updated_at from storage.objects order by 1, 2) to '$OUT/files.tsv'"

# Every bucket is public, so each file is one plain download. Names are
# URL-encoded segment by segment so spaces and symbols survive.
fails=0; count=0
while IFS=$'\t' read -r bucket name _rest; do
  enc="$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$name")"
  mkdir -p "$OUT/files/$bucket/$(dirname "$name")"
  if curl -fsS --retry 2 -o "$OUT/files/$bucket/$name" \
       "https://$PROJECT.supabase.co/storage/v1/object/public/$bucket/$enc"; then
    count=$((count + 1))
  else
    fails=$((fails + 1)); log "could not download $bucket/$name"
  fi
done < "$OUT/files.tsv"
log "Files: $count downloaded, $fails failed, $(du -sh "$OUT/files" | cut -f1)"

# Keep the newest $KEEP dated folders; never touch anything else in $DEST.
# (macOS head has no negative counts, hence awk.)
ls -1d "$DEST"/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] 2>/dev/null | sort \
  | awk -v k="$KEEP" '{a[NR]=$0} END {for (i = 1; i <= NR - k; i++) print a[i]}' | while read -r old; do
  rm -rf "$old"; log "Removed old backup $(basename "$old")"
done

if [ "$fails" -gt 0 ]; then log "DONE WITH PROBLEMS: $fails file(s) missing"; exit 2; fi
log "DONE: $OUT"
