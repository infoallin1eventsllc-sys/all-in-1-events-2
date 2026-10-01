# Safety net

```
npm test               # refs, functions, smoke, flows, media — a few minutes
npm run test:refs      # static only, instant
npm run test:functions # the Netlify functions, no network, ~5s
npm run test:smoke
npm run test:flows
npm run test:media
npm run test:a11y      # not in `npm test`: ~2 min, run before a launch
```

Six scripts, no test framework, no config file. They exist to catch the
specific ways this repo has actually broken — not to chase coverage.

## What each one is for

**`check-refs.mjs`** — static, sub-second, no browser.

- Every internal `href` / `src` / `action` and every `<meta refresh>` target
  resolves to a file that exists.
- Every `product.html?id=…` names a product still in the catalogue. The ids are
  read by *evaluating* `products.js` and reading `CATALOG`, not by regex, so
  renaming a field will not silently disable the check.
- Every external host in the markup is allowed by the CSP in `netlify.toml`.
- Both compiled Tailwind files are current — it rebuilds each to a temp file
  and compares. Set `SKIP_TAILWIND_CHECK=1` to skip (it needs `npx`).
- The checkout function sells what the shop shows. `create-checkout-session.js`
  carries its own price list because the browser must not send prices; this
  evaluates both and fails on an id either side lacks, a price or name that
  disagrees, a free-shipping threshold or flat rate that differs from
  `policy.js`, `payments.js` or the bag page, and a Stripe country list that
  does not match `POLICY.shipsTo`. The catalogue was replaced once and the
  function kept the eight retired products: every purchase of the new line
  failed with "Unknown product", and no page was red.

**`functions.mjs`** — the Netlify functions, called directly, no network.

- `create-checkout-session`: every catalogue product prices at the shop's
  figure under its name; retired ids, bad quantities, prices sent by the
  browser, nonsense nonces are refused or ignored; shipping flips at the
  threshold; US-only address collection; the nonce becomes a Stripe
  idempotency key; a Stripe error returns Stripe's own message; the throttle
  trips on the 16th call. The `stripe` package is replaced in the require
  cache with a recorder.
- `owner-auth` + `owner-session`: missing / short / wrong / right passcode;
  the error names the deploy context (preview, branch, production); tokens
  verify, fail under a changed passcode, and survive whitespace in the
  variable; the throttle trips on the 11th guess.
- `lead`: honeypot, validation, cleaning and lowercasing, the secret header,
  and every upstream failure shape (rejected, non-JSON, unreachable, timed
  out) as the 502 the page knows how to show. `fetch` is stubbed.
- `throttle`: limit, per-address and per-function isolation, window expiry,
  header fallbacks. `health`: booleans only.

**`flows.mjs`** — what a customer does, in Chromium, with the functions
stubbed at the network edge.

- Product: no size, no bag; add twice makes one line at quantity 2 with the
  badge to match; the phone bar presses the same button; favorite toggles and
  survives a reload; title, description, og: tags and Product JSON-LD follow
  the product; an unknown id gets the not-found state.
- Bag: free shipping at and above the threshold, the "$X from free shipping"
  line below it, `+` crossing the line, `−` to zero removing the line, remove
  on one of two lines, CHECKOUT navigating.
- Checkout: flat vs free shipping in the totals, "not connected" while keys
  are blank, the function receives ids/sizes/quantities and a nonce but no
  prices, an error is shown and the button restored, the same nonce is sent
  on a retry and a new one after the bag changes, a paid return empties the
  bag and shows the confirmation.
- Favorites, shop (count, `?cat=`, `?q=`, no-results, sort both ways, pill
  click updating grid, heading and URL), both forms (delivered / undeployed /
  rejected, with what was sent), the drops page's undated state, the 404
  search box, and a sweep for retired-collection copy on every customer page.

**`media.mjs`** — the playlist and film wiring, which fails invisibly.

- No request reaches Spotify, Apple, YouTube or their CDNs on page load.
  The players are drawn as our own facades and the real iframe is built on
  click; a page that loads one unasked looks *identical* and tracks every
  visitor who never pressed play. Only a request log sees the difference.
- The film is fetched on the click, not before.
- The link parsers in `media-links.js` reject lookalike hosts
  (`open.spotify.com.evil.tld`), `javascript:`, plain http, quote break-outs
  and wrong-length ids, and rebuild each URL from the captured id rather than
  echoing input. Every value there is hand-pasted into an `href` or an iframe
  `src`, so they are a security boundary.
- The YouTube embed uses `youtube-nocookie.com` while the new-tab link uses
  the real host — each is wrong in the other's place.
- The listen link carries `rel=noopener`; without it the new tab can navigate
  this one.
- With nothing configured the shop renders nothing, rather than an empty box.

**`a11y.mjs`** — axe-core over the seventeen customer-facing storefront
pages at both widths; WCAG A/AA plus best practice. Slow, so it is its own
command rather than part of `npm test`. Its first run found a strip of links
outside any landmark, a heading that jumped h1→h3, and a brand colour 0.13
short of AA contrast — none of which any other script can see.

**`smoke.mjs`** — loads all 26 pages in Chromium at 1280px and 390px,
including checkout and every owner-gated surface.

- No uncaught exceptions or console errors.
- No same-origin request failing.
- No horizontal scroll.
- The page renders real text rather than an empty shell.

## Why these checks and not others

Each one is a bug that already shipped here:

| Check | What it would have caught |
|---|---|
| Renders real text | Renaming one function left every product page blank — `getProduct is not defined`, HTTP 200 on the wire. A link checker sees nothing wrong. |
| Dead product ids | Swapping the catalogue left four nav links, three homepage tiles and a drops CTA pointing at a retired product. |
| Horizontal scroll | A `nowrap` word in the footer pushed every page 11px sideways on desktop only. |
| CSP hosts | A host missing from `img-src` blocks images with **no error at all** — just a hole where the photo should be. |
| Stale Tailwind | Tailwind is compiled, not CDN. A class added without a rebuild does nothing, silently. |
| Player loads unasked | Inlining a Spotify or YouTube iframe instead of a click-to-load facade tracks every visitor. The page looks the same, so nothing else catches it. |
| Checkout price drift | The catalogue was replaced; the function kept the retired products. Fifteen of sixteen pieces failed at Pay with "Unknown product", the sixteenth at the wrong price. Every page rendered. |
| Stale heading on filter | Clicking a category pill changed the grid and left the heading on the previous category, with the URL unchanged, so reload lost the filter. |

Each was verified by deliberately reintroducing the fault and confirming the
suite goes red — the blank product page, the sideways scroll, a drifted
Tailwind build, an off-site film URL, a Spotify iframe inlined into the
shop, and in the checkout function a wrong price, a missing product, a
retired product left in, Canada added back and a moved shipping threshold.

## What this does NOT cover

Say this out loud before trusting it:

- Stripe itself is a recorder here. A green run proves the function sends
  Stripe the right session; it does not prove the account is live, the
  methods are enabled or the webhook exists. The sandbox walk-through in
  PAYMENTS-SETUP.md is still the only proof of a real payment.
- PayPal is exercised only as far as the page rendering; its SDK loads only
  with a client id, which is blank.
- `chat`, `media`, `media-file`, `media-public` and `owner-orders` have no
  direct tests. The media functions sit on Netlify Blobs; the smoke run
  confirms the pages that call them degrade.
- Meridian's 6 Supabase Edge Functions, 5 migrations and the CLI are untested.
- There is no linter.

A green run means the storefront works end to end against a stand-in for the
payment and CRM services. It does not mean money has moved.

## Two deliberate blind spots

**Netlify functions.** `npm run dev` is a bare static server, so
`/.netlify/functions/*` returns 404 and the smoke test ignores those. The site
is built to degrade when the media feed is unavailable. To exercise the
functions for real, run `npm start` (`netlify dev`) instead.

**External hosts.** Product photography lives on Supabase and fonts on Google.
A sandbox or an offline laptop cannot reach either, so failed *external*
requests are ignored — otherwise the suite would be permanently red, which is
the same as having no net. CSP coverage for those hosts is `check-refs.mjs`'s
job instead, and that needs no network.

## Known gaps

`check-refs.mjs` carries a small `KNOWN` allowlist. Every entry must state why.
An entry without a reason is a bug being hidden rather than a decision being
recorded, and a long allowlist means the net has stopped meaning anything.

## Before splitting the repo

Run `npm test` before the split and again after. The split is a mass file move,
which is exactly when relative paths, the two Tailwind config paths, the
functions directory and the CSP host list break — quietly. A green run before
and a green run after is the cheapest proof the move did not cost anything.

## Chromium

`smoke.mjs`, `flows.mjs`, `media.mjs` and `a11y.mjs` prefer the browser already installed at `PLAYWRIGHT_BROWSERS_PATH`
(`/opt/pw-browsers` in the cloud sandbox, where the bundled version and the one
Playwright expects do not match) and falls back to Playwright's own download on
a normal machine. If it cannot find either, run `npx playwright install chromium`.
