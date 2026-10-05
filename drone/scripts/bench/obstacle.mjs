#!/usr/bin/env node
/**
 * Bench test: obstacle sensing. The stand-in ArduCopter flies with a forward proximity sensor
 * (fake_vehicle.py --obstacle 3.5: PRX1_TYPE 4, DISTANCE_SENSOR at 3.5 m ahead), then without one.
 *
 *   npm run dev
 *   node scripts/bench/obstacle.mjs [--url http://127.0.0.1:5173/drone/]
 *
 * With the sensor, the link must show the obstacle (popover and the warning under the link button
 * on every page) and the pre-flight must read avoidance as on, with the aircraft's own margin.
 * Without it, the pre-flight must say plainly the drone will not stop for obstacles.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://127.0.0.1:5173/drone/';
const bridgeDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'hardware', 'companion-pi', 'bridge');
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');

const kids = [];
const run = (cmd, a) => { const p = spawn(cmd, a, { cwd: bridgeDir, stdio: ['ignore', 'pipe', 'pipe'] }); kids.push(p); return p; };
const cleanup = () => kids.forEach(k => { try { k.kill(); } catch { /* gone */ } });
process.on('exit', cleanup);
const fail = (msg) => { console.error(`FAIL: ${msg}`); cleanup(); process.exit(1); };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const wsPort = process.env.BENCH_WS_PORT ?? '8774', udpPort = process.env.BENCH_UDP_PORT ?? '14555';
run('python3', ['mavlink_ws.py', '--udp', `127.0.0.1:${udpPort}`, '--host', '127.0.0.1', '--port', wsPort, '--token', 'bench']);
await new Promise(r => setTimeout(r, 1500));
let fc = null;
const startFc = (extra) => { if (fc) { fc.kill(); kids.splice(kids.indexOf(fc), 1); } fc = run('python3', ['fake_vehicle.py', '--to', `127.0.0.1:${udpPort}`, ...extra]); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', e => fail(`page error: ${e.message}`));
const connect = async () => {
  await page.goto(`${url}?view=patrol`, { waitUntil: 'networkidle' });
  await page.click('#link-button');
  await page.getByLabel('Bridge address').fill(`ws://127.0.0.1:${wsPort}/?token=bench`);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await page.getByText(/ArduCopter/).first().waitFor({ timeout: 15000 }).catch(() => fail('no live ArduCopter'));
};
const popover = () => page.locator('#link-button').locator('..').innerText();
const until = async (test, ms, what) => { for (let t = 0; t < ms; t += 500) { if (test(await popover())) return; await page.waitForTimeout(500); } fail(`${what}:\n${await popover()}`); };

// With a forward sensor seeing something 3.5 m ahead.
startFc(['--obstacle', '3.5']);
await connect();
await until(p => /Obstacle sensors\s*nearest 3\.5 m ahead/.test(p), 15000, 'the popover did not show the obstacle');
await until(p => /Obstacle avoidance on\s*stops 2 m away; missions fly straight \(OA_TYPE 0\)/.test(p), 20000, 'pre-flight did not read avoidance as on');
const alert = page.getByRole('alert').filter({ hasText: /Obstacle 3\.5 m ahead/ });
await page.mouse.click(600, 900);                     // close the popover: the warning stays, under the link button
await alert.waitFor({ timeout: 5000 }).catch(() => fail('no obstacle warning in the app bar'));
log('sensor: obstacle shown (3.5 m ahead), warning in the app bar, pre-flight reads avoidance on (2 m)');

// No sensor: the pre-flight says so.
startFc([]);
await connect();
await until(p => /Obstacle avoidance on\s*no obstacle sensor: will not stop for obstacles/.test(p), 20000, 'pre-flight did not say the drone will not stop');
await until(p => /Obstacle sensors\s*none reporting/.test(p), 5000, 'popover did not say no sensor reports');
log('no sensor: pre-flight says it will not stop for obstacles');

console.log('PASS: obstacle sensing shown, warned and checked; a drone without a sensor is called out');
await browser.close(); cleanup(); process.exit(0);
