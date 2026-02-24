import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './examples',
  testMatch: '**/e2e/*.spec.ts',
  timeout: 180_000,
  retries: 0,
  use: {
    headless: true,
  },
});
