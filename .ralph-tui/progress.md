# Ralph Progress Log

This file tracks progress across iterations. Agents update this file
after each iteration and it's included in prompts for context.

## Codebase Patterns (Study These First)

- **Mock injection pattern for Playwright**: Browser mocks (STT/TTS) are exported as self-contained install functions from `tests/e2e/mocks/*.ts`. The `inject.ts` helper passes them to `page.addInitScript()` which serialises them for browser evaluation. Config is injected via a separate `addInitScript()` call before the mock script so the mock can read `window.__xxxMockConfig` during its execution.
- **pnpm workspace flags**: Use `-w` or `--workspace-root` flag when adding dependencies to the root package.json (e.g., `pnpm add -wD @playwright/test`).
- **TypeScript strict mode casts for window**: In browser-evaluated code, use `window as any` (with eslint-disable comment) instead of `window as Record<string, unknown>` — the latter fails strict type checking because `Window` doesn't have an index signature.

---

## 2026-02-24 - composite-voice-ekb.1
- **What was implemented**: Shared Playwright E2E test infrastructure
- **Files changed**:
  - `package.json` — added `@playwright/test` devDependency
  - `pnpm-lock.yaml` — updated lockfile
  - `.gitignore` — added `tests/fixtures/` for binary fixture exclusion
  - `tests/fixtures/spacewalk.wav` — downloaded audio fixture (16-bit PCM, mono, 44.1kHz)
  - `tests/e2e/helpers.ts` — shared utility module with:
    - `launchBrowser()` — Chromium with fake audio capture flags
    - `createContext()` — browser context with microphone permissions
    - `startDevServer()` / `DevServer` — example dev server lifecycle management
    - `collectDiagnostics()` — console log/error and network failure collection
    - `withRetry()` — escalating timeout retry wrapper (60s → 90s → 120s)
    - `createGitHubIssue()` — structured issue creation via `gh` CLI
  - `tests/e2e/mocks/native-stt.ts` — NativeSTT mock (SpeechRecognition) with realistic event sequence, configurable transcript/delay/confidence, call tracking via `window.__sttMockCalls`
  - `tests/e2e/mocks/native-tts.ts` — NativeTTS mock (speechSynthesis) with speak interception, realistic voice list, utterance capture via `window.__ttsMockUtterances`
  - `tests/e2e/mocks/inject.ts` — `injectNativeSTTMock()`, `injectNativeTTSMock()`, `injectNativeMocks()` helpers with optional config
- **Learnings:**
  - Playwright's `page.addInitScript({ path })` evaluates the file directly in the browser — it must be valid JavaScript, not TypeScript. Use the function form (`page.addInitScript(fn)`) with exported functions instead — Playwright serialises the compiled JS.
  - Chromium's `--use-file-for-fake-audio-capture` flag only works for getUserMedia-based audio capture, not for Web Speech API (SpeechRecognition manages its own microphone). NativeSTT examples need the mock; Deepgram examples can use real fake audio capture.
  - The existing Jest test suite (19 suites, 375 tests) uses jsdom with extensive browser API mocks in `tests/setup.ts`. E2E tests are separate under `tests/e2e/` and use Playwright + Chromium.
---

