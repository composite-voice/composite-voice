import { defineConfig, loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    root: '.',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      target: 'esnext',
    },
    server: {
      host: true,
      port: 3001,
      strictPort: true,
      open: false,
      proxy: {
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
        '@lukeocodes/composite-voice': path.resolve(__dirname, '../../dist/index.mjs'),
      },
    },
  };
});
