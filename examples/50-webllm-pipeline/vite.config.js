import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 3050,
    strictPort: true,
    open: false,
    headers: {
      // Required for SharedArrayBuffer used by some WebLLM model variants
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  resolve: {
    alias: {
      '@lukeocodes/composite-voice': path.resolve(__dirname, '../../dist/index.mjs'),
    },
  },
});
