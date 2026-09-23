// Sync client tests: the console's real upload code (src/sync/sync.ts) against the
// real schema (server/supabase/migrations) in PGlite, behind a minimal stand-in for
// Supabase's REST layer. Proves a flight recorded and chained by the console is
// accepted by the database's chain check, that a re-sync only sends new events,
// and that a view-only account is refused.
import assert from 'assert';
import { readFileSync } from 'fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { loadModule } from './bundle.mjs';

// Browser bits the module touches.
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
globalThis.atob ??= s => Buffer.from(s, 'base64').toString('binary');

const sync = await loadModule('../src/sync/sync.ts');
const chain = await loadModule('../src/record/chain.ts');

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role authenticated nologin;`);
await db.exec(readFileSync(new URL('../server/supabase/migrations/0001_drone_command.sql', import.meta.url), 'utf8'));
const PILOT = '11111111-1111-1111-1111-111111111111', CLIENT = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users values ('${PILOT}'), ('${CLIENT}');
  insert into public.dc_members values ('${PILOT}', 'a1events', 'PIC', 'Pilot A', now()), ('${CLIENT}', 'a1events', 'CLIENT', 'Venue C', now());`);

// Minimal PostgREST: just the calls sync.ts makes, run as the bearer's user.
const log = [];
const jwt = sub => `h.${Buffer.from(JSON.stringify({ sub, email: 'pilot@example.com' })).toString('base64url')}.s`;
async function asUser(sub, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${sub}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const json = (b, status = 200) => new Response(b == null ? null : JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
sync.setFetch(async (url, init = {}) => {
  const u = new URL(url); const method = init.method ?? 'GET';
  log.push(`${method} ${u.pathname.replace('/rest/v1/', '')}`);
  if (u.pathname === '/auth/v1/otp') return json({}, 200);
  const sub = JSON.parse(Buffer.from((init.headers?.Authorization ?? '').split('.')[1] ?? '', 'base64url').toString() || '{}').sub;
  const table = u.pathname.replace('/rest/v1/', '');
  const body = init.body ? JSON.parse(init.body) : null;
  try {
    return await asUser(sub, async () => {
      if (method === 'GET' && table === 'dc_members') return json((await db.query('select org_id, role, display_name from public.dc_members where user_id = $1', [u.searchParams.get('user_id').slice(3)])).rows);
      if (method === 'GET' && table === 'dc_events') return json((await db.query('select seq from public.dc_events where session_id = $1 order by seq desc limit 1', [u.searchParams.get('session_id').slice(3)])).rows);
      if (method === 'POST' && table === 'dc_sessions') {
        await db.query(`insert into public.dc_sessions (id, vertical, title, source, started_at, ended_at, aircraft, note) values ($1,$2,$3,$4,$5,$6,$7,$8)
          on conflict (id) do update set ended_at = excluded.ended_at, note = excluded.note`, [body.id, body.vertical, body.title, body.source, body.started_at, body.ended_at, body.aircraft, body.note]);
        return json(null, 201);
      }
      if (method === 'POST' && table === 'dc_events') {
        await db.transaction(async tx => { for (const r of body) await tx.query('insert into public.dc_events (session_id, seq, t, severity, kind, text, aircraft, operator, prev, hash) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [r.session_id, r.seq, r.t, r.severity, r.kind, r.text, r.aircraft, r.operator, r.prev, r.hash]); });
        return json(null, 201);
      }
      if (method === 'POST' && table === 'dc_health') { await db.query('insert into public.dc_health (aircraft, started_at, ended_at, airborne_s, overall, report) values ($1,$2,$3,$4,$5,$6) on conflict do nothing', [body.aircraft, body.started_at, body.ended_at, body.airborne_s, body.overall, JSON.stringify(body.report)]); return json(null, 201); }
      if (method === 'POST' && table === 'dc_service') { await db.query('insert into public.dc_service (aircraft, t, note, part) values ($1,$2,$3,$4)', [body.aircraft, body.t, body.note, body.part]); return json(null, 201); }
      return json({ message: 'not found' }, 404);
    });
  } catch (e) { return json({ message: e.message }, 403); }
});

sync.config.url = 'https://project.supabase.co'; sync.config.key = 'anon-key';
assert.equal(sync.enabled(), true);

// Sign in from the email link's redirect.
const a = sync.consumeRedirect(`#access_token=${jwt(PILOT)}&refresh_token=r1&expires_in=3600&token_type=bearer`);
assert.equal(a.userId, PILOT); assert.equal(a.email, 'pilot@example.com'); assert.equal(sync.auth().userId, PILOT);
assert.deepEqual(await sync.member(), { org_id: 'a1events', role: 'PIC', display_name: 'Pilot A' });

// A flight as the console records it: events stamped in storage order across two flushes.
const t0 = Date.UTC(2026, 8, 21, 20, 0, 0);
const session = { id: 'patrol-live-1', vertical: 'SURVEILLANCE', title: 'Patrol · Venue compound', source: 'NETWORK', startedAt: t0, endedAt: t0 + 900_000, aircraft: ['T-80M'], sampleCount: 0, eventCount: 6 };
const ev = [0, 1, 2, 3, 4, 5].map(i => ({ id: 10 + i, sessionId: session.id, t: t0 + i * 60_000, severity: i === 3 ? 'WARNING' : 'INFO', kind: i === 1 ? 'COMMAND' : i === 3 ? 'DETECTION' : 'SYSTEM', text: `event ${i}`, aircraft: i ? 'T-80M' : undefined, operator: 'Pilot A · pilot in command' }));
const h = await chain.stamp(ev.slice(0, 4)); await chain.stamp(ev.slice(4), h);

assert.equal(await sync.pushSession(session, ev.slice(0, 4)), 4, 'first upload sends four events');
assert.equal(await sync.pushSession(session, ev), 2, 're-sync sends only the two new ones');
assert.equal(await sync.pushSession(session, ev), 0, 'nothing new, nothing sent');
const head = (await db.query('select chain_head from public.dc_sessions where id = $1', [session.id])).rows[0].chain_head;
assert.equal(head, ev[5].hash, 'server chain head matches the console');

// Health report and parts log.
await sync.pushHealth({ aircraft: 'SIM-1', source: 'LIVE', startedAt: t0, endedAt: t0 + 60_000, airborneS: 55, overall: 'OK', verdict: 'Fit to fly', frame: { kind: 'QUAD', motors: 4, label: 'Quad' }, findings: [], motors: [], vibeMax: null, clipDelta: 0, minCellV: null, maxCellSpreadV: null, maxBatteryTempC: null, events: [] });
await sync.pushService({ aircraft: 'SIM-1', t: t0, note: 'Prop 3 replaced', part: 'prop-3' });
assert.equal((await db.query('select count(*)::int n from public.dc_health')).rows[0].n, 1);
assert.equal((await db.query('select part from public.dc_service')).rows[0].part, 'prop-3');

// A record edited on the device after the fact is refused by the database.
const forged = ev.map(e => ({ ...e }));
const s2 = { ...session, id: 'patrol-live-2' }; forged.forEach(e => { e.sessionId = s2.id; }); await chain.stamp(forged);
forged[2].text = 'nothing happened here';
await assert.rejects(sync.pushSession(s2, forged), /does not match/);
assert.equal((await db.query('select count(*)::int n from public.dc_events where session_id = $1', [s2.id])).rows[0].n, 0, 'the whole batch is refused');

// Unsigned (pre-signing) records are not uploaded as evidence.
await assert.rejects(sync.pushSession({ ...session, id: 'old' }, ev.map(({ hash, prev, ...e }) => e)), /before signing/);

// A client (view-only) account cannot upload.
sync.consumeRedirect(`#access_token=${jwt(CLIENT)}&refresh_token=r2&expires_in=3600`);
await assert.rejects(sync.pushSession({ ...session, id: 'client-try' }, ev), /403/);

// Queue without IndexedDB: jobs that fail stay queued.
sync.signOut();
assert.deepEqual(await sync.flush(), { sent: 0, left: 0 });

await db.close();
console.log('server sync: all tests passed');
