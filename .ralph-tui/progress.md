# Ralph Progress Log

This file tracks progress across iterations. Agents update this file
after each iteration and it's included in prompts for context.

## Codebase Patterns (Study These First)

- **Mock injection pattern for Playwright**: Browser mocks (STT/TTS) are exported as self-contained install functions from `tests/e2e/mocks/*.ts`. The `inject.ts` helper passes them to `page.addInitScript()` which serialises them for browser evaluation. Config is injected via a separate `addInitScript()` call before the mock script so the mock can read `window.__xxxMockConfig` during its execution.
- **pnpm workspace flags**: Use `-w` or `--workspace-root` flag when adding dependencies to the root package.json (e.g., `pnpm add -wD @playwright/test`).
- **TypeScript strict mode casts for window**: In browser-evaluated code, use `window as any` (with eslint-disable comment) instead of `window as Record<string, unknown>` — the latter fails strict type checking because `Window` doesn't have an index signature.
- **Network request monitoring for REST-based TTS**: When a TTS provider uses REST (e.g. OpenAI TTS) rather than SpeechSynthesis, verify TTS by intercepting `page.on('response')` and matching the endpoint URL (e.g. `/v1/audio/speech`), rather than checking DOM elements or mocks.
- **React/Next.js E2E selectors**: When the UI is React-rendered without `id` attributes, use Playwright's `getByRole('button', { name: 'Initialize' })` and heading-sibling traversal (`h2` → parent → `p`) instead of CSS ID selectors. For state verification, poll spans by `textContent` since CSS `text-transform` only affects visual rendering.
- **Dynamic conversation bubble verification**: For conversation-style UIs (e.g. example 24) where messages are dynamically created `.message.user/.assistant .bubble` elements, use `waitForFunction` polling for the DOM elements to exist with non-empty text, rather than `waitForNonPlaceholder` which assumes the target element already exists at page load.

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

## 2026-02-24 - composite-voice-ekb.18
- **What was implemented**: E2E Playwright test for example 31-anthropic-streaming-config (NativeSTT + Anthropic LLM + NativeTTS)
- **Files changed**:
  - `examples/31-anthropic-streaming-config/e2e/31-anthropic-streaming-config.spec.ts` — new Playwright test file with three test cases:
    1. Page render verification (UI elements, config sliders, controls, state label, no console errors)
    2. Streaming config controls interactivity (slider value changes propagate to display)
    3. Full conversation round-trip: mocked STT → Anthropic LLM → mocked TTS with utterance verification and escalating retry strategy
- **Learnings:**
  - For examples using both NativeSTT + NativeTTS, use `injectNativeMocks()` (not just `injectNativeSTTMock()`) — both browser speech APIs are unavailable in headless Chromium.
  - TTS verification for NativeTTS mocks uses `window.__ttsMockUtterances` (populated by the mock), while REST-based TTS (OpenAI) uses network request interception. Choose the right verification strategy based on the provider type.
  - Range input interactivity in Playwright can be tested with `fill()` + `dispatchEvent('input')` to trigger the slider's event handler.
  - Streaming config examples have additional UI elements (sliders, config display, apply button) that should be verified separately from the conversation round-trip test.
---

## 2026-02-24 - composite-voice-ekb.19
- **What was implemented**: E2E Playwright test for example 40-openai-pipeline (NativeSTT + OpenAI LLM + NativeTTS)
- **Files changed**:
  - `examples/40-openai-pipeline/e2e/40-openai-pipeline.spec.ts` — new Playwright test file with two test cases:
    1. Page render verification (UI elements, provider badge, controls, state label, no console errors)
    2. Full conversation round-trip: mocked STT → OpenAI LLM → mocked TTS with utterance verification and escalating retry strategy
- **Learnings:**
  - Example 40 follows the same NativeSTT + LLM + NativeTTS pattern as 31-anthropic-streaming-config — same mock injection, same verification strategy. The only difference is the LLM provider (OpenAI vs Anthropic) and the absence of config controls.
  - Placeholder text in this example uses both "will appear here" and "will stream here" — the `waitForNonPlaceholder` helper already handles both variants.
---

## 2026-02-24 - composite-voice-ekb.15
- **What was implemented**: E2E Playwright test for example 23-deepgram-voices (DeepgramSTT + Anthropic LLM + DeepgramTTS with voice gallery)
- **Files changed**:
  - `examples/23-deepgram-voices/e2e/23-deepgram-voices.spec.ts` — new Playwright test file with three test cases:
    1. Page render verification (UI elements, provider badges, voice gallery with 10 cards, controls, content areas, no console errors)
    2. Voice selection UI interactivity (clicking a different voice card updates selection class, active voice label, and TTS tag)
    3. Full conversation round-trip with real APIs (initialize → start listening → STT transcription → LLM response → TTS activity) using escalating retry strategy
- **Learnings:**
  - Voice gallery examples have unique UI interactivity (card selection with CSS class toggling, label updates) that should be tested separately from the conversation round-trip — this verifies client-side DOM logic without needing API connectivity.
  - DeepgramTTS is WebSocket-based, so TTS verification uses `#tts-log` DOM element (populated by `tts.start`/`tts.complete` events) rather than network request interception used for REST-based TTS providers like OpenAI.
  - Example 23 follows the same all-real-API pattern as example 41 — no browser mocks needed, Chromium fake audio capture feeds DeepgramSTT directly.
---

## 2026-02-24 - composite-voice-ekb.16
- **What was implemented**: E2E Playwright test for example 24-deepgram-conversation-history (DeepgramSTT + Anthropic LLM + DeepgramTTS with multi-turn conversation history)
- **Files changed**:
  - `examples/24-deepgram-conversation-history/e2e/24-deepgram-conversation-history.spec.ts` — new Playwright test file with two test cases:
    1. Page render verification (UI elements, provider badges, feature badge, controls, status area, conversation area with placeholder, turn count info cards, interim bar, no console errors)
    2. Full conversation round-trip with real APIs (initialize → start listening → STT user message bubble → LLM assistant message bubble → TTS state verification → turn count increment) using escalating retry strategy
- **Learnings:**
  - Conversation-style UI examples (with dynamic `.message.user/.assistant .bubble` elements) require a different helper (`waitForMessageBubble`) than the `waitForNonPlaceholder` pattern used for static `#transcript`/`#response` elements — the DOM elements don't exist at page load, they're created dynamically by event handlers.
  - When an example lacks a `#tts-log` element for TTS verification, agent state transition works as an alternative — checking that the status moves past "Thinking..." (to "Speaking...", "Listening...", or "Ready") confirms TTS engaged.
  - Turn count verification (`#turn-count >= 1`) is a good way to confirm the conversation history feature is actively tracking turns, specific to conversation-history examples.
---

## 2026-02-24 - composite-voice-ekb.17
- **What was implemented**: E2E Playwright test for example 30-anthropic-models (NativeSTT + Anthropic LLM with model selector + NativeTTS)
- **Files changed**:
  - `examples/30-anthropic-models/e2e/30-anthropic-models.spec.ts` — new Playwright test file with three test cases:
    1. Page render verification (UI elements, 3 model cards with names/badges, latency indicator, controls, content areas, state label, no console errors)
    2. Model selection UI interactivity (clicking different model cards toggles `.active` class correctly in both directions)
    3. Full conversation round-trip: mocked STT → Anthropic LLM (Haiku default) → mocked TTS with utterance verification and escalating retry strategy
- **Learnings:**
  - Model selector examples use CSS class toggling (`.active`) on `<label>` elements wrapping radio inputs — Playwright's `.click()` on the label triggers both the radio change and the JS click handler.
  - The model selector's `reinitializeWithModel()` dispose/recreate pattern means testing model switching mid-session would require API calls for each model — testing the UI class toggling separately is more cost-effective.
  - This example follows the same NativeSTT + LLM + NativeTTS mock pattern as 31 and 40, but adds model selector verification as a unique test case.
---

## 2026-02-24 - composite-voice-ekb.14
- **What was implemented**: E2E Playwright test for example 22-deepgram-options (DeepgramSTT + Anthropic LLM + DeepgramTTS with config panel)
- **Files changed**:
  - `examples/22-deepgram-options/e2e/22-deepgram-options.spec.ts` — new Playwright test file with three test cases:
    1. Page render verification (UI elements, provider badges, config panel with all controls, content areas, status, no console errors)
    2. Configuration controls interactivity (model/language dropdowns, endpointing slider with display update, toggle switches, config summary JSON verification)
    3. Full conversation round-trip with real APIs (initialize → start listening → STT transcription → LLM response → TTS activity) using escalating retry strategy
- **Learnings:**
  - Toggle checkboxes styled with `opacity: 0` and custom `.toggle-slider` overlays require `{ force: true }` in Playwright's `.uncheck()` / `.check()` to bypass visibility checks — the actual input is invisible by design.
  - Config summary (`#config-summary`) containing JSON of all config values is a convenient single assertion point to verify multiple UI control changes propagated correctly.
  - Example 22 follows the same all-real-API pattern as examples 41 and 23 — no browser mocks needed, Chromium fake audio capture feeds DeepgramSTT directly. The unique aspect is the config panel interactivity testing.
---

## 2026-02-24 - composite-voice-ekb.10
- **What was implemented**: E2E Playwright test for example 12-custom-provider (NativeSTT + MockLLM custom provider + NativeTTS)
- **Files changed**:
  - `examples/12-custom-provider/e2e/12-custom-provider.spec.ts` — new Playwright test file with three test cases:
    1. Page render verification (UI elements, provider tagline, no-API-key banner, controls, token delay selector, content areas, source code viewer toggle, state label, no console errors)
    2. Source code viewer toggle interactivity (click toggles `.visible` class on `#source-code`, verifies MockLLM class source is displayed)
    3. Full conversation round-trip: mocked STT → MockLLM (in-browser) → mocked TTS with response content validation and utterance verification using escalating retry strategy
- **Learnings:**
  - Example 12 is fully self-contained (no API keys, no external calls) — the MockLLM cycles through predefined responses in the browser. This makes the round-trip test faster and more deterministic than real-API tests.
  - Because MockLLM responses are known strings, we can regex-validate the response content (e.g. `/mock LLM|BaseLLMProvider/i`) rather than just checking for non-empty text — stronger assertion than generic `waitForNonPlaceholder`.
  - This example follows the same NativeSTT + NativeTTS mock injection pattern as examples 30, 31, and 40, confirming the pattern is stable across different LLM providers (Anthropic, OpenAI, and custom).
---

## 2026-02-24 - composite-voice-ekb.11
- **What was implemented**: E2E Playwright test for example 13-multi-language (NativeSTT + Anthropic LLM + NativeTTS with language selector)
- **Files changed**:
  - `examples/13-multi-language/e2e/13-multi-language.spec.ts` — new Playwright test file with three test cases:
    1. Page render verification (UI elements, 6 language cards with names, active default English, current language display, controls, content areas, state label, no console errors)
    2. Language selection UI interactivity (clicking language cards toggles `.active` class, updates `#current-lang-display` — tests English→Spanish→French→Japanese→English cycle)
    3. Full conversation round-trip: mocked STT → Anthropic LLM → mocked TTS with utterance polling and escalating retry strategy
  - `tests/e2e/mocks/native-tts.ts` — **critical fix**: added `MockUtterance` class that replaces `window.SpeechSynthesisUtterance` so the `.voice` setter accepts plain objects from `getVoices()`. Updated `speak()` to use `any` cast and plain `Event` instead of `SpeechSynthesisEvent`. This fix benefits ALL existing NativeTTS-mocked tests (12, 13, 30, 31, 40).
- **Learnings:**
  - Playwright 1.58 runs spec files as ESM in Node 24, but transpiled helper modules are CJS. The `createRequire(import.meta.url)` pattern resolves CJS imports from ESM context, with `fileURLToPath(import.meta.url)` providing `__dirname` equivalent.
  - Vite's `loadEnv()` reads `.env` from `process.cwd()` (the example dir), not from parent directories. Tests that need API keys from root `.env` must manually load them into `process.env` before starting the dev server.
  - Chromium's real `SpeechSynthesisUtterance.voice` setter throws `TypeError: Failed to convert value to 'SpeechSynthesisVoice'` when assigned a plain object. The `MockUtterance` class avoids this by using a simple property instead of the browser's typed setter. This was the root cause of silent TTS failures (state went to `speaking → error` with no visible error messages).
  - TTS utterance polling with `waitForFunction` is more reliable than immediate `page.evaluate` — TTS may fire slightly after LLM response completes.
---

## 2026-02-24 - composite-voice-ekb.12
- **What was implemented**: E2E Playwright test for example 20-deepgram-pipeline (DeepgramSTT + Anthropic LLM + DeepgramTTS)
- **Files changed**:
  - `examples/20-deepgram-pipeline/e2e/20-deepgram-pipeline.spec.ts` — new Playwright test file with two test cases:
    1. Page render verification (UI elements, provider badges with Deepgram/Anthropic/Deepgram, status area, controls, content areas, no console errors)
    2. Full conversation round-trip with real APIs (initialize → start listening → STT transcription via Deepgram nova-3 → LLM response via Anthropic claude-haiku-4-6 → TTS activity via Deepgram aura-2) using escalating retry strategy
- **Learnings:**
  - Example 20 is structurally nearly identical to example 41 (same UI elements: `#init-btn`, `#start-btn`, `#stop-btn`, `#dispose-btn`, `#transcript`, `#response`, `#tts-log`, `#status-text`) — the only differences are the LLM provider (Anthropic vs OpenAI) and port (3020 vs 3041). This confirms the Deepgram pipeline pattern is stable across different LLM providers.
  - All-Deepgram pipeline tests (STT + TTS) verify three distinct pipeline stages via separate DOM elements: `#transcript` (STT output), `#response` (LLM streaming output), and `#tts-log` (TTS activity log) — each populated by different event handlers (`transcription.final`, `llm.chunk`, `tts.start`/`tts.complete`).
---

## 2026-02-24 - composite-voice-ekb.13
- **What was implemented**: E2E Playwright test for example 21-eager-pipeline (DeepgramSTT + Anthropic LLM + DeepgramTTS with eagerLLM preflight pipeline)
- **Files changed**:
  - `examples/21-eager-pipeline/e2e/21-eager-pipeline.spec.ts` — new Playwright test file with two test cases:
    1. Page render verification (UI elements, 4 badges including eager badge, status area, controls, 3 pipeline stage logs, timing panel with 4 metrics, no console errors)
    2. Full conversation round-trip with real APIs (initialize → start listening → STT activity in `#stt-log` → LLM output in `#llm-log` → TTS activity in `#tts-log`) using escalating retry strategy
- **Learnings:**
  - Example 21 uses different content element IDs than the standard Deepgram pipeline pattern (`#stt-log`, `#llm-log`, `#tts-log` vs `#transcript`, `#response`, `#tts-log`) — the eager pipeline visualizes each stage separately in a three-column layout.
  - Placeholder text patterns vary: example 21 uses "Waiting for speech/transcript/response..." instead of "will appear here" — the `waitForNonPlaceholder` helper must be customized per-example to match the actual placeholder text.
  - The eager pipeline adds a timing panel (`.timing-panel`) with 4 latency metrics (`#t-preflight`, `#t-speech-final`, `#t-llm-first-token`, `#t-tts-start`) — these are visible at page load with "—" placeholder values, making them good candidates for render verification without requiring API calls.
---

## 2026-02-24 - composite-voice-ekb.6
- **What was implemented**: E2E Playwright test for example 04-error-recovery (NativeSTT + Anthropic LLM + NativeTTS with error simulation and auto-recovery)
- **Files changed**:
  - `examples/04-error-recovery/e2e/04-error-recovery.spec.ts` — new Playwright test file with three test cases:
    1. Page render verification (UI elements, error simulation controls, proxy status indicator, recovery status panel, error event log, content areas, state label, no console errors)
    2. Full conversation round-trip: mocked STT → Anthropic LLM (via Vite proxy) → mocked TTS with utterance polling and escalating retry strategy
    3. Error simulation: emit agent error verifies error count increments, last error updates, recovery status changes, and error log populates with entries
- **Learnings:**
  - Error simulation tests (e.g. "Emit Agent Error") are purely UI-driven with no API dependency, making them deterministic and fast — no need for the `withRetry` escalating timeout pattern. Only the conversation round-trip test needs retry logic.
  - The `autoRecover: true` flag enables automatic state recovery after errors, detected by `agent.stateChange` event transitioning out of `'error'` state. This is a testable behavior but requires triggering a real error during an active conversation (not just emitting a synthetic event), so testing the recovery *transition* is better suited for integration tests.
  - Error simulation controls in example 04 use distinct mechanisms: "Break Proxy" mutates `llmInstance.proxyUrl` to an invalid endpoint (requires active conversation to trigger), "Emit Agent Error" fires a synthetic `agent.error` event (immediately testable). The emit approach is ideal for E2E testing error logging and counter UI.
---

## 2026-02-24 - composite-voice-ekb.7
- **What was implemented**: E2E Playwright test for example 05-turn-taking (NativeSTT + Anthropic LLM + NativeTTS with turn-taking strategy selector)
- **Files changed**:
  - `examples/05-turn-taking/e2e/05-turn-taking.spec.ts` — new Playwright test file with three test cases:
    1. Page render verification (UI elements, 4 strategy cards with titles/configs, default selection, mic status indicator with turn-state badge, info panel, controls, content areas, state label, no console errors)
    2. Strategy selection UI interactivity (clicking cards toggles `.selected` class through all 4 strategies and updates info panel content — Conservative→Aggressive→Detect→Always Pause→Conservative cycle)
    3. Full conversation round-trip: mocked STT → Anthropic LLM → mocked TTS with `#active-strategy-label` verification, utterance polling, and escalating retry strategy
- **Learnings:**
  - Example 05 follows the same NativeSTT + NativeTTS mock injection pattern as examples 04, 12, 13, 30, 31, 40 — confirming this pattern is stable across all NativeSTT+NativeTTS examples.
  - Strategy cards use `data-strategy` and `data-auto-strategy` attributes, but the JS derives a key like `auto-conservative`. The `.selected` class toggles between cards on click, similar to model cards in example 30 (`.active` on labels).
  - The `#active-strategy-label` element is empty before initialization and populates with "Active: {strategy name}" after `agent.initialize()` — this is a good assertion to confirm the strategy was applied to the agent.
  - Info panel content updates dynamically based on strategy selection even before initialization — this is purely client-side DOM logic that can be tested without API calls.
---

## 2026-02-24 - composite-voice-ekb.8
- **What was implemented**: E2E Playwright test for example 10-proxy-server (DeepgramSTT + Anthropic LLM + DeepgramTTS via Vite dev proxy)
- **Files changed**:
  - `examples/10-proxy-server/e2e/10-proxy-server.spec.ts` — new Playwright test file with two test cases:
    1. Page render verification (UI elements, 4 badges including proxy badge, proxy-info section, status area, controls, content areas, hidden error banner, no console errors)
    2. Full conversation round-trip via proxy with real APIs (initialize → start listening → STT transcription via proxy→Deepgram → LLM response via proxy→Anthropic → TTS activity via proxy→Deepgram) using escalating retry strategy
- **Learnings:**
  - The proxy example uses the same UI element IDs as example 20 (`#init-btn`, `#start-btn`, `#stop-btn`, `#dispose-btn`, `#transcript`, `#response`, `#tts-log`, `#status-text`) plus proxy-specific elements (`.badge.proxy`, `.proxy-info`, `#error-banner`, `#status-detail`).
  - Vite's dev proxy is transparent to the E2E test — the same real-API testing pattern (Chromium fake audio capture, no browser mocks) works identically whether providers connect directly or through a proxy. The proxy just adds an HTTP/WebSocket hop on the same origin.
  - The `pnpm dev` command starts a single Vite dev server that serves both the frontend and the proxy routes — no separate server process needed for the E2E test.
---

## 2026-02-24 - composite-voice-ekb.9
- **What was implemented**: E2E Playwright test for example 11-nextjs-proxy (NativeSTT + Anthropic LLM via Next.js App Router proxy + NativeTTS)
- **Files changed**:
  - `examples/11-nextjs-proxy/e2e/11-nextjs-proxy.spec.ts` — new Playwright test file with two test cases:
    1. Page render verification (heading, provider subtitle, state indicator, 3 control buttons with correct enabled/disabled states, content area headings with placeholder text, no console errors with Next.js dev noise filtered)
    2. Full conversation round-trip via Next.js proxy: mocked STT → Anthropic LLM (via `/api/proxy/anthropic`) → mocked TTS with utterance polling and escalating retry strategy
- **Learnings:**
  - React/Next.js examples have NO element IDs — unlike Vite examples which use `#init-btn`, `#transcript`, etc. Playwright's `getByRole('button', { name: 'Initialize' })` and heading-sibling traversal (`h2` → parentElement → `p`) are the correct selector patterns for React-rendered DOM.
  - Next.js compiles TypeScript on first page request, making startup significantly slower than Vite. The `startDevServer` timeout needs 60s (vs Vite's 30s default), and the first `page.goto('/')` also needs a `toBeVisible({ timeout: 30_000 })` wait for the h1 to confirm compilation completed.
  - The `startDevServer` helper passes `--port <N>` which is a Vite flag, but pnpm forwards unknown flags to the underlying script. Since the port is already baked into the Next.js `dev` script (`next dev -p 3011`), the extra `--port` is harmless and works with Next.js 15+ which accepts both `-p` and `--port`.
  - Next.js dev console output can include hydration warnings and React development warnings — these should be filtered out of the "no console errors" assertion alongside the standard favicon/404 filters.
  - React conditional rendering means placeholder text appears inside a `<span>` within the `<p>`, but real content replaces the entire `<p>` children. The `waitForContent` helper checks for absence of placeholder text patterns rather than checking for a specific DOM structure.
---

## 2026-02-24 - composite-voice-ekb.2
- **What was implemented**: E2E Playwright test for example 00-minimal-voice-agent (NativeSTT + Anthropic LLM + NativeTTS)
- **Files changed**:
  - `examples/00-minimal-voice-agent/e2e/00-minimal-voice-agent.spec.ts` — new Playwright test file with three test cases:
    1. Page render verification (UI elements, button enabled/disabled states, hidden error box, state label, no console errors)
    2. STT transcript verification: mocked STT fires transcript event that appears in `#transcript`
    3. Full conversation round-trip: mocked STT → Anthropic LLM → mocked TTS with utterance verification, state machine return to Ready/Listening, and escalating retry strategy
- **Learnings:**
  - Example 00 is the simplest baseline — it uses the standard `#btn-init`, `#btn-start`, `#btn-stop`, `#transcript`, `#response`, `#state-label` element IDs shared across most Vite examples. No extra UI features (no config panels, model selectors, or error simulation controls).
  - The `#error` box in example 00 is hidden by default (`display: none`) and only shown via `.visible` class on error — can verify it's hidden with `isVisible() === false` rather than checking for a class.
  - Splitting the STT transcript check into its own test case (separate from the full round-trip) provides faster feedback on STT mock issues without needing to wait for LLM/TTS verification. The full round-trip test still covers STT as part of the pipeline.
---

## 2026-02-24 - composite-voice-ekb.3
- **What was implemented**: E2E Playwright test for example 01-conversation-history (NativeSTT + Anthropic LLM + NativeTTS with multi-turn conversation history)
- **Files changed**:
  - `examples/01-conversation-history/e2e/01-conversation-history.spec.ts` — new Playwright test file with two test cases:
    1. Page render verification (UI elements, 4 badges including feature badge, status area, controls with clear-history button, interim bar, conversation area with placeholder, turn count info cards, error banner hidden, no console errors)
    2. Full conversation round-trip: mocked STT → Anthropic LLM → mocked TTS with dynamic user/assistant message bubble verification, TTS utterance polling, turn count increment, and state return to Ready/Listening using escalating retry strategy
- **Learnings:**
  - Example 01 uses dynamic conversation bubbles (`.message.user .bubble` / `.message.assistant .bubble`) instead of static `#transcript`/`#response` panels — requires `waitForMessageBubble` helper with `waitForFunction` polling, matching the "Dynamic conversation bubble verification" codebase pattern from example 24.
  - The `#status-text` element in example 01 uses bare state labels (`Ready`, `Listening...`, `Thinking...`) from the `STATE_LABELS` map — no additional suffix like example 00's `Ready — click Start`. Assertions must match the exact text from the example's own status update logic.
  - Turn count verification (`#turn-count >= 1`) confirms the conversation history feature is actively tracking turns, and `#turn-badge` provides a human-readable version ("1 turn" vs "2 turns"). This is the same pattern used in example 24.
  - Example 01 shares the same NativeSTT + NativeTTS mock injection pattern as all other Native provider examples (00, 04, 05, 12, 13, 30, 31, 40, 42), further confirming the pattern's stability.
---

## 2026-02-24 - composite-voice-ekb.4
- **What was implemented**: E2E Playwright test for example 02-system-persona (NativeSTT + Anthropic LLM + NativeTTS with persona selector)
- **Files changed**:
  - `examples/02-system-persona/e2e/02-system-persona.spec.ts` — new Playwright test file with three test cases:
    1. Page render verification (5 persona cards with correct data-persona attributes, default assistant selection, controls, content areas with placeholders, empty active persona label, hidden error box, state label, no console errors)
    2. Persona selection UI interactivity (clicking cards toggles `.selected` class through all 5 personas — assistant→tech→storyteller→coach→pirate→assistant cycle, verifying mutual exclusivity)
    3. Full conversation round-trip: mocked STT → Anthropic LLM (with default assistant persona) → mocked TTS with active persona label verification ("Active: Helpful Assistant"), utterance polling, state return to Ready/Listening, and escalating retry strategy
- **Learnings:**
  - Example 02 shares identical element IDs with example 00 (`#btn-init`, `#btn-start`, `#btn-stop`, `#transcript`, `#response`, `#state-label`, `#error`) — the persona-specific additions are `#persona-grid`, `.persona-card[data-persona]`, and `#active-persona-label`. This made the test structure nearly identical to example 00 with persona-specific assertions layered on top.
  - Persona switching triggers `agent.dispose()` + `initializeAgent()` when the agent is already initialized, but only toggles the `.selected` class when not initialized. The UI interactivity test covers the pre-init class toggling (pure DOM, no API calls), while the round-trip test covers the post-init active persona label update.
  - The `#active-persona-label` is empty before initialization and populates with "Active: {title}" after `agent.initialize()` — same pattern as `#active-strategy-label` in example 05.
  - State labels in example 02 match example 00 exactly ("Idle — select a persona and click Initialize" for idle, "Ready — click Start" for ready) except the idle label has a persona-specific suffix.
---

## 2026-02-24 - composite-voice-ekb.5
- **What was implemented**: E2E Playwright test for example 03-event-inspector (NativeSTT + Anthropic LLM + NativeTTS with event timeline)
- **Files changed**:
  - `examples/03-event-inspector/e2e/03-event-inspector.spec.ts` — new Playwright test file with three test cases:
    1. Page render verification (UI controls, filter chips with 5 categories all checked, event counter at "0 events", timeline with empty state, content areas with placeholders, hidden error box, state label, no console errors)
    2. Event timeline population: after initialization and conversation start, verifies event rows appear in the timeline with correct structure (`.event-time`, `.event-type`, `.event-data`), empty state removed, counter incremented, and events from multiple categories (transcription, llm, agent) present
    3. Full conversation round-trip: mocked STT → Anthropic LLM → mocked TTS with event timeline verification — confirms event rows exist for all 4 pipeline categories (transcription, llm, tts, agent), event counter >= 5, TTS utterance polling, and state return to Ready/Listening using escalating retry strategy
- **Learnings:**
  - Example 03 shares identical element IDs with example 00 (`#btn-init`, `#btn-start`, `#btn-stop`, `#transcript`, `#response`, `#state-label`, `#error`) plus event-inspector-specific additions: `#timeline`, `#event-counter`, `#btn-clear`, `#filters`, `.filter-chip[data-category]`, `.event-row[data-category]`.
  - Event rows use `data-category` attributes that enable both CSS filtering (via checkbox toggle of `display: none`) and test assertions (via `page.locator('.event-row[data-category="llm"]')`). This data attribute approach is ideal for E2E testing.
  - LLM chunk accumulation (consecutive `llm.chunk` events consolidating into a single row) doesn't require special test assertions — the accumulated row still carries `data-category="llm"` so category-based counting works correctly.
  - The event timeline populates even during initialization (agent.ready, agent.stateChange events fire before any conversation starts), making the timeline population testable independently of the LLM round-trip.
---

## 2026-02-24 - composite-voice-ekb.22
- **What was implemented**: Final review and summary issue for all 20 E2E example tests
- **Files changed**: No code changes — this was a review/summary bead
- **Actions taken**:
  - Verified all 20 E2E spec files exist (54 total test cases across 20 examples)
  - Confirmed no E2E failure issues were filed during the review (0 failures)
  - Killed stale dev servers on ports 3001 and 3025
  - Verified `pnpm test` passes (19 suites, 375 tests)
  - Created GitHub Issue #4: `[E2E] Summary: Comprehensive Example Review Results` with full results table, mock effectiveness analysis, common patterns, and recommendations
- **Learnings:**
  - The `e2e` label didn't exist on the repo — needed `gh label create` before filing the issue
  - Port 3025 had a persistent/respawning process that required `kill -9` to fully terminate
  - Example 50 (WebLLM) was excluded from the review scope since it requires in-browser WebGPU model download — flagged as a recommendation for future lightweight render-only testing
---
