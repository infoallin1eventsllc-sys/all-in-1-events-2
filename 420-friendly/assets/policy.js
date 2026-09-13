/* 420 FRIENDLY — store policies and info pages.
 *
 * Every policy page reads from this one object, so a number appears in exactly
 * one place. Shipping thresholds were previously written into `product.html`
 * as prose; a customer reading "$100" on the product page and a different
 * figure on the shipping page is the kind of contradiction that produces a
 * chargeback, so both now come from here.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * VALUES MARKED `NEEDS_OTIS` ARE NOT REAL YET.
 *
 * They render as a visible "not set" notice rather than a plausible guess,
 * because a wrong returns address or an invented company name on a live
 * storefront is worse than an obviously incomplete one — one is a gap, the
 * other is a false promise a customer can act on.
 * ─────────────────────────────────────────────────────────────────────────
 */

const NEEDS_OTIS = null;

const POLICY = {
  /* ---- Identity. Needed on Terms and Privacy to say who the contract is
     with. A store with no legal entity named is not enforceable and, in most
     US states, not compliant. ---- */
  legalName: NEEDS_OTIS,          // e.g. "All In 1 Events LLC" or whoever trades as 420 Friendly
  contactEmail: NEEDS_OTIS,       // the address customers actually reach
  returnsAddress: NEEDS_OTIS,     // where a physical return is posted
  jurisdiction: NEEDS_OTIS,       // state whose law governs, e.g. "Texas"

  /* ---- Shipping. These figures were already stated on the product page and
     in the sample orders, so they are treated as the operative policy. ---- */
  freeShippingOver: 100,
  flatShipping: 8,
  dispatchDays: "1–2 business days",
  transitDays: "3–5 business days",
  shipsTo: "United States",
  internationalNote:
    "We do not ship outside the US yet. Join the list and we will say so when that changes.",

  /* ---- Returns. Also taken from the copy already live on product pages. ---- */
  returnWindowDays: 30,
  returnCondition: "unworn, unwashed, with tags attached",
  limitedDropRule: "size exchange only",
  refundDays: "5–10 business days after we receive it",
  whoPaysReturn: NEEDS_OTIS,      // "customer" or "us" — this changes the copy
};

/* Size guide. Real garment measurements cannot be invented: a customer who
 * orders to a made-up chest measurement returns the item, and the return is
 * our fault. Left null until Otis measures a piece from each run. */
const SIZE_CHART = {
  note: "Measurements are of the garment laid flat, in inches.",
  fit: "Cut oversized and boxy. True to size for that fit — size down for a closer one.",
  rows: NEEDS_OTIS,
  // Shape when filled in:
  // rows: [
  //   { size: "S",  chest: 21, length: 27, sleeve: 23 },
  //   { size: "M",  chest: 23, length: 28, sleeve: 24 },
  // ],
};

/* ---- Rendering helpers -------------------------------------------------- */

function policyMissing(label) {
  return (
    '<span class="inline-block rounded bg-error-container text-on-error-container ' +
    'px-2 py-0.5 font-label-caps text-label-caps">' +
    esc(label) + " NOT SET</span>"
  );
}

/** A configured value, or a visible marker that it is not configured. */
function pv(value, label) {
  return value === null || value === undefined || value === ""
    ? policyMissing(label)
    : esc(String(value));
}

function money0(n) {
  return "$" + Number(n).toFixed(0);
}

/* Standard page chrome for every policy page, so seven files stay thin and a
 * change to the layout happens once. */
function renderPolicyPage(opts) {
  const root = document.getElementById("policy-root");
  root.innerHTML =
    '<section class="pt-12 md:pt-16 pb-8 max-w-3xl">' +
    '<p class="font-label-caps text-label-caps text-tertiary mb-4">' + esc(opts.kicker) + "</p>" +
    '<h1 class="font-headline-xl-mobile text-headline-xl-mobile md:font-headline-xl ' +
    'md:text-headline-xl text-on-surface uppercase tracking-tighter">' + esc(opts.title) + "</h1>" +
    (opts.standfirst
      ? '<p class="font-body-lg text-body-lg text-on-surface-variant mt-5">' + opts.standfirst + "</p>"
      : "") +
    "</section>" +
    '<section class="policy-body max-w-3xl pb-16">' + opts.body + "</section>";

  // Any unset value shows a banner at the top, so an incomplete policy is
  // obvious to whoever is reviewing rather than only to a customer who reads
  // to the bottom.
  if (root.querySelector(".bg-error-container")) {
    const warn = document.createElement("div");
    warn.className =
      "max-w-3xl mb-8 rounded-xl border border-error/40 bg-error-container/40 px-5 py-4";
    warn.innerHTML =
      '<p class="font-label-caps text-label-caps text-on-error-container">THIS PAGE IS NOT FINISHED</p>' +
      '<p class="font-body-md text-body-md text-on-surface-variant mt-2">' +
      "Highlighted values are not set yet. Fill them in at " +
      '<span class="font-label-caps text-label-caps">420-friendly/assets/policy.js</span> ' +
      "before this store takes real orders.</p>";
    root.insertBefore(warn, root.firstChild);
  }
}

/** Section heading + prose, the only two shapes these pages need. */
function h(text) {
  return '<h2 class="font-headline-md text-headline-md text-on-surface uppercase tracking-tighter mt-10 mb-3">' +
    esc(text) + "</h2>";
}
function p(html) {
  return '<p class="font-body-lg text-body-lg text-on-surface-variant mb-4">' + html + "</p>";
}
function ul(items) {
  return '<ul class="font-body-lg text-body-lg text-on-surface-variant mb-4 flex flex-col gap-2">' +
    items.map((i) => '<li class="flex gap-3"><span class="text-tertiary">&bull;</span><span>' + i + "</span></li>").join("") +
    "</ul>";
}
