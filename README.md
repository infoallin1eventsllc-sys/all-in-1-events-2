# Secrets of Cint — Promotional Website

A single-page marketing site for **Secrets of Cint**, a Black-owned San Francisco
candle house making hand-poured luxury soy candles and room sprays. It is a fast,
dependency-free static site (hand-written CSS, vanilla JavaScript, the brand's real
product photography) that deploys to Netlify or Vercel with no build step.

> *A new life candle experience. Hand-poured in small batches in San Francisco, CA.*

## What's inside

```
.
├── index.html                 # The whole site
├── assets/
│   ├── css/styles.css         # Design system and all styling (no framework)
│   ├── js/head.js             # Adds the .js class before paint (reveals stay visible without JS)
│   ├── js/hero-film.js        # Hero film: muted autoplay, Sound on/off, scent line follows the film
│   ├── js/main.js             # Products, filters, wishlist, cart, reviews, menu, newsletter
│   ├── js/portal.js           # Owner Photo Control (PIN-gated photo swaps + ZIP export)
│   ├── js/jszip.min.js        # ZIP export for the portal
│   ├── images/                # Product and brand photography
│   └── video/                 # Hero film (WebM, MP4, poster)
├── marketing/film/            # Film sources, shot lists and build scripts
├── DESIGN.md                  # Design system, decisions and every QA pass
├── CLIENT-APPROVAL-STATUS.md  # What is done and what waits on the client
├── netlify.toml / vercel.json # Deploy config and security headers
└── .github/workflows/         # "Fetch media into the repo" (pulls a render into the branch)
```

## The page

- **Header**: logo, section links, cart count, menu sheet on phones and tablets.
- **Hero**: the 15-second black-and-white film (match strike, Exotic Peach, Brewed
  Elixir, Inferno Dreams, logo). It plays muted; **Sound on** restarts it with sound.
  The "In the film" line lights the scent on screen and links to its card.
- **Collection**: 13 products (8 candles, 4 room sprays, 1 reed diffuser) with
  filters, wishlist hearts and Add to Cart.
- **Pop-up**: The Crossing, San Francisco.
- **Signature**: Moon Flower, with its notes and an Add to Cart button.
- **Our Story**: the house, plus a spec list (wax, fragrance, vessel, house).
- **Reviews**: labelled sample reviews with visible fill-in slots for name and city
  until real reviews arrive. No ratings are shown, because none have been collected.
- **Newsletter** and **footer** (contact details, social icons as slots until the
  profile links arrive, Owner Login).

## Design

Soft monochrome "Maison" edition: warm ivory, porcelain and charcoal, Cormorant
Garamond for display and Jost for text, hairlines instead of boxes, arched product
images. Full system, tokens and QA history in `DESIGN.md`. Everything meets WCAG AA
contrast, every control is at least 44 px, and motion respects `prefers-reduced-motion`.

## Run locally

```bash
npm run dev        # serves on http://localhost:8000
# or:
python3 -m http.server 8000
```

## Deploy

**Netlify**: connect the repo or drag the folder to [app.netlify.com/drop](https://app.netlify.com/drop).
No build (`publish = "."`).

**Vercel**: import the repo; `vercel.json` sets the config and headers.

Both configs send the same Content Security Policy (scripts from this site only, Google
Fonts for type) and make browsers revalidate assets, so a replaced photo or film shows
up for returning visitors immediately.

Before launch, set `og:image` in `index.html` to an absolute URL on the final domain;
link previews on social apps need the full address.

## Notes for the client

- Cart, wishlist and newsletter are front-end demos. Wire them to real commerce
  (Shopify, Snipcart, or similar) when you are ready to sell.
- Product names, prices and notes live in `assets/js/main.js` (`PRODUCTS`).
- **Owner Login** (footer) opens the photo portal. Swapped photos show instantly in your
  own browser; **Export ZIP** packages them for the developer to publish for everyone.
  The PIN is a soft gate in page code, not real security.

---

*Website by All in 1 Events LLC.*
