import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Served from /drone/ on the All in 1 Events site (see ../netlify.toml, ../vercel.json).
  base: '/drone/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
