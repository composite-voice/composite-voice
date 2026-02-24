/**
 * E2E test for example 50-webllm-pipeline (render-only).
 *
 * Provider stack: NativeSTT + WebLLM (in-browser via WebGPU) + NativeTTS
 *
 * This is a lightweight render-only test — it does NOT attempt to download
 * the multi-GB WebLLM model or run a full conversation round-trip. It verifies
 * that the page loads, all UI elements are present, and no JS errors occur
 * during initial render.
 *
 * The full pipeline test is skipped because:
 * - WebLLM requires WebGPU (not available in headless Chromium CI)
 * - Model download is 500MB+ and would dominate test time
 * - Model loading requires persistent browser cache across runs
 */

import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launchBrowser,
  createContext,
  startDevServer,
  collectDiagnostics,
  getJsErrors,
  type DevServer,
} from '../../../tests/e2e/helpers';
import { injectNativeMocks } from '../../../tests/e2e/mocks/inject';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXAMPLE_DIR = path.resolve(__dirname, '..');
const PORT = 3050;
const BASE_URL = `http://localhost:${PORT}`;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let server: DevServer;

test.beforeAll(async () => {
  server = await startDevServer(EXAMPLE_DIR, PORT);
});

test.afterAll(async () => {
  await server?.stop();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('50-webllm-pipeline E2E (render-only)', () => {
  test('page renders without console errors and all UI elements present', async () => {
    const browser = await launchBrowser();
    const context = await createContext(browser, { baseURL: BASE_URL });
    const page = await context.newPage();

    // Inject NativeSTT/TTS mocks (prevents errors from missing Web Speech API)
    await injectNativeMocks(page);

    const diag = collectDiagnostics(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // ── Header ────────────────────────────────────────────────────────
    await expect(page.locator('h1')).toContainText('CompositeVoice');
    await expect(page.locator('.tagline')).toContainText('WebLLM');
    await expect(page.locator('.badge')).toContainText('Fully Offline');

    // ── Controls ──────────────────────────────────────────────────────
    await expect(page.locator('#btn-init')).toBeVisible();
    await expect(page.locator('#btn-init')).toBeEnabled();
    await expect(page.locator('#btn-start')).toBeVisible();
    await expect(page.locator('#btn-start')).toBeDisabled();
    await expect(page.locator('#btn-stop')).toBeVisible();
    await expect(page.locator('#btn-stop')).toBeDisabled();

    // ── Content areas ─────────────────────────────────────────────────
    await expect(page.locator('#transcript')).toBeVisible();
    await expect(page.locator('#response')).toBeVisible();

    // ── State label shows Idle ────────────────────────────────────────
    await expect(page.locator('#state-label')).toContainText('Idle');

    // ── Progress bar hidden initially ─────────────────────────────────
    const progressContainer = page.locator('#progress-container');
    await expect(progressContainer).toBeAttached();
    const isVisible = await progressContainer.isVisible();
    expect(isVisible).toBe(false);

    // ── Error box hidden initially ────────────────────────────────────
    const errorBox = page.locator('#error');
    await expect(errorBox).toBeAttached();
    expect(await errorBox.isVisible()).toBe(false);

    // ── No JS errors during initial load ──────────────────────────────
    expect(getJsErrors(diag)).toHaveLength(0);

    await context.close();
    await browser.close();
  });
});
