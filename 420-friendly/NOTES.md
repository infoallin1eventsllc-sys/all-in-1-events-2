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
- `assets/logo.webp` — the 3D brand emblem, used in the header and footer. Cut
  from the 1024px Stitch render: the dark studio background was removed with a
  flood fill that used the mark's green edge-glow as the boundary, then resized
  to 261x300 and saved as WebP with alpha (~21KB). `favicon.ico` and
  `apple-touch-icon.png` come from the same cutout, padded onto the brand black
  so the mark stays square and centred rather than letterboxed.

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

## Open decisions

1. ~~The logo is a reproduction.~~ **Resolved** — the 3D emblem is in place,
   background removed, with matching favicons.
2. **Header legibility.** At 56px the badge's own lettering is too small to
   read. Options: leave as-is; pair the badge with a "420 FRIENDLY" wordmark
   beside it (recommended); or make the header taller.
3. **Gold vs green.** The 3D emblem is charcoal and green, which sits close to
   the site's electric green accent (`#00e639`) — that half now matches. The
   odd one out is the gold (`#e9c349`) on the pill CTAs and active nav, chosen
   back when the logo was the gold badge. Options: keep gold as a deliberate
   contrast accent; move CTAs to the logo's green; or keep gold only for
   small highlights.

Front page layout is settled — Otis likes it. Leave it alone unless asked.
