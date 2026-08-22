/**
 * Paths come from the environment because none of these locations survive a
 * new session: the website checkout moves, and the scratchpad is deleted with
 * the container.
 *
 *   SITE_DIST   the website's built dist/            (default ../../../meridian-interface-website/dist)
 *   PRICING     a JSON dump of settings.pricing_catalogue
 *   OUT         where to write the preview HTML
 *
 * PRICING is deliberately not committed. It is the studio's rate card, and
 * this repository's root is a client site. Fetch it fresh instead:
 *   node system/cli.mjs catalogue > /tmp/pricing.json
 * or POST {"action":"catalogue"} to the owner function with an owner token.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.env.SITE_DIST || new URL('../../../meridian-interface-website/dist', import.meta.url).pathname;
const assets = join(dist, 'assets');
const files = readdirSync(assets);

let css = files.filter(f => f.endsWith('.css')).map(f => readFileSync(join(assets, f), 'utf8')).join('\n');
let js  = files.filter(f => f.endsWith('.js')).map(f => readFileSync(join(assets, f), 'utf8')).join('\n');

// Self-hosted fonts -> data URIs. The artifact CSP allows no host but Google
// Fonts, and these are not on it.
for (const font of readdirSync(join(dist, 'fonts'))) {
  const b64 = readFileSync(join(dist, 'fonts', font)).toString('base64');
  css = css.split(`/fonts/${font}`).join(`data:font/woff2;base64,${b64}`);
}
// The hero is referenced from the bundle by absolute path; the artifact has no
// origin to resolve that against, so embed it too.
const hero = readFileSync(join(dist, 'images', 'hero-earth.jpg')).toString('base64');
const heroUri = `data:image/jpeg;base64,${hero}`;

// The hero footage and its poster are referenced by absolute path too. The
// artifact has no origin to resolve those against, so they get embedded as
// well — this is why the published page is a few MB rather than one.
const media = {
  '/images/earth-poster.jpg': `data:image/jpeg;base64,${readFileSync(join(dist, 'images', 'earth-poster.jpg')).toString('base64')}`,
  '/video/earth-loop.webm':   `data:video/webm;base64,${readFileSync(join(dist, 'video', 'earth-loop.webm')).toString('base64')}`,
  '/video/earth-loop.mp4':    `data:video/mp4;base64,${readFileSync(join(dist, 'video', 'earth-loop.mp4')).toString('base64')}`,
};

if (/url\(\/(?!\/)/.test(css)) throw new Error('an absolute url() survived inlining');
js = js.split('/images/hero-earth.jpg').join(heroUri);
if (js.includes('/images/hero-earth.jpg')) throw new Error('hero reference survived inlining');
for (const [path, uri] of Object.entries(media)) {
  js = js.split(path).join(uri);
  if (js.includes(path)) throw new Error(`reference survived inlining: ${path}`);
}
if (js.includes('</script')) throw new Error('bundle contains </script');

// The artifact viewer's CSP allows no host but Google Fonts, so every call to
// Supabase is blocked. Without a stand-in the owner portal would sit forever on
// "loading" and a booking would look broken — neither of which is true of the
// deployed site. This shim answers those calls locally so every button in the
// preview does what it does in production.
const catalogue = JSON.parse(readFileSync(process.env.PRICING || '/tmp/pricing.json', 'utf8'));
catalogue.hourly_benchmarks = {
  freelancer: '$50 – $120 / hr', boutique: '$100 – $200 / hr', agency: '$200 – $350 / hr',
};

// System Health has no database to read in a preview, so it answers with the
// system's actual configured state — mock mode, no key, Key Router not
// deployed, the real schedules — and zeros everywhere a real count would go.
// Inventing activity here would make the preview read as a business record.
const previewHealth = {
  ok: true,
  generated_at: new Date().toISOString(),
  alerts: [],
  marketing: {
    mode: 'mock', key_configured: false, real_outputs: 0,
    autonomy: 'you approve', model: null,
    recent_runs: [], errors_24h: 0,
    tasks: {}, content: {}, messages: {}, performance: null,
  },
  schedules: [
    { job: 'marketing-analyze',      schedule: '30 12 * * *',   last_run: null, last_status: null, runs_24h: 0, failures_24h: 0 },
    { job: 'marketing-healthcheck',  schedule: '*/15 * * * *',  last_run: null, last_status: null, runs_24h: 0, failures_24h: 0 },
    { job: 'marketing-orchestrator', schedule: '0 13 * * *',    last_run: null, last_status: null, runs_24h: 0, failures_24h: 0 },
    { job: 'marketing-report',       schedule: '30 13 * * 1',   last_run: null, last_status: null, runs_24h: 0, failures_24h: 0 },
    { job: 'marketing-runner',       schedule: '*/2 * * * *',   last_run: null, last_status: null, runs_24h: 0, failures_24h: 0 },
  ],
  keyrouter: {
    state: 'not_deployed',
    detail: 'Key Router has not been deployed. Nothing is broken — marketing calls the AI directly.',
  },
};

const shim = `
(function () {
  // Some hosts refuse sessionStorage outright — the accessor throws rather than
  // returning null. The app treats that as "no session", so the pricing request
  // is never authorised and the portal opens to empty tabs. In the preview that
  // would read as a broken build rather than a blocked API, so give it an
  // in-memory store to fall back on. The deployed site now says plainly when
  // this happens instead of showing nothing.
  try { window.sessionStorage.setItem('__probe', '1'); window.sessionStorage.removeItem('__probe'); }
  catch (e) {
    var mem = {};
    var fake = {
      getItem: function (k) { return k in mem ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; },
      clear: function () { mem = {}; },
      key: function (i) { return Object.keys(mem)[i] || null; },
      get length() { return Object.keys(mem).length; },
    };
    try { Object.defineProperty(window, 'sessionStorage', { value: fake, configurable: true }); } catch (e2) {}
    try { Object.defineProperty(window, 'localStorage', { value: fake, configurable: true }); } catch (e2) {}
  }

  var invoices = [];
  var CAT = ${JSON.stringify(catalogue)};
  var HEALTH = ${JSON.stringify(previewHealth)};
  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('supabase.co') === -1) return realFetch(input, init);
    var body = {};
    try { body = JSON.parse((init && init.body) || '{}'); } catch (e) {}
    var reply = function (o) {
      return Promise.resolve(new Response(JSON.stringify(o), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }));
    };
    if (url.indexOf('/intake') !== -1) return reply({ ok: true, contact_id: 'preview' });
    switch (body.action) {
      case 'status':    return reply({ ok: true, configured: true });
      // Any passcode opens the preview. The real gate is a constant-time
      // comparison against a secret held server-side; there is no secret here
      // to compare against, and none is shipped.
      case 'login':     return reply({ ok: true, token: 'preview', expiresIn: 99999 });
      case 'catalogue': return reply({ ok: true, catalogue: CAT });
      case 'health':    return reply(HEALTH);
      case 'list':      return reply({ ok: true, invoices: invoices });
      case 'save':
        invoices = [body.invoice].concat(invoices.filter(function (i) { return i.id !== body.invoice.id; }));
        return reply({ ok: true, invoice: body.invoice });
      case 'delete':
        invoices = invoices.filter(function (i) { return i.id !== body.id; });
        return reply({ ok: true, deleted: body.id });
      default:          return reply({ ok: true });
    }
  };
})();
`;

const out = `<meta charset="utf-8" />
<title>Meridian Interface Site</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
${css}
/* The site commits to one light identity; paint it so the page holds its own
   ground whichever theme the artifact host is in. */
:root { color-scheme: light; }
html, body { background: #f8fafc; color: #0f172a; }
#root { min-height: 100vh; }
.preview-note {
  font: 500 12px/1.5 ui-sans-serif, system-ui, sans-serif;
  background: #fef3c7; color: #78350f;
  border-bottom: 1px solid #fcd34d;
  padding: 8px 16px; text-align: center;
}
.preview-note strong { font-weight: 700; }
</style>
<div class="preview-note">
  <strong>Preview</strong> — a working copy of the live site, running with a stand-in backend so
  every button works here. Bookings are not delivered and the passcode is not checked; the real
  site does both, and System Health here shows the system's configured state rather than live
  readings. Owner portal: footer → Studio login, any passcode.
</div>
<div id="root"></div>
<script>${shim}</script>
<script type="module">
${js}
</script>
`;

const target = process.env.OUT || '/tmp/meridian-site-preview.html';
writeFileSync(target, out);
console.log('wrote', target, (Buffer.byteLength(out) / 1024 / 1024).toFixed(2) + ' MB');
