import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { tmpdir } from 'os';
import { join } from 'path';

export default defineConfig({
  plugins: [svelte()],
  cacheDir: join(tmpdir(), 'hearth-vtt-vite-cache'),
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/healthz': {
        target: 'http://localhost:3000',
      },
    },
  },
});
