import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Fully static output: `npm run build` emits a self-contained bundle in dist/
// that can be opened from any static host (or file:// via `npm run preview`).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
