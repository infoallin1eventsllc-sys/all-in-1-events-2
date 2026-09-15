# Safety net

```
npm test          # both, ~25s
npm run test:refs # static only, instant
npm run test:smoke
```

Two scripts, no test framework, no config file. They exist to catch the
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

Each was verified by deliberately reintroducing the fault and confirming the
suite goes red — the blank product page, the sideways scroll, and a drifted
Tailwind build.

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
