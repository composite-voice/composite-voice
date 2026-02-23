import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
  },
  server: {
    port: 3002,
    open: true,
  },
  resolve: {
    alias: {
      '@lukeocodes/composite-voice': path.resolve(__dirname, '../../dist/index.mjs'),
    },
  },
});
