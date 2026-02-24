import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { host: true, port: 3012, open: false },
  resolve: {
    alias: {
      '@lukeocodes/composite-voice': path.resolve(__dirname, '../../dist/index.mjs'),
    },
  },
});
