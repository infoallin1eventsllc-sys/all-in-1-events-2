# To do — next session

Updated 2026-09-13. Branch `claude/420-friendly-hoodie-page-yl8ho9`, PR #3,
unmerged, everything pushed.

---

## Pick up here: the launch video is one decision from done

Otis picked **all six hats (11–16)** and asked which hoodies and bottoms carry
the 420 Friendly wordmark. Answer, checked by zooming into each garment rather
than guessed:

| Carries 420 FRIENDLY | Branded Emerald Triangle instead |
|---|---|
| 02 Navy Hoodie | 01 Black Hoodie ($148 flagship) |
| 05 Navy Sativa Joggers | 03 Heather Grey Hoodie |
| 06 Black Joggers | 04 Crimson Hoodie |
| 07 Grey Joggers | |
| 08 White Joggers | |

**Only one of four hoodies carries the wordmark.** That was news to him and he
has not answered yet.

Six hats + five branded pieces = **eleven**, which does not fit 13 seconds
(about a second each — too fast to read). The open question put to him:

1. Lengthen the video to 25–30s so eleven pieces get two seconds each, or
2. Keep 13s and cut down to five or six

Nothing should be built until he answers.

**Raylight project:** "420 FRIENDLY — Haze Snapback Launch"
`https://www.raylight.app/editor/e00560e1-b9dc-4879-8f88-964a0d81ad1c`

Three real shots (snapback → emblem → 420 FRIENDLY sting, 13.1s, Fey template),
plus a temporary shot at the end called **"420 FRIENDLY BRANDED"** that exists
only so Otis can see the five candidates. **Delete that shot** before any render.

Prices are deliberately NOT in the video — his instruction. They live on the
storefront.

---

## How to get files to and from Otis

This cost most of a session. What actually works:

- **Paste the Stitch HTML into chat.** This is how the whole sixteen-piece line
  arrived — names, prices, materials and every image URL in one message. Far
  better than file uploads, which kept failing.
- **Raylight fetches URLs server-side.** This container's network policy blocks
  `lh3.googleusercontent.com` and `supabase.co`, but Raylight's server does not,
  so `upload_media {url}` pulls images this container cannot reach.
- **Google Drive is connected and readable.** Best route for full-size files.
- **Stitch exports one `screen.png` per zip.** Six zips gave six images, three
  of them the same cap. Do not expect an archive of many.
- **Stitch itself is unreachable** — domain blocked by egress policy, and it is
  behind his Google login regardless.

---

## Only Otis can do these

### 1. Merge PR #3
`main` still has none of this. Storefront, Portal, policy pages, soundtrack,
the Archive catalog — all on the branch.

### 2. `OWNER_PASSCODE` in Netlify — **Scopes: All scopes**
The one thing locking the Owner Portal and the music upload. A Production-only
value is invisible to deploy previews, which is the failure he hit twice.
Tell me when it is set so a push can trigger the rebuild that picks it up.

### 3. Full-size product photography
The sixteen photos on the site are **512×512** and served from **Raylight's
asset storage**. Both facts are compromises:

- 512px is soft on a large product page (the one committed image,
  `haze-snapback.webp`, is 1024 and visibly sharper)
- It is someone else's server; if that Raylight project is deleted, they go

Re-export full size from Stitch → drop in Google Drive → they get committed to
`420-friendly/assets/products/` and served from his own domain. The art-tile
fallback sits under every photo meanwhile, so a dead URL shows artwork, not a
hole.

### 4. Decide what the brand is called on the garments
Three of four hoodies say **Emerald Triangle**, everything else says **420
Friendly**. Not a bug, but the storefront, the video and the labels should agree
on whether Emerald Triangle is a sub-line or a second brand.

### 5. Six policy values → `420-friendly/assets/policy.js`
Five pages still show "THIS PAGE IS NOT FINISHED". `contactEmail` is the urgent
one — five pages reference it and a customer with a problem cannot reach anyone.
Then `returnsAddress`, `legalName`, `jurisdiction`, `whoPaysReturn`,
`SIZE_CHART.rows`.

### 6. Stripe account
Business verification takes a day or two. **Check the cannabis policy first** —
apparel should be fine, but cannabis-themed branding gets accounts reviewed, and
a straight answer before there are orders beats one after.

### 7. Anthropic key → **Supabase**, not Netlify
Edge Functions → Secrets. Until then every marketing draft is placeholder text.
Set a spend limit the same day.

---

## Claude can do these

### 8. Stock tracking — highest build value
"Small runs, no restocks" breaks the moment two people buy the last hoodie and
one gets refunded. Damages the brand promise rather than merely being missing.

### 9. Retail order storage
The Portal reads **sample orders** — Marcus Webb and the rest are invented.
Real orders need a retail Stripe webhook writing to an orders table. Note
`pay-webhook` is invoice-shaped (Meridian clients via `owner_invoices`); retail
is `netlify/functions/create-checkout-session.js`. Pattern reusable, schema not.

### 10. Split 420 Friendly into its own repo — agreed, after PR #3 merges
420 Friendly owns 6 of 8 functions; `lead` is the only shared one; one
cross-link. This repo holds three businesses and is named after one of them.

### 11. Recover three uncommitted functions
`owner`, `analyze`, `cardspike` are deployed with no source in the repo, and
`analyze` runs on a cron.

### 12. Rate-limit the chat endpoint
Public by necessity; anyone who finds it can spend the Anthropic budget.

### 13. Port `photos.html` to server storage
Product photos live in one browser's IndexedDB — they never reach a server.

### 14. Clear 15 junk drafts + add a dedupe key
Placeholder text regenerated daily since Aug 24. Deletion is irreversible, so
confirm first.

---

## Known and accepted

- **Playlist** unconfigured by design — paste a share link into `playlist.js`.
- **Soundtrack** shows nothing until audio is uploaded through the Portal.
- **Marketing drafts are mock** until the Anthropic key is set.
- **`preview.html` is a snapshot** of the storefront, not a second site. It
  still shows the OLD eight-product catalog — regenerate or delete it.

## Traps that have each cost a session

1. **Run `npm run build:420` from the repo root after any Tailwind class
   change.** An uncompiled class does nothing, silently.
2. **A terminal running `npm start` cannot accept commands.** `Cmd+T` for a tab.
3. **Netlify env vars default to Production scope** — deploy previews cannot see
   them. Always choose *All scopes*.
4. **Rendering images to look at them is not the same as Otis seeing them.**
   `render_stills` output lands in the transcript, not his screen. To show him
   something, put it on his Raylight canvas or publish an artifact.
5. **Widening a catalog means re-pointing everything that referenced it.**
   Replacing the eight products broke four nav links, three homepage tiles and a
   drops CTA, and dropping `getProduct()` blanked every product page.
