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
      port: 3041,
      strictPort: true,
      open: false,
      proxy: {
        '/proxy/openai': {
          target: 'https://api.openai.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/proxy\/openai/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin');
              proxyReq.removeHeader('referer');
              if (env.OPENAI_API_KEY) {
                proxyReq.setHeader('Authorization', `Bearer ${env.OPENAI_API_KEY}`);
              }
            });
          },
        },
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
      },
    },
    resolve: {
      alias: {
        '@lukeocodes/composite-voice': path.resolve(__dirname, '../../dist/index.mjs'),
      },
    },
  };
});
