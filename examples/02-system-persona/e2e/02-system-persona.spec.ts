/**
 * E2E test for example 02-system-persona.
 *
 * Provider stack: NativeSTT (mocked) + Anthropic LLM (via Vite proxy) + NativeTTS (mocked)
 *
 * Both NativeSTT and NativeTTS are mocked via addInitScript — the Web Speech
 * API is not available in headless Chromium. The Anthropic LLM is proxied
 * through Vite's dev server to avoid CORS and key exposure.
 *
 * This example adds a persona selector grid with five personalities that
 * inject different system prompts into the Anthropic LLM. Switching personas
 * disposes and reinitializes the agent with the new prompt.
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
const PORT = 3002;
const BASE_URL = `http://localhost:${PORT}`;
const EXAMPLE_NAME = '02-system-persona';

const PERSONA_KEYS = ['assistant', 'tech', 'storyteller', 'coach', 'pirate'] as const;

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

test.describe('02-system-persona E2E', () => {
  test('page renders without console errors and key UI elements present', async () => {
    const browser = await launchBrowser();
    const context = await createContext(browser, { baseURL: BASE_URL });
    const page = await context.newPage();

    // Inject both NativeSTT and NativeTTS mocks (must happen before navigation)
    await injectNativeMocks(page);

    const diag = collectDiagnostics(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // ── Persona grid ──────────────────────────────────────────────────
    const personaGrid = page.locator('#persona-grid');
    await expect(personaGrid).toBeVisible();

    // All 5 persona cards render with correct data-persona attributes
    const personaCards = page.locator('.persona-card');
    await expect(personaCards).toHaveCount(5);

    for (const key of PERSONA_KEYS) {
      await expect(page.locator(`.persona-card[data-persona="${key}"]`)).toBeVisible();
    }

    // Default selection: "assistant" card has .selected class
    const assistantCard = page.locator('.persona-card[data-persona="assistant"]');
    await expect(assistantCard).toHaveClass(/selected/);

    // No other card has .selected
    for (const key of PERSONA_KEYS.filter((k) => k !== 'assistant')) {
      const card = page.locator(`.persona-card[data-persona="${key}"]`);
      await expect(card).not.toHaveClass(/selected/);
    }

    // ── Controls ──────────────────────────────────────────────────────
    await expect(page.locator('#btn-init')).toBeVisible();
    await expect(page.locator('#btn-start')).toBeVisible();
    await expect(page.locator('#btn-stop')).toBeVisible();

    // Start and Stop should be disabled initially
    await expect(page.locator('#btn-start')).toBeDisabled();
    await expect(page.locator('#btn-stop')).toBeDisabled();

    // ── Content areas with placeholder text ───────────────────────────
    await expect(page.locator('#transcript')).toBeVisible();
    await expect(page.locator('#response')).toBeVisible();

    // ── State label shows Idle ────────────────────────────────────────
    await expect(page.locator('#state-label')).toContainText('Idle');

    // ── Active persona label is empty before initialization ───────────
    const activeLabel = page.locator('#active-persona-label');
    await expect(activeLabel).toBeAttached();
    const labelText = await activeLabel.textContent();
    expect(labelText?.trim()).toBe('');

    // ── Error box should be hidden initially ──────────────────────────
    const errorBox = page.locator('#error');
    await expect(errorBox).toBeAttached();
    const isVisible = await errorBox.isVisible();
    expect(isVisible).toBe(false);

    // ── No JS errors during initial load ──────────────────────────────
    expect(getJsErrors(diag)).toHaveLength(0);

    await context.close();
    await browser.close();
  });

  test('persona selection toggles .selected class across cards', async () => {
    const browser = await launchBrowser();
    const context = await createContext(browser, { baseURL: BASE_URL });
    const page = await context.newPage();

    await injectNativeMocks(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Default: assistant is selected
    await expect(page.locator('.persona-card[data-persona="assistant"]')).toHaveClass(/selected/);

    // Click through each persona and verify selection transfers
    const cycle: Array<(typeof PERSONA_KEYS)[number]> = ['tech', 'storyteller', 'coach', 'pirate', 'assistant'];
    for (const targetKey of cycle) {
      const targetCard = page.locator(`.persona-card[data-persona="${targetKey}"]`);
      await targetCard.click();

      // Target card should gain .selected
      await expect(targetCard).toHaveClass(/selected/);

      // All other cards should NOT have .selected
      for (const key of PERSONA_KEYS.filter((k) => k !== targetKey)) {
        await expect(page.locator(`.persona-card[data-persona="${key}"]`)).not.toHaveClass(/selected/);
      }
    }

    await context.close();
    await browser.close();
  });

  test('full conversation round-trip: mocked STT \u2192 Anthropic LLM \u2192 mocked TTS \u2192 UI updated', async () => {
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

          // ── Verify active persona label updated ─────────────────────
          await expect(page.locator('#active-persona-label')).toContainText(
            'Active: Helpful Assistant',
            { timeout: 5_000 },
          );

          // ── Start listening ─────────────────────────────────────────
          const startBtn = page.locator('#btn-start');
          await expect(startBtn).toBeEnabled({ timeout: 5_000 });
          await startBtn.click();

          // Status should transition to "Listening\u2026"
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

          // ── Verify UI state updated after full round-trip ───────────
          // After TTS completes, state should return to ready or listening
          await page.waitForFunction(
            () => {
              const label = document.querySelector('#state-label')?.textContent ?? '';
              return (
                label.includes('Ready') ||
                label.includes('Listening')
              );
            },
            {},
            { timeout: 15_000 },
          );

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
