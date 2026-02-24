/**
 * Mock injection helpers for Playwright E2E tests.
 *
 * Uses `page.addInitScript()` to inject NativeSTT and NativeTTS mocks into
 * the browser context *before* any page script runs. This is necessary
 * because the SDK reads `window.SpeechRecognition` / `window.speechSynthesis`
 * during provider initialization — the mocks must be in place first.
 *
 * Usage:
 *   import { injectNativeMocks, injectNativeSTTMock, injectNativeTTSMock } from './mocks/inject';
 *
 *   // Inject both STT and TTS mocks (most common for NativeSTT + NativeTTS examples)
 *   const page = await context.newPage();
 *   await injectNativeMocks(page);
 *   await page.goto(url);
 *
 *   // Or inject only one:
 *   await injectNativeSTTMock(page);
 *   await injectNativeTTSMock(page);
 */

import type { Page } from '@playwright/test';
import { installNativeSTTMock } from './native-stt';
import { installNativeTTSMock } from './native-tts';

/** Options for configuring the STT mock before injection */
export interface STTMockOptions {
  /** Transcript returned by the mock. Default: "Hello, can you hear me?" */
  transcript?: string;
  /** Delay (ms) before firing the result event sequence. Default: 500 */
  delayMs?: number;
  /** Confidence score (0-1). Default: 0.95 */
  confidence?: number;
}

/** Options for configuring the TTS mock before injection */
export interface TTSMockOptions {
  /** Delay (ms) between onstart and onend. Default: 100 */
  speakDelayMs?: number;
}

/**
 * Inject the NativeSTT mock into a Playwright page.
 *
 * Must be called *before* navigating the page. The mock replaces
 * `window.SpeechRecognition` and `window.webkitSpeechRecognition` so
 * NativeSTT will use the mock instead of the real browser API.
 */
export async function injectNativeSTTMock(page: Page, options?: STTMockOptions): Promise<void> {
  // Set config before the mock script runs so it can read it
  if (options) {
    await page.addInitScript((config) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__sttMockConfig = config;
    }, options);
  }

  // Install the mock — Playwright serialises this function and evaluates it in
  // the browser context. TypeScript annotations are stripped during compilation.
  await page.addInitScript(installNativeSTTMock);
}

/**
 * Inject the NativeTTS mock into a Playwright page.
 *
 * Must be called *before* navigating the page. The mock replaces
 * `window.speechSynthesis` so NativeTTS will use the mock instead of
 * the real browser API.
 */
export async function injectNativeTTSMock(page: Page, options?: TTSMockOptions): Promise<void> {
  if (options) {
    await page.addInitScript((config) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__ttsMockConfig = config;
    }, options);
  }

  await page.addInitScript(installNativeTTSMock);
}

/**
 * Inject both NativeSTT and NativeTTS mocks into a Playwright page.
 *
 * Convenience wrapper for examples that use both Native providers (e.g.
 * 00-minimal-voice-agent, 01-conversation-history, etc.).
 */
export async function injectNativeMocks(
  page: Page,
  options?: { stt?: STTMockOptions; tts?: TTSMockOptions },
): Promise<void> {
  await injectNativeSTTMock(page, options?.stt);
  await injectNativeTTSMock(page, options?.tts);
}
