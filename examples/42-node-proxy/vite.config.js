import { defineConfig } from 'vite';
import path from 'path';

// The real proxy lives in server.ts (plain Node.js + createNodeProxy).
// Vite forwards /proxy/* to it during development.
const PROXY_PORT = Number(process.env.PROXY_PORT ?? 3044);

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 3043,
    strictPort: true,
    open: false,
    proxy: {
      '/proxy': {
        target: `http://localhost:${PROXY_PORT}`,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  resolve: {
    alias: {
      'composite-voice': path.resolve(__dirname, '../../dist/index.mjs'),
    },
  },
});
