# Secrets of Cint — Project Status & Client Approval Checklist

_Last updated: 2026-08-17 · Branch: `claude/client-promo-website-5ct9i8` · Built by All in 1 Events LLC_

A living record of what's done and **everything waiting on the client** before launch.

## Quick links
- **Live preview (private):** https://claude.ai/code/artifact/0910620c-af54-4c83-8ece-b01a3ffd2ba3
  (share from the page's menu; also delivered as a single-file `Secrets-of-Cint-Preview.html`)
- **Pull request:** https://github.com/infoallin1eventsllc-sys/all-in-1-events-2/pull/1 _(open, not merged)_
- **Figma design:** https://www.figma.com/design/ZywyhvgLhvXvnmFXf1Yp77
- **Canva flyer:** https://www.canva.com/d/75zJd3Hyw0oXf6p
- **Owner Photo Portal:** footer **🔒 Owner Login** → PIN **1234** → 📸 Owner Photo Control

---

## ✅ Done
- White **& black minimalist** theme (per client), elegant serif (Cormorant + Jost), fully responsive
- **Full San Francisco rebrand** (Harlem framing removed; product names kept)
- Catalog matched to the **real store** (shop.app / secretsofcint.com): names, prices, scent notes
- **Real product photography** wired in for: Hero (Inferno Dreams), Signature spotlight (Moon Flower),
  Harlem Smock, Moon Flower, Inferno Dreams, Exotic Peach (candle), Brewed Elixir, Exotic Peach
  Room Spray, Amber Blush Room Spray, Stress Relief Room Spray, Moon Flower Room Spray, No.7 Citrus
  Grove diffuser
- Real business **contact details**: (415) 202-3147 · secretsofcintllc@outlook.com · secretsofcint.com ·
  San Francisco, CA · free shipping over $100 · pop-up at The Crossing
- **Owner Photo Control portal** — discreet, PIN-gated (1234), upload by file or image URL, live update,
  export ZIP to publish
- Editable **Figma** design + **Canva** promo flyer
- Committed & pushed; interactive preview published

---

## ⏳ Waiting on CLIENT (approval / decisions / assets)

### Approvals
- [ ] **Approve the overall design** (white/black, SF rebrand) via the preview link — greenlight to proceed
- [ ] Approve the **Inferno Dreams hero** image, or pick a different hero photo
- [ ] Approve **Figma** design and **Canva** flyer, or request changes

### Photos still needed (real product shots)
- [ ] **For Him** (candle) — on placeholder
- [ ] **Vintage Bloom** (candle) — on placeholder
- [ ] **Stress Relief** (candle) — on placeholder
- [ ] Optional: **Cinnamon Manhattan** candle (only marketing graphics received so far — no clean product shot)
- [ ] Decide whether to use the **atmospheric/lifestyle shots** (rose-petal top-down, bowl candles,
  pour/packaging) somewhere — e.g., a gallery strip

### Details to confirm
- [ ] **Prices** for every scent (confirmed Boho/others at $35, Harlem Smock $38 — please verify all)
- [ ] **Amber Blush** third scent note (label was partly cut off — currently "Vanilla · White Amber · Jasmine")
- [ ] Replace **placeholder customer reviews** with real ones before launch
- [ ] Confirm the **full product list** — anything missing or discontinued? (e.g., travel tins seen on the store)

### Decisions
- [ ] **Card crop:** fill the frame (current) vs. show the whole photo uncropped?
- [ ] **Where does this site live?** secretsofcint.com is currently a **Shopify store** — does this new
  site replace it, sit on a subdomain, or elsewhere? (Needed before deploy.)
- [ ] **Owner portal:** keep PIN `1234` or change it? Keep browser-local + export-to-publish, or upgrade to
  **auto-publishing** (free Supabase storage — one-time setup + deploy)?
- [ ] **Commerce:** cart / checkout / newsletter are front-end demos — wire to real commerce
  (Shopify / Snipcart) when ready to sell?
- [ ] **Deploy** to Netlify or Vercel once approved (and merge PR #1)

---

## 📌 Notes / known limitations
- Preview sandbox blocks **ZIP download** and **external image-URL** loading; both work on the deployed site.
  File-upload live preview works everywhere.
- Owner PIN is a **soft gate** (lives in page code), not bank-grade security. Uploads only affect the
  viewer's own browser until exported + published, so there's no risk to the live site for others.
- The `logo.jpg` (original brand mark) is in use; the earlier SC monogram SVG was removed per client.
