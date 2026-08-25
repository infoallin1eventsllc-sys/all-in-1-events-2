# 420 Friendly — build notes

Static storefront preview for the 420 Friendly apparel brand. Lives alongside
the All in 1 Events site in this repo, under `420-friendly/`.

Branch: `claude/420-friendly-hoodie-page-yl8ho9` · PR #3
Deploy preview: https://deploy-preview-3--allin1-events.netlify.app/420-friendly/

## Pages

| File | Purpose |
|---|---|
| `index.html` | Home: hero, category tiles, Just Dropped rail, Portal editorial split |
| `shop.html` | Product listing: category rail/pills, sort, `?cat=` deep links |
| `product.html` | Product detail via `?id=`: gallery, sticky buy rail, accordions, related |
| `cart.html` | Bag: line items, quantity, subtotal, free-shipping meter |
| `drops.html` | Drop calendar with live countdown |
| `portal.html` | Members mailing-list signup |
| `favorites.html` | Saved pieces |

`/420-friendly-hoodie.html` at the repo root redirects to the hoodie's product
page, preserving the original URL.

## Assets

- `assets/app.js` — shared chrome (header, bottom nav, footer), cart, favorites,
  product cards, and the brand badge. All dynamic interpolation goes through
  `esc()`, matching this repo's XSS-safe convention.
- `assets/products.js` — the catalog. Eight products. Add `image` to a product
  and it replaces the typographic art tile automatically.
- `assets/styles.css` — hand-written styles (art tiles, ticker, toast, badges).
- `assets/tailwind.css` — **compiled output, do not edit by hand.**
- `assets/logo-lg.webp` — the emblem at 657x760 (~60KB), used only by the
  homepage hero, where it is large enough that its own lettering reads.
- `assets/logo.webp` — the 3D brand emblem, used in the header and footer. Cut
  from the light-environment Stitch render: the background is removed by flood
  filling inward from the image border, then a morphological close seals the
  thin notches where bright rim highlights touch the silhouette. 259x300 WebP
  with alpha (~21KB). `favicon.ico` and `apple-touch-icon.png` come from the
  same cutout, padded onto the page off-white to stay square.

## Building CSS

Tailwind is compiled to a static stylesheet, not loaded from the CDN:

```
npm run build:420
```

Run this after adding any new Tailwind class. Classes that only appear inside
JavaScript strings still get picked up (`tailwind.config.js` scans
`assets/*.js`), but a class that is *constructed* at runtime will not — those
belong in the config's `safelist`. Forgetting to rebuild has already caused one
bug: new height classes were missing, so the logo rendered at zero height.

## State of things

Working:
- Cart and favorites persist in `localStorage`, survive navigation, badge counts
  update across every page.
- Category filter, sort, deep links, 404 state for unknown product ids.
- Verified in headless Chromium: all pages load clean, cart math round-trips.

Not wired up (deliberate, and labeled as such in the UI):
- **Checkout** — needs Stripe, Shopify, or similar.
- **Portal signups** — stored in the browser only; needs a mailing-list provider.
- **Product photography** — only the Vibrant Series Hoodie has a real photo. The
  other seven render typographic art tiles as placeholders.

## Theme

The site runs a light "pearl" theme. The page background is generated in CSS,
not shipped as an image: three layered radial gradients (warm cream one side,
cool mint-grey the other) plus a fine grain from an inline SVG turbulence,
each on its own fixed pseudo-element. `background-attachment: fixed` is
deliberately avoided — it repaints badly on mobile Safari — and the layers carry
`pointer-events: none` so they never swallow clicks.

Colour rules that matter when extending it:

- Body copy is `on-surface` / `on-surface-variant`; `outline` is the lightest
  tone that still clears WCAG AA on the pearl background — do not lighten it.
- Product art tiles stay dark on purpose: they stand in for product photography
  and read as images against the light page. Their decorative words carry
  `aria-hidden="true"`, so screen readers and contrast tooling skip them.
- There is a contrast sweep in the scratch tooling; every text node on all seven
  pages passes AA. Re-run it after any palette change.

## Open decisions

1. ~~The logo is a reproduction.~~ **Resolved** — the 3D emblem is in place,
   background removed, with matching favicons.
2. ~~Header legibility.~~ **Resolved** — the header is now 80px, the emblem 64px,
   and it is paired with a real Montserrat wordmark. The emblem carries the name
   internally too, but that lettering is unreadable below roughly 100px, so the
   wordmark is what actually names the brand on screen.

   Two traps worth remembering here. The `.hero-emblem` float animation owns the
   `transform` property, so a Tailwind translate on the same element is silently
   overwritten — position a wrapper instead. And the hero's readability wash must
   sit *under* the emblem in DOM order, or it drains the mark to a ghost.
3. ~~Gold vs green.~~ **Resolved by the light theme** — CTAs are now charcoal
   (`#1d2320`) on pearl, matching the emblem; green (`#12752f`) carries status
   and accents; gold survives only as a deepened highlight (`#8a6a05`).

Front page layout is settled — Otis likes it. Leave it alone unless asked.
