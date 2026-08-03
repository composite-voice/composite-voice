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
      port: 3033,
      strictPort: true,
      open: false,
      proxy: {
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
        '/proxy/anthropic': {
          target: 'https://api.anthropic.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/proxy\/anthropic/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin');
              proxyReq.removeHeader('referer');
              if (env.ANTHROPIC_API_KEY) {
                proxyReq.setHeader('x-api-key', env.ANTHROPIC_API_KEY);
                proxyReq.setHeader('anthropic-version', '2023-06-01');
              }
            });
          },
        },
      },
    },
    resolve: {
      alias: {
        'composite-voice': path.resolve(__dirname, '../../dist/index.mjs'),
      },
    },
  };
});
