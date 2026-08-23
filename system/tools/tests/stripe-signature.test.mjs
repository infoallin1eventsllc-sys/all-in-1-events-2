import { loadVerifier } from './extract.mjs';
const { verifyStripeSignature } = await loadVerifier();
import { createHmac } from 'node:crypto';

const SECRET = 'whsec_test_deadbeefcafebabe0123456789abcdef';
const OTHER  = 'whsec_someone_elses_secret_0000000000';
const body   = JSON.stringify({ id:'evt_1', type:'checkout.session.completed',
                                data:{ object:{ id:'cs_1', payment_status:'paid', amount_total: 850000 } } });

const sign = (payload, secret, t) =>
  createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');

const now = () => Math.floor(Date.now()/1000);
let pass = 0, fail = 0;
const check = async (name, expectOk, header, secret = SECRET) => {
  const r = await verifyStripeSignature(body, header, secret);
  const ok = r.ok === expectOk;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(52)} ${r.ok ? 'accepted' : 'rejected: ' + r.reason}`);
};

const t = now();
await check('genuine signature is accepted',            true,  `t=${t},v1=${sign(body, SECRET, t)}`);
await check('wrong secret is rejected',                 false, `t=${t},v1=${sign(body, OTHER, t)}`);
await check('tampered body is rejected',                false, `t=${t},v1=${sign(body.replace('850000','1'), SECRET, t)}`);
await check('missing header is rejected',               false, null);
await check('empty signature list is rejected',         false, `t=${t}`);
await check('garbage header is rejected',               false, 'not-a-signature');
await check('no configured secret is rejected',         false, `t=${t},v1=${sign(body, SECRET, t)}`, '');

// Replay: a genuine, correctly signed event from an hour ago.
const old = now() - 3600;
await check('REPLAY of a real old event is rejected',   false, `t=${old},v1=${sign(body, SECRET, old)}`);

// Future-dated beyond tolerance (clock skew abuse).
const future = now() + 3600;
await check('future-dated beyond tolerance rejected',   false, `t=${future},v1=${sign(body, SECRET, future)}`);

// Small skew inside tolerance must still work, or real webhooks fail.
const skew = now() - 120;
await check('120s clock skew still accepted',           true,  `t=${skew},v1=${sign(body, SECRET, skew)}`);

// Secret rotation: Stripe sends one v1 per active secret.
await check('accepts when one of two v1s matches',      true,  `t=${t},v1=${sign(body, OTHER, t)},v1=${sign(body, SECRET, t)}`);
await check('rejects when neither v1 matches',          false, `t=${t},v1=${sign(body, OTHER, t)},v1=${sign(body, OTHER+'x', t)}`);

console.log(`\n${pass}/${pass+fail} passed`);
process.exit(fail ? 1 : 0);
