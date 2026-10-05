#!/usr/bin/env node
/**
 * Bench test: a hobby build on INAV, connected to the dashboard through the real network bridge.
 *
 *   npm run dev
 *   node scripts/bench/inav-link.mjs [--v2] [--url http://127.0.0.1:5173/drone/]
 *
 * The stand-in (hardware/companion-pi/bridge/fake_inav.py) speaks MAVLink 1 like INAV with
 * mavlink_version 1 (--v2 for 2), reports itself as MAV_AUTOPILOT_GENERIC, takes waypoint
 * uploads as MISSION_ITEM and go-to as DO_REPOSITION in MAV_FRAME_GLOBAL, and ignores
 * COMMAND_LONG. It flies in position hold, launched from the radio. The test checks the
 * dashboard: names it, shows what it can and can't do, keeps Disarm and Return home off, uploads the patrol as waypoints the stand-in stores, says the
 * pilot starts it from the radio, and flies a go-to it accepts. First without GCS NAV mode
 * (the go-to refusal must reach the screen), then with it.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const v2 = args.includes('--v2');
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://127.0.0.1:5173/drone/';
const bridgeDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'hardware', 'companion-pi', 'bridge');
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');

const kids = [];
const run = (cmd, a) => { const p = spawn(cmd, a, { cwd: bridgeDir, stdio: ['ignore', 'pipe', 'pipe'] }); kids.push(p); return p; };
const cleanup = () => kids.forEach(k => { try { k.kill(); } catch { /* gone */ } });
process.on('exit', cleanup);
let vlog = [];
const fail = (msg) => { console.error(`FAIL: ${msg}`); console.error('flight controller said:\n  ' + vlog.slice(-20).join('\n  ')); cleanup(); process.exit(1); };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const waitLog = async (re, ms, what) => { for (let t = 0; t < ms; t += 250) { if (vlog.some(l => re.test(l))) return; await new Promise(r => setTimeout(r, 250)); } fail(what); };

const wsPort = process.env.BENCH_WS_PORT ?? '8772', udpPort = process.env.BENCH_UDP_PORT ?? '14553';
run('python3', ['mavlink_ws.py', '--udp', `127.0.0.1:${udpPort}`, '--host', '127.0.0.1', '--port', wsPort, '--token', 'bench']);
await new Promise(r => setTimeout(r, 1500));
let fc = null;
const startFc = (gcsNav) => {
  if (fc) { fc.kill(); kids.splice(kids.indexOf(fc), 1); }
  // Flying in position hold, launched by the pilot from the radio (INAV arms only from there).
  fc = run('python3', ['fake_inav.py', '--to', `127.0.0.1:${udpPort}`, '--flying', ...(gcsNav ? ['--gcs-nav'] : []), ...(v2 ? ['--v2'] : [])]);
  fc.stdout.on('data', d => vlog.push(...String(d).trim().split('\n')));
  fc.stderr.on('data', d => vlog.push(...String(d).trim().split('\n')));
};
startFc(false);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', e => fail(`page error: ${e.message}`));
await page.goto(`${url}?view=patrol`, { waitUntil: 'networkidle' });
await page.click('#link-button');
await page.getByLabel('Bridge address').fill(`ws://127.0.0.1:${wsPort}/?token=bench`);
await page.getByRole('button', { name: 'Connect', exact: true }).click();

// Named, versioned and shown live.
await page.getByText(/MAVLink flight controller \(INAV, Betaflight or other\)/).waitFor({ timeout: 15000 }).catch(() => fail('the dashboard did not name the flight controller'));
await page.getByText(`MAVLink ${v2 ? 2 : 1}`, { exact: false }).first().waitFor({ timeout: 5000 }).catch(() => fail(`MAVLink ${v2 ? 2 : 1} not shown`));
log(`connected: INAV stand-in on MAVLink ${v2 ? 2 : 1}`);
// What it can do: the radio's commands stay off, with the reason.
// The popover re-renders with every telemetry update; a DOM click is not thrown off by that.
await page.getByRole('button', { name: /What this aircraft can do/ }).evaluate(b => b.click());
const pop = await page.locator('#link-button').locator('..').innerText();
for (const want of [/Live position, attitude, battery, GPS/, /from your radio: not over MAVLink/, /GCS NAV mode/, /waypoints and return-home only/, /needs ArduPilot or PX4/]) if (!want.test(pop)) fail(`capabilities list is missing ${want}`);
if (await page.getByRole('button', { name: 'Disarm', exact: true }).isEnabled()) fail('Disarm is offered to a flight controller that disarms from the radio');
if (await page.getByRole('button', { name: /Return to launch/ }).isEnabled()) fail('Return to launch is offered to a flight controller that takes it from the radio');
log('capabilities listed; Disarm and Return to launch held off');
await page.screenshot({ path: process.env.BENCH_SHOT ?? '/dev/null', clip: { x: 1000, y: 40, width: 440, height: 960 } }).catch(() => {});
await page.mouse.click(600, 900);

// The patrol, as waypoints.
await page.getByRole('tab', { name: 'Route' }).evaluate(b => b.click());   // the live screen re-renders at 10 Hz
const upload = page.getByRole('button', { name: /Upload patrol/ });
await upload.waitFor({ timeout: 10000 }).catch(() => fail('no Upload patrol for the live aircraft'));
for (let i = 0; i < 40 && !(await upload.isEnabled()); i++) await page.waitForTimeout(250);
if (!(await upload.isEnabled())) fail('Upload patrol stayed disabled (pre-flight gate)');
await upload.click({ timeout: 15000 }).catch(async e => { if (process.env.BENCH_SHOT) await page.screenshot({ path: process.env.BENCH_SHOT, timeout: 120000 }).catch(() => {}); fail(`Upload patrol could not be clicked: ${e.message.split('\n')[0]}`); });
await waitLog(/MIS stored 5 waypoints/, 15000, 'the flight controller did not store the 5 patrol waypoints');
if (vlog.some(l => /IGNORED MISSION_ITEM_INT|refused/.test(l))) fail('an item was sent in a form INAV does not take');
await page.getByText(/Route on the aircraft · start the route from the radio/).waitFor({ timeout: 5000 }).catch(() => fail('the screen did not say the route is started from the radio'));
log('patrol uploaded as 5 MISSION_ITEMs; screen says start it from the radio');

// Go-to without GCS NAV: refused, and the refusal reaches the screen.
const wp = page.getByRole('button', { name: /WP2/ });
await wp.click();
await waitLog(/CMD reposition denied/, 8000, 'the go-to did not reach the flight controller');
await page.getByRole('alert').filter({ hasText: /GCS NAV mode/ }).waitFor({ timeout: 5000 }).catch(() => fail('the go-to refusal did not reach the screen'));
log('go-to without GCS NAV: refused, and the screen says why');

// With GCS NAV mode on: accepted.
startFc(true);
await page.waitForTimeout(2500);
await wp.click();
await waitLog(/CMD reposition 33\.\d+,-118\.\d+ alt \d+/, 8000, 'the go-to was not accepted with GCS NAV on');
log(`go-to with GCS NAV: ${vlog.filter(l => /CMD reposition \d/.test(l)).pop()}`);

console.log(`PASS: INAV stand-in on MAVLink ${v2 ? 2 : 1}: named, capabilities shown, patrol uploaded as waypoints, go-to refused then flown`);
await browser.close(); cleanup(); process.exit(0);
