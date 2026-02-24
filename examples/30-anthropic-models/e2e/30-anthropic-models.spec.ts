/**
 * E2E test for example 30-anthropic-models.
 *
 * Provider stack: NativeSTT (mocked) + Anthropic LLM (multiple models) + NativeTTS (mocked)
 *
 * Both NativeSTT and NativeTTS are mocked via addInitScript — the Web Speech
 * API is not available in headless Chromium, so we inject mock SpeechRecognition
 * and speechSynthesis that fire realistic event sequences.
 *
 * This example features a model selector with three Anthropic models:
 * Haiku, Sonnet, and Opus. Clicking a model card switches the active model.
 *
 * Required environment variables: ANTHROPIC_API_KEY
 */

import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import {
  launchBrowser,
  createContext,
  startDevServer,
  collectDiagnostics,
  withRetry,
  createGitHubIssue,
  type DevServer,
  type PageDiagnostics,
} from '../../../tests/e2e/helpers';
import { injectNativeMocks } from '../../../tests/e2e/mocks/inject';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXAMPLE_DIR = path.resolve(__dirname, '..');
const PORT = 3030;
const BASE_URL = `http://localhost:${PORT}`;
const EXAMPLE_NAME = '30-anthropic-models';

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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for an element's text content to change from its placeholder value,
 * indicating the pipeline has produced output.
 */
async function waitForNonPlaceholder(
  page: Page,
  selector: string,
  timeoutMs: number,
): Promise<string> {
  await page.waitForFunction(
    ({ sel }) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const text = el.textContent?.trim() ?? '';
      return (
        text.length > 0 &&
        !text.includes('will appear here') &&
        !text.includes('will stream here')
      );
    },
    { sel: selector },
    { timeout: timeoutMs },
  );
  const el = page.locator(selector);
  return (await el.textContent()) ?? '';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('30-anthropic-models E2E', () => {
  test('page renders without console errors and key UI elements present', async () => {
    const browser = await launchBrowser();
    const context = await createContext(browser, { baseURL: BASE_URL });
    const page = await context.newPage();

    // Inject both NativeSTT and NativeTTS mocks (must happen before navigation)
    await injectNativeMocks(page);

    const diag = collectDiagnostics(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check title
    await expect(page).toHaveTitle(/30.*Anthropic.*Models/i);

    // Model selector — 3 model cards (Haiku, Sonnet, Opus)
    const modelCards = page.locator('.model-card');
    await expect(modelCards).toHaveCount(3);
    await expect(page.locator('.model-card .model-name').nth(0)).toContainText('Haiku');
    await expect(page.locator('.model-card .model-name').nth(1)).toContainText('Sonnet');
    await expect(page.locator('.model-card .model-name').nth(2)).toContainText('Opus');

    // First card (Haiku) is active by default
    await expect(page.locator('.model-card').first()).toHaveClass(/active/);

    // Latency indicator
    await expect(page.locator('#latency-value')).toBeVisible();

    // Controls
    await expect(page.locator('#btn-init')).toBeVisible();
    await expect(page.locator('#btn-start')).toBeVisible();
    await expect(page.locator('#btn-stop')).toBeVisible();

    // Content areas
    await expect(page.locator('#transcript')).toBeVisible();
    await expect(page.locator('#response')).toBeVisible();

    // State label
    await expect(page.locator('#state-label')).toContainText('Idle');

    // No JS errors during initial load
    const jsErrors = diag.consoleErrors.filter(
      (e) => !e.text.includes('favicon') && !e.text.includes('404'),
    );
    expect(jsErrors).toHaveLength(0);

    await context.close();
    await browser.close();
  });

  test('model selection UI is interactive', async () => {
    const browser = await launchBrowser();
    const context = await createContext(browser, { baseURL: BASE_URL });
    const page = await context.newPage();

    await injectNativeMocks(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Haiku is active by default
    await expect(page.locator('.model-card').first()).toHaveClass(/active/);
    await expect(page.locator('.model-card').nth(1)).not.toHaveClass(/active/);
    await expect(page.locator('.model-card').nth(2)).not.toHaveClass(/active/);

    // Click Sonnet card — it should become active, Haiku deactivated
    await page.locator('.model-card').nth(1).click();
    await expect(page.locator('.model-card').nth(1)).toHaveClass(/active/);
    await expect(page.locator('.model-card').first()).not.toHaveClass(/active/);

    // Click Opus card — it should become active, Sonnet deactivated
    await page.locator('.model-card').nth(2).click();
    await expect(page.locator('.model-card').nth(2)).toHaveClass(/active/);
    await expect(page.locator('.model-card').nth(1)).not.toHaveClass(/active/);

    // Click back to Haiku
    await page.locator('.model-card').first().click();
    await expect(page.locator('.model-card').first()).toHaveClass(/active/);
    await expect(page.locator('.model-card').nth(2)).not.toHaveClass(/active/);

    await context.close();
    await browser.close();
  });

  test('conversation round-trip: mocked STT → Anthropic LLM → mocked TTS', async () => {
    let diagnostics: PageDiagnostics | undefined;

    try {
      await withRetry(async (attempt, timeoutMs) => {
        const browser = await launchBrowser();
        const context = await createContext(browser, { baseURL: BASE_URL });
        const page = await context.newPage();

        // Inject both NativeSTT and NativeTTS mocks
        await injectNativeMocks(page);

        diagnostics = collectDiagnostics(page);

        try {
          await page.goto('/');
          await page.waitForLoadState('networkidle');

          // ── Initialize ──────────────────────────────────────────────
          const initBtn = page.locator('#btn-init');
          await expect(initBtn).toBeEnabled();
          await initBtn.click();

          // Wait for state to become "ready"
          await page.waitForFunction(
            () =>
              document.querySelector('#state-label')?.textContent ===
              'Ready \u2014 click Start',
            {},
            { timeout: 15_000 },
          );

          // ── Start listening ─────────────────────────────────────────
          const startBtn = page.locator('#btn-start');
          await expect(startBtn).toBeEnabled({ timeout: 5_000 });
          await startBtn.click();

          // Status should transition to "Listening…"
          await page.waitForFunction(
            () =>
              document.querySelector('#state-label')?.textContent ===
              'Listening\u2026',
            {},
            { timeout: 10_000 },
          );

          // ── STT: verify mocked transcript appears ───────────────────
          // The NativeSTT mock fires "Hello, can you hear me?" after ~500ms
          const transcriptText = await waitForNonPlaceholder(
            page,
            '#transcript',
            timeoutMs - 20_000,
          );
          expect(transcriptText.length).toBeGreaterThan(0);

          // ── LLM: wait for AI response from Anthropic Claude ─────────
          const responseText = await waitForNonPlaceholder(
            page,
            '#response',
            30_000,
          );
          expect(responseText.length).toBeGreaterThan(0);

          // ── TTS: verify mocked TTS received the response text ───────
          // The NativeTTS mock captures utterances in window.__ttsMockUtterances
          const ttsUtterances = await page.evaluate(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (window as any).__ttsMockUtterances ?? [];
          });
          expect(ttsUtterances.length).toBeGreaterThan(0);

          // ── Cleanup ─────────────────────────────────────────────────
          const stopBtn = page.locator('#btn-stop');
          if (await stopBtn.isEnabled()) {
            await stopBtn.click();
          }
        } finally {
          await context.close();
          await browser.close();
        }
      }, `${EXAMPLE_NAME} full round-trip`);
    } catch (err) {
      // All retry tiers exhausted — create a GitHub issue with diagnostics
      const error = err instanceof Error ? err : new Error(String(err));
      createGitHubIssue({
        title: `[E2E] ${EXAMPLE_NAME}: ${error.message.slice(0, 80)}`,
        example: EXAMPLE_NAME,
        attempt: 2,
        error: error.stack ?? error.message,
        diagnostics,
        labels: ['e2e'],
      });
      throw err;
    }
  });
});
