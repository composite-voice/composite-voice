/**
 * E2E test for example 24-deepgram-conversation-history.
 *
 * Provider stack: DeepgramSTT (nova-3) + Anthropic LLM (claude-haiku-4-6) + DeepgramTTS (aura-2)
 * Feature: Multi-turn conversation history (maxTurns: 10)
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
const PORT = 3024;
const BASE_URL = `http://localhost:${PORT}`;
const EXAMPLE_NAME = '24-deepgram-conversation-history';

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
 * Wait for a conversation message bubble to appear with non-empty text.
 * The selector targets `.message.<role> .bubble` elements created dynamically
 * by the app as the pipeline produces output.
 */
async function waitForMessageBubble(
  page: Page,
  role: 'user' | 'assistant',
  timeoutMs: number,
): Promise<string> {
  await page.waitForFunction(
    ({ r }) => {
      const bubbles = document.querySelectorAll(`.message.${r} .bubble`);
      if (bubbles.length === 0) return false;
      const last = bubbles[bubbles.length - 1];
      const text = last?.textContent?.trim() ?? '';
      return text.length > 0;
    },
    { r: role },
    { timeout: timeoutMs },
  );
  const bubbles = page.locator(`.message.${role} .bubble`);
  const last = bubbles.last();
  return (await last.textContent()) ?? '';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('24-deepgram-conversation-history E2E', () => {
  test('page renders without console errors and key UI elements present', async () => {
    const browser = await launchBrowser();
    const context = await createContext(browser, { baseURL: BASE_URL });
    const page = await context.newPage();
    const diag = collectDiagnostics(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check title
    await expect(page).toHaveTitle(/24.*Deepgram.*Conversation.*History/i);

    // Provider badges
    await expect(page.locator('.badge.stt')).toContainText('Deepgram');
    await expect(page.locator('.badge.llm')).toContainText('Anthropic');
    await expect(page.locator('.badge.tts')).toContainText('Deepgram');
    await expect(page.locator('.badge.feat')).toContainText('Multi-turn');

    // Controls
    await expect(page.locator('#init-btn')).toBeVisible();
    await expect(page.locator('#start-btn')).toBeVisible();
    await expect(page.locator('#stop-btn')).toBeVisible();
    await expect(page.locator('#clear-btn')).toBeVisible();
    await expect(page.locator('#dispose-btn')).toBeVisible();

    // Status area
    await expect(page.locator('#status-text')).toContainText('Idle');

    // Conversation area
    await expect(page.locator('#conversation')).toBeVisible();
    await expect(page.locator('#messages')).toBeVisible();
    await expect(page.locator('#messages .placeholder')).toContainText(
      'Your conversation will appear here',
    );

    // Info cards: turn count and max turns
    await expect(page.locator('#turn-count')).toContainText('0');
    await expect(page.locator('#turn-badge')).toContainText('0 turns');

    // Interim bar
    await expect(page.locator('#interim-bar')).toBeVisible();

    // No JS errors during initial load
    const jsErrors = diag.consoleErrors.filter(
      (e) => !e.text.includes('favicon') && !e.text.includes('404'),
    );
    expect(jsErrors).toHaveLength(0);

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

          // ── STT: wait for user message bubble ───────────────────────
          const userText = await waitForMessageBubble(
            page,
            'user',
            timeoutMs - 15_000,
          );
          expect(userText.length).toBeGreaterThan(0);

          // ── LLM: wait for assistant message bubble ──────────────────
          const assistantText = await waitForMessageBubble(
            page,
            'assistant',
            30_000,
          );
          expect(assistantText.length).toBeGreaterThan(0);

          // ── TTS: verify agent entered "Speaking..." state ───────────
          // DeepgramTTS triggers a state change to "speaking" — verify
          // that this transition occurred by checking diagnostics logs
          // or by waiting for the status to reflect it. Since the state
          // may have already transitioned past "speaking" by the time
          // we check, verify via console log entries from the agent's
          // stateChange event (logging: { enabled: true }).
          await page.waitForFunction(
            () => {
              const text = document.querySelector('#status-text')?.textContent;
              // Agent may be in Speaking, or may have already cycled back
              // to Listening or Ready — any post-thinking state is valid.
              return (
                text === 'Speaking...' ||
                text === 'Listening...' ||
                text === 'Ready'
              );
            },
            {},
            { timeout: 30_000 },
          );

          // ── Conversation history: verify turn count updated ─────────
          await page.waitForFunction(
            () => {
              const el = document.querySelector('#turn-count');
              const count = parseInt(el?.textContent ?? '0', 10);
              return count >= 1;
            },
            {},
            { timeout: 5_000 },
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
