/**
 * E2E test for example 10-proxy-server.
 *
 * Provider stack: DeepgramSTT (nova-3) + Anthropic LLM (claude-haiku-4-6) + DeepgramTTS (aura-2)
 * All routed through a Vite dev proxy — no API keys in the browser.
 *
 * This test uses **real APIs** via the proxy — no browser mocks are injected.
 * Chromium's fake audio capture flag feeds the spacewalk.wav fixture into
 * getUserMedia so Deepgram receives real audio data over its WebSocket.
 *
 * Required environment variables: DEEPGRAM_API_KEY, ANTHROPIC_API_KEY
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
const PORT = 3010;
const BASE_URL = `http://localhost:${PORT}`;
const EXAMPLE_NAME = '10-proxy-server';

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
 * indicating the pipeline has produced output through the proxy.
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

test.describe('10-proxy-server E2E', () => {
  test('page renders without console errors and key UI elements present', async () => {
    const browser = await launchBrowser();
    const context = await createContext(browser, { baseURL: BASE_URL });
    const page = await context.newPage();
    const diag = collectDiagnostics(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check title
    await expect(page).toHaveTitle(/10.*Proxy.*Server/i);

    // Provider badges (including proxy badge)
    await expect(page.locator('.badge.proxy')).toContainText('proxy');
    await expect(page.locator('.badge.stt')).toContainText('Deepgram');
    await expect(page.locator('.badge.llm')).toContainText('Anthropic');
    await expect(page.locator('.badge.tts')).toContainText('Deepgram');

    // Proxy info section
    await expect(page.locator('.proxy-info')).toBeVisible();

    // Status area
    await expect(page.locator('#status')).toBeVisible();
    await expect(page.locator('#status-text')).toBeVisible();

    // Controls
    await expect(page.locator('#init-btn')).toBeVisible();
    await expect(page.locator('#start-btn')).toBeVisible();
    await expect(page.locator('#stop-btn')).toBeVisible();
    await expect(page.locator('#dispose-btn')).toBeVisible();

    // Content areas
    await expect(page.locator('#transcript')).toBeVisible();
    await expect(page.locator('#response')).toBeVisible();
    await expect(page.locator('#tts-log')).toBeVisible();

    // Error banner exists (hidden by default)
    await expect(page.locator('#error-banner')).toBeAttached();

    // No JS errors during initial load
    const jsErrors = diag.consoleErrors.filter(
      (e) => !e.text.includes('favicon') && !e.text.includes('404'),
    );
    expect(jsErrors).toHaveLength(0);

    await context.close();
    await browser.close();
  });

  test('full conversation round-trip via proxy with real APIs', async () => {
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

          // Wait for status to become "Ready" (agent initialized via proxy)
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

          // ── STT: wait for transcription (via proxy → Deepgram) ────
          const transcriptText = await waitForNonPlaceholder(
            page,
            '#transcript',
            timeoutMs - 15_000,
          );
          expect(transcriptText.length).toBeGreaterThan(0);

          // ── LLM: wait for AI response (via proxy → Anthropic) ─────
          const responseText = await waitForNonPlaceholder(
            page,
            '#response',
            30_000,
          );
          expect(responseText.length).toBeGreaterThan(0);

          // ── TTS: verify TTS activity (via proxy → Deepgram) ───────
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
