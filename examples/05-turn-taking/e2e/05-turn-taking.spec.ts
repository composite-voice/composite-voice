/**
 * E2E test for example 05-turn-taking.
 *
 * Provider stack: NativeSTT (mocked) + Anthropic LLM (via Vite proxy) + NativeTTS (mocked)
 *
 * Both NativeSTT and NativeTTS are mocked via addInitScript — the Web Speech
 * API is not available in headless Chromium. The Anthropic LLM is proxied
 * through Vite's dev server to avoid CORS and key exposure.
 *
 * This example features a turn-taking strategy selector with four strategy
 * cards (Auto Conservative, Auto Aggressive, Auto Detect, Always Pause) and
 * a microphone status indicator with turn-state badge.
 *
 * Requires ANTHROPIC_API_KEY in the root .env file.
 */

import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launchBrowser,
  createContext,
  startDevServer,
  collectDiagnostics,
  getJsErrors,
  withRetry,
  createGitHubIssue,
  type DevServer,
  type PageDiagnostics,
} from '../../../tests/e2e/helpers';
import { injectNativeMocks } from '../../../tests/e2e/mocks/inject';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXAMPLE_DIR = path.resolve(__dirname, '..');
const PORT = 3005;
const BASE_URL = `http://localhost:${PORT}`;
const EXAMPLE_NAME = '05-turn-taking';

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

test.describe('05-turn-taking E2E', () => {
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
    await expect(page).toHaveTitle(/05.*Turn.*Taking/i);

    // Provider tagline
    await expect(page.locator('.tagline')).toContainText('Anthropic');

    // Strategy selector — 4 strategy cards in the grid
    const strategyCards = page.locator('.strategy-card');
    await expect(strategyCards).toHaveCount(4);

    // First card (Auto Conservative) is selected by default
    const firstCard = strategyCards.nth(0);
    await expect(firstCard).toHaveClass(/selected/);
    await expect(firstCard.locator('.strategy-title')).toContainText('Auto (Conservative)');

    // All four strategy titles present
    await expect(strategyCards.nth(0).locator('.strategy-title')).toContainText('Auto (Conservative)');
    await expect(strategyCards.nth(1).locator('.strategy-title')).toContainText('Auto (Aggressive)');
    await expect(strategyCards.nth(2).locator('.strategy-title')).toContainText('Auto (Detect)');
    await expect(strategyCards.nth(3).locator('.strategy-title')).toContainText('Always Pause');

    // Controls
    await expect(page.locator('#btn-init')).toBeVisible();
    await expect(page.locator('#btn-start')).toBeVisible();
    await expect(page.locator('#btn-stop')).toBeVisible();

    // Microphone status indicator
    await expect(page.locator('#mic-icon')).toBeVisible();
    await expect(page.locator('#mic-label')).toContainText('Microphone Inactive');
    await expect(page.locator('#turn-badge')).toContainText('Inactive');

    // Info panel
    await expect(page.locator('#info-panel')).toBeVisible();

    // Content areas
    await expect(page.locator('#transcript')).toBeVisible();
    await expect(page.locator('#response')).toBeVisible();

    // State label shows idle
    await expect(page.locator('#state-label')).toContainText('Idle');

    // Active strategy label is empty before initialization
    await expect(page.locator('#active-strategy-label')).toHaveText('');

    // No JS errors during initial load
    expect(getJsErrors(diag)).toHaveLength(0);

    await context.close();
    await browser.close();
  });

  test('strategy selection: clicking cards toggles selection and updates info panel', async () => {
    const browser = await launchBrowser();
    const context = await createContext(browser, { baseURL: BASE_URL });
    const page = await context.newPage();

    await injectNativeMocks(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const strategyCards = page.locator('.strategy-card');

    // Initially: first card (Auto Conservative) is selected
    await expect(strategyCards.nth(0)).toHaveClass(/selected/);
    await expect(strategyCards.nth(1)).not.toHaveClass(/selected/);

    // Info panel should mention Conservative
    await expect(page.locator('#info-panel')).toContainText('Conservative');

    // ── Click "Auto (Aggressive)" card ────────────────────────────────
    await strategyCards.nth(1).click();

    // Selection should move to the second card
    await expect(strategyCards.nth(1)).toHaveClass(/selected/);
    await expect(strategyCards.nth(0)).not.toHaveClass(/selected/);

    // Info panel should update to mention Aggressive
    await expect(page.locator('#info-panel')).toContainText('Aggressive');

    // ── Click "Auto (Detect)" card ────────────────────────────────────
    await strategyCards.nth(2).click();

    await expect(strategyCards.nth(2)).toHaveClass(/selected/);
    await expect(strategyCards.nth(1)).not.toHaveClass(/selected/);

    // Info panel should update to mention Detect
    await expect(page.locator('#info-panel')).toContainText('Detect');

    // ── Click "Always Pause" card ─────────────────────────────────────
    await strategyCards.nth(3).click();

    await expect(strategyCards.nth(3)).toHaveClass(/selected/);
    await expect(strategyCards.nth(2)).not.toHaveClass(/selected/);

    // Info panel should mention "Always Pause"
    await expect(page.locator('#info-panel')).toContainText('Always Pause');

    // ── Click back to first card ──────────────────────────────────────
    await strategyCards.nth(0).click();

    await expect(strategyCards.nth(0)).toHaveClass(/selected/);
    await expect(strategyCards.nth(3)).not.toHaveClass(/selected/);

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

          // Active strategy label should now show the selected strategy
          await expect(page.locator('#active-strategy-label')).toContainText('Active:');

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
          const transcriptText = await waitForNonPlaceholder(
            page,
            '#transcript',
            timeoutMs - 20_000,
          );
          expect(transcriptText.length).toBeGreaterThan(0);

          // ── LLM: wait for Anthropic response ────────────────────────
          const responseText = await waitForNonPlaceholder(
            page,
            '#response',
            30_000,
          );
          expect(responseText.length).toBeGreaterThan(0);

          // ── TTS: verify mocked TTS received the response text ───────
          const ttsUtterances = await page.waitForFunction(
            () => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const utts = (window as any).__ttsMockUtterances ?? [];
              return utts.length > 0 ? utts : null;
            },
            {},
            { timeout: 15_000 },
          );
          const utterances = await ttsUtterances.jsonValue();
          expect((utterances as string[]).length).toBeGreaterThan(0);

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
