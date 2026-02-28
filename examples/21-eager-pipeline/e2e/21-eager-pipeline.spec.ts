/**
 * E2E test for example 21-eager-pipeline.
 *
 * Provider stack: DeepgramSTT (nova-3) + Anthropic LLM (claude-haiku-4-5) + DeepgramTTS (aura-2)
 * Feature: eagerLLM — speculative LLM generation on Deepgram preflight signals
 *
 * This test uses **real APIs** — no browser mocks are injected.
 * Chromium's fake audio capture flag feeds the spacewalk.wav fixture into
 * getUserMedia so Deepgram receives real audio data over its WebSocket.
 *
 * Required environment variables: DEEPGRAM_API_KEY, ANTHROPIC_API_KEY
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXAMPLE_DIR = path.resolve(__dirname, '..');
const PORT = 3021;
const BASE_URL = `http://localhost:${PORT}`;
const EXAMPLE_NAME = '21-eager-pipeline';

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
 *
 * Example 21 uses "Waiting for ..." placeholders in each pipeline stage.
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
        !text.includes('Waiting for speech') &&
        !text.includes('Waiting for transcript') &&
        !text.includes('Waiting for response')
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

test.describe('21-eager-pipeline E2E', () => {
  test('page renders without console errors and key UI elements present', async () => {
    const browser = await launchBrowser();
    const context = await createContext(browser, { baseURL: BASE_URL });
    const page = await context.newPage();
    const diag = collectDiagnostics(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check title
    await expect(page).toHaveTitle(/21.*Eager.*Pipeline/i);

    // Provider badges
    await expect(page.locator('.badge.stt')).toContainText('Deepgram');
    await expect(page.locator('.badge.llm')).toContainText('Anthropic');
    await expect(page.locator('.badge.tts')).toContainText('Deepgram');
    await expect(page.locator('.badge.eager')).toContainText('Eager');

    // Status area
    await expect(page.locator('#status')).toBeVisible();
    await expect(page.locator('#status-text')).toBeVisible();

    // Controls
    await expect(page.locator('#init-btn')).toBeVisible();
    await expect(page.locator('#start-btn')).toBeVisible();
    await expect(page.locator('#stop-btn')).toBeVisible();
    await expect(page.locator('#dispose-btn')).toBeVisible();

    // Pipeline stage content areas
    await expect(page.locator('#stt-log')).toBeVisible();
    await expect(page.locator('#llm-log')).toBeVisible();
    await expect(page.locator('#tts-log')).toBeVisible();

    // Timing panel
    await expect(page.locator('.timing-panel')).toBeVisible();
    await expect(page.locator('#t-preflight')).toBeVisible();
    await expect(page.locator('#t-speech-final')).toBeVisible();
    await expect(page.locator('#t-llm-first-token')).toBeVisible();
    await expect(page.locator('#t-tts-start')).toBeVisible();

    // No JS errors during initial load
    expect(getJsErrors(diag)).toHaveLength(0);

    await context.close();
    await browser.close();
  });

  test('full conversation round-trip with real APIs', async () => {
    let diagnostics: PageDiagnostics | undefined;

    try {
      await withRetry(async (attempt, timeoutMs) => {
        const browser = await launchBrowser();
        const context = await createContext(browser, { baseURL: BASE_URL });
        const page = await context.newPage();
        diagnostics = collectDiagnostics(page);

        try {
          await page.goto('/');
          await page.waitForLoadState('networkidle');

          // ── Initialize ──────────────────────────────────────────────
          const initBtn = page.locator('#init-btn');
          await expect(initBtn).toBeEnabled();
          await initBtn.click();

          // Wait for status to become "Ready" (agent initialized)
          await page.waitForFunction(
            () => document.querySelector('#status-text')?.textContent === 'Ready',
            {},
            { timeout: 15_000 },
          );

          // ── Start listening ─────────────────────────────────────────
          const startBtn = page.locator('#start-btn');
          await expect(startBtn).toBeEnabled({ timeout: 5_000 });
          await startBtn.click();

          // Status should transition to "Listening..."
          await page.waitForFunction(
            () => document.querySelector('#status-text')?.textContent === 'Listening...',
            {},
            { timeout: 10_000 },
          );

          // ── STT: wait for transcription ─────────────────────────────
          // Deepgram processes the fake audio capture; transcription text
          // should appear in #stt-log (interim, preflight, or final).
          const sttText = await waitForNonPlaceholder(
            page,
            '#stt-log',
            timeoutMs - 15_000,
          );
          expect(sttText.length).toBeGreaterThan(0);

          // ── LLM: wait for AI response ───────────────────────────────
          const llmText = await waitForNonPlaceholder(
            page,
            '#llm-log',
            30_000,
          );
          expect(llmText.length).toBeGreaterThan(0);

          // ── TTS: verify TTS activity ────────────────────────────────
          const ttsText = await waitForNonPlaceholder(
            page,
            '#tts-log',
            30_000,
          );
          expect(ttsText.length).toBeGreaterThan(0);

          // ── Cleanup ─────────────────────────────────────────────────
          const stopBtn = page.locator('#stop-btn');
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
