#!/usr/bin/env node
/**
 * Bench test: a whole site survey flown by the dashboard against the stand-in
 * autopilot, through the real network bridge. No aircraft, no radio.
 *
 *   npm run dev                                  # dashboard on http://127.0.0.1:5173/drone/ (or pass --url)
 *   node scripts/bench/survey-flight.mjs [--px4] [--url http://127.0.0.1:5173/drone/]
 *
 * Needs Python with pymavlink and websockets (hardware/companion-pi/requirements.txt)
 * and Playwright's Chromium (npx playwright install chromium, or PLAYWRIGHT=/path/to/playwright).
 *
 * It connects over the network link, places the demo venue around the aircraft
 * (bench-test site), checks the pre-flight list passes, uploads the geofence and
 * mission, holds Start, and follows the flight. The stand-in's battery failsafe
 * brings it home mid-survey; the test uploads the resume mission, holds Resume,
 * and waits for the survey to finish. It fails on any step that doesn't happen.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const px4 = args.includes('--px4');
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://127.0.0.1:5173/drone/';
const bridgeDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'hardware', 'companion-pi', 'bridge');
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');

const kids = [];
const run = (cmd, a) => { const p = spawn(cmd, a, { cwd: bridgeDir, stdio: ['ignore', 'pipe', 'pipe'] }); kids.push(p); return p; };
const cleanup = () => kids.forEach(k => { try { k.kill(); } catch { /* gone */ } });
process.on('exit', cleanup);
let vlog = [];
const fail = (msg) => { console.error(`FAIL: ${msg}`); console.error('autopilot said:\n  ' + vlog.filter(l => !/^MIS do/.test(l)).slice(-25).join('\n  ')); cleanup(); process.exit(1); };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// Ports: BENCH_WS_PORT / BENCH_UDP_PORT, so two benches can run side by side.
const wsPort = process.env.BENCH_WS_PORT ?? '8771', udpPort = process.env.BENCH_UDP_PORT ?? '14551';
run('python3', ['mavlink_ws.py', '--udp', `127.0.0.1:${udpPort}`, '--host', '127.0.0.1', '--port', wsPort, '--token', 'bench']);
await new Promise(r => setTimeout(r, 1500));
const vehicle = run('python3', ['fake_vehicle.py', '--to', `127.0.0.1:${udpPort}`, '--time', '8', ...(px4 ? ['--px4'] : [])]);
vehicle.stdout.on('data', d => vlog.push(...String(d).trim().split('\n')));

// Software WebGL so it also runs headless on a server.
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', e => fail(`page error: ${e.message}`));
await page.goto(`${url}?view=survey`, { waitUntil: 'networkidle' });
await page.click('#link-button');
await page.getByLabel('Bridge address').fill(`ws://127.0.0.1:${wsPort}/?token=bench`);
await page.getByRole('button', { name: 'Connect', exact: true }).click();
await page.getByRole('tab', { name: /Aircraft/ }).waitFor({ timeout: 15000 }).catch(() => fail('no live telemetry'));
await page.mouse.click(700, 950);
await page.getByRole('tab', { name: 'Site' }).click();
await page.getByRole('button', { name: 'Bench test here' }).click();
await page.getByRole('tab', { name: /Aircraft/ }).click();
await page.getByText('Ready', { exact: true }).waitFor({ timeout: 10000 }).catch(() => fail('pre-flight checklist not ready'));
log('checklist ready');

const holdOnce = async () => { const b = await page.locator('#sv-primary').boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(1500); await page.mouse.up(); };
// Press and hold Start; the button disables itself if a check drops mid-hold (on a busy machine a late
// heartbeat can), which cancels the press. Hold again until the autopilot is armed, up to three times.
const hold = async () => {
  const before = vlog.filter(l => /CMD arm True/.test(l)).length;
  for (let k = 0; k < 3; k++) {
    await holdOnce();
    for (let w = 0; w < 20; w++) { await page.waitForTimeout(500); if (vlog.filter(l => /CMD arm True/.test(l)).length > before) return; }
    log('start did not reach the autopilot; holding again');
  }
  fail('the aircraft never armed');
};
const status = async () => (await page.locator('#survey-dashboard').innerText()).split('\n').slice(0, 2).join(' | ');
await page.locator('#sv-primary').click();
await page.getByRole('button', { name: /Start survey/ }).waitFor({ timeout: 20000 }).catch(() => fail('upload did not finish'));
log('mission and fence on the aircraft'); await hold();

const seen = new Set(); let resumed = false;
for (let i = 0; i < 180; i++) {
  await page.waitForTimeout(2000);
  const st = await status();
  const m = st.match(/Live · ([^|]+)/); if (m && !seen.has(m[1].trim())) { seen.add(m[1].trim()); log(m[1].trim()); }
  if (/Start refused|did not arm/.test(await page.locator('#survey-dashboard').innerText())) fail('start refused');
  const resume = page.getByRole('button', { name: /Upload resume/ });
  if (!resumed && await resume.count() && await resume.isEnabled()) {
    await page.waitForTimeout(3000); await resume.click();
    await page.getByRole('button', { name: /Resume survey/ }).waitFor({ timeout: 20000 }).catch(() => fail('resume upload did not finish'));
    await hold(); resumed = true; log('resumed');
  }
  if (/Live · Capture complete/.test(st)) break;
  if (i === 179) fail('the survey did not finish in time');
}
await page.getByRole('tab', { name: /Coverage/ }).click(); await page.waitForTimeout(500);
const text = await page.locator('#survey-dashboard').innerText();
const photos = Number(text.match(/Photos\n~?([\d,]+)/)?.[1]?.replace(',', '') ?? 0);
const lines = text.match(/Lines flown\n(\d+) of (\d+)/);
// The status is sampled every 2 s and a short first line can fall between samples: the event log has every line.
await page.getByRole('tab', { name: 'Log' }).click(); await page.waitForTimeout(300);
const events = await page.locator('#survey-dashboard').innerText();
if (![...seen].some(s => /Capturing · line 1 of/.test(s)) && !/\nLine 1 of \d+\n/.test(events)) fail('never saw line 1 being captured');
if (!resumed) fail('the battery return did not offer a resume');
if (!lines || lines[1] !== lines[2]) fail(`lines flown: ${lines ? `${lines[1]} of ${lines[2]}` : 'not shown'}`);
if (photos < 300) fail(`only ${photos} photos reported`);
if (!vlog.some(l => /mission start accepted|PX4 armed in mission mode/.test(l))) fail('the autopilot never started the mission');
if (!vlog.some(l => /fence done/.test(l))) fail('no geofence reached the autopilot');
log(`PASS: ${photos} photos, ${lines ? `${lines[1]} of ${lines[2]} lines` : 'lines n/a'}, resumed after a battery return`);
await browser.close(); cleanup(); process.exit(0);
