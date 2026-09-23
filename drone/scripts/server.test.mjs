// Server schema tests: the Supabase migration applied to a real Postgres (PGlite,
// in-process) with a stand-in for Supabase's auth schema. Checks the things that
// make the server copy trustworthy: the database recomputes every event's SHA-256
// chain link exactly as the console does, events are append-only, companies only
// see their own rows, and a client (view-only) account cannot write.
import assert from 'assert';
import { readFileSync } from 'fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { loadModule } from './bundle.mjs';

const chain = await loadModule('../src/record/chain.ts');
const db = new PGlite({ extensions: { pgcrypto } });

// Supabase provides these; stand them in.
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role authenticated nologin;
`);
await db.exec(readFileSync(new URL('../server/supabase/migrations/0001_drone_command.sql', import.meta.url), 'utf8'));

const U = { pilot: '11111111-1111-1111-1111-111111111111', client: '22222222-2222-2222-2222-222222222222', rival: '33333333-3333-3333-3333-333333333333', observer: '44444444-4444-4444-4444-444444444444' };
await db.exec(`
  insert into auth.users values ('${U.pilot}'), ('${U.client}'), ('${U.rival}'), ('${U.observer}');
  insert into public.dc_members values
    ('${U.pilot}', 'a1events', 'PIC', 'Pilot A', now()),
    ('${U.observer}', 'a1events', 'OBSERVER', 'Observer B', now()),
    ('${U.client}', 'a1events', 'CLIENT', 'Venue C', now()),
    ('${U.rival}', 'other-co', 'PIC', 'Pilot D', now());
`);

/** Run as a signed-in user, the way PostgREST does. */
async function as(user, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const fails = async (p, re, msg) => { let err = null; try { await p; } catch (e) { err = e; } assert.ok(err, `${msg}: expected an error`); if (re) assert.match(String(err.message), re, msg); };

// A session and five events, stamped by the console's own chain code.
const sid = 'survey-demo-1';
const t0 = Date.UTC(2026, 8, 20, 18, 0, 0);
const events = [0, 1, 2, 3, 4].map(i => ({ id: i + 1, sessionId: sid, t: t0 + i * 1000, severity: i === 3 ? 'WARNING' : 'INFO', kind: i === 1 ? 'COMMAND' : 'SYSTEM', text: `entry ${i} — with “unicode” and | pipes`, aircraft: i % 2 ? 'MAP-1' : undefined, operator: i === 1 ? 'Pilot A · pilot in command' : undefined }));
const head = await chain.stamp(events);
const row = (e, seq) => [sid, seq, e.t, e.severity, e.kind, e.text, e.aircraft ?? null, e.operator ?? null, e.prev, e.hash];
const INSERT = 'insert into public.dc_events (session_id, seq, t, severity, kind, text, aircraft, operator, prev, hash) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)';

await as(U.pilot, async () => {
  await db.query(`insert into public.dc_sessions (id, vertical, title, source, started_at, aircraft) values ($1, 'SURVEY', 'Survey · Festival grounds', 'SIMULATION', now(), '{MAP-1}')`, [sid]);
  for (let i = 0; i < 3; i++) await db.query(INSERT, row(events[i], i));
  // Out of order, a forged hash, a broken link, a gap: all refused.
  await fails(db.query(INSERT, row(events[4], 4)), /expects seq 3/, 'skipping an event');
  await fails(db.query(INSERT, row({ ...events[3], hash: 'f'.repeat(64) }, 3)), /does not match/, 'forged hash');
  await fails(db.query(INSERT, row({ ...events[3], text: 'edited after the fact' }, 3)), /does not match/, 'edited text, original hash');
  await fails(db.query(INSERT, row({ ...events[3], prev: 'a'.repeat(64) }, 3)), /does not extend the chain/, 'wrong prev');
  for (let i = 3; i < 5; i++) await db.query(INSERT, row(events[i], i));
  const s = (await db.query('select chain_head, org_id, uploaded_by from public.dc_sessions where id = $1', [sid])).rows[0];
  assert.equal(s.chain_head, head, 'server chain head equals the console chain head');
  assert.equal(s.org_id, 'a1events'); assert.equal(s.uploaded_by, U.pilot);
  // Append-only, even for the pilot who wrote it.
  // Two layers: crew accounts are never granted UPDATE/DELETE, and a trigger refuses it for everyone.
  await fails(db.query(`update public.dc_events set text = 'nothing happened' where session_id = $1 and seq = 1`, [sid]), /permission denied|append-only/, 'edit an event');
  await fails(db.query(`delete from public.dc_events where session_id = $1`, [sid]), /permission denied|append-only/, 'delete events');
  await db.query(`insert into public.dc_health (aircraft, started_at, ended_at, airborne_s, overall, report) values ('SIM-1', now(), now(), 90, 'WATCH', '{"findings":[]}')`);
  await db.query(`insert into public.dc_service (aircraft, t, note, part) values ('SIM-1', now(), 'Prop 3 replaced', 'prop-3')`);
});

// Even the database owner cannot quietly edit history.
await fails(db.query(`update public.dc_events set text = 'nothing happened' where session_id = $1 and seq = 1`, [sid]), /append-only/, 'owner edit');
await fails(db.query(`delete from public.dc_events where session_id = $1`, [sid]), /append-only/, 'owner delete');

// The events as stored verify with the console's own checker.
const stored = (await db.query('select * from public.dc_events where session_id = $1 order by seq', [sid])).rows
  .map(r => ({ id: r.seq + 1, sessionId: r.session_id, t: Number(r.t), severity: r.severity, kind: r.kind, text: r.text, aircraft: r.aircraft ?? undefined, operator: r.operator ?? undefined, prev: r.prev, hash: r.hash }));
assert.deepEqual(await chain.verify(stored), { status: 'VERIFIED', checked: 5 });

await as(U.observer, async () => {
  const n = (await db.query('select count(*)::int as n from public.dc_events where session_id = $1', [sid])).rows[0].n;
  assert.equal(n, 5, 'crew in the same company reads the record');
});

await as(U.client, async () => {
  assert.equal((await db.query('select count(*)::int as n from public.dc_sessions')).rows[0].n, 1, 'client sees its company flights');
  await fails(db.query(`insert into public.dc_sessions (id, vertical, title, source, started_at) values ('x', 'SURVEY', 'x', 'SIMULATION', now())`), /row-level security/, 'client cannot write a session');
  await fails(db.query(`insert into public.dc_service (aircraft, t, note) values ('SIM-1', now(), 'x')`), /row-level security/, 'client cannot write the parts log');
});

await as(U.rival, async () => {
  assert.equal((await db.query('select count(*)::int as n from public.dc_sessions')).rows[0].n, 0, 'another company sees nothing');
  assert.equal((await db.query('select count(*)::int as n from public.dc_events')).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::int as n from public.dc_health')).rows[0].n, 0);
  await fails(db.query(INSERT, row(events[0], 5)), null, 'another company cannot add to this record');
});

await db.close();
console.log('server schema: all tests passed');
