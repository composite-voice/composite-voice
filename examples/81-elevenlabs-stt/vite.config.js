import { defineConfig, loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    root: '.',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      host: true,
      port: 3081,
      strictPort: true,
      open: false,
      proxy: {
        // ── ElevenLabs (WebSocket — STT) ──────────────────────────────────
        // Browser connects: ws://localhost:3081/proxy/elevenlabs/v1/speech-to-text/realtime
        // Vite proxies to: wss://api.elevenlabs.io/v1/speech-to-text/realtime
        // Injects xi-api-key header server-side — never exposed to the browser.
        '/proxy/elevenlabs': {
          target: 'wss://api.elevenlabs.io',
          ws: true,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/proxy\/elevenlabs/, ''),
          configure: (proxy) => {
            proxy.on('proxyReqWs', (proxyReq) => {
              proxyReq.removeHeader('origin');
              proxyReq.removeHeader('referer');
              if (env.ELEVENLABS_API_KEY) {
                proxyReq.setHeader('xi-api-key', env.ELEVENLABS_API_KEY);
              }
            });
          },
        },
      },
    },
    resolve: {
      alias: {
        '@lukeocodes/composite-voice': path.resolve(__dirname, '../../dist/index.mjs'),
      },
    },
  };
});
