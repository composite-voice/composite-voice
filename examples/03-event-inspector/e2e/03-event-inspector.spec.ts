/**
 * E2E test for example 03-event-inspector.
 *
 * Provider stack: NativeSTT (mocked) + Anthropic LLM (via Vite proxy) + NativeTTS (mocked)
 *
 * Both NativeSTT and NativeTTS are mocked via addInitScript — the Web Speech
 * API is not available in headless Chromium. The Anthropic LLM is proxied
 * through Vite's dev server to avoid CORS and key exposure.
 *
 * This example adds an event timeline that records every SDK event with
 * timestamps, category colours, and data summaries. Filter chips toggle
 * visibility of event categories. LLM chunk events accumulate into a
 * single row that updates in-place.
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
const PORT = 3003;
const BASE_URL = `http://localhost:${PORT}`;
const EXAMPLE_NAME = '03-event-inspector';

const FILTER_CATEGORIES = [
  'transcription',
  'llm',
  'tts',
  'agent',
  'audio',
] as const;

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

test.describe('03-event-inspector E2E', () => {
  test('page renders without console errors and key UI elements present', async () => {
    const browser = await launchBrowser();
    const context = await createContext(browser, { baseURL: BASE_URL });
    const page = await context.newPage();

    await injectNativeMocks(page);

    const diag = collectDiagnostics(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // ── Controls ──────────────────────────────────────────────────────
    await expect(page.locator('#btn-init')).toBeVisible();
    await expect(page.locator('#btn-start')).toBeVisible();
    await expect(page.locator('#btn-stop')).toBeVisible();
    await expect(page.locator('#btn-clear')).toBeVisible();

    // Start and Stop should be disabled initially
    await expect(page.locator('#btn-start')).toBeDisabled();
    await expect(page.locator('#btn-stop')).toBeDisabled();

    // ── Content areas with placeholder text ───────────────────────────
    await expect(page.locator('#transcript')).toBeVisible();
    await expect(page.locator('#response')).toBeVisible();

    // ── Error box hidden initially ────────────────────────────────────
    const errorBox = page.locator('#error');
    await expect(errorBox).toBeAttached();
    const isVisible = await errorBox.isVisible();
    expect(isVisible).toBe(false);

    // ── State label shows Idle ────────────────────────────────────────
    await expect(page.locator('#state-label')).toContainText('Idle');

    // ── Event Inspector UI ────────────────────────────────────────────
    // Event counter starts at 0
    await expect(page.locator('#event-counter')).toHaveText('0 events');

    // All 5 filter chips present and checked
    for (const category of FILTER_CATEGORIES) {
      const chip = page.locator(`.filter-chip[data-category="${category}"]`);
      await expect(chip).toBeVisible();
      const checkbox = chip.locator('input[type="checkbox"]');
      await expect(checkbox).toBeChecked();
    }

    // Timeline container visible with empty state
    await expect(page.locator('#timeline')).toBeVisible();
    await expect(page.locator('.timeline-empty')).toBeVisible();

    // ── No JS errors during initial load ──────────────────────────────
    const jsErrors = diag.consoleErrors.filter(
      (e) => !e.text.includes('favicon') && !e.text.includes('404'),
    );
    expect(jsErrors).toHaveLength(0);

    await context.close();
    await browser.close();
  });

  test('event timeline populates with events during conversation round-trip', async () => {
    let diagnostics: PageDiagnostics | undefined;

    try {
      await withRetry(async (_attempt, timeoutMs) => {
        const browser = await launchBrowser();
        const context = await createContext(browser, { baseURL: BASE_URL });
        const page = await context.newPage();

        await injectNativeMocks(page);

        diagnostics = collectDiagnostics(page);

        try {
          await page.goto('/');
          await page.waitForLoadState('networkidle');

          // ── Initialize ──────────────────────────────────────────────
          const initBtn = page.locator('#btn-init');
          await expect(initBtn).toBeEnabled();
          await initBtn.click();

          await page.waitForFunction(
            () =>
              document.querySelector('#state-label')?.textContent ===
              'Ready \u2014 click Start',
            {},
            { timeout: 15_000 },
          );

          // After initialization, agent.ready should populate the timeline
          await page.waitForFunction(
            () => {
              const counter = document.querySelector('#event-counter');
              if (!counter) return false;
              const count = parseInt(counter.textContent ?? '0', 10);
              return count > 0;
            },
            {},
            { timeout: 10_000 },
          );

          // Empty state should be gone
          const emptyEl = page.locator('.timeline-empty');
          await expect(emptyEl).toHaveCount(0);

          // At least one event row should exist (agent.ready / agent.stateChange)
          const eventRows = page.locator('.event-row');
          const rowCount = await eventRows.count();
          expect(rowCount).toBeGreaterThan(0);

          // Verify event row structure: each row has time, type, data
          const firstRow = eventRows.first();
          await expect(firstRow.locator('.event-time')).toBeVisible();
          await expect(firstRow.locator('.event-type')).toBeVisible();
          await expect(firstRow.locator('.event-data')).toBeVisible();

          // ── Start listening ─────────────────────────────────────────
          const startBtn = page.locator('#btn-start');
          await expect(startBtn).toBeEnabled({ timeout: 5_000 });
          await startBtn.click();

          await page.waitForFunction(
            () =>
              document.querySelector('#state-label')?.textContent ===
              'Listening\u2026',
            {},
            { timeout: 10_000 },
          );

          // ── STT: verify transcript appears ──────────────────────────
          await waitForNonPlaceholder(
            page,
            '#transcript',
            timeoutMs - 20_000,
          );

          // ── LLM: wait for response ──────────────────────────────────
          await waitForNonPlaceholder(page, '#response', 30_000);

          // ── Verify timeline has events from multiple categories ──────
          // Wait for the full pipeline to generate events across categories
          await page.waitForFunction(
            () => {
              const rows = document.querySelectorAll('.event-row');
              const categories = new Set<string>();
              rows.forEach((row) => {
                const cat = (row as HTMLElement).dataset.category;
                if (cat) categories.add(cat);
              });
              // We expect at least transcription, llm, and agent events
              return (
                categories.has('transcription') &&
                categories.has('llm') &&
                categories.has('agent')
              );
            },
            {},
            { timeout: 30_000 },
          );

          // Event counter should reflect multiple events
          const counterText =
            (await page.locator('#event-counter').textContent()) ?? '';
          const totalEvents = parseInt(counterText, 10);
          expect(totalEvents).toBeGreaterThan(3);

          // ── Cleanup ─────────────────────────────────────────────────
          const stopBtn = page.locator('#btn-stop');
          if (await stopBtn.isEnabled()) {
            await stopBtn.click();
          }
        } finally {
          await context.close();
          await browser.close();
        }
      }, `${EXAMPLE_NAME} event timeline`);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      createGitHubIssue({
        title: `[E2E] ${EXAMPLE_NAME}: event timeline - ${error.message.slice(0, 60)}`,
        example: EXAMPLE_NAME,
        attempt: 2,
        error: error.stack ?? error.message,
        diagnostics,
        labels: ['e2e'],
      });
      throw err;
    }
  });

  test('full conversation round-trip: mocked STT → Anthropic LLM → mocked TTS → event timeline verified', async () => {
    let diagnostics: PageDiagnostics | undefined;

    try {
      await withRetry(async (_attempt, timeoutMs) => {
        const browser = await launchBrowser();
        const context = await createContext(browser, { baseURL: BASE_URL });
        const page = await context.newPage();

        await injectNativeMocks(page);

        diagnostics = collectDiagnostics(page);

        try {
          await page.goto('/');
          await page.waitForLoadState('networkidle');

          // ── Initialize ──────────────────────────────────────────────
          const initBtn = page.locator('#btn-init');
          await expect(initBtn).toBeEnabled();
          await initBtn.click();

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

          // ── Verify event timeline recorded the full pipeline ────────
          // Check that the event counter is non-trivial
          await page.waitForFunction(
            () => {
              const counter = document.querySelector('#event-counter');
              if (!counter) return false;
              const count = parseInt(counter.textContent ?? '0', 10);
              return count >= 5;
            },
            {},
            { timeout: 10_000 },
          );

          // Verify event rows exist for each pipeline stage
          const hasTranscription = await page.locator('.event-row[data-category="transcription"]').count();
          const hasLlm = await page.locator('.event-row[data-category="llm"]').count();
          const hasTts = await page.locator('.event-row[data-category="tts"]').count();
          const hasAgent = await page.locator('.event-row[data-category="agent"]').count();

          expect(hasTranscription).toBeGreaterThan(0);
          expect(hasLlm).toBeGreaterThan(0);
          expect(hasTts).toBeGreaterThan(0);
          expect(hasAgent).toBeGreaterThan(0);

          // ── Verify UI state returns to ready/listening ──────────────
          await page.waitForFunction(
            () => {
              const label =
                document.querySelector('#state-label')?.textContent ?? '';
              return label.includes('Ready') || label.includes('Listening');
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
