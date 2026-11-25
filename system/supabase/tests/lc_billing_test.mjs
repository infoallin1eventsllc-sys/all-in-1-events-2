// Attack test for the Live Cards payment functions. Runs both functions for real, in Node, against a stand-in
// database and a stand-in Stripe. Nothing outside this process is contacted.
// Run from system/supabase:  node tests/lc_billing_test.mjs <path to esbuild>
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';

const esbuild = process.argv[2];
const dir = mkdtempSync(path.join(tmpdir(), 'lcbill-'));
writeFileSync(path.join(dir, 'stub-supabase.mjs'), 'export const createClient=()=>globalThis.__sb;');
writeFileSync(path.join(dir, 'stub-empty.mjs'), 'export {};');
const build = (name) => { const out = path.join(dir, name + '.mjs');
  execFileSync(esbuild, [`functions/${name}/index.ts`, '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error',
    `--alias:npm:@supabase/supabase-js@2=${path.join(dir, 'stub-supabase.mjs')}`, `--alias:jsr:@supabase/functions-js/edge-runtime.d.ts=${path.join(dir, 'stub-empty.mjs')}`]); return out; };

// ---- stand-ins
const db = { lc_accounts: [], lc_cards: [], lc_billing_events: [] };
const keyOf = { lc_accounts: 'user_id', lc_billing_events: 'event_id', lc_cards: 'id' };
let rateOk = true;
function table(name) { const rows = db[name]; let filt = [], op = 'select', payload = null, ord = null;
  const q = { select() { return q }, eq(c, v) { filt.push([c, v]); return q }, order(c) { ord = c; return q },
    insert(o) { op = 'insert'; payload = o; return q }, update(o) { op = 'update'; payload = o; return q }, delete() { op = 'delete'; return q },
    upsert(o) { op = 'upsert'; payload = o; return q },
    maybeSingle() { return q.then(r => ({ data: (r.data || [])[0] ?? null, error: r.error })) },
    then(res, rej) { let out; const match = r => filt.every(([c, v]) => r[c] === v);
      if (op === 'insert') { const k = keyOf[name]; if (rows.some(r => r[k] === payload[k])) out = { data: null, error: { code: '23505', message: 'duplicate key' } }; else { rows.push({ ...payload }); out = { data: null, error: null } } }
      else if (op === 'upsert') { const k = keyOf[name], i = rows.findIndex(r => r[k] === payload[k]); if (i >= 0) Object.assign(rows[i], payload); else rows.push({ ...payload }); out = { data: null, error: null } }
      else if (op === 'update') { rows.filter(match).forEach(r => Object.assign(r, payload)); out = { data: null, error: null } }
      else if (op === 'delete') { for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i])) rows.splice(i, 1); out = { data: null, error: null } }
      else { let d = rows.filter(match); if (ord) d = [...d].sort((a, b) => String(a[ord]).localeCompare(String(b[ord]))); out = { data: d, error: null } }
      return Promise.resolve(out).then(res, rej) } };
  return q }
const U1 = '11111111-2222-4333-8444-555555555555', U2 = '99999999-2222-4333-8444-555555555555';
globalThis.__sb = { from: table, rpc: async () => ({ data: rateOk, error: null }),
  auth: { getUser: async (t) => t === 'good-1' ? { data: { user: { id: U1, email: 'a@example.com' } }, error: null } : t === 'good-2' ? { data: { user: { id: U2, email: 'b@example.com' } }, error: null } : { data: { user: null }, error: { message: 'bad jwt' } } } };
const env = { STRIPE_SECRET_KEY: 'sk_test_x', LC_STRIPE_PRICE_ID: 'price_TEST123', LC_STRIPE_WEBHOOK_SECRET: 'whsec_testsecret', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' };
const handlers = {}; let current = '';
globalThis.Deno = { env: { get: k => env[k] }, serve: fn => { handlers[current] = fn } };
const subs = { sub_A: { id: 'sub_A', status: 'active', customer: 'cus_A', metadata: { product: 'live-cards', user_id: U1 } },
  sub_OTHER: { id: 'sub_OTHER', status: 'active', customer: 'cus_Z', metadata: { product: 'something-else', user_id: U2 } },
  sub_B: { id: 'sub_B', status: 'active', customer: 'cus_B', metadata: { product: 'live-cards', user_id: U2 } } };
const stripeCalls = []; let stripeDown = false;
globalThis.fetch = async (url, init = {}) => { url = String(url); stripeCalls.push({ url, body: String(init.body || ''), headers: init.headers || {} });
  if (!url.startsWith('https://api.stripe.com/v1/')) throw new Error('unexpected outside request: ' + url);
  if (stripeDown) return new Response(JSON.stringify({ error: { message: 'down' } }), { status: 500 });
  const m = url.match(/\/subscriptions\/(sub_\w+)$/); if (m) return subs[m[1]] ? new Response(JSON.stringify(subs[m[1]])) : new Response(JSON.stringify({ error: { message: 'no such subscription' } }), { status: 404 });
  if (url.endsWith('/checkout/sessions')) return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }));
  if (url.endsWith('/billing_portal/sessions')) return new Response(JSON.stringify({ url: 'https://billing.stripe.com/p/session/x' }));
  return new Response('{}', { status: 404 }) };

current = 'hook'; await import(pathToFileURL(build('lc-billing-webhook')).href);
current = 'bill'; await import(pathToFileURL(build('lc-billing')).href);

const out = []; const T = (ok, name, extra) => out.push((ok ? 'PASS ' : 'FAIL ') + name + (!ok && extra ? ' :: ' + extra : ''));
const sign = (body, secret = env.LC_STRIPE_WEBHOOK_SECRET, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
const hook = async (evt, sig) => { const body = typeof evt === 'string' ? evt : JSON.stringify(evt); const h = { 'content-type': 'application/json' }; if (sig !== null) h['stripe-signature'] = sig ?? sign(body);
  const r = await handlers.hook(new Request('https://x/functions/v1/lc-billing-webhook', { method: 'POST', headers: h, body })); return { status: r.status, json: await r.json() } };
const plan = u => (db.lc_accounts.find(a => a.user_id === u) || {}).plan || 'free';
const done = (id, sub, ref) => ({ id, type: 'checkout.session.completed', data: { object: { mode: 'subscription', subscription: sub, client_reference_id: ref } } });

// ---- the webhook: forged, replayed and out-of-order messages
let r = await hook(done('evt_1', 'sub_A', U1), null); T(r.status === 400 && plan(U1) === 'free', 'message with no signature is refused');
r = await hook(done('evt_1', 'sub_A', U1), 't=1,v1=deadbeef'); T(r.status === 400 && plan(U1) === 'free', 'message with a made-up signature is refused');
{ const b = JSON.stringify(done('evt_1', 'sub_A', U1)); r = await hook(b, sign(b, 'whsec_wrong')); T(r.status === 400 && plan(U1) === 'free', 'message signed with the wrong secret is refused');
  r = await hook(b, sign(b, undefined, Math.floor(Date.now() / 1000) - 3600)); T(r.status === 400 && plan(U1) === 'free', 'a genuine message replayed an hour later is refused');
  const sig = sign(b); r = await hook(b.replace(U1, U2), sig); T(r.status === 400 && plan(U2) === 'free', 'a genuine message altered after signing is refused') }
T(db.lc_billing_events.length === 0, 'refused messages leave no trace in the database');
r = await hook(done('evt_2', 'sub_OTHER', U2)); T(r.status === 200 && plan(U2) === 'free', 'a payment for a different product does not unlock Live Cards');
r = await hook(done('evt_3', 'sub_A', U2)); T(r.status === 200 && plan(U2) === 'free' && plan(U1) === 'free', 'a payment whose account reference does not match changes nothing', JSON.stringify(r.json));
r = await hook(done('evt_4', 'sub_NOPE', U1)); T(r.status === 500 && plan(U1) === 'free' && !db.lc_billing_events.some(e => e.event_id === 'evt_4'), 'unknown subscription: nothing changes and the message is released for retry');
r = await hook(done('evt_5', 'sub_A', U1)); T(r.status === 200 && plan(U1) === 'pro', 'a real paid checkout turns the plan on', JSON.stringify(r.json));
const acct = db.lc_accounts.find(a => a.user_id === U1); T(acct.stripe_customer_id === 'cus_A' && acct.stripe_subscription_id === 'sub_A', 'customer and subscription ids are stored for later');
db.lc_accounts.find(a => a.user_id === U1).plan = 'free'; r = await hook(done('evt_5', 'sub_A', U1)); T(r.json.duplicate === true && plan(U1) === 'free', 'the same message delivered twice is only applied once'); db.lc_accounts.find(a => a.user_id === U1).plan = 'pro';
// cancelled: plan drops, extra cards go offline, nothing is deleted
db.lc_cards.push({ id: 'c1', owner: U1, created_at: '2026-01-01', published: true, data: { name: 'One', showMade: false } }, { id: 'c2', owner: U1, created_at: '2026-02-01', published: true, data: { name: 'Two', showMade: false } }, { id: 'c9', owner: U2, created_at: '2026-01-01', published: true, data: { name: 'Other', showMade: true } });
// an old "still active" message arriving after the cancellation must not turn the plan back on
subs.sub_A.status = 'canceled';
r = await hook({ id: 'evt_6', type: 'customer.subscription.updated', data: { object: { id: 'sub_A', status: 'active' } } }); T(plan(U1) === 'free', 'a late "active" message cannot switch a cancelled plan back on (Stripe is asked directly)');
T(db.lc_cards.length === 3 && db.lc_cards.find(c => c.id === 'c1').published && !db.lc_cards.find(c => c.id === 'c2').published && db.lc_cards.find(c => c.id === 'c1').data.showMade === true, 'after cancelling: first card stays live, extra card goes offline, nothing deleted');
T(db.lc_cards.find(c => c.id === 'c9').published, 'another account\'s card is untouched');
stripeDown = true; r = await hook({ id: 'evt_7', type: 'customer.subscription.deleted', data: { object: { id: 'sub_A' } } }); stripeDown = false;
T(r.status === 500 && !db.lc_billing_events.some(e => e.event_id === 'evt_7'), 'if Stripe cannot be reached the message is kept for retry, not lost');
r = await hook({ id: 'evt_8', type: 'invoice.created', data: { object: {} } }); T(r.status === 200 && r.json.handled === false, 'unrelated messages are acknowledged and ignored');
r = await handlers.hook(new Request('https://x/', { method: 'GET' })); T(r.status === 405, 'the webhook only accepts POST');
r = await hook('x'.repeat(300 * 1024), 't=1,v1=00'); T(r.status === 413, 'oversized messages are refused');

// ---- the checkout: who may open one, and what the browser can influence
const bill = async (token, body) => { const h = { 'content-type': 'application/json' }; if (token) h.authorization = 'Bearer ' + token;
  const q = await handlers.bill(new Request('https://x/functions/v1/lc-billing', { method: 'POST', headers: h, body: JSON.stringify(body) })); return { status: q.status, json: await q.json(), cors: q.headers.get('access-control-allow-origin') } };
stripeCalls.length = 0;
r = await bill(null, { action: 'checkout' }); T(r.status === 401, 'checkout without sign-in is refused');
r = await bill('forged-token', { action: 'checkout' }); T(r.status === 401 && stripeCalls.length === 0, 'checkout with a forged sign-in is refused before Stripe is contacted');
r = await bill('good-2', { action: 'give-me-pro' }); T(r.status === 400, 'unknown requests are refused');
r = await bill('good-2', { action: 'checkout', price: 'price_CHEAP', amount: 1, user_id: U1, success_url: 'https://evil.example/', plan: 'pro' });
const sent = decodeURIComponent((stripeCalls.at(-1) || {}).body || '');
T(r.status === 200 && r.json.url.startsWith('https://checkout.stripe.com/'), 'a signed-in account gets a Stripe-hosted checkout address');
T(sent.includes('line_items[0][price]=price_TEST123') && !sent.includes('price_CHEAP') && !sent.includes('evil.example') && sent.includes('client_reference_id=' + U2) && !sent.includes(U1) && sent.includes('success_url=https://meridianinterface.com/studio/'), 'price, account and return address come from the server, never from the browser', sent);
T(plan(U2) === 'free', 'opening a checkout does not change the plan');
T(r.cors === 'https://meridianinterface.com', 'only the Meridian site may call it from a browser');
db.lc_accounts.push({ user_id: U2, plan: 'pro', stripe_customer_id: 'cus_B', stripe_subscription_id: 'sub_B' });
r = await bill('good-2', { action: 'checkout' }); T(r.status === 409, 'an account that already has the plan cannot be charged twice');
r = await bill('good-2', { action: 'portal' }); T(r.status === 200 && r.json.url.startsWith('https://billing.stripe.com/') && decodeURIComponent(stripeCalls.at(-1).body).includes('customer=cus_B'), 'manage-plan opens Stripe\'s own page for that account only');
db.lc_accounts.find(a => a.user_id === U1).plan = 'free'; db.lc_accounts.find(a => a.user_id === U1).blocked = true; { const before = stripeCalls.length; r = await bill('good-1', { action: 'checkout' }); T(r.status === 403 && stripeCalls.length === before, 'an account whose card was taken down cannot buy a plan'); } db.lc_accounts.find(a => a.user_id === U1).blocked = false;
rateOk = false; r = await bill('good-1', { action: 'checkout' }); rateOk = true; T(r.status === 429, 'too many tries are slowed down');
delete env.LC_STRIPE_PRICE_ID; db.lc_accounts = db.lc_accounts.filter(a => a.user_id !== U1); r = await bill('good-1', { action: 'checkout' }); T(r.status === 503, 'with no price configured, payments stay off');
T(stripeCalls.every(c => c.url.startsWith('https://api.stripe.com/v1/')), 'the functions only ever talk to Stripe');

console.log(out.join('\n')); const f = out.filter(x => x.startsWith('FAIL')).length; console.log(`${f} FAIL of ${out.length}`); process.exit(f ? 1 : 0);
