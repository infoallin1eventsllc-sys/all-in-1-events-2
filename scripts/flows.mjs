#!/usr/bin/env node
// The things a customer does, done in a real browser, with the result checked.
//
// smoke.mjs proves every page renders. This proves the pages *work*: a size
// has to be picked before a piece goes in the bag, the bag's count and totals
// follow what is in it, the free-shipping line flips at the threshold, pay
// talks to the function with no prices and carries one nonce across a retry,
// a paid return empties the bag, favorites save and clear, the shop filters,
// searches and sorts, and the two forms tell the truth about where a lead
// went. The functions themselves are stubbed at the network edge, so this
// runs anywhere with no Stripe and no CRM.
//
//   node scripts/flows.mjs
//
// External hosts are blocked, as in smoke.mjs — product photography and fonts
// are not what is under test, and a sandbox cannot reach them anyway.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const S = "/420-friendly/";

const CATALOG = new Function(
  fs.readFileSync(path.join(ROOT, "420-friendly/assets/products.js"), "utf8") + "\nreturn CATALOG;"
)();
const POLICY = new Function(
  fs.readFileSync(path.join(ROOT, "420-friendly/assets/policy.js"), "utf8") + "\nreturn POLICY;"
)();
const PAYMENTS = new Function(
  fs.readFileSync(path.join(ROOT, "420-friendly/assets/payments.js"), "utf8") + "\nreturn PAYMENTS;"
)();
const FREE = POLICY.freeShippingOver;
const FLAT = PAYMENTS.flatShipping;
const byPrice = [...CATALOG].sort((a, b) => a.price - b.price);
const cheap = byPrice[0];                         // under the free-shipping line
const dear = byPrice[byPrice.length - 1];         // over it on its own
const multiSize = CATALOG.find((p) => p.sizes.length > 1);
const money = (n) => "$" + Number(n).toFixed(2) + " USD";

/* ---------- static server and browser, as smoke.mjs ---------- */
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".ico": "image/x-icon", ".mp4": "video/mp4", ".woff2": "font/woff2",
};
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  let file = path.join(ROOT, urlPath);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404).end("not found"); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
function browserExe() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!fs.existsSync(base)) return undefined;
  const dir = fs.readdirSync(base).filter((d) => d.startsWith("chromium-")).sort().pop();
  const exe = dir && path.join(base, dir, "chrome-linux", "chrome");
  return exe && fs.existsSync(exe) ? exe : undefined;
}
await new Promise((r) => server.listen(0, r));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try { browser = await chromium.launch({ executablePath: browserExe() }); }
catch { browser = await chromium.launch(); }

/* ---------- harness ---------- */
let passes = 0, failures = 0;
const group = (t) => console.log(`\n${t}`);

// Each test gets a fresh page: clean storage, its own function stubs, its own
// error log. `mocks` maps a function name to a Playwright route handler; a
// function with no mock answers 404, which is what a static host does.
async function test(name, run, { width = 1280, height = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  const mocks = {};
  const calls = [];
  page.on("pageerror", (e) => errors.push("uncaught: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text());
  });
  await page.route((url) => !url.href.startsWith(origin), (route) => route.abort());
  await page.route("**/.netlify/functions/*", async (route) => {
    const fnName = new URL(route.request().url()).pathname.split("/").pop();
    const body = route.request().postData();
    calls.push({ fn: fnName, body: body ? JSON.parse(body) : null });
    const h = mocks[fnName];
    if (!h) return route.fulfill({ status: 404, body: "not found" });
    return h(route, calls.at(-1));
  });
  try {
    await run({ page, mocks, calls, errors });
    assert.deepEqual(errors, [], "page errors");
    passes++;
    console.log(`  ok    ${name}`);
  } catch (err) {
    failures++;
    const msg = String(err && err.message || err).split("\n").map((l) => "          " + l).join("\n");
    console.log(`  FAIL  ${name}\n${msg}`);
  } finally {
    await ctx.close();
  }
}

const go = (page, route) => page.goto(origin + S + route, { waitUntil: "domcontentloaded" });

// Storage is per origin, so land on a page first, then seed.
async function seed(page, { cart, favs } = {}) {
  await go(page, "cart.html");
  await page.evaluate(({ cart, favs }) => {
    localStorage.clear(); sessionStorage.clear();
    if (cart) localStorage.setItem(CART_KEY, JSON.stringify(cart));
    if (favs) localStorage.setItem(FAVS_KEY, JSON.stringify(favs));
  }, { cart, favs });
}
const storedCart = (page) => page.evaluate(() => JSON.parse(localStorage.getItem(CART_KEY) || "[]"));
const storedFavs = (page) => page.evaluate(() => JSON.parse(localStorage.getItem(FAVS_KEY) || "[]"));
const badge = (page) => page.evaluate(() => {
  const b = document.querySelector("[data-cart-count]");
  return b && { text: b.textContent.trim(), empty: b.dataset.empty };
});
const toastSeen = (page, text) =>
  page.locator(".toast", { hasText: text }).first().waitFor({ state: "visible", timeout: 4000 });
// A two-cell summary row: "<span>LABEL</span><span>value</span>".
const rowValue = (page, label) => page.evaluate((label) => {
  const span = [...document.querySelectorAll("span")]
    .find((s) => s.textContent.trim() === label && s.parentElement.children.length === 2);
  return span ? span.parentElement.children[1].textContent.trim() : null;
}, label);
const text = async (page, sel) => (await page.locator(sel).first().textContent()).trim();
const gridIds = (page) => page.evaluate(() =>
  [...document.querySelectorAll("#grid > *")].map((card) => {
    const sel = "a[href*='product.html?id=']";
    const a = card.matches(sel) ? card : card.querySelector(sel);
    return a ? new URL(a.href).searchParams.get("id") : null;
  }));
// Pages also ask a function for photo overrides on load, so look only at the
// calls made to the function under test.
const callsTo = (calls, fnName) => calls.filter((c) => c.fn === fnName);
const jsonOk = (data) => (route) => route.fulfill({
  status: 200, contentType: "application/json", body: JSON.stringify(data) });
const jsonErr = (status, data) => (route) => route.fulfill({
  status, contentType: "application/json", body: JSON.stringify(data) });

/* ======================================================================
   product page
   ====================================================================== */
group("product page");
const P = multiSize;

await test("nothing goes in the bag until a size is picked", async ({ page }) => {
  await seed(page);
  await go(page, `product.html?id=${P.id}`);
  await page.click("#add-to-bag");
  await toastSeen(page, "PICK A SIZE FIRST");
  assert.deepEqual(await storedCart(page), []);
  assert.deepEqual(await badge(page), { text: "0", empty: "true" });
});

await test("pick a size, add twice: one line, quantity 2, badge 2, toast names the piece", async ({ page }) => {
  await seed(page);
  await go(page, `product.html?id=${P.id}`);
  const size = P.sizes[1];
  await page.locator("#sizes button", { hasText: new RegExp(`^${size}$`) }).click();
  await page.click("#add-to-bag");
  await toastSeen(page, `${P.name.toUpperCase()} / ${size} — ADDED TO BAG`);
  assert.deepEqual(await storedCart(page), [{ id: P.id, size, qty: 1 }]);
  assert.deepEqual(await badge(page), { text: "1", empty: "false" });
  await page.click("#add-to-bag");
  assert.deepEqual(await storedCart(page), [{ id: P.id, size, qty: 2 }]);
  assert.equal((await badge(page)).text, "2");
});

await test("phone: the sticky bar shows the price and presses the same button", async ({ page }) => {
  await seed(page);
  await go(page, `product.html?id=${P.id}`);
  const bar = page.locator("#add-to-bag-mobile");
  await bar.waitFor({ state: "visible" });
  assert.match(await bar.textContent(), new RegExp(money(P.price).replace(/[$.]/g, "\\$&")));
  await bar.click();
  await toastSeen(page, "PICK A SIZE FIRST");
  await page.locator("#sizes button", { hasText: new RegExp(`^${P.sizes[0]}$`) }).click();
  await bar.click();
  assert.deepEqual(await storedCart(page), [{ id: P.id, size: P.sizes[0], qty: 1 }]);
}, { width: 390, height: 844 });

await test("desktop: the phone bar is not shown", async ({ page }) => {
  await seed(page);
  await go(page, `product.html?id=${P.id}`);
  await page.locator("#add-to-bag").waitFor();
  assert.equal(await page.locator("#add-to-bag-mobile").isVisible(), false);
});

await test("favorite toggles on and off and is remembered", async ({ page }) => {
  await seed(page);
  await go(page, `product.html?id=${P.id}`);
  await page.click("#fav-btn");
  await toastSeen(page, "SAVED TO FAVORITES");
  assert.equal(await text(page, "#fav-label"), "FAVORITED");
  assert.deepEqual(await storedFavs(page), [P.id]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#fav-label").waitFor();
  assert.equal(await text(page, "#fav-label"), "FAVORITED");
  await page.click("#fav-btn");
  await toastSeen(page, "REMOVED FROM FAVORITES");
  assert.equal(await text(page, "#fav-label"), "FAVORITE");
  assert.deepEqual(await storedFavs(page), []);
});

await test("title, description, share tags and structured data follow the product", async ({ page }) => {
  await go(page, `product.html?id=${P.id}`);
  await page.locator("#add-to-bag").waitFor();
  assert.equal(await page.title(), `420 FRIENDLY — ${P.name}`);
  const meta = await page.evaluate(() => ({
    desc: document.querySelector('meta[name="description"]').content,
    ogTitle: document.querySelector('meta[property="og:title"]').content,
    ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent)),
  }));
  assert.ok(meta.desc.startsWith(P.subtitle), "description leads with the subtitle");
  assert.equal(meta.ogTitle, `420 FRIENDLY — ${P.name}`);
  const product = meta.ld.flatMap((d) => d["@graph"] || [d]).find((n) => n["@type"] === "Product");
  assert.ok(product, "Product JSON-LD present");
  assert.equal(product.name, P.name);
  assert.equal(product.sku, P.id);
  assert.equal(product.offers.price, P.price);
  assert.equal(product.offers.priceCurrency, "USD");
  assert.equal(await text(page, "h1"), P.name);
});

await test("an id that is not in the catalogue says so and offers the shop", async ({ page }) => {
  await go(page, "product.html?id=midnight-windbreaker");
  await page.getByText("PIECE NOT FOUND").waitFor();
  assert.ok(await page.locator('a[href="shop.html"]').first().isVisible());
});

/* ======================================================================
   bag
   ====================================================================== */
group("bag");

await test(`over $${FREE}: free shipping applied, estimated total = subtotal`, async ({ page }) => {
  await seed(page, { cart: [{ id: dear.id, size: dear.sizes[0], qty: 1 }] });
  await go(page, "cart.html");
  await page.locator("#checkout").waitFor();
  assert.equal(await rowValue(page, "SUBTOTAL"), money(dear.price));
  assert.equal(await rowValue(page, "SHIPPING"), "FREE");
  assert.equal(await rowValue(page, "ESTIMATED TOTAL"), money(dear.price));
  await page.getByText("Free US shipping applied.").waitFor();
});

await test(`under $${FREE}: says how far from free shipping; + crosses the line; − to zero removes the line`, async ({ page }) => {
  await seed(page, { cart: [{ id: cheap.id, size: cheap.sizes[0], qty: 1 }] });
  await go(page, "cart.html");
  await page.locator("#checkout").waitFor();
  assert.equal(await rowValue(page, "SHIPPING"), "AT CHECKOUT");
  await page.getByText(`You're ${money(FREE - cheap.price)} from free US shipping.`).waitFor();

  const need = Math.ceil(FREE / cheap.price);
  for (let q = 2; q <= need; q++) {
    await page.click("button[data-action=inc]");
    assert.equal(await text(page, "button[data-action=inc] >> xpath=.. >> span"), String(q));
    assert.equal(await rowValue(page, "SUBTOTAL"), money(cheap.price * q));
  }
  assert.equal(await rowValue(page, "SHIPPING"), "FREE");
  assert.deepEqual(await storedCart(page), [{ id: cheap.id, size: cheap.sizes[0], qty: need }]);
  assert.equal((await badge(page)).text, need > 9 ? "9+" : String(need));

  for (let q = need; q >= 1; q--) await page.click("button[data-action=dec]");
  await page.getByText("YOUR BAG IS EMPTY").waitFor();
  assert.deepEqual(await storedCart(page), []);
  assert.deepEqual(await badge(page), { text: "0", empty: "true" });
});

await test("two lines: remove one, the other stays; CHECKOUT goes to the checkout page", async ({ page }) => {
  await seed(page, { cart: [
    { id: dear.id, size: dear.sizes[0], qty: 1 },
    { id: cheap.id, size: cheap.sizes[0], qty: 2 },
  ] });
  await go(page, "cart.html");
  await page.locator("#checkout").waitFor();
  assert.equal(await page.locator("button[data-action=remove]").count(), 2);
  assert.equal(await rowValue(page, "SUBTOTAL"), money(dear.price + 2 * cheap.price));
  await page.locator("button[data-action=remove]").first().click();
  assert.equal(await page.locator("button[data-action=remove]").count(), 1);
  assert.deepEqual(await storedCart(page), [{ id: cheap.id, size: cheap.sizes[0], qty: 2 }]);
  await page.click("#checkout");
  await page.waitForURL(/checkout\.html$/);
});

/* ======================================================================
   checkout
   ====================================================================== */
group("checkout");

await test(`totals: flat $${FLAT} shipping under the line, free over it; "not connected" shown while keys are blank`, async ({ page }) => {
  await seed(page, { cart: [{ id: cheap.id, size: cheap.sizes[0], qty: 1 }] });
  await go(page, "checkout.html");
  await page.locator("#pay-stripe").waitFor();
  assert.equal(await rowValue(page, "SUBTOTAL"), money(cheap.price));
  assert.equal(await rowValue(page, "SHIPPING"), money(FLAT));
  assert.equal(await rowValue(page, "TOTAL"), money(cheap.price + FLAT));
  assert.match(await text(page, "#pay-stripe"), new RegExp("^PAY " + money(cheap.price + FLAT).replace(/[$.]/g, "\\$&")));
  await page.getByText("PAYMENTS NOT CONNECTED YET").waitFor();
  assert.ok(await page.locator("#pay-paypal-disabled").isVisible());

  await seed(page, { cart: [{ id: dear.id, size: dear.sizes[0], qty: 1 }] });
  await go(page, "checkout.html");
  await page.locator("#pay-stripe").waitFor();
  assert.equal(await rowValue(page, "SHIPPING"), "FREE");
  assert.equal(await rowValue(page, "TOTAL"), money(dear.price));
});

await test("pay: the function gets ids, sizes and quantities only, with a nonce; an error is shown and the button comes back", async ({ page, mocks, calls }) => {
  mocks["create-checkout-session"] = jsonErr(503, { error: "not_configured", message: "Stripe is not connected on this deploy" });
  await seed(page, { cart: [{ id: cheap.id, size: cheap.sizes[0], qty: 2 }] });
  await go(page, "checkout.html");
  const label = await text(page, "#pay-stripe");
  await page.click("#pay-stripe");
  await toastSeen(page, "STRIPE IS NOT CONNECTED ON THIS DEPLOY");
  const sent = callsTo(calls, "create-checkout-session");
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].body.cart, [{ id: cheap.id, size: cheap.sizes[0], qty: 2 }], "no prices leave the browser");
  assert.match(sent[0].body.nonce, /^[A-Za-z0-9-]{8,64}$/);
  await page.waitForFunction(() => !document.getElementById("pay-stripe").disabled);
  assert.equal(await text(page, "#pay-stripe"), label);
  assert.deepEqual(await storedCart(page), [{ id: cheap.id, size: cheap.sizes[0], qty: 2 }], "the bag survives a failed attempt");
});

await test("retry after a failure sends the same nonce; success redirects; the paid return empties the bag", async ({ page, mocks, calls }) => {
  mocks["create-checkout-session"] = jsonErr(502, { error: "stripe_error", message: "temporary" });
  await seed(page, { cart: [{ id: cheap.id, size: cheap.sizes[0], qty: 1 }] });
  await go(page, "checkout.html");
  await page.click("#pay-stripe");
  await toastSeen(page, "TEMPORARY");
  await page.waitForFunction(() => !document.getElementById("pay-stripe").disabled);

  mocks["create-checkout-session"] = jsonOk({ url: origin + S + "checkout.html?paid=1&session_id=cs_test_flow" });
  await page.click("#pay-stripe");
  await page.waitForURL(/paid=1/);
  const sent = callsTo(calls, "create-checkout-session");
  assert.equal(sent.length, 2);
  assert.equal(sent[1].body.nonce, sent[0].body.nonce, "one attempt, one nonce — Stripe dedupes on it");
  await page.getByText("Order confirmed").waitFor();
  await page.getByText(POLICY.dispatchDays).waitFor();
  assert.deepEqual(await storedCart(page), []);
  assert.deepEqual(await badge(page), { text: "0", empty: "true" });
  assert.ok(await page.locator('a[href="contact.html"]').first().isVisible(), "a way to reach a person");
});

await test("a changed bag gets a new nonce", async ({ page, mocks, calls }) => {
  mocks["create-checkout-session"] = jsonErr(502, { error: "stripe_error", message: "temporary" });
  await seed(page, { cart: [{ id: cheap.id, size: cheap.sizes[0], qty: 1 }] });
  await go(page, "checkout.html");
  await page.click("#pay-stripe");
  await toastSeen(page, "TEMPORARY");
  await page.evaluate(() => { const c = getCart(); c[0].qty = 2; saveCart(c); });
  await page.waitForFunction(() => !document.getElementById("pay-stripe").disabled);
  await page.click("#pay-stripe");
  await toastSeen(page, "TEMPORARY");
  const sent = callsTo(calls, "create-checkout-session");
  assert.equal(sent.length, 2);
  assert.notEqual(sent[1].body.nonce, sent[0].body.nonce);
});

await test("an empty bag at checkout says so", async ({ page }) => {
  await seed(page);
  await go(page, "checkout.html");
  await page.getByText("YOUR BAG IS EMPTY").waitFor();
  assert.equal(await page.locator("#pay-stripe").count(), 0);
});

/* ======================================================================
   favorites
   ====================================================================== */
group("favorites");

await test("saved pieces are listed, removable one by one, down to the empty state", async ({ page }) => {
  const [a, b] = CATALOG;
  await seed(page, { favs: [a.id, b.id] });
  await go(page, "favorites.html");
  await page.getByText("2 PIECES").waitFor();
  assert.equal(await page.locator("[data-remove]").count(), 2);
  await page.locator(`[data-remove="${a.id}"]`).click();
  await toastSeen(page, "REMOVED FROM FAVORITES");
  await page.getByText("1 PIECE", { exact: true }).waitFor();
  assert.deepEqual(await storedFavs(page), [b.id]);
  await page.locator(`[data-remove="${b.id}"]`).click();
  await page.getByText("NO FAVORITES YET").waitFor();
  assert.deepEqual(await storedFavs(page), []);
});

await test("a favorite whose product was retired is skipped, not a blank card", async ({ page }) => {
  await seed(page, { favs: ["vibrant-hoodie", CATALOG[0].id] });
  await go(page, "favorites.html");
  await page.getByText("1 PIECE", { exact: true }).waitFor();
  assert.equal(await page.locator("[data-remove]").count(), 1);
});

/* ======================================================================
   shop
   ====================================================================== */
group("shop");

await test(`shows all ${CATALOG.length} pieces, in catalogue order`, async ({ page }) => {
  await go(page, "shop.html");
  await page.getByText(`${CATALOG.length} PIECES`).waitFor();
  assert.deepEqual(await gridIds(page), CATALOG.map((p) => p.id));
  assert.equal(await page.locator("#no-results").isVisible(), false);
});

await test("?cat= filters and titles the page; an unknown category falls back to all", async ({ page }) => {
  const cat = CATALOG[0].category;
  const expect = CATALOG.filter((p) => p.category === cat).map((p) => p.id);
  await go(page, `shop.html?cat=${encodeURIComponent(cat)}`);
  await page.getByText(`${expect.length} PIECE${expect.length === 1 ? "" : "S"}`).waitFor();
  assert.deepEqual(await gridIds(page), expect);
  assert.equal(await text(page, "#plp-title"), cat);
  await go(page, "shop.html?cat=windbreakers");
  await page.getByText(`${CATALOG.length} PIECES`).waitFor();
});

await test("?q= searches name, subtitle, category and copy; no hits says so", async ({ page }) => {
  const q = cheap.name.split(" ").pop().toLowerCase();
  const expect = CATALOG.filter((p) =>
    (p.name + " " + p.subtitle + " " + p.category + " " + p.blurb).toLowerCase().includes(q)).map((p) => p.id);
  assert.ok(expect.length >= 1 && expect.length < CATALOG.length, `"${q}" should match some, not all`);
  await go(page, `shop.html?q=${encodeURIComponent(q)}`);
  await page.getByText(`${expect.length} PIECE${expect.length === 1 ? "" : "S"}`).waitFor();
  assert.deepEqual(await gridIds(page), expect);
  assert.equal(await text(page, "#plp-title"), `Results for "${q}"`);

  await go(page, "shop.html?q=zzqqxx");
  await page.getByText("0 PIECES").waitFor();
  assert.equal(await page.locator("#no-results").isVisible(), true);
  assert.deepEqual(await gridIds(page), []);
});

await test("sort by price both ways, ties keeping catalogue order", async ({ page }) => {
  await go(page, "shop.html");
  await page.getByText(`${CATALOG.length} PIECES`).waitFor();
  await page.selectOption("#sort", "price-asc");
  assert.deepEqual(await gridIds(page), [...CATALOG].sort((a, b) => a.price - b.price).map((p) => p.id));
  await page.selectOption("#sort", "price-desc");
  assert.deepEqual(await gridIds(page), [...CATALOG].sort((a, b) => b.price - a.price).map((p) => p.id));
  await page.selectOption("#sort", "featured");
  assert.deepEqual(await gridIds(page), CATALOG.map((p) => p.id));
});

await test("clicking a category pill changes the grid, the heading and the URL", async ({ page }) => {
  const cats = [...new Set(CATALOG.map((p) => p.category))];
  const cat = cats[cats.length - 1];
  const expect = CATALOG.filter((p) => p.category === cat).map((p) => p.id);
  await go(page, "shop.html");
  const heading = await text(page, "#plp-title");
  await page.locator(`#cat-pills [data-cat="${cat}"]`).click();
  assert.deepEqual(await gridIds(page), expect);
  assert.equal(await text(page, "#plp-title"), cat);
  assert.equal(new URL(page.url()).searchParams.get("cat"), cat);
  await page.locator('#cat-pills [data-cat="ALL"]').click();
  assert.equal(await text(page, "#plp-title"), heading);
  assert.equal(new URL(page.url()).searchParams.get("cat"), null);
  assert.deepEqual(await gridIds(page), CATALOG.map((p) => p.id));
}, { width: 390, height: 844 });

/* ======================================================================
   forms
   ====================================================================== */
group("forms");

await test("members: a delivered signup says so, clears the form, and sent what the CRM needs", async ({ page, mocks, calls }) => {
  mocks.lead = jsonOk({ ok: true });
  await go(page, "members.html");
  await page.fill("#portal-name", "Test Person");
  await page.fill("#portal-email", "test@example.com");
  await page.click("#portal-submit");
  await page.locator("#portal-status", { hasText: "YOU'RE ON THE LIST — WATCH YOUR INBOX" }).waitFor();
  const sent = callsTo(calls, "lead");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.email, "test@example.com");
  assert.equal(sent[0].body.name, "Test Person");
  assert.equal(sent[0].body.source, "420-friendly:members");
  assert.equal(sent[0].body.company_website, "");
  assert.equal(await page.inputValue("#portal-email"), "");
  await page.waitForFunction(() => !document.getElementById("portal-submit").disabled);
});

await test("members: with no lead function the address is kept here and the page says so", async ({ page }) => {
  await go(page, "members.html");
  await page.fill("#portal-email", "kept@example.com");
  await page.click("#portal-submit");
  await page.locator("#portal-status", { hasText: "SAVED HERE — LEAD SERVICE NOT DEPLOYED YET" }).waitFor();
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem(LOCAL_LEADS_KEY) || "[]"));
  assert.equal(pending.length, 1);
  assert.equal(pending[0].email, "kept@example.com");
  assert.equal(await page.inputValue("#portal-email"), "kept@example.com", "the field is not cleared on failure");
});

await test("members: a validation complaint from the function is shown verbatim", async ({ page, mocks }) => {
  mocks.lead = jsonErr(400, { ok: false, error: "That email address does not look right." });
  await go(page, "members.html");
  await page.fill("#portal-email", "x@y.z");
  await page.click("#portal-submit");
  await page.locator("#portal-status", { hasText: "THAT EMAIL ADDRESS DOES NOT LOOK RIGHT." }).waitFor();
});

await test("contact: delivered message folds the order number in, resets the form", async ({ page, mocks, calls }) => {
  mocks.lead = jsonOk({ ok: true });
  await go(page, "contact.html");
  await page.fill("#c-name", "Test Person");
  await page.fill("#c-email", "test@example.com");
  await page.fill("#c-order", "1234");
  await page.fill("#c-message", "Where is my hoodie?");
  await page.click("#c-submit");
  await page.locator("#c-status", { hasText: "THANKS — WE'VE GOT IT AND WILL REPLY BY EMAIL" }).waitFor();
  const sent = callsTo(calls, "lead");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.message, "Order 1234 — Where is my hoodie?");
  assert.equal(sent[0].body.source, "420-friendly:contact");
  assert.equal(await page.inputValue("#c-message"), "");
});

await test("contact: a failure keeps what was typed and says where it went", async ({ page, mocks }) => {
  mocks.lead = jsonErr(502, { ok: false, error: "unreachable", message: "Could not reach the CRM" });
  await go(page, "contact.html");
  await page.fill("#c-name", "Test Person");
  await page.fill("#c-email", "test@example.com");
  await page.fill("#c-message", "Still here?");
  await page.click("#c-submit");
  await page.locator("#c-status", { hasText: "SAVED HERE — THE CRM DID NOT ACCEPT IT YET" }).waitFor();
  assert.equal(await page.inputValue("#c-message"), "Still here?");
  await page.waitForFunction(() => !document.getElementById("c-submit").disabled);
});

/* ======================================================================
   drops, 404, stale copy
   ====================================================================== */
group("drops, 404, copy");

await test("drops: with no date set the panel says TBA, shows no timer and no NaN", async ({ page }) => {
  await go(page, "drops.html");
  await page.locator("#countdown").getByText("Date TBA").waitFor();
  const body = await page.evaluate(() => document.body.innerText);
  assert.ok(!/NaN/.test(body), "no NaN on the page");
  assert.ok(!/Drop is live/.test(body), "nothing is announced as live that was never scheduled");
  assert.ok(await page.locator('a[href="shop.html"]', { hasText: "SHOP THE ARCHIVE" }).isVisible());
});

await test("404: the search box lands on shop results", async ({ page }) => {
  await go(page, "404.html");
  await page.fill("#lost-search", "beanie");
  await page.press("#lost-search", "Enter");
  await page.waitForURL(/shop\.html\?q=beanie/);
  await page.locator("#plp-title").getByText('Results for "beanie"').waitFor();
});

const RETIRED = /VIBRANT SERIES|SMOKE SIGNAL|WINDBREAKER|TERPENE JOGGERS|SESH SOCKS|BLAZED BEANIE|HARVEST CAPSULE/i;
await test("no retired-collection copy on any customer page", async ({ page }) => {
  const pages = ["index.html", "shop.html", `product.html?id=${CATALOG[0].id}`, "cart.html", "checkout.html", "drops.html",
    "playlist.html", "favorites.html", "contact.html", "faq.html", "shipping.html", "sizing.html", "returns.html",
    "privacy.html", "terms.html", "members.html", "404.html"];
  const hits = [];
  for (const route of pages) {
    await go(page, route);
    await page.locator("#site-footer *").first().waitFor();
    const body = await page.evaluate(() => document.body.innerText);
    const m = body.match(RETIRED);
    if (m) hits.push(`${route}: "${m[0]}"`);
  }
  assert.deepEqual(hits, []);
});

/* ---------- report ---------- */
await browser.close();
server.close();
console.log(`\n${passes} passed, ${failures} failed\n`);
process.exit(failures ? 1 : 0);
