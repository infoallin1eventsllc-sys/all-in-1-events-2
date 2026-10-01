# Launch audit — 1 Oct 2026

Four checklists Otis sent (the @yatesvids "paste this to Claude" series),
run against the 420 Friendly storefront. Eighty items. Each one is marked:

- **Done** — already true before this audit, verified.
- **Fixed** — changed in the audit commit. The file is named.
- **Otis** — needs a decision, an account, or information only he has.
- **N/A** — does not apply here, with the reason.

The storefront is static pages on Netlify plus eight serverless functions,
Stripe-hosted checkout, and a CRM in Supabase that is its own system. Several
of the items were written for an app with a database of its own; where that
is not this site, it says so rather than inventing a checkbox.

---

## 1 · "20 things to protect before your vibecoded website goes public"

| # | Item | Status | Where / why |
|---|---|---|---|
| 1 | Rate limiting | **Fixed** | `netlify/shared/throttle.js` on chat (20/min), lead (10/min), checkout (15/min), owner passcode (10/min), per address, with `Retry-After`. It is per function instance, so it stops a client in a loop, not a botnet. The hard ceiling is **Otis:** Netlify → Site configuration → Firewall → Traffic rules. |
| 2 | API limits | Done | `chat.js` caps tokens, message length and history; `create-checkout-session.js` caps quantity per line; `lead.js` caps field length. |
| 3 | Spending caps | **Otis** | Set a monthly limit on the Anthropic key at console.anthropic.com → Limits. Stripe receives money and needs none. Netlify's function and bandwidth limits are on the plan. |
| 4 | Error handling | Done + **Fixed** | Every function already returned a specific error; the provider-failure branches in `chat`, `lead` and `checkout` now also `console.error`, so Netlify's function log shows them. |
| 5 | Loading states | Done | SENDING… / JOINING… / STARTING SECURE CHECKOUT…, with the button disabled. |
| 6 | Empty states | Done | Empty bag, no search results, no playlist linked, no clips, media section hidden until something exists. |
| 7 | Failed requests | Done | A lead that cannot reach the CRM is kept in the browser and the page says which happened; checkout re-enables and names the error; the media feed degrades silently. |
| 8 | API timeouts | **Fixed** | `lead.js` aborts the CRM call at 8s; `chat.js` gives the Anthropic SDK a 25s timeout and one retry. Before this, a hung upstream held the function until the platform killed it. |
| 9 | Prevent duplicate subscriptions | Done / **Otis** | Button disabled while in flight; the local copy dedupes by email. Whether the CRM dedupes on its side is Meridian's intake function — check `system/` (see the `meridian-marketing` skill). |
| 10 | Prevent duplicate payments | **Fixed** | A per-attempt nonce from the browser (`payments.js`) becomes a Stripe idempotency key in `create-checkout-session.js`, so a retry after a dropped connection returns the same session. Stripe Checkout cannot be paid twice for one session; the Pay button is disabled in flight. |
| 11 | Optimise DB queries | N/A | The storefront has no database queries: the catalogue is a 16-item file, the media list is one key in Netlify Blobs. The CRM is Supabase and separate. |
| 12 | Add DB indexes | N/A | Same. Meridian's migrations under `system/` are where its indexes live. |
| 13 | Paginate large results | N/A | Sixteen products; media is bounded by the upload cap. |
| 14 | Compress files | Done | Netlify serves text brotli-compressed; product photography is on Supabase's CDN; video loads only on click. The 2–3 MB PNGs in `assets/social/` are for posting and are not served by any page. |
| 15 | Limit upload size | Done | `media.js` enforces `MAX_BYTES` per kind and answers 413 with the limit. |
| 16 | Cache repeat requests | **Fixed** | `netlify.toml`: a week of browser cache on video, product tiles, brand and social assets. HTML, CSS and JS stay revalidate-every-time on purpose — nothing is content-hashed, and a day-old `products.js` after a price change would be a real problem. |
| 17 | Uptime monitoring | **Fixed** + **Otis** | `netlify/functions/health.js` returns 200 and which integrations are configured (booleans). Point UptimeRobot (free) at `/.netlify/functions/health` and at the homepage. |
| 18 | Error logging | **Fixed** | See 4. Netlify → Functions → the function → Logs. |
| 19 | Test simultaneous users | **Otis** | Static pages come off Netlify's CDN and scale on their own; each function call is isolated. Not load-tested. Before a drop day, run a short k6 or `ab` burst against a deploy preview's shop and product pages. |
| 20 | Test backup restore | **Otis** | Orders live in Stripe (exportable from the dashboard). Leads live in Supabase: turn on daily backups / PITR for the project. Media lives in Netlify Blobs with no snapshot feature — keep the original files. Nothing here needs a restore drill until there is data worth losing; schedule one the week real orders start. |

## 2 · "20 things to tell Claude to add before launching"

| # | Item | Status | Where / why |
|---|---|---|---|
| 1 | Custom 404 page | **Fixed** | `/420-friendly/404.html` in the brand chrome for any missing shop path (`netlify.toml` rule), `/404.html` for the rest. Both in the smoke run. |
| 2 | CTA above the fold | Done | SHOP and NEXT DROP in the hero. |
| 3 | Internal links | Done | Nav, footer, FAQ cross-links; policy pages now have breadcrumbs. |
| 4 | Thank-you page | Done + **Fixed** | Order confirmation now says when it ships (from `policy.js`) and how to reach a person — and no longer tells the customer about the owner portal. Contact and list signups confirm inline. |
| 5 | Breadcrumbs | Done + **Fixed** | Shop and product had them; every policy page does now (`policy.js`). |
| 6 | Case studies | N/A | A clothing brand's case study is a lookbook; the film is on the homepage and every product page. |
| 7 | Five FAQs | Done + **Fixed** | Nine, plus FAQPage structured data built from the rendered questions. |
| 8 | Response-time promise | Done + **Fixed** | "One business day" was live on the contact page; it is now `POLICY.replyWithin` so it is a promise with one source. |
| 9 | Sticky mobile CTA | **Fixed** | Product page: an ADD TO BAG bar with the price sits above the bottom nav on phones. It presses the real button, so there is one code path. |
| 10 | robots.txt | **Fixed** | `/robots.txt`: everything allowed except owner tools, per-visitor pages and the stale preview. |
| 11 | Unique page titles | Done | Every page; product pages set theirs per product. |
| 12 | Meta descriptions | **Fixed** | Every indexable page (eleven were missing). Product pages set theirs per product. `check-refs` now fails on an indexable page without one. |
| 13 | Social share image | **Fixed** | `assets/og-image.jpg`, 1200×630 from the ad's own still — real product, not generated. Product pages share their own photo. |
| 14 | Maps + directions | N/A | No premises. Add when there is a pop-up or stockist. |
| 15 | Real reviews | **Otis** | None exist. Do not add placeholders (list 3 says remove fake ones). Ask for them in the post-purchase email once orders ship; a reviews block can be added when there are real ones to show. |
| 16 | Alt text on images | Done | Every image, static and generated; axe confirms. |
| 17 | Local schema | **Fixed** | Organization + WebSite with site search (`index.html`), Product + BreadcrumbList (`product.html`), FAQPage (`faq.html`). LocalBusiness is not used — no address. |
| 18 | Privacy policy page | Done + **Otis** | Exists; the legal name and contact email in `policy.js` are still unset and render as NOT SET. |
| 19 | Google Analytics | **Otis — decision** | The privacy page promises no analytics and no trackers, and that promise is why there is no cookie banner. GA breaks both. If numbers are wanted, Netlify Analytics is server-side with no cookies and keeps the promise. Not added. |
| 20 | Team photo | **Otis** | A real one. Not generated. |

## 3 · Legal and accessibility

| Item | Status | Where / why |
|---|---|---|
| Check colour contrast | **Fixed** | The gold `secondary` token was 4.37:1 at label size on the lightest container; AA needs 4.5. Now `#7f6204`, 4.96:1 and up everywhere it is used, not a visible change. |
| Alt text on images | Done | |
| Refund policy | Done + **Otis** | `returns.html`; who pays return postage is unset. |
| Privacy policy page | Done | |
| Fix accessibility | **Fixed** | axe-core over sixteen pages at two widths found three things: the utility links sat outside any landmark (now a `<nav>`), the shop grid went h1→h3 (an sr-only h2), and the contrast above. Clean after. `npm run test:a11y` re-runs it. |
| Remove fake reviews | Done | None on the site. The owner portal's sample orders are owner-only and labelled sample. |
| T&Cs page | Done + **Otis** | `terms.html`; legal name and governing state unset. |
| Check third-party embeds | Done | Spotify, Apple and YouTube load only on click (`npm run test:media` fails if that regresses). |
| Check copyright on images | Done | All product photography is Otis's own. The generated plates are in `_archive-generated/` and referenced by nothing. |
| Cookies policy | **Fixed** | A Cookies section on the privacy page: none of our own; what the browser keeps locally; the three things that can set one and when. |
| Check tracking | Done | None. |
| Form consent | Done | The list form states what joining does and how to leave; the contact form collects only what a reply needs. |
| Clear button labels | Done | |
| Check for cookie consent | N/A | No non-essential cookies, so nothing to consent to. The privacy page says so. |
| Add real business details | **Otis** | `420-friendly/assets/policy.js`: `legalName`, `contactEmail`, `returnsAddress`, `jurisdiction`, `whoPaysReturn`, and `SIZE_CHART.rows`. Every unset one shows a NOT SET badge to customers until it is filled. |
| Only collect necessary data | Done | Email and an optional name for the list; name, email, message and optional order number for contact. |
| Keyboard-friendly forms | Done | Labels on every field, visible focus, axe clean. |
| Check local laws | **Otis** | The site sells apparel and says plainly it sells no cannabis. Before going live, read Stripe's and PayPal's acceptable-use pages for cannabis-themed goods (already in TODO) — a processor shutting an account mid-drop is the real risk here. |

## 4 · "20 AI writing giveaways"

The site copy was searched for every phrase on the list and the usual
buzzwords beyond it (seamless, elevate, unlock, journey, crafted, robust,
curated, immerse, redefine, meticulous, testament…). One hit: "Free US
shipping unlocked." in the bag, now "applied". The product blurbs were read
individually — they are specific (weights, fabrics, placements), make no
expert claims, and their lists are real feature lists, not rhetorical
triples. Nothing else to change.

---

## What Otis does next, in order

1. **`policy.js`** — the six unset values. Nothing else on this page matters
   until a customer can see who they are buying from.
2. **Netlify → Firewall → Traffic rules** — rate limiting across instances.
3. **console.anthropic.com → Limits** — a monthly cap on the concierge key.
4. **UptimeRobot** on `/.netlify/functions/health` and the homepage.
5. **Supabase** — daily backups on the CRM project.
6. **Stripe / PayPal acceptable-use** for cannabis-themed apparel.
7. Decide on analytics (Netlify Analytics keeps the privacy promise; GA does not).
8. When a custom domain exists: one find-and-replace of
   `https://allin1-events.netlify.app` in `robots.txt`, `sitemap.xml` and the
   `og:` tags of each page head.
