import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// Served from /drone/ on the All in 1 Events site (see ../netlify.toml, ../vercel.json). The Meridian
// Interface portfolio hosts a copy at /demos/drone-command/: build that with DEMO_BASE (the path) and
// DEMO_URL (the absolute address, for the link-preview image), e.g.
//   DEMO_BASE=/demos/drone-command/ DEMO_URL=https://meridianinterface.com/demos/drone-command/ npm run build
// A portfolio build (any DEMO_BASE under /demos/) carries the studio's name, "Meridian Interface Drone
// Command", in place of "All in 1 Drone Command" (src/brand.ts); DEMO_BRAND=meridian|allin1 overrides.
const base = process.env.DEMO_BASE || '/drone/';
const url = process.env.DEMO_URL || 'https://allin1events.com/drone/';
const brand = process.env.DEMO_BRAND || (base.startsWith('/demos/') ? 'meridian' : 'allin1');
const appName = brand === 'meridian' ? 'Meridian Interface Drone Command' : 'All in 1 Drone Command';

/** %DEMO_URL% and %APP_NAME% in index.html, and the app's name in the built web manifest. */
function demoPage(): Plugin {
  let outDir = 'dist';
  return {
    name: 'demo-page',
    configResolved: c => { outDir = path.resolve(c.root, c.build.outDir); },
    transformIndexHtml: html => html.replaceAll('%DEMO_URL%', url).replaceAll('%APP_NAME%', appName),
    closeBundle() {
      const file = path.join(outDir, 'manifest.webmanifest');
      if (!fs.existsSync(file)) return;
      const m = JSON.parse(fs.readFileSync(file, 'utf8'));
      m.name = appName;
      fs.writeFileSync(file, JSON.stringify(m, null, 2) + '\n');
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), demoPage()],
  base,
  define: { 'import.meta.env.VITE_BRAND': JSON.stringify(brand) },
  build: {
    rolldownOptions: {
      // three.js in its own file: it rarely changes, so browsers keep it cached across deploys.
      output: { advancedChunks: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] } },
    },
    chunkSizeWarningLimit: 900,     // three.js alone is about 700 kB minified
  },
  resolve: {
    alias: {
      '@': import.meta.dirname,
    },
  },
});
