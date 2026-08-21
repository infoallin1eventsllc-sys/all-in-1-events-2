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
