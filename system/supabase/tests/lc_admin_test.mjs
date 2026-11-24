// Attack test for the Live Cards owner desk (functions/lc-admin). Runs the function for real, in Node, against a stand-in
// database and file store. Nothing outside this process is contacted.
// Run from system/supabase:  node tests/lc_admin_test.mjs <path to esbuild>
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';

const esbuild = process.argv[2];
const dir = mkdtempSync(path.join(tmpdir(), 'lcadmin-'));
writeFileSync(path.join(dir, 'stub-supabase.mjs'), 'export const createClient=()=>globalThis.__sb;');
writeFileSync(path.join(dir, 'stub-empty.mjs'), 'export {};');
const out = path.join(dir, 'lc-admin.mjs');
execFileSync(esbuild, ['functions/lc-admin/index.ts', '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error',
  `--alias:npm:@supabase/supabase-js@2=${path.join(dir, 'stub-supabase.mjs')}`, `--alias:jsr:@supabase/functions-js/edge-runtime.d.ts=${path.join(dir, 'stub-empty.mjs')}`]);

const U1 = '11111111-2222-4333-8444-555555555555', U2 = '99999999-2222-4333-8444-555555555555', C1 = 'c0000000-0000-4000-8000-000000000001', C2 = 'c0000000-0000-4000-8000-000000000002';
const db = {
  owner_security: [{ id: true, session_epoch: 3 }], security_events: [],
  lc_accounts: [{ user_id: U1, plan: 'free', blocked: false, stripe_subscription_id: null }, { user_id: U2, plan: 'pro', blocked: false, stripe_subscription_id: 'sub_B' }],
  lc_cards: [{ id: C1, owner: U1, slug: 'jordan-rivers', data: { name: 'Jordan Rivers', company: 'Rivers Realty' }, published: true, blocked: false, updated_at: '2026-11-20' },
             { id: C2, owner: U2, slug: 'fake-bank', data: { name: 'Totally A Bank' }, published: true, blocked: false, updated_at: '2026-11-22' }],
  lc_reports: [{ id: 1, slug: 'fake-bank', reason: 'Pretends to be my bank', handled: false, created_at: '2026-11-23' }, { id: 2, slug: 'jordan-rivers', reason: 'old', handled: true, created_at: '2026-11-01' }],
};
const patterns = []; const rpcCalls = []; let rateOk = true;
const get = (row, col) => col.includes('->>') ? (row[col.split('->>')[0]] || {})[col.split('->>')[1]] : row[col];
function table(name) { const rows = db[name]; if (!rows) throw new Error('unexpected table ' + name); let filt = [], op = 'select', payload = null, ord = null, lim = null, head = false;
  const q = { select(_c, o) { if (o && o.head) head = true; return q }, eq(c, v) { filt.push(r => get(r, c) === v); return q }, in(c, vs) { filt.push(r => vs.includes(get(r, c))); return q },
    ilike(c, p) { patterns.push(p); const needle = p.replace(/%/g, '').toLowerCase(); filt.push(r => String(get(r, c) ?? '').toLowerCase().includes(needle)); return q },
    order(c, o) { ord = [c, o && o.ascending === false ? -1 : 1]; return q }, limit(n) { lim = n; return q },
    insert(o) { op = 'insert'; payload = o; return q }, update(o) { op = 'update'; payload = o; return q }, upsert(o) { op = 'upsert'; payload = o; return q },
    maybeSingle() { return q.then(r => ({ data: (r.data || [])[0] ?? null, error: r.error })) },
    then(res, rej) { let o; const match = r => filt.every(f => f(r));
      if (op === 'insert') { rows.push({ ...payload }); o = { data: null, error: null } }
      else if (op === 'upsert') { const i = rows.findIndex(r => r.user_id === payload.user_id); if (i >= 0) Object.assign(rows[i], payload); else rows.push({ blocked: false, stripe_subscription_id: null, ...payload }); o = { data: null, error: null } }
      else if (op === 'update') { rows.filter(match).forEach(r => Object.assign(r, payload)); o = { data: null, error: null } }
      else { let d = rows.filter(match); if (ord) d = [...d].sort((a, b) => String(a[ord[0]]).localeCompare(String(b[ord[0]])) * ord[1]); if (lim) d = d.slice(0, lim); o = head ? { count: d.length, data: null, error: null } : { data: d, error: null } }
      return Promise.resolve(o).then(res, rej) } };
  return q }
const files = new Map([[`${U2}/bg-a1.jpg`, 1], [`${U2}/logo-b2.jpg`, 1], [`${U1}/bg-keep.jpg`, 1]]);
globalThis.__sb = { from: table,
  rpc: async (fn, args) => { if (fn === 'rate_allow') return { data: rateOk, error: null }; rpcCalls.push([fn, args]);
    if (fn === 'lc_set_blocked') { const c = db.lc_cards.find(x => x.id === args.p_card); if (!c) return { data: null, error: { code: 'P0002', message: 'No such card.' } };
      db.lc_cards.filter(x => x.owner === c.owner).forEach(x => x.blocked = args.p_blocked); db.lc_accounts.find(a => a.user_id === c.owner).blocked = args.p_blocked; return { data: null, error: null } }
    return { data: null, error: { message: 'unexpected rpc' } } },
  auth: { admin: { getUserById: async id => ({ data: { user: { id, email: id === U1 ? 'jordan@example.com' : 'bank@example.com' } } }) } },
  storage: { from: b => ({ list: async (prefix) => ({ data: [...files.keys()].filter(k => k.startsWith(prefix + '/')).map(k => ({ name: k.split('/')[1] })), error: null }),
    remove: async paths => { paths.forEach(p => files.delete(p)); return { error: null } } }) } };
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' };
let handler; globalThis.Deno = { env: { get: k => env[k] }, serve: fn => { handler = fn } };
globalThis.fetch = async (u) => { throw new Error('unexpected outside request: ' + u) };
await import(pathToFileURL(out).href);

const b64 = b => Buffer.from(b).toString('base64url');
const token = (epoch = 3, exp = Math.floor(Date.now() / 1000) + 600, secret = 'owner-session|svc') => { const body = b64(JSON.stringify({ exp, ep: epoch })); return body + '.' + crypto.createHmac('sha256', secret).update(body).digest('base64url') };
const call = async (body, tok = token(), method = 'POST') => { const h = { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }; if (tok) h.authorization = 'Bearer ' + tok;
  const r = await handler(new Request('https://x/functions/v1/lc-admin', { method, headers: h, body: method === 'POST' ? JSON.stringify(body) : undefined })); let j = {}; try { j = await r.json() } catch {} return { status: r.status, json: j } };
const res = []; const T = (ok, name, extra) => res.push((ok ? 'PASS ' : 'FAIL ') + name + (!ok && extra ? ' :: ' + extra : ''));

// ---- who may use it
let r = await call({ action: 'overview' }, null); T(r.status === 401, 'no owner session: refused');
r = await call({ action: 'overview' }, 'abc.def'); T(r.status === 401, 'made-up session: refused');
r = await call({ action: 'overview' }, token(3, undefined, 'owner-session|guess')); T(r.status === 401, 'session signed with the wrong secret: refused');
r = await call({ action: 'overview' }, token(3, Math.floor(Date.now() / 1000) - 5)); T(r.status === 401, 'expired session: refused');
r = await call({ action: 'overview' }, token(2)); T(r.status === 401, 'session from before "sign out every device": refused');
r = await call({ action: 'take_down', card_id: C1 }, 't.eyJzdWIiOiIxMTExMTExMS0yMjIyLTQzMzMtODQ0NC01NTU1NTU1NTU1NTUifQ.s'); T(r.status === 401 && !db.lc_cards[0].blocked, 'a Live Cards client sign-in is not an owner session: refused');
T(db.security_events.length === 0 && rpcCalls.length === 0, 'refused requests change nothing');
r = await call({}, token(), 'GET'); T(r.status === 405, 'only POST is accepted');
rateOk = false; r = await call({ action: 'overview' }); rateOk = true; T(r.status === 429, 'too many requests are slowed down');

// ---- what it does
r = await call({ action: 'overview' }); T(r.status === 200 && r.json.cards === 2 && r.json.published === 2 && r.json.paid_accounts === 1 && r.json.open_reports === 1 && r.json.blocked_accounts === 0, 'overview counts are right', JSON.stringify(r.json));
r = await call({ action: 'reports' }); T(r.json.reports.length === 1 && r.json.reports[0].card.slug === 'fake-bank' && r.json.reports[0].card.account.email === 'bank@example.com', 'open reports come with the card and the account email', JSON.stringify(r.json));
r = await call({ action: 'reports', show: 'all' }); T(r.json.reports.length === 2, 'all reports can be listed');
r = await call({ action: 'cards', q: "Rivers%' ; drop table lc_cards;--<script>" }); T(patterns.every(p => /^%[a-z0-9 -]*%$/.test(p)), 'search text is reduced to safe characters before it reaches the database', patterns.join(' | '));
r = await call({ action: 'cards', q: 'jordan' }); T(r.json.cards.length === 1 && r.json.cards[0].name === 'Jordan Rivers' && r.json.cards[0].account.plan === 'free', 'search finds a card by name or link');
r = await call({ action: 'take_down', card_id: 'not-a-card' }); T(r.status === 400 && rpcCalls.length === 0, 'a malformed card id never reaches the database');
r = await call({ action: 'take_down', card_id: 'c0000000-0000-4000-8000-00000000dead' }); T(r.status === 404, 'a card that does not exist gives a plain answer');
r = await call({ action: 'take_down', card_id: C2 }); T(r.status === 200 && db.lc_cards[1].blocked && db.lc_accounts[1].blocked && !db.lc_cards[0].blocked, 'take down blocks that card and account only');
T(db.security_events.some(e => e.kind === 'lc_card_taken_down' && e.detail.card === C2), 'the take-down is written to the security log');
r = await call({ action: 'remove_files', user_id: U2 }); T(r.json.removed === 2 && files.size === 1 && files.has(`${U1}/bg-keep.jpg`), 'remove files clears that account\'s folder and nobody else\'s');
r = await call({ action: 'remove_files', user_id: '../' + U1 }); T(r.status === 400 && files.size === 1, 'a path trick in the account id is refused');
r = await call({ action: 'report_done', id: 1 }); T(db.lc_reports[0].handled === true, 'a report can be marked handled');
r = await call({ action: 'report_done', id: '1; drop' }); T(r.status === 400, 'a malformed report id is refused');
r = await call({ action: 'restore', card_id: C2 }); T(!db.lc_cards[1].blocked && !db.lc_accounts[1].blocked, 'restore lifts the block');
r = await call({ action: 'set_plan', user_id: U1, plan: 'admin' }); T(r.status === 400 && db.lc_accounts[0].plan === 'free', 'only "free" or "pro" is accepted as a plan');
r = await call({ action: 'set_plan', user_id: U1, plan: 'pro' }); T(db.lc_accounts[0].plan === 'pro' && r.json.pays_through_stripe === false && db.security_events.some(e => e.kind === 'lc_plan_set_by_owner'), 'the owner can set a plan by hand, and it is logged');
r = await call({ action: 'set_plan', user_id: U2, plan: 'free' }); T(r.json.pays_through_stripe === true, 'setting a plan on a paying account warns that Stripe is separate');
r = await call({ action: 'delete_everything' }); T(r.status === 400, 'unknown actions are refused');
r = await handler(new Request('https://x/', { method: 'POST', headers: { 'content-length': '999999', authorization: 'Bearer ' + token() }, body: '{}' })); T(r.status === 413, 'oversized requests are refused');

console.log(res.join('\n')); const f = res.filter(x => x.startsWith('FAIL')).length; console.log(`${f} FAIL of ${res.length}`); process.exit(f ? 1 : 0);
