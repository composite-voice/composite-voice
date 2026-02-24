/**
 * E2E test for example 01-conversation-history.
 *
 * Provider stack: NativeSTT (mocked) + Anthropic LLM (via Vite proxy) + NativeTTS (mocked)
 *
 * Both NativeSTT and NativeTTS are mocked via addInitScript — the Web Speech
 * API is not available in headless Chromium. The Anthropic LLM is proxied
 * through Vite's dev server to avoid CORS and key exposure.
 *
 * This example adds multi-turn conversation history with dynamic message
 * bubbles, turn counting, and a clear-history button on top of the base
 * voice-agent pattern.
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
const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;
const EXAMPLE_NAME = '01-conversation-history';

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
 * Wait for a dynamically-created message bubble to appear in the conversation.
 * Unlike `waitForNonPlaceholder`, message bubbles don't exist at page load —
 * they're created by event handlers as the conversation progresses.
 */
async function waitForMessageBubble(
  page: Page,
  role: 'user' | 'assistant',
  timeoutMs: number,
): Promise<string> {
  await page.waitForFunction(
    (r: string) => {
      const bubble = document.querySelector(`.message.${r} .bubble`);
      if (!bubble) return false;
      const text = bubble.textContent?.trim() ?? '';
      return text.length > 0;
    },
    role,
    { timeout: timeoutMs },
  );
  const bubble = page.locator(`.message.${role} .bubble`).first();
  return (await bubble.textContent()) ?? '';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('01-conversation-history E2E', () => {
  test('page renders without console errors and key UI elements present', async () => {
    const browser = await launchBrowser();
    const context = await createContext(browser, { baseURL: BASE_URL });
    const page = await context.newPage();

    // Inject both NativeSTT and NativeTTS mocks (must happen before navigation)
    await injectNativeMocks(page);

    const diag = collectDiagnostics(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // ── Badges ──────────────────────────────────────────────────────
    const badges = page.locator('.stack-badges .badge');
    await expect(badges).toHaveCount(4);
    await expect(page.locator('.badge.stt')).toContainText('NativeSTT');
    await expect(page.locator('.badge.llm')).toContainText('Anthropic');
    await expect(page.locator('.badge.tts')).toContainText('NativeTTS');
    await expect(page.locator('.badge.feat')).toContainText('Multi-turn history');

    // ── Status area ─────────────────────────────────────────────────
    await expect(page.locator('#status')).toBeVisible();
    await expect(page.locator('#status-text')).toContainText('Idle');

    // ── Controls ────────────────────────────────────────────────────
    await expect(page.locator('#init-btn')).toBeVisible();
    await expect(page.locator('#init-btn')).toBeEnabled();
    await expect(page.locator('#start-btn')).toBeVisible();
    await expect(page.locator('#start-btn')).toBeDisabled();
    await expect(page.locator('#stop-btn')).toBeVisible();
    await expect(page.locator('#stop-btn')).toBeDisabled();
    await expect(page.locator('#clear-btn')).toBeVisible();
    await expect(page.locator('#clear-btn')).toBeDisabled();
    await expect(page.locator('#dispose-btn')).toBeVisible();
    await expect(page.locator('#dispose-btn')).toBeDisabled();

    // ── Interim bar ─────────────────────────────────────────────────
    await expect(page.locator('#interim-bar')).toBeVisible();

    // ── Conversation area with placeholder ──────────────────────────
    await expect(page.locator('#conversation')).toBeVisible();
    await expect(page.locator('#messages .placeholder')).toContainText(
      'Your conversation will appear here',
    );

    // ── Turn count info cards ───────────────────────────────────────
    await expect(page.locator('#turn-count')).toContainText('0');
    await expect(page.locator('#turn-badge')).toContainText('0 turns');

    // ── Error banner hidden ─────────────────────────────────────────
    const errorBanner = page.locator('#error-banner');
    await expect(errorBanner).toBeAttached();
    const isVisible = await errorBanner.isVisible();
    expect(isVisible).toBe(false);

    // ── No JS errors during initial load ────────────────────────────
    expect(getJsErrors(diag)).toHaveLength(0);

    await context.close();
    await browser.close();
  });

  test('full conversation round-trip: mocked STT → Anthropic LLM → mocked TTS → conversation updated', async () => {
    let diagnostics: PageDiagnostics | undefined;

    try {
      await withRetry(async (_attempt, timeoutMs) => {
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
          const initBtn = page.locator('#init-btn');
          await expect(initBtn).toBeEnabled();
          await initBtn.click();

          // Wait for status to become "Ready"
          await page.waitForFunction(
            () => {
              const text = document.querySelector('#status-text')?.textContent ?? '';
              return text === 'Ready';
            },
            {},
            { timeout: 15_000 },
          );

          // ── Start listening ─────────────────────────────────────────
          const startBtn = page.locator('#start-btn');
          await expect(startBtn).toBeEnabled({ timeout: 5_000 });
          await startBtn.click();

          // Status should transition to "Listening..."
          await page.waitForFunction(
            () => {
              const text = document.querySelector('#status-text')?.textContent ?? '';
              return text === 'Listening...';
            },
            {},
            { timeout: 10_000 },
          );

          // ── STT: verify user message bubble appears ─────────────────
          const userText = await waitForMessageBubble(
            page,
            'user',
            timeoutMs - 20_000,
          );
          expect(userText.length).toBeGreaterThan(0);

          // ── LLM: verify assistant message bubble appears ────────────
          const assistantText = await waitForMessageBubble(
            page,
            'assistant',
            30_000,
          );
          expect(assistantText.length).toBeGreaterThan(0);

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

          // ── Turn count incremented ──────────────────────────────────
          await page.waitForFunction(
            () => {
              const el = document.querySelector('#turn-count');
              const count = parseInt(el?.textContent ?? '0', 10);
              return count >= 1;
            },
            {},
            { timeout: 10_000 },
          );

          // ── State returns to Ready or Listening after round-trip ────
          await page.waitForFunction(
            () => {
              const text = document.querySelector('#status-text')?.textContent ?? '';
              return text === 'Ready' || text === 'Listening...';
            },
            {},
            { timeout: 15_000 },
          );

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
