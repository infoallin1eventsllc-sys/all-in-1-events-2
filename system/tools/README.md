# Operator tools

## `site-audit.mjs` — which businesses are worth calling, and what to say

A scraped list of businesses is not a prospect list. What makes a call worth
making is knowing exactly what is wrong with that company's website, in words
the owner recognises. This loads each site the way their customers do — on a
phone — measures it, and writes a sentence per problem that you can say out
loud.

### Setup (once)

```bash
cd system/tools
npm install
npx playwright install chromium
```

### Run it

```bash
# a few sites by hand
npm run audit -- https://example-plumber.com https://example-dentist.com

# a list, one URL per line
npm run audit -- --file urls.txt

# straight from an Apify export (reads the `website` field)
npm run audit -- --file apify-google-maps.json --out prospects.json
```

Results come back worst-site-first, so the top of the list is where to start.

### What it measures

Ranked by how visible the problem is to that business's own customers, because
that is what makes an owner act — not what a developer finds untidy.

| Check | Why an owner cares |
|---|---|
| No HTTPS | Their browser shows visitors a "Not secure" warning |
| No mobile viewport | The site loads desktop-width on a phone |
| Sideways scrolling | Content runs off the edge of the screen |
| Slow load | Visitors leave after about three seconds |
| Stale copyright year | Reads as "this business may have closed" |
| Missing/placeholder title | It is what Google shows in the search result |
| No meta description | Google invents one, often from a menu |
| Tiny tap targets | Customers miss buttons and give up |
| No phone, email or contact link | A ready buyer has no way to reach them |
| Legacy build | Why it is hard to update and breaks on new phones |
| Broken images | Empty boxes where photos of the work should be |

### Bands

| Score | Band | Meaning |
|---|---|---|
| 45+ | **call first** | Several things their customers can see are wrong |
| 25–44 | worth a call | A real, specific problem to open with |
| 10–24 | minor issues | Probably not worth a cold approach |
| 0–9 | site is fine | Leave them alone; you would be selling nothing |

That last band matters. A tool that says everyone needs your help is a tool
that makes you sound like every other cold caller. This one is willing to say
a site is fine.

### Where Apify fits

Apify supplies the *list* — its Google Maps scraper returns businesses in an
area with name, phone, and website. This decides which of those to call and
why. The two are independent: a CSV, a chamber-of-commerce directory, or a
hand-typed list works just as well.

**Before any outbound sending:** use a separate domain, not
meridianinterface.com. A cold list can get a domain flagged as spam, and that
would break your real client email — quotes, invoices, project threads.

---

## build-site-preview.mjs — the clickable copy of the website

Inlines the website's build into one self-contained HTML file and publishes as
an artifact. Everything a viewer clicks works, because a shim answers the calls
that would otherwise go to Supabase — the artifact viewer's CSP allows no host
but Google Fonts, so without it the portal would sit on "loading" forever and a
booking would look broken, neither of which is true of the deployed site.

```
export SITE_DIST=/path/to/meridian-interface-website/dist
export PRICING=/tmp/pricing.json      # see below
export OUT=/tmp/meridian-site-preview.html
npm install                            # once per container
npm run preview
npm run diag:preview                   # proves the portal opens and renders
```

**PRICING is not committed, on purpose.** It is the studio's rate card, and the
root of this repository is a client site that auto-deploys. Fetch it fresh each
time from the `owner` function (`{"action":"catalogue"}` with an owner token).

**The preview shows configured state, not live readings.** System Health has no
database to read here, so it answers with what is actually true of the system —
mock mode, no key, Key Router not deployed, the real schedules — and zeros
where a live count would go. Do not put invented activity in that payload: a
panel that looks official is exactly where a made-up number does damage.

**Republish to the existing artifact URL**, never a new one, or the link Otis
has bookmarked goes stale while a second copy drifts:
`https://claude.ai/code/artifact/4ee1e978-b336-40b6-ba13-dadd73cf5f33`

## diag-site.mjs — 18 checks over the built site

Serves `dist/` locally and drives it headless: every view, the booking form,
each portal tab, plus the two measurements that catch what reading the source
cannot — icons painted as their own name (the subset font's cmap has no j, q,
x or z) and horizontal scroll at 390px.

```
npm run diag:site
```
