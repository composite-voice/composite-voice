import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './examples',
  testMatch: '**/e2e/*.spec.ts',
  timeout: 180_000,
  retries: 0,
  tsconfig: './tests/e2e/tsconfig.json',
  /* Each example uses a unique port (NN + 3000), so tests can run in parallel
     without port conflicts. CI runners may want fewer workers to stay within
     resource limits — override with PLAYWRIGHT_WORKERS env var. */
  fullyParallel: true,
  workers: process.env.PLAYWRIGHT_WORKERS
    ? parseInt(process.env.PLAYWRIGHT_WORKERS, 10)
    : undefined,
  use: {
    headless: true,
  },
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list']],
});
