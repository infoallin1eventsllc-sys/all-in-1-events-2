#!/usr/bin/env bash
# Runs migration 0047 and its attack test on a throw-away local database, then the same-instant (race) tests with many connections.
# Needs a local PostgreSQL 16 server running and the right to act as its postgres user. Nothing outside this machine is touched.
# Usage: bash system/supabase/tests/local/run.sh [path to another version of the migration]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SB="$HERE/../.."; MIG="${1:-$SB/migrations/0047_live_cards.sql}"; DB=lc_local_test
P() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 $*"; }
su postgres -c "psql -X -q -c 'drop database if exists $DB'" >/dev/null
for r in authenticator anon authenticated service_role; do su postgres -c "psql -X -q -c 'drop role if exists $r'" >/dev/null 2>&1 || true; done
su postgres -c "createdb $DB"
WORK="$(mktemp -d)"; chmod 755 "$WORK"; cp "$HERE/stub_supabase.sql" "$MIG" "$SB/tests/0047_live_cards_attack_test.sql" "$HERE/race.sql" "$WORK/"; chmod 644 "$WORK"/*
P "-d $DB -f $WORK/stub_supabase.sql"
P "-d $DB -f $WORK/$(basename "$MIG")" >/dev/null 2>&1
echo "== attack test (the final error is the result list)"
( echo "begin;"; cat "$WORK/0047_live_cards_attack_test.sql" ) > "$WORK/attack.sql"; chmod 644 "$WORK/attack.sql"
su postgres -c "psql -X -q -d $DB -f $WORK/attack.sql" 2>&1 | grep -E "^(PASS|FAIL)" | sort | uniq -c | awk '{print $2}' | sort | uniq -c
su postgres -c "psql -X -q -d $DB -f $WORK/attack.sql" 2>&1 | grep -E "^FAIL" || true
echo "== same-instant tests"
P "-d $DB -f $WORK/race.sql" >/dev/null
U=$(su postgres -c "psql -X -qAt -d $DB -c \"select id from auth.users where email='race@example.invalid'\"")
# Every connection waits for the same clock time (GO) and then acts, so the requests really do land together.
gate() { GO=$(su postgres -c "psql -X -qAt -d $DB -c \"select clock_timestamp() + interval '4 seconds'\""); }
wait_sql() { echo "select pg_sleep(greatest(0, extract(epoch from ('$GO'::timestamptz - clock_timestamp()))));"; }
run_as() { PGPASSWORD=local-test-only psql -X -q -h 127.0.0.1 -U authenticator -d $DB -c "set role $1; select set_config('request.jwt.claims', '$2', false); $(wait_sql) $3" >/dev/null 2>>"$WORK/errors.log" || true; }
as_user() { run_as authenticated "{\"sub\":\"$U\",\"role\":\"authenticated\"}" "$1"; }
as_anon() { run_as anon "{\"role\":\"anon\"}" "$1"; }
gate; for i in $(seq 1 24); do as_user "insert into public.lc_cards(slug, data) values ('race-card-$i', '{\"name\":\"Race\"}')" & done; wait
U1="$U"; U=$(su postgres -c "psql -X -qAt -d $DB -c \"select id from auth.users where email='race-pro@example.invalid'\"")
gate; for i in $(seq 1 24); do as_user "insert into public.lc_cards(slug, data) values ('race-pro-$i', '{\"name\":\"Race\"}')" & done; wait
UP="$U"; U="$U1"
gate; for i in $(seq 1 30); do as_user "insert into storage.objects(bucket_id, name) values ('live-cards', '$U/bg-r$i.mp4')" & done; wait
gate; for i in $(seq 1 30); do as_anon "select public.lc_report('race-target', 'report number $i')" & done; wait
su postgres -c "psql -X -qAt -d $DB" <<SQL
select case when (select count(*) from public.lc_cards where owner = '$U') = 1 then 'PASS' else 'FAIL' end || ' 24 saves at once on the free plan: ' || (select count(*) from public.lc_cards where owner = '$U') || ' card kept (limit 1)';
select case when (select count(*) from public.lc_cards where owner = '$UP') = 5 then 'PASS' else 'FAIL' end || ' 24 saves at once on the paid plan: ' || (select count(*) from public.lc_cards where owner = '$UP') || ' cards kept (limit 5)';
select case when (select count(*) from storage.objects where name like '$U/%') = 12 then 'PASS' else 'FAIL' end || ' 30 uploads at once: ' || (select count(*) from storage.objects where name like '$U/%') || ' files kept (limit 12)';
select case when (select count(*) from public.lc_reports where slug = 'race-target') = 5 then 'PASS' else 'FAIL' end || ' 30 reports at once: ' || (select count(*) from public.lc_reports where slug = 'race-target') || ' kept (limit 5 an hour)';
SQL
grep -v "Your plan allows\|row-level security\|^CONTEXT" "$WORK/errors.log" | sort | uniq -c | head -5 || true
su postgres -c "psql -X -q -c 'drop database $DB'" >/dev/null; rm -rf "$WORK"
