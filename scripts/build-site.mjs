// Assemble the deployable site in _site/: the events pages plus the built drone
// app at /drone/. Only what visitors need is published, not the whole repo
// (system/, docs, sources and the drone app's unbuilt index.html stay out).
//   npm run build   (builds drone/ first, then runs this)
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const OUT = '_site';
const FILES = ['index.html', 'marketing-system.html', 'css', 'js', 'assets'];

if (!existsSync('drone/dist/index.html')) {
  console.error('drone/dist is missing: run "npm run build:drone" first.');
  process.exit(1);
}
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const f of FILES) if (existsSync(f)) cpSync(f, `${OUT}/${f}`, { recursive: true });
rmSync(`${OUT}/assets/README.md`, { force: true });
cpSync('drone/dist', `${OUT}/drone`, { recursive: true });
console.log(`Site assembled in ${OUT}/ (events pages + /drone/)`);
