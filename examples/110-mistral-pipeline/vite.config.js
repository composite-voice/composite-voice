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
      port: 3110,
      strictPort: true,
      open: false,
      proxy: {
        '/proxy/deepgram': {
          target: 'wss://api.deepgram.com',
          ws: true,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/proxy\/deepgram/, ''),
          configure: (proxy) => {
            proxy.on('proxyReqWs', (proxyReq) => {
              proxyReq.removeHeader('origin');
              proxyReq.removeHeader('referer');
              if (env.DEEPGRAM_API_KEY) {
                proxyReq.setHeader('Authorization', `Token ${env.DEEPGRAM_API_KEY}`);
              }
            });
          },
        },
        '/proxy/mistral': {
          target: 'https://api.mistral.ai',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/proxy\/mistral/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin');
              proxyReq.removeHeader('referer');
              if (env.MISTRAL_API_KEY) {
                proxyReq.setHeader('Authorization', `Bearer ${env.MISTRAL_API_KEY}`);
              }
            });
          },
        },
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
