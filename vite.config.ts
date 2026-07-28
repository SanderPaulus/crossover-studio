import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths: GitHub Pages serves the app under /<repo-name>/,
  // not at the domain root.
  base: './',
  server: {
    // Honor the port the launcher assigns (autoPort); default stays 5173.
    port: Number(process.env.PORT) || 5173,
  },
});
