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
      port: 3060,
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
        '/proxy/groq': {
          target: 'https://api.groq.com/openai/v1',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/proxy\/groq/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin');
              proxyReq.removeHeader('referer');
              if (env.GROQ_API_KEY) {
                proxyReq.setHeader('Authorization', `Bearer ${env.GROQ_API_KEY}`);
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
