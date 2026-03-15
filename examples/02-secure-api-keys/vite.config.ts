import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: { port: 3002, strictPort: true },
  resolve: {
    alias: {
      '@lukeocodes/composite-voice': path.resolve(__dirname, '../../dist/index.mjs'),
      '@lukeocodes/composite-voice/proxy': path.resolve(__dirname, '../../dist/proxy/index.mjs'),
      '@lukeocodes/composite-voice-ui/theme.css': path.resolve(__dirname, '../../packages/ui/src/theme.css'),
      '@lukeocodes/composite-voice-ui/icons': path.resolve(__dirname, '../../packages/ui/src/icons.tsx'),
      '@lukeocodes/composite-voice-ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
    },
  },
  envDir: '../../',
});
