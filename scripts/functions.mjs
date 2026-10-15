#!/usr/bin/env node
// The Netlify functions, called directly. No network, no browser, no Netlify —
// each handler is required and invoked with the event shape Netlify gives it.
//
// These are the parts of the site that move money, hold the owner's door shut
// and carry a customer's email to the CRM. None of them can be seen in a page
// load: a checkout function that rejects every product still serves a perfect
// checkout page. So they are exercised here, with Stripe, the CRM and the
// clock stubbed where they would otherwise reach out.
//
//   node scripts/functions.mjs
//
// Every test uses its own client address, because the throttle is real and
// shared across the run.

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const fn = (name) => require(path.join(ROOT, "netlify/functions", name + ".js")).handler;

/* ---------- the shop catalogue, as the browser sees it ---------- */
const CATALOG = new Function(
  fs.readFileSync(path.join(ROOT, "420-friendly/assets/products.js"), "utf8") + "\nreturn CATALOG;"
)();
const POLICY = new Function(
  fs.readFileSync(path.join(ROOT, "420-friendly/assets/policy.js"), "utf8") + "\nreturn POLICY;"
)();

/* ---------- a stand-in for the stripe package ----------
   The function requires "stripe" inside the handler, so planting a module in
   the require cache under stripe's real path is enough: the same filename
   resolves from netlify/functions, and Node hands back our exports. */
const stripeCalls = [];
let stripeFailure = null;
function fakeStripe(secret) {
  return {
    checkout: {
      sessions: {
        async create(params, options) {
          stripeCalls.push({ secret, params, options });
          if (stripeFailure) {
            const err = new Error(stripeFailure);
            err.type = "StripeInvalidRequestError";
            throw err;
          }
          return { url: "https://checkout.stripe.com/c/pay/cs_test_fake" };
        }
      }
    }
  };
}
const stripePath = require.resolve("stripe");
require.cache[stripePath] = { id: stripePath, filename: stripePath, loaded: true, exports: fakeStripe };

/* ---------- harness ---------- */
let ipCounter = 0;
const nextIp = () => `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

function event({ method = "POST", body, headers = {}, ip = nextIp(), host = "allin1-events.netlify.app" } = {}) {
  return {
    httpMethod: method,
    headers: {
      host,
      origin: "https://" + host,
      "x-nf-client-connection-ip": ip,
      "content-type": "application/json",
      ...headers
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body)
  };
}
const parse = (res) => ({ status: res.statusCode, headers: res.headers, body: JSON.parse(res.body) });

async function withEnv(vars, run) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try { return await run(); }
  finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

let failures = 0, passes = 0;
function group(title) { console.log(`\n${title}`); }
async function test(name, run) {
  try {
    await run();
    passes++;
    console.log(`  ok    ${name}`);
  } catch (err) {
    failures++;
    const msg = String(err && err.message || err).split("\n").map((l) => "          " + l).join("\n");
    console.log(`  FAIL  ${name}\n${msg}`);
  }
}

// Every test below runs with no live credentials in the environment, whatever
// the shell had. Nothing here should ever reach a real service.
for (const k of ["STRIPE_SECRET_KEY", "STRIPE_PAYMENT_METHODS", "OWNER_PASSCODE", "MERIDIAN_INTAKE_URL",
  "MERIDIAN_WEBHOOK_SECRET", "ANTHROPIC_API_KEY"]) delete process.env[k];

/* ======================================================================
   throttle
   ====================================================================== */
group("throttle  (netlify/shared/throttle.js)");
const { throttled } = require(path.join(ROOT, "netlify/shared/throttle.js"));

await test("allows `limit` requests then answers 429 with Retry-After", () => {
  const ip = nextIp();
  const opts = { limit: 3, windowMs: 60_000, name: "t-basic" };
  for (let i = 0; i < 3; i++) assert.equal(throttled(event({ ip }), opts), null, `request ${i + 1} should pass`);
  const res = throttled(event({ ip }), opts);
  assert.equal(res.statusCode, 429);
  assert.ok(Number(res.headers["Retry-After"]) >= 1);
  assert.equal(JSON.parse(res.body).error, "rate_limited");
});

await test("one address's limit does not touch another's", () => {
  const a = nextIp(), b = nextIp();
  const opts = { limit: 1, windowMs: 60_000, name: "t-isolated" };
  assert.equal(throttled(event({ ip: a }), opts), null);
  assert.equal(throttled(event({ ip: a }), opts).statusCode, 429);
  assert.equal(throttled(event({ ip: b }), opts), null);
});

await test("one function's limit does not count against another's", () => {
  const ip = nextIp();
  assert.equal(throttled(event({ ip }), { limit: 1, windowMs: 60_000, name: "t-lead" }), null);
  assert.equal(throttled(event({ ip }), { limit: 1, windowMs: 60_000, name: "t-lead" }).statusCode, 429);
  assert.equal(throttled(event({ ip }), { limit: 1, windowMs: 60_000, name: "t-checkout" }), null,
    "a different function must start its own count");
});

await test("the window expires", async () => {
  const ip = nextIp();
  const opts = { limit: 1, windowMs: 40, name: "t-window" };
  assert.equal(throttled(event({ ip }), opts), null);
  assert.equal(throttled(event({ ip }), opts).statusCode, 429);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(throttled(event({ ip }), opts), null);
});

await test("falls back to x-forwarded-for, then 'unknown'", () => {
  const opts = { limit: 1, windowMs: 60_000, name: "t-ip" };
  const e = event(); delete e.headers["x-nf-client-connection-ip"]; e.headers["x-forwarded-for"] = "203.0.113.9, 10.0.0.1";
  assert.equal(throttled(e, opts), null);
  assert.equal(throttled(e, opts).statusCode, 429);
  const bare = { httpMethod: "POST", headers: {} };
  throttled(bare, { limit: 1000, windowMs: 60_000, name: "t-bare" }); // must not throw
});

/* ======================================================================
   health
   ====================================================================== */
group("health");
const health = fn("health");

await test("GET answers 200 with configuration booleans, never values", async () => {
  const r = parse(await health(event({ method: "GET" })));
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.deepEqual(r.body.configured, { stripe: false, crm: false, concierge: false, ownerPasscode: false });
  assert.equal(r.headers["Cache-Control"], "no-store");
  await withEnv({ STRIPE_SECRET_KEY: "sk_test_x", OWNER_PASSCODE: "a-long-passphrase" }, async () => {
    const r2 = parse(await health(event({ method: "GET" })));
    assert.equal(r2.body.configured.stripe, true);
    assert.equal(r2.body.configured.ownerPasscode, true);
    assert.ok(!r2.body.includes, "no values in the body");
    assert.ok(!JSON.stringify(r2.body).includes("sk_test_x"));
  });
});

await test("POST is refused", async () => {
  assert.equal(parse(await health(event({ method: "POST", body: {} }))).status, 405);
});

/* ======================================================================
   create-checkout-session
   ====================================================================== */
group("create-checkout-session");
const checkout = fn("create-checkout-session");
const KEY = { STRIPE_SECRET_KEY: "sk_test_fake_for_tests" };
const line = (p, qty = 1, size = "M") => ({ id: p.id, size, qty });

await test("without STRIPE_SECRET_KEY: 503 not_configured, Stripe never called", async () => {
  stripeCalls.length = 0;
  const r = parse(await checkout(event({ body: { cart: [line(CATALOG[0])] } })));
  assert.equal(r.status, 503);
  assert.equal(r.body.error, "not_configured");
  assert.equal(stripeCalls.length, 0);
});

await test("GET is refused; malformed JSON and an empty bag are 400", () => withEnv(KEY, async () => {
  assert.equal(parse(await checkout(event({ method: "GET" }))).status, 405);
  assert.equal(parse(await checkout(event({ body: "{not json" }))).status, 400);
  assert.equal(parse(await checkout(event({ body: { cart: [] } }))).status, 400);
  assert.equal(parse(await checkout(event({ body: {} }))).status, 400);
}));

await test("every product in the shop can be bought, at the shop's price, under its name", () => withEnv(KEY, async () => {
  stripeCalls.length = 0;
  const cart = CATALOG.map((p) => line(p, 1, p.sizes[0]));
  const r = parse(await checkout(event({ body: { cart, nonce: "abcdefgh-1234" } })));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.url, "https://checkout.stripe.com/c/pay/cs_test_fake");
  const { params } = stripeCalls[0];
  assert.equal(params.line_items.length, CATALOG.length);
  CATALOG.forEach((p, i) => {
    const li = params.line_items[i];
    assert.equal(li.price_data.unit_amount, Math.round(p.price * 100), `${p.id} price`);
    assert.equal(li.price_data.currency, "usd");
    assert.equal(li.price_data.product_data.name, `${p.name} — ${p.sizes[0]}`, `${p.id} receipt name`);
    assert.equal(li.quantity, 1);
  });
}));

await test("a product the shop no longer sells is refused by id", () => withEnv(KEY, async () => {
  for (const id of ["vibrant-hoodie", "midnight-windbreaker", "", null, 42]) {
    const r = parse(await checkout(event({ body: { cart: [{ id, size: "M", qty: 1 }] } })));
    assert.equal(r.status, 400, `id ${JSON.stringify(id)}`);
    assert.match(r.body.error, /^Unknown product/);
  }
}));

await test("quantity must be a whole number from 1 to 10", () => withEnv(KEY, async () => {
  const p = CATALOG[0];
  for (const qty of [0, -1, 11, "abc", null, undefined, Infinity]) {
    const r = parse(await checkout(event({ body: { cart: [{ id: p.id, size: "M", qty }] } })));
    assert.equal(r.status, 400, `qty ${String(qty)}`);
    assert.match(r.body.error, /Invalid quantity/);
  }
  stripeCalls.length = 0;
  const ok = parse(await checkout(event({ body: { cart: [{ id: p.id, size: "M", qty: 2.9 }] } })));
  assert.equal(ok.status, 200);
  assert.equal(stripeCalls[0].params.line_items[0].quantity, 2, "fractional quantities floor");
}));

await test("prices sent by the browser are ignored", () => withEnv(KEY, async () => {
  stripeCalls.length = 0;
  const p = CATALOG[0];
  const r = parse(await checkout(event({ body: { cart: [{ id: p.id, size: "M", qty: 1, price: 0.01, cents: 1 }] } })));
  assert.equal(r.status, 200);
  assert.equal(stripeCalls[0].params.line_items[0].price_data.unit_amount, Math.round(p.price * 100));
}));

const FREE_CENTS = Math.round(POLICY.freeShippingOver * 100);
const cheapest = [...CATALOG].sort((a, b) => a.price - b.price)[0];
const dearest = [...CATALOG].sort((a, b) => b.price - a.price)[0];

await test(`a bag under $${POLICY.freeShippingOver} pays flat shipping; at or over it ships free`, () => withEnv(KEY, async () => {
  assert.ok(cheapest.price * 100 < FREE_CENTS, "need a product under the threshold for this test");
  assert.ok(dearest.price * 100 >= FREE_CENTS, "need a product at or over the threshold for this test");
  stripeCalls.length = 0;
  await checkout(event({ body: { cart: [line(cheapest)] } }));
  const paid = stripeCalls[0].params.shipping_options[0].shipping_rate_data;
  assert.equal(paid.fixed_amount.amount, 800);
  assert.match(paid.display_name, /Standard shipping/);
  await checkout(event({ body: { cart: [line(dearest)] } }));
  const free = stripeCalls[1].params.shipping_options[0].shipping_rate_data;
  assert.equal(free.fixed_amount.amount, 0);
  assert.equal(free.display_name, "Free shipping");
  // Exactly at the threshold counts as over, matching the bag page's `>=`.
  const qty = Math.ceil(FREE_CENTS / (cheapest.price * 100));
  await checkout(event({ body: { cart: [line(cheapest, Math.min(qty, 10))] } }));
  if (qty <= 10) assert.equal(stripeCalls[2].params.shipping_options[0].shipping_rate_data.fixed_amount.amount, 0);
}));

await test(`ships to the US only, as the shipping page promises ("${POLICY.shipsTo}")`, () => withEnv(KEY, async () => {
  stripeCalls.length = 0;
  await checkout(event({ body: { cart: [line(CATALOG[0])] } }));
  assert.deepEqual(stripeCalls[0].params.shipping_address_collection.allowed_countries, ["US"]);
}));

await test("success and cancel URLs come from the request origin", () => withEnv(KEY, async () => {
  stripeCalls.length = 0;
  await checkout(event({ body: { cart: [line(CATALOG[0])] }, host: "deploy-preview-3--allin1-events.netlify.app" }));
  const { params } = stripeCalls[0];
  assert.equal(params.success_url,
    "https://deploy-preview-3--allin1-events.netlify.app/420-friendly/checkout.html?paid=1&session_id={CHECKOUT_SESSION_ID}");
  assert.equal(params.cancel_url, "https://deploy-preview-3--allin1-events.netlify.app/420-friendly/cart.html?canceled=1");
  assert.equal(params.mode, "payment");
  assert.deepEqual(params.payment_method_types, ["card"]);
}));

await test("a well-formed nonce becomes a Stripe idempotency key; anything else is dropped", () => withEnv(KEY, async () => {
  stripeCalls.length = 0;
  const cart = [line(CATALOG[0])];
  await checkout(event({ body: { cart, nonce: "3f2a9c1e-7b4d-4e5f-8a6b-9c0d1e2f3a4b" } }));
  assert.deepEqual(stripeCalls[0].options, { idempotencyKey: "checkout-3f2a9c1e-7b4d-4e5f-8a6b-9c0d1e2f3a4b" });
  for (const bad of ["short", "has spaces here", "x".repeat(65), 12345678, { a: 1 }, "semi;colon-injection"]) {
    await checkout(event({ body: { cart, nonce: bad } }));
    assert.equal(stripeCalls.at(-1).options, undefined, `nonce ${JSON.stringify(bad)} must not reach Stripe`);
  }
}));

await test("the size is passed through, truncated, and never breaks the line", () => withEnv(KEY, async () => {
  stripeCalls.length = 0;
  await checkout(event({ body: { cart: [{ id: CATALOG[0].id, size: "X".repeat(40), qty: 1 }] } }));
  assert.equal(stripeCalls[0].params.line_items[0].price_data.product_data.name, `${CATALOG[0].name} — ${"X".repeat(12)}`);
  await checkout(event({ body: { cart: [{ id: CATALOG[0].id, size: 7, qty: 1 }] } }));
  assert.equal(stripeCalls[1].params.line_items[0].price_data.product_data.name, CATALOG[0].name);
}));

await test("STRIPE_PAYMENT_METHODS widens the method list", () => withEnv({ ...KEY, STRIPE_PAYMENT_METHODS: "card, cashapp ,link," }, async () => {
  stripeCalls.length = 0;
  await checkout(event({ body: { cart: [line(CATALOG[0])] } }));
  assert.deepEqual(stripeCalls[0].params.payment_method_types, ["card", "cashapp", "link"]);
}));

await test("a Stripe error comes back as 502 with Stripe's own message", () => withEnv(KEY, async () => {
  stripeFailure = "Cash App Pay is not enabled on this account";
  try {
    const r = parse(await checkout(event({ body: { cart: [line(CATALOG[0])] } })));
    assert.equal(r.status, 502);
    assert.equal(r.body.error, "stripe_error");
    assert.equal(r.body.message, stripeFailure);
  } finally { stripeFailure = null; }
}));

await test("the 16th attempt in a minute from one address is throttled", () => withEnv(KEY, async () => {
  const ip = nextIp();
  for (let i = 0; i < 15; i++) {
    const r = parse(await checkout(event({ ip, body: { cart: [line(CATALOG[0])] } })));
    assert.equal(r.status, 200, `attempt ${i + 1}`);
  }
  const r = parse(await checkout(event({ ip, body: { cart: [line(CATALOG[0])] } })));
  assert.equal(r.status, 429);
}));

/* ======================================================================
   owner-auth + owner-session
   ====================================================================== */
group("owner-auth  (and the session tokens it issues)");
const ownerAuth = fn("owner-auth");
const session = require(path.join(ROOT, "netlify/shared/owner-session.js"));
const PASS = "correct-horse-battery-staple-420";

await test("no OWNER_PASSCODE: 503 that names the deploy context", async () => {
  const preview = parse(await ownerAuth(event({ body: { passcode: "x" }, host: "deploy-preview-3--allin1-events.netlify.app" })));
  assert.equal(preview.status, 503);
  assert.equal(preview.body.error, "not_configured");
  assert.match(preview.body.message, /deploy preview #3, not production/);
  assert.match(preview.body.message, /Scopes must include Functions/);
  const branch = parse(await ownerAuth(event({ body: { passcode: "x" }, host: "claude-feature--allin1-events.netlify.app" })));
  assert.match(branch.body.message, /branch deploy, not production/);
  const prod = parse(await ownerAuth(event({ body: { passcode: "x" }, host: "allin1-events.netlify.app" })));
  assert.match(prod.body.message, /this is the production deploy/);
});

await test("a passcode under 8 characters is refused as weak, even when it matches", () => withEnv({ OWNER_PASSCODE: "1234567" }, async () => {
  const r = parse(await ownerAuth(event({ body: { passcode: "1234567" } })));
  assert.equal(r.status, 503);
  assert.equal(r.body.error, "weak_passcode");
}));

await test("GET is refused; bad JSON is 400", () => withEnv({ OWNER_PASSCODE: PASS }, async () => {
  assert.equal(parse(await ownerAuth(event({ method: "GET" }))).status, 405);
  assert.equal(parse(await ownerAuth(event({ body: "{" }))).status, 400);
}));

await test("the wrong passcode is 401 after a delay, with a message that gives nothing away", () => withEnv({ OWNER_PASSCODE: PASS }, async () => {
  const t0 = Date.now();
  const r = parse(await ownerAuth(event({ body: { passcode: PASS + "x" } })));
  assert.equal(r.status, 401);
  assert.equal(r.body.error, "wrong_passcode");
  assert.ok(Date.now() - t0 >= 650, "failure must be delayed");
  assert.ok(!r.body.message.includes(PASS));
  const empty = parse(await ownerAuth(event({ body: {} })));
  assert.equal(empty.status, 401);
}));

await test("the right passcode issues a token the data functions will accept", () => withEnv({ OWNER_PASSCODE: PASS }, async () => {
  const r = parse(await ownerAuth(event({ body: { passcode: PASS } })));
  assert.equal(r.status, 200);
  assert.ok(r.body.token && r.body.token.includes("."));
  assert.equal(r.body.expiresIn, session.SESSION_MS);
  assert.equal(r.headers["Cache-Control"], "no-store");
  assert.ok(!JSON.stringify(r.body).includes(PASS), "the passcode never travels back");
  assert.deepEqual(session.verifyToken(r.body.token, PASS), { ok: true });
  assert.equal(session.verifyToken(r.body.token, PASS + "changed").ok, false, "changing the passcode voids every session");
  assert.equal(session.verifyToken(r.body.token.slice(0, -2) + "zz", PASS).reason, "bad_signature");
  assert.equal(session.verifyToken("garbage", PASS).reason, "malformed");
  assert.equal(session.verifyToken(r.body.token, "").reason, "not_configured");
}));

await test("whitespace around the stored or typed passcode is forgiven", () => withEnv({ OWNER_PASSCODE: "  " + PASS + "\n" }, async () => {
  const r = parse(await ownerAuth(event({ body: { passcode: " " + PASS + " " } })));
  assert.equal(r.status, 200);
  assert.deepEqual(session.verifyToken(r.body.token, PASS), { ok: true },
    "the token must verify under the trimmed passcode the data functions normalise to");
}));

await test("tokenFromEvent reads either header", () => {
  assert.equal(session.tokenFromEvent({ headers: { authorization: "Bearer abc.def" } }), "abc.def");
  assert.equal(session.tokenFromEvent({ headers: { "x-owner-token": "abc.def" } }), "abc.def");
  assert.equal(session.tokenFromEvent({ headers: {} }), null);
});

await test("the 11th guess in a minute from one address is throttled", () => withEnv({ OWNER_PASSCODE: PASS }, async () => {
  const ip = nextIp();
  for (let i = 0; i < 10; i++) {
    assert.equal(parse(await ownerAuth(event({ ip, body: { passcode: PASS } }))).status, 200, `guess ${i + 1}`);
  }
  assert.equal(parse(await ownerAuth(event({ ip, body: { passcode: PASS } }))).status, 429);
}));

/* ======================================================================
   lead
   ====================================================================== */
group("lead  (the form → CRM bridge)");
const lead = fn("lead");
const INTAKE = { MERIDIAN_INTAKE_URL: "https://crm.example.test/functions/v1/intake" };
const realFetch = globalThis.fetch;
const crmCalls = [];
function mockCrm(reply) {
  globalThis.fetch = async (url, opts) => {
    crmCalls.push({ url, opts, body: JSON.parse(opts.body) });
    if (reply instanceof Error) throw reply;
    return { ok: reply.status < 400, status: reply.status, text: async () => reply.text };
  };
}
const okCrm = () => mockCrm({ status: 200, text: JSON.stringify({ ok: true }) });

try {
  await test("without MERIDIAN_INTAKE_URL: 503, and nothing is sent", async () => {
    crmCalls.length = 0; okCrm();
    const r = parse(await lead(event({ body: { email: "a@b.co" } })));
    assert.equal(r.status, 503);
    assert.equal(r.body.error, "not_configured");
    assert.equal(crmCalls.length, 0);
  });

  await test("GET is refused; bad JSON is 400", () => withEnv(INTAKE, async () => {
    assert.equal(parse(await lead(event({ method: "GET" }))).status, 405);
    assert.equal(parse(await lead(event({ body: "nope" }))).status, 400);
  }));

  await test("a filled honeypot gets a quiet 200 and never reaches the CRM", () => withEnv(INTAKE, async () => {
    crmCalls.length = 0; okCrm();
    const r = parse(await lead(event({ body: { email: "bot@spam.test", company_website: "http://spam" } })));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true, skipped: true });
    assert.equal(crmCalls.length, 0);
  }));

  await test("no way to reach the person, or an address that is not one: 400 with a human message", () => withEnv(INTAKE, async () => {
    crmCalls.length = 0; okCrm();
    const none = parse(await lead(event({ body: { name: "Only a name" } })));
    assert.equal(none.status, 400);
    assert.match(none.body.error, /email address/i);
    const bad = parse(await lead(event({ body: { email: "not-an-email" } })));
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /does not look right/);
    assert.equal(crmCalls.length, 0);
  }));

  await test("a good lead is forwarded cleaned, lowercased, with its source and consent", () => withEnv({ ...INTAKE, MERIDIAN_WEBHOOK_SECRET: "shh" }, async () => {
    crmCalls.length = 0; okCrm();
    const r = parse(await lead(event({ body: {
      name: "  Otis ", email: "  Otis@Example.COM ", message: "Order 1234 — hello", source: "420-friendly:contact",
      company_website: "", phone: "", extra: "ignored"
    } })));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true });
    assert.equal(crmCalls.length, 1);
    assert.equal(crmCalls[0].url, INTAKE.MERIDIAN_INTAKE_URL);
    assert.equal(crmCalls[0].opts.method, "POST");
    assert.equal(crmCalls[0].opts.headers["x-webhook-secret"], "shh");
    assert.ok(crmCalls[0].opts.signal, "the call carries an abort signal (timeout)");
    assert.deepEqual(crmCalls[0].body, {
      name: "Otis", email: "otis@example.com", phone: null, company: null,
      message: "Order 1234 — hello", source: "420-friendly:contact", consent_email: true
    });
  }));

  await test("a phone number alone is enough; source defaults to 'website'; consent can be withheld", () => withEnv(INTAKE, async () => {
    crmCalls.length = 0; okCrm();
    const r = parse(await lead(event({ body: { phone: "+1 555 0100", consent_email: false } })));
    assert.equal(r.status, 200);
    assert.equal(crmCalls[0].body.phone, "+1 555 0100");
    assert.equal(crmCalls[0].body.source, "website");
    assert.equal(crmCalls[0].body.consent_email, false);
    assert.equal(crmCalls[0].opts.headers["x-webhook-secret"], undefined);
  }));

  await test("over-long fields are cut at 2000 characters", () => withEnv(INTAKE, async () => {
    crmCalls.length = 0; okCrm();
    await lead(event({ body: { email: "a@b.co", message: "m".repeat(5000) } }));
    assert.equal(crmCalls[0].body.message.length, 2000);
  }));

  await test("the CRM saying no, or answering nonsense, is a 502 the page can show", () => withEnv(INTAKE, async () => {
    mockCrm({ status: 200, text: JSON.stringify({ ok: false, error: "duplicate" }) });
    let r = parse(await lead(event({ body: { email: "a@b.co" } })));
    assert.equal(r.status, 502); assert.equal(r.body.error, "intake_error"); assert.equal(r.body.message, "duplicate");
    mockCrm({ status: 500, text: "<html>Bad gateway</html>" });
    r = parse(await lead(event({ body: { email: "a@b.co" } })));
    assert.equal(r.status, 502); assert.equal(r.body.error, "bad_upstream"); assert.match(r.body.message, /500/);
    mockCrm({ status: 401, text: JSON.stringify({ error: "bad secret" }) });
    r = parse(await lead(event({ body: { email: "a@b.co" } })));
    assert.equal(r.status, 502); assert.equal(r.body.message, "bad secret");
  }));

  await test("an unreachable or hung CRM is reported, not swallowed", () => withEnv(INTAKE, async () => {
    mockCrm(Object.assign(new Error("getaddrinfo ENOTFOUND"), { name: "FetchError" }));
    let r = parse(await lead(event({ body: { email: "a@b.co" } })));
    assert.equal(r.status, 502); assert.equal(r.body.error, "unreachable");
    mockCrm(Object.assign(new Error("aborted"), { name: "AbortError" }));
    r = parse(await lead(event({ body: { email: "a@b.co" } })));
    assert.equal(r.status, 502); assert.equal(r.body.error, "timeout");
  }));

  await test("the 11th submission in a minute from one address is throttled", () => withEnv(INTAKE, async () => {
    okCrm();
    const ip = nextIp();
    for (let i = 0; i < 10; i++) assert.equal(parse(await lead(event({ ip, body: { email: "a@b.co" } }))).status, 200);
    assert.equal(parse(await lead(event({ ip, body: { email: "a@b.co" } }))).status, 429);
  }));
} finally {
  globalThis.fetch = realFetch;
}

/* ---------- report ---------- */
console.log(`\n${passes} passed, ${failures} failed\n`);
process.exit(failures ? 1 : 0);
