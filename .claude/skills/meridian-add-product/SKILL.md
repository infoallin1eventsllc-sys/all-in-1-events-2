---
name: meridian-add-product
description: >-
  Put one of Otis's products on the Meridian Interface website — its picture in
  the portfolio tile and, when asked, the product itself hosted as a working
  demo behind "Open the working demo". Use whenever Otis sends a product bundle
  (a zip from AI Studio or elsewhere) and says what it is — "this is the
  promotional image for X", "host this", "put this on the site", "install the
  demo feature" — or asks why a tile shows the wrong picture, an empty panel, or
  an old image. Carries the traps that cost a day to rediscover: hotlinked
  images that go blank, Photo Control uploads that silently beat committed
  files, a stale local main, and a strip regex that once deleted every demo's
  root.
---

# Adding a product to the Meridian site

Two jobs, and Otis decides which one he is asking for. **Listen for scope.**

| He says | Do |
|---|---|
| "This is the promotional image for X", "put it in the photos", "hero shot" | **Picture only.** Cover + gallery on the tile. Do not build the app. |
| "Open the working demo", "host it", "install that feature" | **Picture and demo.** Everything below. |

He once got a full rebuild when he wanted a photo, and said so: *"This seems
like a lot to build just for a hero shot."* When in doubt, ask in one line —
never build first.

The website repo is `meridian-interface-website`. Vercel builds production from
`main`. Direct pushes to `main` are blocked: branch → PR → squash-merge via the
GitHub tools.

## 0. Before anything: fetch

```
git fetch origin && git checkout -B <branch> origin/main
```

The local `origin/main` ref goes stale the moment a PR is merged on GitHub.
A branch cut from a stale ref is missing the last merge, edits aimed at it
fail, and `set -e` inside a heredoc will **not** reliably stop the script.
Gate every step with an explicit `|| exit 1` and never commit until the
verifier has passed.

## 1. Read the bundle before touching it

```
find . -type f | grep -v node_modules            # what is actually in it
grep -rn "lh3.googleusercontent\|aida-public" src  # hotlinks: these WILL go blank
grep -rn "fonts.googleapis" index.html             # CDN type: self-host it
grep -rni "card number\|cvc\|cvv" src              # a card form on a public page
grep -rhoE "(Est\.|Since) ?[0-9]{4}" src           # dates that contradict his artwork
```

**Hotlinks are not optional to fix.** The AI Studio host is temporary. The
storefront was hosted with ten of them and every screenshot came out as empty
frames — that is why its tile had no gallery for a day. If the bundle ships
its images in `src/assets`, use those. If it does not, Adobe Stock search and
licensing work from here and apparel/product plates come back free-licensed;
generative image tools do not. Self-host fonts as latin subsets in
`public/fonts/` with **relative** `url(./f0.woff2)` — `public/` is copied
unprocessed, so an absolute `/fonts/` path 404s under `/demos/<slug>/`.

**A card form is the one thing to fix even in picture-only mode** if the demo
is already hosted. Replace the inputs with a fixed panel that says no payment
is taken. Nothing else in the copy gets touched unless he asks — but tell him
what is in there (organic, fair trade, awards, named vendors, a founding date)
because a client who ships it inherits those claims.

## 2. Picture: cover and gallery

- Files go in `public/images/portfolio/<slug>*.jpg`, ≤1600px wide, JPEG q84.
  A promotional composite is the cover; lifestyle frames are the gallery.
- If the bundle has no clean shots, photograph the built demo with Playwright
  at 1600×900 @1.5× (`scratchpad/shoot-storefront.mjs` is the pattern).
- Tile entry in `src/data/mockData.ts`: `title` carries the product's own
  name (`Fog City Roasters — Coffee Brand Identity`, `MODERN_STREET —
  Streetwear Storefront`); `image`; `gallery: [{src, caption}]`; `year:
  '2026'`; `demo: '/demos/<slug>/'` when hosted. Never leave `image: ''`.
- Remove the rendered placeholder it replaces from `public/images/work/`.
  Otis wants only real work on the site; unreferenced files are still in
  the bundle.

### The override trap

`resolveImage(id, fallback)` in `src/lib/imageStore.ts` returns a **Photo
Control upload first** and the committed file only when there is none. The
map is `settings.image_overrides` in Supabase (`glzodwhyavexpuusbqjy`).
A coffee image was once uploaded into the storefront's slot; the tile showed
coffee while the gallery showed clothing. **Whenever a tile shows something
other than what is committed, look here before the code.**

```sql
select k, v from settings, jsonb_each_text(value) t(k,v) where key='image_overrides';
update settings set value = value - 'p6' where key='image_overrides';  -- record the URL first
```

Clear the override for the tile you are updating; the upload stays in
storage. Do not clear others without asking — they are his uploads.

## 3. Demo: build, host, stamp

```
# in the product's own folder, tracked in the website repo (planner/, storefront/, fog-city/)
DEMO_BASE=/demos/<slug>/ npm run build
rm -rf ../public/demos/<slug> && cp -r dist ../public/demos/<slug>
cp ../public/brand/meridian-mark.png ../public/demos/<slug>/brand/
node ../tools/brand-demos.mjs        # add the slug to LABEL first
```

- `vite.config.ts`: `base: process.env.DEMO_BASE || '/'`. Vite rewrites
  URLs in HTML and CSS but **not string literals in JS** — resolve image
  paths in data files against `import.meta.env.BASE_URL`.
- **Commit the source.** Only built output was tracked for six demos and
  none could be rebuilt. Add the folder to the root `tsconfig.json`
  `exclude`, and list it in `public/demos/README.txt`.
- The Meridian bar (`tools/brand-demos.mjs`) is why demos keep their own
  names. It is re-stampable and refuses to write if stripping the old bar
  would remove `<div id="root">` — that guard exists because a looser regex
  once blanked all seven demos. Do not loosen the patterns. If the app pins
  its own header with `fixed top-0`, the bar's CSS already pushes it down.
- The in-app "Built by Meridian Interface" footer is
  `scratchpad/products/_BuiltByMeridian.tsx`; brand art must resolve
  against `BASE_URL`, not `/brand/`.

## 4. Verify — or it did not happen

Serve the built site locally and assert, with Playwright:

- every `<img>` has `complete && naturalWidth > 0`; **no** request leaves
  the origin (`data:` is fine)
- the demo mounts (`#root` > 500 chars), the bar is at `top === 0`, and no
  `.fixed.top-0, .sticky.top-0` element sits above 45px
- the tile's cover `src` is the committed file, given the override map the
  database **actually** holds (route `**/site-images*` to
  `{ok:true, overrides:{…}}` — that is the contract; a flat object is ignored)
- the lightbox counter reads `1 / N` for this tile's own gallery

Three assertions that were wrong before they were right: `querySelector`
for the modal image matched a grid tile behind it — scope to
`.fixed.inset-0.z-50`; `innerText` reflects `text-transform`, so "Est. 2013"
reads `EST. 2013` — match case-insensitively; a test that asserts `() =>
true` is worse than none.

## 5. Show him

Send the screenshots with `SendUserFile`. He is often looking at a **branch
preview URL** (`…-git-<branch>-….vercel.app`) that is frozen to a deleted
branch and will never show `main`; production is under Vercel → Domains.
Outbound web is blocked from the sandbox, so say plainly that the repo is
verified and the live site is not.

## State of the site (Sep 5)

Eight working demos: stack-planner, finsight, aurora, orchestra, meridian-crm,
analytics-hub, modern-street, fog-city. Still rendered rather than real: the
Logo Design service card and the Apparel Design & Brand Studio tile. Photo
Control overrides still winning on the live site: `p7` FinSight, `p10` Tech
Stack.
