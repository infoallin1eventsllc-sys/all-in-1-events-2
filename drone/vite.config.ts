import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served from /drone/ on the All in 1 Events site (see ../netlify.toml, ../vercel.json). The Meridian
// Interface portfolio hosts a copy at /demos/drone-command/: build that with DEMO_BASE (the path) and
// DEMO_URL (the absolute address, for the link-preview image), e.g.
//   DEMO_BASE=/demos/drone-command/ DEMO_URL=https://meridianinterface.com/demos/drone-command/ npm run build
const base = process.env.DEMO_BASE || '/drone/';
const url = process.env.DEMO_URL || 'https://allin1events.com/drone/';

export default defineConfig({
  plugins: [react(), tailwindcss(), { name: 'demo-url', transformIndexHtml: html => html.replaceAll('%DEMO_URL%', url) }],
  base,
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
