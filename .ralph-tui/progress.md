# Ralph Progress Log

This file tracks progress across iterations. Agents update this file
after each iteration and it's included in prompts for context.

## Codebase Patterns (Study These First)

- **Mock injection pattern for Playwright**: Browser mocks (STT/TTS) are exported as self-contained install functions from `tests/e2e/mocks/*.ts`. The `inject.ts` helper passes them to `page.addInitScript()` which serialises them for browser evaluation. Config is injected via a separate `addInitScript()` call before the mock script so the mock can read `window.__xxxMockConfig` during its execution.
- **pnpm workspace flags**: Use `-w` or `--workspace-root` flag when adding dependencies to the root package.json (e.g., `pnpm add -wD @playwright/test`).
- **TypeScript strict mode casts for window**: In browser-evaluated code, use `window as any` (with eslint-disable comment) instead of `window as Record<string, unknown>` — the latter fails strict type checking because `Window` doesn't have an index signature.
- **Network request monitoring for REST-based TTS**: When a TTS provider uses REST (e.g. OpenAI TTS) rather than SpeechSynthesis, verify TTS by intercepting `page.on('response')` and matching the endpoint URL (e.g. `/v1/audio/speech`), rather than checking DOM elements or mocks.

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

## 2026-02-24 - composite-voice-ekb.20
- **What was implemented**: E2E Playwright test for example 41-openai-deepgram (DeepgramSTT + OpenAI LLM + DeepgramTTS)
- **Files changed**:
  - `examples/41-openai-deepgram/e2e/41-openai-deepgram.spec.ts` — new Playwright test file with two test cases:
    1. Page render verification (UI elements, provider badges, controls, no console errors)
    2. Full conversation round-trip with real APIs (initialize → start listening → STT transcription → LLM response → TTS activity) using escalating retry strategy
- **Learnings:**
  - Real-API E2E tests (Deepgram/OpenAI) don't need browser mocks — Chromium's `--use-file-for-fake-audio-capture` feeds WAV audio directly into getUserMedia which DeepgramSTT consumes via its WebSocket pipeline.
  - E2E spec files placed under `examples/*/e2e/*.spec.ts` are automatically excluded from Jest (which only matches `**/*.test.ts` in `tests/` root).
  - The `waitForNonPlaceholder` pattern is useful for real-API tests where you can't predict exact text — just check that placeholder text is replaced with actual content.
---

## 2026-02-24 - composite-voice-ekb.21
- **What was implemented**: E2E Playwright test for example 42-openai-tts-pipeline (NativeSTT + OpenAI LLM + OpenAI TTS)
- **Files changed**:
  - `examples/42-openai-tts-pipeline/e2e/42-openai-tts-pipeline.spec.ts` — new Playwright test file with two test cases:
    1. Page render verification (UI elements, provider badges, controls, state label, no console errors)
    2. Full conversation round-trip: mocked STT → OpenAI LLM → OpenAI TTS with network request verification and escalating retry strategy
- **Learnings:**
  - Hybrid mock/real E2E tests work well: mock only what the browser can't do (NativeSTT in headless Chromium), let real REST APIs exercise the full path (OpenAI LLM + TTS).
  - UI element IDs vary between examples (`btn-init` vs `init-btn`, `state-label` vs `status-text`) — always read the HTML source before writing selectors.
  - OpenAI TTS verification via network request interception (`page.on('response')` matching `/v1/audio/speech`) is reliable for REST-based TTS providers where there's no DOM artifact like a `#tts-log`.
  - Placeholder text varies between examples ("will appear here" vs "will stream here") — `waitForNonPlaceholder` must account for all variants.
---

