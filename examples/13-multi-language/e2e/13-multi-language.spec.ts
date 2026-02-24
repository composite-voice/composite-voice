/**
 * E2E test for example 13-multi-language.
 *
 * Provider stack: NativeSTT (mocked) + Anthropic LLM + NativeTTS (mocked)
 *
 * Both NativeSTT and NativeTTS are mocked via addInitScript — the Web Speech
 * API is not available in headless Chromium, so we inject mock SpeechRecognition
 * and speechSynthesis that fire realistic event sequences.
 *
 * This example features a language selector grid with six language cards
 * (English, Spanish, French, German, Japanese, Portuguese). Selecting a
 * language updates the STT language, LLM system prompt, and TTS voice.
 *
 * Required environment variables: ANTHROPIC_API_KEY
 */

import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const {
  launchBrowser,
  createContext,
  startDevServer,
  collectDiagnostics,
  withRetry,
  createGitHubIssue,
} = require('../../../tests/e2e/helpers') as typeof import('../../../tests/e2e/helpers');
const { injectNativeMocks } = require('../../../tests/e2e/mocks/inject') as typeof import('../../../tests/e2e/mocks/inject');

type DevServer = import('../../../tests/e2e/helpers').DevServer;
type PageDiagnostics = import('../../../tests/e2e/helpers').PageDiagnostics;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXAMPLE_DIR = path.resolve(__dirname, '..');
const PORT = 3013;
const BASE_URL = `http://localhost:${PORT}`;
const EXAMPLE_NAME = '13-multi-language';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let server: DevServer;

// Load root .env so the Anthropic API key is available to the Vite proxy.
// Vite's loadEnv() reads from process.cwd() (the example dir), which has no
// .env file. By loading the root .env into process.env, the key propagates
// through startDevServer's env: { ...process.env } to the Vite child process.
const ROOT_ENV = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(ROOT_ENV)) {
  const envContent = fs.readFileSync(ROOT_ENV, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

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

test.describe('13-multi-language E2E', () => {
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
    await expect(page).toHaveTitle(/13.*Multi.?Language/i);

    // Language selector — 6 language cards
    const languageCards = page.locator('.language-card');
    await expect(languageCards).toHaveCount(6);

    // Verify language names are present
    await expect(page.locator('.language-card .language-name').nth(0)).toContainText('English');
    await expect(page.locator('.language-card .language-name').nth(1)).toContainText('Spanish');
    await expect(page.locator('.language-card .language-name').nth(2)).toContainText('French');
    await expect(page.locator('.language-card .language-name').nth(3)).toContainText('German');
    await expect(page.locator('.language-card .language-name').nth(4)).toContainText('Japanese');
    await expect(page.locator('.language-card .language-name').nth(5)).toContainText('Portuguese');

    // First card (English) is active by default
    await expect(page.locator('.language-card').first()).toHaveClass(/active/);

    // Current language indicator
    await expect(page.locator('#current-lang-display')).toContainText('English (en-US)');

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
    const jsErrors = diag.consoleErrors.filter(
      (e) => !e.text.includes('favicon') && !e.text.includes('404'),
    );
    expect(jsErrors).toHaveLength(0);

    await context.close();
    await browser.close();
  });

  test('language selection UI is interactive', async () => {
    const browser = await launchBrowser();
    const context = await createContext(browser, { baseURL: BASE_URL });
    const page = await context.newPage();

    await injectNativeMocks(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // English is active by default
    await expect(page.locator('.language-card').first()).toHaveClass(/active/);
    await expect(page.locator('#current-lang-display')).toContainText('English (en-US)');

    // Click Spanish card — it should become active, English deactivated
    await page.locator('.language-card[data-lang="es-ES"]').click();
    await expect(page.locator('.language-card[data-lang="es-ES"]')).toHaveClass(/active/);
    await expect(page.locator('.language-card[data-lang="en-US"]')).not.toHaveClass(/active/);
    await expect(page.locator('#current-lang-display')).toContainText('Spanish (es-ES)');

    // Click French card — it should become active, Spanish deactivated
    await page.locator('.language-card[data-lang="fr-FR"]').click();
    await expect(page.locator('.language-card[data-lang="fr-FR"]')).toHaveClass(/active/);
    await expect(page.locator('.language-card[data-lang="es-ES"]')).not.toHaveClass(/active/);
    await expect(page.locator('#current-lang-display')).toContainText('French (fr-FR)');

    // Click Japanese card
    await page.locator('.language-card[data-lang="ja-JP"]').click();
    await expect(page.locator('.language-card[data-lang="ja-JP"]')).toHaveClass(/active/);
    await expect(page.locator('.language-card[data-lang="fr-FR"]')).not.toHaveClass(/active/);
    await expect(page.locator('#current-lang-display')).toContainText('Japanese (ja-JP)');

    // Click back to English
    await page.locator('.language-card[data-lang="en-US"]').click();
    await expect(page.locator('.language-card[data-lang="en-US"]')).toHaveClass(/active/);
    await expect(page.locator('.language-card[data-lang="ja-JP"]')).not.toHaveClass(/active/);
    await expect(page.locator('#current-lang-display')).toContainText('English (en-US)');

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
          // The NativeSTT mock fires "Hello, can you hear me?" after ~500ms
          const transcriptText = await waitForNonPlaceholder(
            page,
            '#transcript',
            timeoutMs - 20_000,
          );
          expect(transcriptText.length).toBeGreaterThan(0);

          // ── LLM: wait for AI response from Anthropic Claude ─────────
          const responseText = await waitForNonPlaceholder(
            page,
            '#response',
            30_000,
          );
          expect(responseText.length).toBeGreaterThan(0);

          // ── TTS: verify mocked TTS received the response text ───────
          // The NativeTTS mock captures utterances in window.__ttsMockUtterances.
          // Poll for utterances since TTS may fire slightly after LLM completes.
          await page.waitForFunction(
            () => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const u = (window as any).__ttsMockUtterances;
              return Array.isArray(u) && u.length > 0;
            },
            {},
            { timeout: 15_000 },
          );
          const ttsUtterances = await page.evaluate(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (window as any).__ttsMockUtterances ?? [];
          });
          expect(ttsUtterances.length).toBeGreaterThan(0);

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
