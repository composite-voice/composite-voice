import { defineConfig } from 'vite';
import path from 'path';

// The real proxy lives in server.ts (Express + createExpressProxy).
// Vite just forwards /proxy/* there so the browser uses a relative path
// on the same origin — no CORS needed.
const PROXY_PORT = Number(process.env.PROXY_PORT ?? 3011);

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 3010,
    strictPort: true,
    open: false,
    proxy: {
      // Forward all /proxy/* requests (HTTP + WebSocket) to the
      // Express proxy server running on PROXY_PORT.
      '/proxy': {
        target: `http://localhost:${PROXY_PORT}`,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  resolve: {
    alias: {
      '@lukeocodes/composite-voice': path.resolve(__dirname, '../../dist/index.mjs'),
    },
  },
});
