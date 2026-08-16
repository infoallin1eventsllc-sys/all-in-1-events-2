# Secrets of Cint — Promotional Website

A beautiful, professional single-page marketing site for **Secrets of Cint**, a
Harlem-poured luxury soy candle & room spray brand. Built as a fast, dependency-free
static site — hand-crafted CSS, vanilla JavaScript, real brand photography — ready to
deploy to Netlify or Vercel with a drag-and-drop.

> *A new life candle experience. Hand-poured in small batches in Harlem, NYC.*

## What's inside

```
.
├── index.html              # The full landing page
├── assets/
│   ├── css/styles.css      # Design system + all styling (no framework)
│   ├── js/main.js          # Product rendering, filters, cart, reveal animations
│   └── images/             # Optimized brand & product photography
├── netlify.toml            # Netlify config + security headers
├── vercel.json             # Vercel config + security headers
└── package.json
```

## Sections

- **Sticky glass header** with brand mark, nav, and live cart counter
- **Hero** — editorial split layout with featured product, live rating, trust badges
- **Trust marquee** — the brand's clean-craft promises, looping
- **The Collection** — all 8 signature scents in a filterable product grid
  (All / Candles / Room Sprays / Heritage), each with add-to-cart & wishlist
- **Signature spotlight** — the hero "Damn That Candle Smell Good" scent, on dark
- **Our Craft** — the Harlem small-batch story with four quality pillars
- **Reviews** — verified customer quotes
- **Newsletter** — email capture with client-side validation
- **Footer** — full navigation, social links, contact

## Design system

| Token        | Value                                    |
| ------------ | ---------------------------------------- |
| Base surface | `#f5f2ed` warm soy cream                 |
| Ink          | `#23201b`                                |
| Brand        | `#5a5a40` botanical olive                |
| Accents      | `#b8934e` gold · `#c66a3a` ember         |
| Display type | Cormorant Garamond (serif)               |
| Body type    | Jost (humanist sans)                     |

Mode: **Persuade** (marketing). Motion is purposeful (scroll reveals, hover lifts,
looping marquee) and respects `prefers-reduced-motion`.

## Design files (editable source)

The website theme is mirrored in two editable design tools for easy iteration and handoff:

- **Figma** — full landing-page frame (sage/cream system, arched product cards, all sections), built to match the live site 1:1:
  <https://www.figma.com/design/ZywyhvgLhvXvnmFXf1Yp77>
- **Canva** — an on-brand promotional flyer in the same theme, easy to edit text/images directly:
  <https://www.canva.com/d/75zJd3Hyw0oXf6p>

## Run locally

```bash
npm run dev        # serves on http://localhost:8000
# or:
python3 -m http.server 8000
```

## Deploy

**Netlify** — drag the project folder to [netlify.com/drop](https://app.netlify.com/drop),
or connect the Git repo. No build needed (`publish = "."`).

**Vercel** — import the repo at [vercel.com](https://vercel.com); the included
`vercel.json` handles config and headers.

## Notes for the client

- The cart, wishlist, and newsletter are front-end demos — wire them to a real backend
  (Shopify, Snipcart, or a headless commerce API) when you're ready to sell.
- All product copy, pricing, and photography are editable in `assets/js/main.js`
  (`PRODUCTS` array) and `assets/images/`.
- Images are pre-optimized for the web (progressive JPEG, ~1.7 MB total).

---

*Website by All in 1 Events LLC.*
