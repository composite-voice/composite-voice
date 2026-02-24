/**
 * E2E test for example 22-deepgram-options.
 *
 * Provider stack: DeepgramSTT (configurable) + Anthropic LLM (claude-haiku-4-6) + DeepgramTTS (aura-2)
 *
 * This test uses **real APIs** — no browser mocks are injected.
 * Chromium's fake audio capture flag feeds the spacewalk.wav fixture into
 * getUserMedia so Deepgram receives real audio data over its WebSocket.
 *
 * Required environment variables: ANTHROPIC_API_KEY, DEEPGRAM_API_KEY
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXAMPLE_DIR = path.resolve(__dirname, '..');
const PORT = 3022;
const BASE_URL = `http://localhost:${PORT}`;
const EXAMPLE_NAME = '22-deepgram-options';

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
        !text.includes('activity will appear here')
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

test.describe('22-deepgram-options E2E', () => {
  test('page renders without console errors and key UI elements present', async () => {
    const browser = await launchBrowser();
    const context = await createContext(browser, { baseURL: BASE_URL });
    const page = await context.newPage();
    const diag = collectDiagnostics(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check title
    await expect(page).toHaveTitle(/22.*Deepgram.*Options/i);

    // Provider badges
    await expect(page.locator('.badge.stt')).toContainText('Deepgram');
    await expect(page.locator('.badge.llm')).toContainText('Anthropic');
    await expect(page.locator('.badge.tts')).toContainText('Deepgram');

    // Config panel elements
    await expect(page.locator('.config-panel')).toBeVisible();
    await expect(page.locator('#cfg-model')).toBeVisible();
    await expect(page.locator('#cfg-language')).toBeVisible();
    await expect(page.locator('#cfg-endpointing')).toBeVisible();
    await expect(page.locator('#cfg-smart-format')).toBeAttached();
    await expect(page.locator('#cfg-punctuation')).toBeAttached();
    await expect(page.locator('#cfg-interim-results')).toBeAttached();
    await expect(page.locator('#cfg-vad-events')).toBeAttached();
    await expect(page.locator('#apply-btn')).toBeVisible();
    await expect(page.locator('#config-summary')).toBeVisible();

    // Controls
    await expect(page.locator('#init-btn')).toBeVisible();
    await expect(page.locator('#start-btn')).toBeVisible();
    await expect(page.locator('#stop-btn')).toBeVisible();
    await expect(page.locator('#dispose-btn')).toBeVisible();

    // Content areas
    await expect(page.locator('#transcript')).toBeVisible();
    await expect(page.locator('#response')).toBeVisible();
    await expect(page.locator('#tts-log')).toBeVisible();

    // Status area
    await expect(page.locator('#status-text')).toContainText('Idle');

    // No JS errors during initial load
    const jsErrors = diag.consoleErrors.filter(
      (e) => !e.text.includes('favicon') && !e.text.includes('404'),
    );
    expect(jsErrors).toHaveLength(0);

    await context.close();
    await browser.close();
  });

  test('configuration controls are interactive', async () => {
    const browser = await launchBrowser();
    const context = await createContext(browser, { baseURL: BASE_URL });
    const page = await context.newPage();

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // ── Model dropdown ────────────────────────────────────────────────
    const modelSelect = page.locator('#cfg-model');
    await expect(modelSelect).toHaveValue('nova-3');
    await modelSelect.selectOption('nova-2');
    await expect(modelSelect).toHaveValue('nova-2');

    // ── Language dropdown ─────────────────────────────────────────────
    const langSelect = page.locator('#cfg-language');
    await expect(langSelect).toHaveValue('en-US');
    await langSelect.selectOption('es');
    await expect(langSelect).toHaveValue('es');

    // ── Endpointing slider ────────────────────────────────────────────
    const slider = page.locator('#cfg-endpointing');
    const sliderDisplay = page.locator('#cfg-endpointing-value');
    await expect(sliderDisplay).toContainText('300 ms');

    await slider.fill('500');
    await slider.dispatchEvent('input');
    await expect(sliderDisplay).toContainText('500 ms');

    // ── Toggle switches ───────────────────────────────────────────────
    const smartFormat = page.locator('#cfg-smart-format');
    await expect(smartFormat).toBeChecked();
    await smartFormat.uncheck({ force: true });
    await expect(smartFormat).not.toBeChecked();

    const punctuation = page.locator('#cfg-punctuation');
    await expect(punctuation).toBeChecked();
    await punctuation.uncheck({ force: true });
    await expect(punctuation).not.toBeChecked();

    // ── Config summary updates ────────────────────────────────────────
    const summary = page.locator('#config-summary');
    const summaryText = await summary.textContent();
    expect(summaryText).toContain('"model": "nova-2"');
    expect(summaryText).toContain('"language": "es"');
    expect(summaryText).toContain('"endpointing": 500');
    expect(summaryText).toContain('"smartFormat": false');
    expect(summaryText).toContain('"punctuation": false');

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
          const transcriptText = await waitForNonPlaceholder(
            page,
            '#transcript',
            timeoutMs - 15_000,
          );
          expect(transcriptText.length).toBeGreaterThan(0);

          // ── LLM: wait for AI response ───────────────────────────────
          const responseText = await waitForNonPlaceholder(
            page,
            '#response',
            30_000,
          );
          expect(responseText.length).toBeGreaterThan(0);

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
        attempt: 2, // final attempt index
        error: error.stack ?? error.message,
        diagnostics,
        labels: ['e2e'],
      });
      throw err;
    }
  });
});
