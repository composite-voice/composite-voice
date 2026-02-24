/**
 * E2E test for example 04-error-recovery.
 *
 * Provider stack: NativeSTT (mocked) + Anthropic LLM (via Vite proxy) + NativeTTS (mocked)
 *
 * Both NativeSTT and NativeTTS are mocked via addInitScript — the Web Speech
 * API is not available in headless Chromium. The Anthropic LLM is proxied
 * through Vite's dev server to avoid CORS and key exposure.
 *
 * This example features error simulation controls (Break Proxy, Fix Proxy,
 * Emit Agent Error) and auto-recovery via the `autoRecover: true` flag.
 *
 * Requires ANTHROPIC_API_KEY in the root .env file.
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
const PORT = 3004;
const BASE_URL = `http://localhost:${PORT}`;
const EXAMPLE_NAME = '04-error-recovery';

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

test.describe('04-error-recovery E2E', () => {
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
    await expect(page).toHaveTitle(/04.*Error.*Recovery/i);

    // Provider tagline
    await expect(page.locator('.tagline')).toContainText('Anthropic');

    // Controls
    await expect(page.locator('#btn-init')).toBeVisible();
    await expect(page.locator('#btn-start')).toBeVisible();
    await expect(page.locator('#btn-stop')).toBeVisible();

    // Error simulation controls
    await expect(page.locator('#btn-break-proxy')).toBeVisible();
    await expect(page.locator('#btn-fix-proxy')).toBeVisible();
    await expect(page.locator('#btn-emit-error')).toBeVisible();

    // Proxy status indicator
    await expect(page.locator('#proxy-status')).toBeVisible();
    await expect(page.locator('#proxy-status-text')).toContainText('Proxy: Healthy');

    // Content areas
    await expect(page.locator('#transcript')).toBeVisible();
    await expect(page.locator('#response')).toBeVisible();

    // Recovery status panel
    await expect(page.locator('#last-error')).toBeVisible();
    await expect(page.locator('#recovery-status')).toBeVisible();
    await expect(page.locator('#error-count')).toBeVisible();
    await expect(page.locator('#error-count')).toContainText('0');

    // Error event log
    await expect(page.locator('#error-log')).toBeVisible();
    await expect(page.locator('#btn-clear-log')).toBeVisible();

    // State label shows idle
    await expect(page.locator('#state-label')).toContainText('Idle');

    // No JS errors during initial load
    const jsErrors = diag.consoleErrors.filter(
      (e) => !e.text.includes('favicon') && !e.text.includes('404'),
    );
    expect(jsErrors).toHaveLength(0);

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

  test('error simulation: emit agent error increments error count and logs entry', async () => {
    const browser = await launchBrowser();
    const context = await createContext(browser, { baseURL: BASE_URL });
    const page = await context.newPage();

    // Inject both NativeSTT and NativeTTS mocks
    await injectNativeMocks(page);

    try {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // ── Initialize ──────────────────────────────────────────────
      const initBtn = page.locator('#btn-init');
      await initBtn.click();

      // Wait for ready state
      await page.waitForFunction(
        () =>
          document.querySelector('#state-label')?.textContent ===
          'Ready \u2014 click Start',
        {},
        { timeout: 15_000 },
      );

      // Verify initial error count is 0
      await expect(page.locator('#error-count')).toContainText('0');

      // ── Emit Agent Error ──────────────────────────────────────────
      const emitErrorBtn = page.locator('#btn-emit-error');
      await expect(emitErrorBtn).toBeEnabled();
      await emitErrorBtn.click();

      // Error count should increment to 1
      await page.waitForFunction(
        () => document.querySelector('#error-count')?.textContent === '1',
        {},
        { timeout: 5_000 },
      );

      // Last error should show the simulated error message
      await expect(page.locator('#last-error')).toContainText('Simulated agent error');

      // Recovery status should show "Error"
      await expect(page.locator('#recovery-status')).toContainText('Error');

      // Error log should have a log entry for the agent.error event
      const logRows = page.locator('#error-log .log-row');
      const logCount = await logRows.count();
      expect(logCount).toBeGreaterThan(0);

      // Verify at least one log entry contains "agent.error"
      const logTexts = await logRows.allTextContents();
      const hasAgentError = logTexts.some((text) => text.includes('agent.error'));
      expect(hasAgentError).toBe(true);

      // ── Emit a second error to verify count increments ──────────
      await emitErrorBtn.click();
      await page.waitForFunction(
        () => document.querySelector('#error-count')?.textContent === '2',
        {},
        { timeout: 5_000 },
      );
    } finally {
      await context.close();
      await browser.close();
    }
  });
});
