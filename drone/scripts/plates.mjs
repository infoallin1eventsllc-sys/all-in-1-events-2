#!/usr/bin/env node
/**
 * Activate the AI aerial plates: every shot in public/footage/ai/manifest.json
 * `planned` whose image is present in that folder goes into `shots`, which the
 * patrol feed plays (San Francisco). Run after adding or removing images.
 *   npm run plates
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'footage', 'ai');
const file = path.join(dir, 'manifest.json');
const m = JSON.parse(fs.readFileSync(file, 'utf8'));
const shots = (m.planned ?? []).filter(s => fs.existsSync(path.join(dir, s.file))).map(({ canva, ...s }) => s); // eslint-disable-line no-unused-vars
const missing = (m.planned ?? []).filter(s => !fs.existsSync(path.join(dir, s.file))).map(s => s.file);
m.shots = shots;
fs.writeFileSync(file, JSON.stringify(m, null, 2) + '\n');
console.log(`${shots.length} plate(s) active${missing.length ? `; missing: ${missing.join(', ')}` : ''}`);
