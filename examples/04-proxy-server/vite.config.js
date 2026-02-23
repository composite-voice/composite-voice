import { defineConfig, loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Load ALL env vars (empty prefix) so server-side secrets are accessible
  // in this config file without being exposed to the browser bundle.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    root: '.',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      port: 3004,
      open: true,
      proxy: {
        // ── Anthropic (HTTP / SSE) ──────────────────────────────────────
        // Browser sends:  POST http://localhost:3004/proxy/anthropic/v1/messages
        // Vite proxies to: https://api.anthropic.com/v1/messages
        // Injects API key server-side — never exposed to the browser.
        '/proxy/anthropic': {
          target: 'https://api.anthropic.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/proxy\/anthropic/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (env.ANTHROPIC_API_KEY) {
                proxyReq.setHeader('x-api-key', env.ANTHROPIC_API_KEY);
                proxyReq.setHeader('anthropic-version', '2023-06-01');
              }
            });
          },
        },
        // ── Deepgram (WebSocket — STT and TTS) ─────────────────────────
        // Browser connects: ws://localhost:3004/proxy/deepgram/v1/listen
        // Vite proxies to: wss://api.deepgram.com/v1/listen
        // Injects API key server-side — never exposed to the browser.
        '/proxy/deepgram': {
          target: 'wss://api.deepgram.com',
          ws: true,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/proxy\/deepgram/, ''),
          configure: (proxy) => {
            proxy.on('proxyReqWs', (proxyReq) => {
              if (env.DEEPGRAM_API_KEY) {
                proxyReq.setHeader('Authorization', `Token ${env.DEEPGRAM_API_KEY}`);
              }
            });
          },
        },
      },
    },
    resolve: {
      alias: {
        '@lukeocodes/composite-voice': path.resolve(__dirname, '../../dist/index.mjs'),
        '@lukeocodes/composite-voice/providers/stt': path.resolve(
          __dirname,
          '../../dist/providers/stt/index.mjs'
        ),
        '@lukeocodes/composite-voice/providers/llm': path.resolve(
          __dirname,
          '../../dist/providers/llm/index.mjs'
        ),
        '@lukeocodes/composite-voice/providers/tts': path.resolve(
          __dirname,
          '../../dist/providers/tts/index.mjs'
        ),
      },
    },
  };
});
