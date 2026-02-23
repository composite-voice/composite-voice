import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    include: [],
  },
  build: {
    target: 'esnext',
  },
});
