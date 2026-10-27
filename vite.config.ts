import { defineConfig } from 'vite';

// Relative base so the build works from any static host path (e.g. GitHub Pages).
// Phaser alone is ~1.4 MB minified (~360 kB gzipped), so raise the size warning.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1600 },
});
