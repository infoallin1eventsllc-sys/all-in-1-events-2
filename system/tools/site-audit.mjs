#!/usr/bin/env node
/**
 * Site audit — find the businesses whose websites are worth rebuilding, and
 * know what to say to them.
 *
 * A scraped list of businesses is not a prospect list. Everyone can buy a list.
 * What makes a call worth making is knowing precisely what is wrong with that
 * company's site, in words the owner recognises — "your site tells visitors
 * it's not secure" lands where "I do web design" does not.
 *
 * So this loads each site the way a customer would, on a phone, and measures.
 * Every finding carries a sentence written for the owner, not for a developer.
 *
 * It does not need Apify. Apify (or a CSV, or a hand-typed list) supplies the
 * URLs; this decides which of them to call first and why.
 *
 *   node site-audit.mjs https://one.com https://two.com
 *   node site-audit.mjs --file urls.txt --out report.json
 *   node site-audit.mjs --file apify-export.json          (reads .website fields)
 *
 * Findings are ranked by how visible the problem is to the business's own
 * customers, because that is what makes an owner act — not what a developer
 * finds untidy.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

/* ------------------------------------------------------------------ checks */
/**
 * Each check returns null when the site is fine, or a finding.
 *
 * `weight` is how much it moves the score. `owner` is the sentence for the
 * business owner — it must describe a consequence they care about, never a
 * technique. `severity` drives the ranking.
 */
const CHECKS = [
  {
    id: 'no_https',
    weight: 25,
    run: (d) => d.finalUrl.startsWith('http://') ? {
      severity: 'critical',
      owner: 'Their browser shows visitors a "Not secure" warning before the page even loads. Google also ranks insecure sites lower.',
      evidence: d.finalUrl,
    } : null,
  },
  {
    id: 'no_mobile_viewport',
    weight: 22,
    run: (d) => !d.hasViewportMeta ? {
      severity: 'critical',
      owner: 'On a phone the site loads at full desktop width, so everything is tiny and has to be pinched to read. More than half of visitors are on a phone.',
      evidence: 'no <meta name="viewport">',
    } : null,
  },
  {
    id: 'mobile_overflow',
    weight: 14,
    run: (d) => d.mobileOverflowPx > 8 ? {
      severity: 'high',
      owner: 'The page slides sideways on a phone — content runs off the edge of the screen and has to be dragged back.',
      evidence: `${d.mobileOverflowPx}px wider than the screen`,
    } : null,
  },
  {
    id: 'slow',
    weight: 16,
    run: (d) => d.loadMs > 4000 ? {
      severity: d.loadMs > 8000 ? 'critical' : 'high',
      owner: `The page takes ${(d.loadMs / 1000).toFixed(1)} seconds to load. Visitors start leaving after about three, and most never come back.`,
      evidence: `${d.loadMs}ms, ${Math.round(d.bytes / 1024)}kB transferred`,
    } : null,
  },
  {
    id: 'heavy',
    weight: 8,
    run: (d) => d.bytes > 5_000_000 ? {
      severity: 'medium',
      owner: `The page downloads ${(d.bytes / 1_000_000).toFixed(1)}MB every visit. On mobile data that is slow and costs the visitor money.`,
      evidence: `${Math.round(d.bytes / 1024)}kB`,
    } : null,
  },
  {
    id: 'stale_copyright',
    weight: 12,
    run: (d) => {
      if (!d.copyrightYear) return null;
      const age = new Date().getFullYear() - d.copyrightYear;
      return age >= 2 ? {
        severity: age >= 4 ? 'high' : 'medium',
        owner: `The footer still says ${d.copyrightYear}. A visitor reads that as "this business may not be running any more".`,
        evidence: `© ${d.copyrightYear}`,
      } : null;
    },
  },
  {
    id: 'no_title',
    weight: 15,
    run: (d) => (!d.title || d.title.trim().length < 5 || /^(untitled|home|index|new page|document)$/i.test(d.title.trim())) ? {
      severity: 'high',
      owner: `The browser tab and the Google result both show "${d.title || '(nothing)'}" instead of the business name. That is the first thing anyone searching sees.`,
      evidence: `<title>${d.title || ''}</title>`,
    } : null,
  },
  {
    id: 'no_meta_description',
    weight: 9,
    run: (d) => !d.metaDescription ? {
      severity: 'medium',
      owner: 'Google has no description to show under their listing, so it invents one from whatever text it finds first — often a menu.',
      evidence: 'no meta description',
    } : null,
  },
  {
    id: 'tiny_tap_targets',
    weight: 10,
    run: (d) => d.tinyTapTargets > 4 ? {
      severity: 'medium',
      owner: `${d.tinyTapTargets} links or buttons are too small to tap reliably on a phone — customers miss them and give up.`,
      evidence: `${d.tinyTapTargets} targets under 32px`,
    } : null,
  },
  {
    id: 'no_contact_path',
    weight: 18,
    run: (d) => !d.hasPhone && !d.hasEmail && !d.hasContactLink ? {
      severity: 'critical',
      owner: 'There is no phone number, email, or contact link anywhere on the homepage. A visitor ready to buy has no way to reach them.',
      evidence: 'no tel:, mailto:, or contact link',
    } : null,
  },
  {
    id: 'legacy_build',
    weight: 11,
    run: (d) => d.legacySignals.length ? {
      severity: 'medium',
      owner: 'The site is built on techniques that were retired years ago, which is why it is hard to update and breaks on newer phones.',
      evidence: d.legacySignals.join(', '),
    } : null,
  },
  {
    id: 'broken_images',
    weight: 10,
    run: (d) => d.brokenImages > 0 ? {
      severity: 'high',
      owner: `${d.brokenImages} image${d.brokenImages === 1 ? '' : 's'} fail to load — visitors see empty boxes where photos of the work should be.`,
      evidence: `${d.brokenImages} broken`,
    } : null,
  },
];

/* ------------------------------------------------------------------- audit */

async function auditOne(browser, rawUrl) {
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const ctx = await browser.newContext({
    // A phone, because that is how most of their customers arrive.
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();

  let bytes = 0;
  page.on('response', (r) => {
    const len = Number(r.headers()['content-length'] || 0);
    if (Number.isFinite(len)) bytes += len;
  });

  const started = Date.now();
  let reachable = true, failure = null;
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  } catch (err) {
    reachable = false;
    failure = err instanceof Error ? err.message.split('\n')[0] : String(err);
  }
  const loadMs = Date.now() - started;

  if (!reachable) {
    await ctx.close();
    return {
      url, reachable: false, failure,
      score: 100, band: 'unreachable',
      findings: [{
        id: 'unreachable', severity: 'critical',
        owner: 'The website did not load at all. If this is right, they are losing every customer who looks them up.',
        evidence: failure,
      }],
    };
  }

  await page.waitForTimeout(1200); // let late images settle

  const d = await page.evaluate(() => {
    const txt = document.body?.innerText || '';
    const years = [...txt.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[–-]\s*)?(\d{4})/gi)].map((m) => Number(m[1]));
    const html = document.documentElement.outerHTML;

    const legacy = [];
    if (/<table[^>]*>[\s\S]{0,4000}<table/i.test(html) && !/<main|<section|<article/i.test(html)) legacy.push('table-based layout');
    if (/document\.write\s*\(/.test(html)) legacy.push('document.write');
    if (/jquery[.-]1\.\d/i.test(html)) legacy.push('jQuery 1.x');
    if (/<font\b/i.test(html)) legacy.push('<font> tags');
    if (/\.swf\b/i.test(html)) legacy.push('Flash');
    if (/<marquee|<blink/i.test(html)) legacy.push('marquee/blink');

    let tiny = 0;
    for (const el of document.querySelectorAll('a[href], button')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.width < 32 || r.height < 32) tiny++;
    }

    let broken = 0;
    for (const img of document.querySelectorAll('img')) {
      if (img.complete && img.naturalWidth === 0) broken++;
    }

    const hrefs = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') || '');

    return {
      title: document.title || '',
      metaDescription: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      hasViewportMeta: !!document.querySelector('meta[name="viewport"]'),
      mobileOverflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      copyrightYear: years.length ? Math.max(...years) : null,
      tinyTapTargets: tiny,
      brokenImages: broken,
      legacySignals: legacy,
      hasPhone: hrefs.some((h) => h.startsWith('tel:')),
      hasEmail: hrefs.some((h) => h.startsWith('mailto:')),
      hasContactLink: hrefs.some((h) => /contact|enquir|inquir|quote|book/i.test(h)),
      textLength: txt.length,
    };
  });

  const finalUrl = page.url();
  await ctx.close();

  const data = { ...d, finalUrl, loadMs, bytes };
  const findings = [];
  let score = 0;
  for (const c of CHECKS) {
    const hit = c.run(data);
    if (hit) { findings.push({ id: c.id, ...hit }); score += c.weight; }
  }

  const rank = { critical: 0, high: 1, medium: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);

  return {
    url, finalUrl, reachable: true,
    loadMs, bytes,
    score: Math.min(100, score),
    band: score >= 45 ? 'call first' : score >= 25 ? 'worth a call' : score >= 10 ? 'minor issues' : 'site is fine',
    findings,
    measured: {
      title: d.title, hasViewportMeta: d.hasViewportMeta,
      copyrightYear: d.copyrightYear, tinyTapTargets: d.tinyTapTargets,
    },
  };
}

/* -------------------------------------------------------------------- cli */

function urlsFromFile(path) {
  const raw = readFileSync(path, 'utf8').trim();
  if (raw.startsWith('[') || raw.startsWith('{')) {
    const json = JSON.parse(raw);
    const rows = Array.isArray(json) ? json : (json.items ?? []);
    // Apify's Google Maps actor puts the site under `website`; accept the
    // obvious alternatives so a hand-made file works too.
    return rows.map((r) => r.website || r.url || r.site || r.domain).filter(Boolean);
  }
  return raw.split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
}

const argv = process.argv.slice(2);
const fileArg = argv.indexOf('--file');
const outArg = argv.indexOf('--out');
const outFile = outArg !== -1 ? argv[outArg + 1] : null;

// Exclude flags and their values BY INDEX. Comparing by value looked fine and
// was not: with no --out present, outArg is -1, so argv[outArg + 1] is argv[0]
// — and the first URL on the command line was silently dropped from every run.
const consumed = new Set();
if (fileArg !== -1) { consumed.add(fileArg); consumed.add(fileArg + 1); }
if (outArg !== -1) { consumed.add(outArg); consumed.add(outArg + 1); }
const urls = fileArg !== -1
  ? urlsFromFile(argv[fileArg + 1])
  : argv.filter((a, i) => !consumed.has(i) && !a.startsWith('--'));

if (!urls.length) {
  console.error('Usage: node site-audit.mjs <url...> | --file urls.txt|apify.json [--out report.json]');
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const results = [];
for (const u of urls) {
  process.stderr.write(`auditing ${u} … `);
  try {
    const r = await auditOne(browser, u);
    results.push(r);
    process.stderr.write(`${r.band} (${r.score})\n`);
  } catch (err) {
    process.stderr.write(`failed: ${err.message}\n`);
    results.push({ url: u, reachable: false, failure: err.message, score: 0, band: 'error', findings: [] });
  }
}
await browser.close();

results.sort((a, b) => b.score - a.score);

console.log('\n══ PROSPECTS, WORST SITE FIRST ══\n');
for (const r of results) {
  console.log(`${String(r.score).padStart(3)}  ${r.band.toUpperCase().padEnd(13)}  ${r.url}`);
  for (const f of r.findings) console.log(`       • [${f.severity}] ${f.owner}`);
  if (r.findings.length) console.log('');
}
const callable = results.filter((r) => r.score >= 25).length;
console.log(`${results.length} audited · ${callable} worth calling\n`);

if (outFile) {
  writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`Full report written to ${outFile}`);
}
