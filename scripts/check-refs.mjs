#!/usr/bin/env node
// Static reference check. No browser, no network — runs in well under a second.
//
// Catches the three ways this repo has actually broken before:
//   1. A link or image pointing at a file that isn't there (a rename, or the
//      file-moves that come with splitting the repo).
//   2. product.html?id=… naming a product that is no longer in the catalogue.
//      Swapping the catalogue once left four nav links, three homepage tiles
//      and a drops CTA pointing at a product that had been retired.
//   3. An external host used in the markup but missing from the CSP. The
//      browser then blocks it **silently** — no error, just a hole where the
//      image should be.
//   4. The checkout function's price list disagreeing with the shop. The
//      catalogue was replaced once and the function kept the old one: every
//      purchase failed with "Unknown product", and nothing on the page was red.
//
//   node scripts/check-refs.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".git", ".netlify", ".claude"]);

/* ---------- gather files ---------- */
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const ALL = walk(ROOT);
const HTML = ALL.filter((f) => f.endsWith(".html") && !f.endsWith(".artifact.html"));
const JS = ALL.filter((f) => /\.(js|mjs)$/.test(f) && !f.includes("/scripts/"));

/* ---------- the catalogue, evaluated rather than regexed ---------- */
let CATALOG = null;
let CATALOG_IDS = null;
const productsFile = path.join(ROOT, "420-friendly/assets/products.js");
if (fs.existsSync(productsFile)) {
  try {
    const src = fs.readFileSync(productsFile, "utf8");
    CATALOG = new Function(`${src}\nreturn CATALOG;`)();
    CATALOG_IDS = new Set(CATALOG.map((p) => p.id));
  } catch (err) {
    console.error(`! could not read the catalogue: ${err.message}`);
  }
}

// Evaluate a browser config file (policy.js, payments.js) and return one of
// its top-level constants. Returns null, with a note, if the file cannot run
// outside a browser — the check then skips rather than failing on itself.
function browserConst(relFile, name) {
  const file = path.join(ROOT, relFile);
  if (!fs.existsSync(file)) return null;
  try {
    return new Function(`${fs.readFileSync(file, "utf8")}\nreturn ${name};`)();
  } catch (err) {
    console.error(`! could not read ${name} from ${relFile}: ${err.message}`);
    return null;
  }
}

/* ---------- the CSP, parsed out of netlify.toml ---------- */
function readCSP() {
  const toml = path.join(ROOT, "netlify.toml");
  if (!fs.existsSync(toml)) return null;
  const m = fs.readFileSync(toml, "utf8").match(/Content-Security-Policy\s*=\s*"([^"]+)"/);
  if (!m) return null;
  const out = {};
  for (const part of m[1].split(";")) {
    const [name, ...vals] = part.trim().split(/\s+/);
    if (name) out[name] = vals;
  }
  return out;
}
const CSP = readCSP();

// Which CSP directive governs a given element. <link> is deliberately absent:
// it only means style-src when rel="stylesheet". A preconnect or dns-prefetch
// to fonts.gstatic.com loads nothing, and font files are governed by font-src.
const DIRECTIVE = {
  img: "img-src", script: "script-src",
  iframe: "frame-src", source: "media-src", video: "media-src", audio: "media-src",
};
const directiveFor = (tag, attrs) =>
  tag === "link"
    ? (/rel\s*=\s*["']?stylesheet/i.test(attrs) ? "style-src" : null)
    : DIRECTIVE[tag] || null;

function cspAllows(directive, url) {
  if (!CSP) return true;
  const list = CSP[directive] || CSP["default-src"] || [];
  let host;
  try { host = new URL(url).origin; } catch { return true; }
  return list.some((entry) => {
    if (entry === "*" || entry === "'self'") return false; // external host needs an explicit origin
    if (!entry.startsWith("http")) return false;
    if (entry.endsWith("/")) return url.startsWith(entry);
    return host === entry.replace(/\/$/, "") || url.startsWith(entry);
  });
}

/* ---------- walk the markup ---------- */
// Deliberate gaps. Each entry needs a reason — if it does not have one, it is
// a bug being hidden rather than a decision being recorded. Keep this short;
// a long allowlist means the net has stopped meaning anything.
const KNOWN = [
  {
    file: "marketing-system.html",
    match: /meridian-logo\.png/,
    why: "placeholder: the <img> has an onerror that swaps in an inline SVG monogram",
  },
];
const isKnown = (file, detail) =>
  KNOWN.some((k) => path.relative(ROOT, file) === k.file && k.match.test(detail));

const problems = [];
const seen = new Set();
const add = (file, kind, detail) => {
  if (isKnown(file, detail)) return;
  const rel = path.relative(ROOT, file);
  const key = `${rel}|${kind}|${detail}`;
  if (seen.has(key)) return;           // the same broken link twice on one page is one problem
  seen.add(key);
  problems.push({ file: rel, kind, detail });
};

const ATTR = /<(\w+)\b([^>]*?)\s(?:href|src|action)\s*=\s*["']([^"']+)["']/gi;
// A stub page redirects by <meta http-equiv="refresh">, not by href, so the
// URL that actually sends the visitor somewhere lives in content=".
const META_REFRESH = /<meta[^>]+http-equiv\s*=\s*["']refresh["'][^>]*content\s*=\s*["'][^"';]*;\s*url=([^"']+)["']/gi;

for (const file of HTML) {
  const html = fs.readFileSync(file, "utf8");
  const dir = path.dirname(file);
  const refs = [
    ...[...html.matchAll(ATTR)].map(([, t, a, u]) => [t.toLowerCase(), a, u]),
    ...[...html.matchAll(META_REFRESH)].map(([, u]) => ["a", "", u]),
  ];
  for (const [tag, attrs, rawUrl] of refs) {
    const url = rawUrl.trim();
    if (!url || /^(#|mailto:|tel:|data:|blob:|javascript:)/i.test(url)) continue;

    if (/^https?:\/\//i.test(url)) {
      const directive = directiveFor(tag, attrs);
      if (directive && !cspAllows(directive, url)) {
        add(file, "csp", `${directive} does not allow ${new URL(url).origin} (<${tag}>)`);
      }
      continue;
    }
    if (url.startsWith("//")) continue;

    // internal: resolve, ignoring query and hash
    const [pathPart, query = ""] = url.split(/[?#]/);
    if (pathPart) {
      const target = pathPart.startsWith("/")
        ? path.join(ROOT, pathPart)
        : path.resolve(dir, pathPart);
      const exists = fs.existsSync(target) ||
        (target.endsWith("/") && fs.existsSync(path.join(target, "index.html")));
      if (!exists) add(file, "missing", `${url}  ->  ${path.relative(ROOT, target)}`);
    }

    // product ids
    const id = new URLSearchParams(query).get("id");
    if (id && pathPart.includes("product.html") && CATALOG_IDS && !CATALOG_IDS.has(id)) {
      add(file, "product", `?id=${id} is not in the catalogue`);
    }
  }

  // The share image is an absolute URL (crawlers insist), so strip the host
  // and check the file is really there — a dead og:image is a blank card on
  // every share, with no error anywhere.
  const og = html.match(/<meta[^>]+property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i);
  if (og) {
    let p = og[1];
    try { p = new URL(p).pathname; } catch { /* already a path */ }
    if (p.startsWith("/") && !fs.existsSync(path.join(ROOT, p))) {
      add(file, "missing", `og:image ${og[1]}  ->  ${p}`);
    }
  }

  // Every page a search engine may list needs a description; the ones that
  // should not be listed say so. Anything else is a gap search fills with
  // whatever text it finds first.
  const noindex = /<meta[^>]+name\s*=\s*["']robots["'][^>]*noindex/i.test(html);
  const hasDesc = /<meta[^>]+name\s*=\s*["']description["']/i.test(html);
  if (!noindex && !hasDesc) add(file, "seo", "no meta description, and not marked noindex");
}

/* ---------- the checkout function sells the same catalogue ----------
   The shop shows products.js; the Netlify function prices from its own list,
   because the browser is untrusted and must not send prices. Two lists, so
   they drift: when the catalogue was replaced the function kept the eight
   retired products, and every purchase of the new line failed with "Unknown
   product" — a 200 everywhere a link checker looks. This reads both and
   fails on an id either side lacks, a price that disagrees, or a shipping
   rule that differs from what the policy and bag pages promise. */
const checkoutFile = path.join(ROOT, "netlify/functions/create-checkout-session.js");
if (CATALOG && fs.existsSync(checkoutFile)) {
  const src = fs.readFileSync(checkoutFile, "utf8");
  const m = src.match(/const CATALOG = (\{[\s\S]*?\n\});/);
  let server = null;
  try { server = m && new Function(`return ${m[1]};`)(); }
  catch (err) { console.error(`! could not read the checkout price list: ${err.message}`); }

  if (!server) {
    add(checkoutFile, "price", "could not find `const CATALOG = {…};` — the price check is switched off");
  } else {
    for (const p of CATALOG) {
      const s = server[p.id];
      if (!s) add(checkoutFile, "price", `${p.id} is in the shop but not in the checkout function — every purchase of it fails`);
      else if (s.cents !== Math.round(p.price * 100)) add(checkoutFile, "price", `${p.id}: the shop shows $${p.price}, checkout charges $${(s.cents / 100).toFixed(2)}`);
      else if (s.name !== p.name) add(checkoutFile, "price", `${p.id}: named "${p.name}" in the shop, "${s.name}" on the Stripe receipt`);
    }
    for (const id of Object.keys(server)) {
      if (!CATALOG_IDS.has(id)) add(checkoutFile, "price", `${id} is in the checkout function but no longer in the shop`);
    }
  }

  // Shipping: one rule, promised in four places. The function is authoritative.
  const free = Number((src.match(/FREE_SHIPPING_OVER_CENTS = (\d+)/) || [])[1]);
  const flat = Number((src.match(/FLAT_SHIPPING_CENTS = (\d+)/) || [])[1]);
  const policy = browserConst("420-friendly/assets/policy.js", "POLICY");
  const payments = browserConst("420-friendly/assets/payments.js", "PAYMENTS");
  const cartSrc = fs.readFileSync(path.join(ROOT, "420-friendly/cart.html"), "utf8");
  const cartFree = Number((cartSrc.match(/FREE_SHIP_AT = (\d+)/) || [])[1]);
  const promised = [
    ["420-friendly/assets/policy.js  POLICY.freeShippingOver", policy && policy.freeShippingOver],
    ["420-friendly/assets/payments.js  PAYMENTS.freeShippingOver", payments && payments.freeShippingOver],
    ["420-friendly/cart.html  FREE_SHIP_AT", cartFree],
  ];
  for (const [where, dollars] of promised) {
    if (typeof dollars === "number" && dollars * 100 !== free) {
      add(checkoutFile, "price", `free shipping from $${free / 100} here, but ${where} says $${dollars}`);
    }
  }
  if (payments && typeof payments.flatShipping === "number" && payments.flatShipping * 100 !== flat) {
    add(checkoutFile, "price", `flat shipping $${flat / 100} here, but PAYMENTS.flatShipping says $${payments.flatShipping}`);
  }
  if (policy && typeof policy.shipsTo === "string") {
    const countries = (src.match(/allowed_countries: \[([^\]]*)\]/) || [])[1] || "";
    const list = [...countries.matchAll(/"([A-Z]{2})"/g)].map((x) => x[1]);
    const usOnly = /^united states$/i.test(policy.shipsTo.trim()) || /^us$/i.test(policy.shipsTo.trim());
    if (usOnly && (list.length !== 1 || list[0] !== "US")) {
      add(checkoutFile, "price", `Stripe collects addresses for ${list.join(", ") || "nothing"}, but POLICY.shipsTo says "${policy.shipsTo}"`);
    }
  }
}

/* ---------- external asset hosts referenced from JS ---------- */
for (const file of JS) {
  const src = fs.readFileSync(file, "utf8");
  for (const [, url] of src.matchAll(/["'`](https?:\/\/[^"'`\s]+\.(?:jpg|jpeg|png|webp|gif|svg))/gi)) {
    if (!cspAllows("img-src", url)) {
      add(file, "csp", `img-src does not allow ${new URL(url).origin}`);
    }
  }
  for (const [, base] of src.matchAll(/=\s*["'](https?:\/\/[^"'\s]*\/)["']/g)) {
    if (/supabase|googleusercontent|cloudinary|amazonaws/i.test(base) && !cspAllows("img-src", base)) {
      add(file, "csp", `img-src does not allow ${new URL(base).origin} (asset base URL)`);
    }
  }
}

/* ---------- is the compiled Tailwind current? ----------
   Tailwind is compiled here, not CDN. Add a class, skip the rebuild, and it
   does nothing — silently, with no error anywhere. This rebuilds to a temp
   file and compares, which is the only way to know. */
import { execFileSync } from "node:child_process";
import os from "node:os";

const BUILDS = [
  { name: "420 Friendly", config: "420-friendly/tailwind.config.js",
    input: "420-friendly/assets/tailwind.src.css", output: "420-friendly/assets/tailwind.css" },
  { name: "All in 1 Events", config: "tailwind.events.config.js",
    input: "css/tailwind.src.css", output: "css/tailwind.css" },
];

if (!process.env.SKIP_TAILWIND_CHECK) {
  for (const b of BUILDS) {
    const built = path.join(ROOT, b.output);
    if (![b.config, b.input, b.output].every((f) => fs.existsSync(path.join(ROOT, f)))) continue;
    const tmp = path.join(os.tmpdir(), `tw-${path.basename(b.output)}-${process.pid}.css`);
    try {
      execFileSync("npx", ["-y", "tailwindcss@3.4.17", "-c", b.config,
        "-i", b.input, "-o", tmp, "--minify"], { cwd: ROOT, stdio: "pipe" });
      if (fs.readFileSync(tmp, "utf8") !== fs.readFileSync(built, "utf8")) {
        problems.push({
          file: b.output, kind: "tailwind",
          detail: `rebuilding changes this file — classes added since the last build do nothing. Run: npm run ${b.name.startsWith("420") ? "build:420" : "build:events"}`,
        });
      }
    } catch (err) {
      console.error(`  ! could not verify ${b.name} Tailwind build: ${String(err.message).split("\n")[0]}`);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
}

/* ---------- report ---------- */
const LABEL = {
  seo: "Indexable page with no description — search will improvise one",
  tailwind: "Stale Tailwind build — new classes silently do nothing",
  missing: "Broken reference — the file is not there",
  product: "Dead product id — nothing in the catalogue matches",
  price: "Checkout disagrees with the shop — purchases fail or charge the wrong amount",
  csp: "Blocked by CSP — the browser will drop this silently",
};

console.log(`\nchecked ${HTML.length} pages and ${JS.length} scripts` +
  (CATALOG_IDS ? ` against ${CATALOG_IDS.size} products` : "") + "\n");

if (!problems.length) {
  console.log("  no broken references\n");
  process.exit(0);
}
for (const kind of ["price", "tailwind", "missing", "product", "csp", "seo"]) {
  const group = problems.filter((p) => p.kind === kind);
  if (!group.length) continue;
  console.log(`  ${LABEL[kind]}  (${group.length})`);
  for (const p of group) console.log(`    ${p.file}\n      ${p.detail}`);
  console.log("");
}
console.log(`${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
process.exit(1);
