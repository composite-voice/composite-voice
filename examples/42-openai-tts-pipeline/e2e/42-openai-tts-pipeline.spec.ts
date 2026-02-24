/**
 * E2E test for example 42-openai-tts-pipeline.
 *
 * Provider stack: NativeSTT (mocked) + OpenAI LLM (gpt-4o-mini) + OpenAI TTS (tts-1)
 *
 * NativeSTT is mocked via addInitScript — the Web Speech API is not available in
 * headless Chromium, so we inject a mock SpeechRecognition that fires a realistic
 * event sequence on start().
 *
 * OpenAI TTS uses a REST API through the Vite proxy (/proxy/openai → api.openai.com),
 * so we do NOT mock TTS. Instead we verify TTS by monitoring network requests to the
 * OpenAI audio/speech endpoint.
 *
 * Required environment variables: OPENAI_API_KEY
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
import { injectNativeSTTMock } from '../../../tests/e2e/mocks/inject';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXAMPLE_DIR = path.resolve(__dirname, '..');
const PORT = 3042;
const BASE_URL = `http://localhost:${PORT}`;
const EXAMPLE_NAME = '42-openai-tts-pipeline';

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

test.describe('42-openai-tts-pipeline E2E', () => {
  test('page renders without console errors and key UI elements present', async () => {
    const browser = await launchBrowser();
    const context = await createContext(browser, { baseURL: BASE_URL });
    const page = await context.newPage();

    // Inject NativeSTT mock (must happen before navigation)
    await injectNativeSTTMock(page);

    const diag = collectDiagnostics(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check title
    await expect(page).toHaveTitle(/42.*OpenAI.*TTS/i);

    // Provider badges
    const badges = page.locator('.badge');
    await expect(badges).toHaveCount(2);
    await expect(badges.nth(0)).toContainText('OpenAI');
    await expect(badges.nth(1)).toContainText('OpenAI');

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
    expect(getJsErrors(diag)).toHaveLength(0);

    await context.close();
    await browser.close();
  });

  test('conversation round-trip: mocked STT → OpenAI LLM → OpenAI TTS', async () => {
    let diagnostics: PageDiagnostics | undefined;

    try {
      await withRetry(async (attempt, timeoutMs) => {
        const browser = await launchBrowser();
        const context = await createContext(browser, { baseURL: BASE_URL });
        const page = await context.newPage();

        // Inject NativeSTT mock only — OpenAI TTS uses REST, not SpeechSynthesis
        await injectNativeSTTMock(page);

        diagnostics = collectDiagnostics(page);

        // Track network requests to OpenAI TTS endpoint
        const ttsRequests: Array<{ url: string; status: number }> = [];
        page.on('response', (response) => {
          const url = response.url();
          if (url.includes('/v1/audio/speech')) {
            ttsRequests.push({ url, status: response.status() });
          }
        });

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
              'Ready — click Start',
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
              'Listening…',
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

          // ── LLM: wait for AI response from OpenAI GPT ───────────────
          const responseText = await waitForNonPlaceholder(
            page,
            '#response',
            30_000,
          );
          expect(responseText.length).toBeGreaterThan(0);

          // ── TTS: verify OpenAI TTS REST API call was made ────────────
          // Wait for the TTS request to complete (may take a moment after LLM finishes)
          await page.waitForFunction(
            () => {
              // The speaking state indicates TTS audio is playing
              const label = document.querySelector('#state-label')?.textContent;
              return (
                label === 'Speaking…' ||
                // If TTS already finished, state will have moved on
                label === 'Ready — click Start' ||
                label === 'Listening…'
              );
            },
            {},
            { timeout: 30_000 },
          );

          // Verify the TTS REST request was actually made to the OpenAI endpoint
          expect(ttsRequests.length).toBeGreaterThan(0);
          expect(ttsRequests[0]!.status).toBe(200);

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
