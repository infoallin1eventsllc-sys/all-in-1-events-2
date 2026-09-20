# Safety net

```
npm test          # all three, ~40s
npm run test:refs # static only, instant
npm run test:smoke
npm run test:media
```

Three scripts, no test framework, no config file. They exist to catch the
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

**`smoke.mjs`** — loads all 24 pages in Chromium at 1280px and 390px,
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

Each was verified by deliberately reintroducing the fault and confirming the
suite goes red — the blank product page, the sideways scroll, a drifted
Tailwind build, an off-site film URL, and a Spotify iframe inlined into the
shop.

## What this does NOT cover

Say this out loud before trusting it. The net covers **pages**. It does not
cover **code that handles money or data**:

- The 8 Netlify Functions have no tests — including `create-checkout-session`.
- PayPal and Stripe are exercised only as far as the page rendering.
- Meridian's 6 Supabase Edge Functions, 5 migrations and the CLI are untested.
- `owner-auth` is untested; the smoke run only confirms the gate renders.
- There is no linter.

A green run means the storefront is not visibly broken. It does not mean a
checkout succeeds.

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

`smoke.mjs` prefers the browser already installed at `PLAYWRIGHT_BROWSERS_PATH`
(`/opt/pw-browsers` in the cloud sandbox, where the bundled version and the one
Playwright expects do not match) and falls back to Playwright's own download on
a normal machine. If it cannot find either, run `npx playwright install chromium`.
