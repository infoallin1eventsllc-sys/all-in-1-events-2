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
- **Elegance upgrade ("Maison" edition)** — softer black & white: warm ivory page, soft charcoal instead of pure black, light airy header, hairlines instead of boxes and shadows, lighter serif headlines, slower and gentler motion. Real photos are unchanged. System documented in `DESIGN.md`
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
- [ ] **Approve the overall design** (soft ivory & charcoal "Maison" edition, SF rebrand) via the preview link — greenlight to proceed
- [ ] Approve the **Inferno Dreams hero** image, or pick a different hero photo
- [ ] Approve **Figma** design and **Canva** flyer, or request changes

- [ ] **Approve the new homepage hero**: the 15-second black-and-white film "A new life candle experience" (with its piano music) now plays in the hero, in place of the earlier code-drawn candle on water. It starts silent (browser rule); visitors tap **Sound on** to hear the music.

### Promo video (new)
- [ ] **Approve the "Inferno Dreams speaks" TikTok/Reels video** (25s, 9:16, voiced by the candle). Editor/preview: https://www.clipkit.dev/public-editor?id=a990ef49-7bbb-425c-bea2-a289dfc0f463 (see `marketing/video/README.md`)
- [ ] Approve the voice (ElevenLabs "Sara – Smooth Ads") and the script, or request another voice
- [ ] FYI: the Inferno Dreams label reads **"SCENTED SOX CANDLE"** (likely meant "SOY"). Exotic Peach reads "SOY". Flag this for the next label print run

- [ ] **Approve the 15s monochrome product film** (match strike, then Exotic Peach, Brewed Elixir, Inferno Dreams, then the wordmark). Preview: https://www.clipkit.dev/public-editor?id=8ddbc285-b4cf-42a1-93ee-eb372fe2ec5d (see `marketing/film/README.md`)
- [ ] Confirm the three featured scents and the tagline ("A new life candle experience") for the film
- [ ] **Cinematic "Cut B" film** (orbits, speed ramps, smoke, flares): the shot prompts are ready in `marketing/film/ai-video-prompts.md`, but generating photoreal video needs credits on an AI video service (Higgsfield, Veo, Kling, Runway, ElevenLabs). Decide who pays, or generate the three clips on your own account and send them; assembly, sound and the logo card are done here at no cost

### Photos still needed (real product shots)
- [ ] **Logo as a vector (SVG/AI/PDF) or a transparent PNG at 2000px+** — the only file on hand is a 480px JPG, too soft for the film's 4K logo card and for print
- [ ] **For Him** (candle) — on placeholder
- [ ] **Vintage Bloom** (candle) — on placeholder
- [ ] **Stress Relief** (candle) — on placeholder
- [ ] Optional: **Cinnamon Manhattan** candle (only marketing graphics received so far — no clean product shot)
- [ ] Decide whether to use the **atmospheric/lifestyle shots** (rose-petal top-down, bowl candles,
  pour/packaging) somewhere — e.g., a gallery strip

### Details to confirm
- [ ] **Burn time**: the site says "50+ hours". Confirm for the 9 oz candle, or send the real figure
- [ ] **Social links**: send the Instagram, Facebook, TikTok and Pinterest URLs. The footer icons have no destination yet
- [ ] **Footer pages**: Wholesale, Candle Care, Shipping & Returns and FAQ were removed from the footer because those pages don't exist. They come back as soon as the content is supplied
- [ ] **Reviews and ratings**: the star ratings on the product cards were removed and the review section is now labelled as sample reviews, with name and city as fill-in slots. Send the first real reviews (name, city, a sentence or two) and the labels go away
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
