import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths: GitHub Pages serves the app under /<repo-name>/,
  // not at the domain root.
  base: './',
  build: {
    rollupOptions: {
      // Two pages from one build: the landing page at the root, the studio at
      // /app/. Keeping them in one Vite project means one deploy, one set of
      // shared assets, and no second host to keep alive.
      input: {
        landing: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app/index.html'),
      },
    },
  },
  server: {
    // Honor the port the launcher assigns (autoPort); default stays 5173.
    port: Number(process.env.PORT) || 5173,
  },
});
