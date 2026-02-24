/**
 * E2E test for example 11-nextjs-proxy.
 *
 * Provider stack: NativeSTT (mocked) + Anthropic LLM (via Next.js App Router proxy) + NativeTTS (mocked)
 *
 * Both NativeSTT and NativeTTS are mocked via addInitScript — the Web Speech
 * API is not available in headless Chromium. The Anthropic LLM is proxied
 * through Next.js `createNextJsProxy` at `/api/proxy/anthropic`.
 *
 * This example is a React (Next.js App Router) app, so DOM elements use
 * text-based selectors rather than element IDs.
 *
 * Requires ANTHROPIC_API_KEY in the environment.
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
const PORT = 3011;
const BASE_URL = `http://localhost:${PORT}`;
const EXAMPLE_NAME = '11-nextjs-proxy';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let server: DevServer;

test.beforeAll(async () => {
  // Next.js compiles on first request — allow extra startup time
  server = await startDevServer(EXAMPLE_DIR, PORT, 60_000);
});

test.afterAll(async () => {
  await server?.stop();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the content paragraph adjacent to a heading to change from its
 * placeholder value. React renders placeholder text inside a <span> within
 * the <p> when the state is empty; once real content arrives the <span> is
 * replaced with raw text.
 */
async function waitForContent(
  page: Page,
  headingText: string,
  timeoutMs: number,
): Promise<string> {
  await page.waitForFunction(
    ({ heading }) => {
      const headers = document.querySelectorAll('h2');
      for (const h of headers) {
        if (h.textContent?.includes(heading)) {
          const p = h.parentElement?.querySelector('p');
          if (p) {
            const text = p.textContent?.trim() ?? '';
            return (
              text.length > 0 &&
              !text.includes('Waiting for speech') &&
              !text.includes('Waiting for response')
            );
          }
        }
      }
      return false;
    },
    { heading: headingText },
    { timeout: timeoutMs },
  );

  return page.evaluate((heading) => {
    const headers = document.querySelectorAll('h2');
    for (const h of headers) {
      if (h.textContent?.includes(heading)) {
        return h.parentElement?.querySelector('p')?.textContent?.trim() ?? '';
      }
    }
    return '';
  }, headingText);
}

/**
 * Wait for the agent state indicator to show a specific state value.
 * The state is rendered as lowercase text (e.g. "idle", "ready") with
 * CSS text-transform: uppercase for display.
 */
async function waitForState(
  page: Page,
  targetState: string,
  timeoutMs: number,
): Promise<void> {
  await page.waitForFunction(
    ({ state }) => {
      // The state is displayed in a span with text-transform: uppercase
      // but the actual textContent is lowercase
      const spans = document.querySelectorAll('span');
      for (const span of spans) {
        if (span.textContent?.trim() === state) {
          return true;
        }
      }
      return false;
    },
    { state: targetState },
    { timeout: timeoutMs },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('11-nextjs-proxy E2E', () => {
  test('page renders without console errors and key UI elements present', async () => {
    const browser = await launchBrowser();
    const context = await createContext(browser, { baseURL: BASE_URL });
    const page = await context.newPage();
    const diag = collectDiagnostics(page);

    // Inject mocks before navigating (NativeSTT + NativeTTS)
    await injectNativeMocks(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for Next.js to compile and render the page
    await expect(page.locator('h1')).toBeVisible({ timeout: 30_000 });

    // Check page heading
    await expect(page.locator('h1')).toContainText('Next.js Proxy');

    // Provider subtitle
    await expect(page.getByText('NativeSTT + AnthropicLLM')).toBeVisible();

    // State indicator — starts as "idle"
    await expect(page.getByText('idle')).toBeVisible();

    // Control buttons
    await expect(page.getByRole('button', { name: 'Initialize' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();

    // Button states — Initialize enabled, others disabled
    await expect(page.getByRole('button', { name: 'Initialize' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Start' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeDisabled();

    // Content area headings
    await expect(page.locator('h2').filter({ hasText: 'Transcript' })).toBeVisible();
    await expect(page.locator('h2').filter({ hasText: 'Response' })).toBeVisible();

    // Placeholder text in content areas
    await expect(page.getByText('Waiting for speech...')).toBeVisible();
    await expect(page.getByText('Waiting for response...')).toBeVisible();

    // No JS errors during initial load (filter Next.js dev noise and favicon)
    expect(getJsErrors(diag, ['hydration', 'Warning:'])).toHaveLength(0);

    await context.close();
    await browser.close();
  });

  test('full conversation round-trip via Next.js proxy', async () => {
    let diagnostics: PageDiagnostics | undefined;

    try {
      await withRetry(async (attempt, timeoutMs) => {
        const browser = await launchBrowser();
        const context = await createContext(browser, { baseURL: BASE_URL });
        const page = await context.newPage();
        diagnostics = collectDiagnostics(page);

        // Inject both NativeSTT and NativeTTS mocks
        await injectNativeMocks(page);

        try {
          await page.goto('/');
          await page.waitForLoadState('networkidle');

          // Wait for Next.js page compilation/render
          await expect(page.locator('h1')).toBeVisible({ timeout: 30_000 });

          // ── Initialize ──────────────────────────────────────────────
          const initBtn = page.getByRole('button', { name: 'Initialize' });
          await expect(initBtn).toBeEnabled();
          await initBtn.click();

          // Wait for state to become "ready" (agent initialized)
          await waitForState(page, 'ready', 15_000);

          // ── Start listening ─────────────────────────────────────────
          const startBtn = page.getByRole('button', { name: 'Start' });
          await expect(startBtn).toBeEnabled({ timeout: 5_000 });
          await startBtn.click();

          // State should transition to "listening"
          await waitForState(page, 'listening', 10_000);

          // ── STT: wait for transcript (from mock) ────────────────────
          const transcriptText = await waitForContent(
            page,
            'Transcript',
            timeoutMs - 15_000,
          );
          expect(transcriptText.length).toBeGreaterThan(0);

          // ── LLM: wait for AI response (via Next.js proxy → Anthropic)
          const responseText = await waitForContent(
            page,
            'Response',
            30_000,
          );
          expect(responseText.length).toBeGreaterThan(0);

          // ── TTS: verify mock utterances were produced ───────────────
          const utteranceCount = await page.waitForFunction(
            () => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const utterances = (window as any).__ttsMockUtterances;
              return Array.isArray(utterances) && utterances.length > 0
                ? utterances.length
                : false;
            },
            {},
            { timeout: 15_000 },
          );
          expect(await utteranceCount.jsonValue()).toBeGreaterThan(0);

          // ── Cleanup ─────────────────────────────────────────────────
          const stopBtn = page.getByRole('button', { name: 'Stop' });
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
        attempt: 2, // final attempt index
        error: error.stack ?? error.message,
        diagnostics,
        labels: ['e2e'],
      });
      throw err;
    }
  });
});
