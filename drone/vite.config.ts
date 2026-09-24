import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Served from /drone/ on the All in 1 Events site (see ../netlify.toml, ../vercel.json).
  base: '/drone/',
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
