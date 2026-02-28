# Contributing to CompositeVoice

First: thank you. Genuinely.

Open source only works because people put time into projects that aren't their job. Whether you're here to fix a single confusing sentence in the docs, report a bug you spent three hours diagnosing, or implement a full new STT provider — all of it moves this project forward, and all of it is welcome.

This guide covers everything from "I want to fix a small thing" to "I want to add a provider from scratch." Jump to the section that fits where you are.

---

## Table of contents

- [All kinds of contributions matter](#all-kinds-of-contributions-matter)
- [Your first contribution](#your-first-contribution)
- [Getting started](#getting-started)
- [Development workflow](#development-workflow)
- [Project structure](#project-structure)
- [Submitting a pull request](#submitting-a-pull-request)
- [Commit style](#commit-style)
- [Code style](#code-style)
- [Writing tests](#writing-tests)
- [Adding a provider](#adding-a-provider)
- [Getting help](#getting-help)

---

## All kinds of contributions matter

Not all contributions are code. Here's what's genuinely valued, regardless of whether you've ever written a line of TypeScript:

**No code required:**

- **Report a bug clearly.** A reproducible bug report with a stack trace and environment details saves hours of guesswork. The world would be better with more of these. Use the [bug report template](https://github.com/lukeocodes/composite-voice/issues/new?template=bug_report.md).
- **Request a feature thoughtfully.** Describe the problem you're trying to solve, not just the solution you have in mind. The best feature requests explain the _why_. Use the [feature request template](https://github.com/lukeocodes/composite-voice/issues/new?template=feature_request.md).
- **Improve the docs.** Typos, unclear examples, missing edge cases, a confusing installation step — documentation improvements are low-friction and high-value. PRs for docs usually merge fast.
- **Answer questions.** Help others in [GitHub Discussions](https://github.com/lukeocodes/composite-voice/discussions). Your real-world experience is useful even when the answer is just "I hit this too — here's what worked for me."
- **Share what you built.** Post your project in Discussions. It helps everyone see what's actually possible and often surfaces missing features better than feature requests do.

**With code:**

- **Fix a bug** — ideally with a test that would have caught it before your fix.
- **Add a new provider** — new STT, LLM, TTS, audio input, or audio output backends are the heart of what makes this SDK useful. See [Adding a provider](#adding-a-provider) for the full walkthrough.
- **Improve test coverage** — especially error paths, reconnection logic, and edge cases at boundaries. The happy path is usually tested; the rest is where bugs actually hide.
- **Performance improvements** — please include before/after benchmarks or a reproduction that demonstrates the impact.

**A note on larger changes:** If you're planning something that involves new top-level configuration options, architectural changes, new external dependencies, or changes to the public API, please [open an issue](https://github.com/lukeocodes/composite-voice/issues/new) before you start coding. It takes five minutes and prevents the situation where you've spent two days on something that turns out to conflict with the project's direction. For small fixes and documentation improvements, open a PR directly — no pre-approval needed.

---

## Your first contribution

Not sure where to start? Browse the labelled issues:

- [`good first issue`](https://github.com/lukeocodes/composite-voice/labels/good%20first%20issue) — small, well-scoped tasks that don't require deep codebase knowledge. These are deliberately kept available for new contributors.
- [`help wanted`](https://github.com/lukeocodes/composite-voice/labels/help%20wanted) — issues where the direction is clear but maintainer bandwidth is limited.
- [`documentation`](https://github.com/lukeocodes/composite-voice/labels/documentation) — docs improvements that don't require running code at all.

If nothing in the issues fits, try running one of the [examples](./examples/) from scratch with fresh API keys and fresh eyes. Note anything that felt rough, unclear, or underdocumented. A clear bug report or a targeted documentation improvement is as valuable as a code fix.

Before you start work on an issue, leave a comment. It takes thirty seconds and prevents the frustrating situation where two people put time into the same thing. It also gives the maintainer a chance to share any context that might save you time.

---

## Getting started

### Prerequisites

- **Node.js** 18 or later — check with `node -v`
- **pnpm** 10 or later — install with `npm install -g pnpm`, check with `pnpm -v`
- **Git**

### Fork and clone

1. Fork the repository: click **Fork** at [github.com/lukeocodes/composite-voice](https://github.com/lukeocodes/composite-voice).

2. Clone your fork locally:

```bash
git clone https://github.com/your-username/composite-voice.git
cd composite-voice
```

3. Add the upstream remote so you can pull future changes from the original:

```bash
git remote add upstream https://github.com/lukeocodes/composite-voice.git
```

4. Create a branch for your work. Use a name that describes what you're doing:

```bash
git checkout -b fix/deepgram-reconnect-on-4xx
# or
git checkout -b feat/assemblyai-stt-provider
# or
git checkout -b docs/proxy-setup-nextjs
```

### Install and verify

```bash
pnpm install
pnpm build
pnpm test
```

All three should succeed on a clean install. If anything fails before you've changed a single line, [open an issue](https://github.com/lukeocodes/composite-voice/issues) with the error output — that's a bug in the setup experience and we want to fix it.

---

## Development workflow

### Core commands

```bash
pnpm build           # compile the SDK to dist/ (required before running examples)
pnpm dev             # watch mode — recompiles automatically on save
pnpm test            # run the full test suite
pnpm test:watch      # watch mode for tests, useful during TDD
pnpm test:coverage   # generate a coverage report in coverage/
pnpm lint            # run ESLint
pnpm lint:fix        # run ESLint with auto-fix
pnpm format          # run Prettier across the whole codebase
pnpm type-check      # TypeScript check without emitting output files
```

### Testing changes in the browser

The examples import the SDK from `dist/`, so you need to build before running them. For active development, run the compiler in watch mode in one terminal and the example server in another:

```bash
# terminal 1 — recompiles automatically as you edit src/
pnpm dev

# terminal 2 — serves the example at http://localhost:3000
pnpm example:00-minimal-voice-agent:dev
```

Available example servers:

```bash
pnpm example:00-minimal-voice-agent:dev        # NativeSTT + AnthropicLLM + NativeTTS (3-provider)
pnpm example:01-conversation-history:dev       # multi-turn conversation with history
pnpm example:10-proxy-server:dev               # server-side proxy, zero browser keys
pnpm example:20-deepgram-pipeline:dev          # full 5-provider Deepgram pipeline
```

Each example needs its own `.env` file with API credentials. Copy the sample template and fill in your keys:

```bash
cp examples/00-minimal-voice-agent/sample.env examples/00-minimal-voice-agent/.env
# open .env and add your keys — it's gitignored, so it won't get committed
```

---

## Project structure

```
src/
├── CompositeVoice.ts          # main orchestrator — wires the 5-role pipeline together
├── core/
│   ├── audio/                 # AudioCapture (microphone), AudioPlayer (speakers)
│   ├── events/                # type-safe EventEmitter
│   ├── pipeline/              # AudioBufferQueue, AudioHeaderCache, resolveProviders()
│   ├── state/                 # agent state machine (idle → listening → thinking → speaking)
│   └── types/                 # shared TypeScript types, interfaces, and role definitions
├── providers/
│   ├── base/                  # abstract base classes — the contracts each provider must fulfil
│   ├── input/                 # audio input providers (MicrophoneInput, BufferInput)
│   ├── stt/                   # speech-to-text providers (NativeSTT, DeepgramSTT, ...)
│   ├── llm/                   # language model providers (AnthropicLLM, OpenAILLM, ...)
│   ├── tts/                   # text-to-speech providers (NativeTTS, DeepgramTTS, ...)
│   └── output/                # audio output providers (BrowserAudioOutput, NullOutput)
├── proxy/                     # server-side proxy middleware (keeps API keys off the browser)
└── utils/                     # shared utility functions (audio format detection, errors, etc.)

tests/
├── unit/                      # unit tests, mirroring the src/ directory structure
├── integration/               # end-to-end pipeline tests (race condition, multi-role, config)
├── mocks/                     # shared mock providers, stubs, and fake responses
└── setup.ts                   # browser API mocks — AudioContext, WebSocket, MediaStream, etc.

examples/
├── 00-minimal-voice-agent/            # minimal setup using only browser-native APIs
├── 20-deepgram-pipeline/              # full 5-provider pipeline via Deepgram
├── 10-proxy-server/                   # full proxy setup — no API keys in the browser
└── ...                                # 28 examples covering different provider combinations
```

The most useful files to read before making changes to the core pipeline are `CompositeVoice.ts`, the role definitions in `src/core/types/roles.ts`, and the base classes in `src/providers/base/`. If you're adding or modifying a provider, start with an existing provider in the same category.

---

## Submitting a pull request

1. Make sure your branch is up to date with `main`:

```bash
git fetch upstream
git rebase upstream/main
```

2. Make your changes. If you're fixing a bug, write a failing test first that reproduces it, then make it pass. The test proves the bug existed and proves your fix works.

3. Verify everything passes locally before pushing:

```bash
pnpm format       # fix formatting automatically
pnpm lint         # catch lint issues
pnpm type-check   # catch type errors
pnpm test         # confirm the full suite passes
```

4. Commit your changes using the [Conventional Commits format](#commit-style). There's a pre-commit hook that enforces this.

5. Push your branch to your fork and open a PR against `main`:

```bash
git push origin your-branch-name
```

6. Fill in the PR template. A description that explains what changed and _why_ will get your PR reviewed faster than one that just says "fixes #123."

### What makes a great PR

- **Focused** — one logical change per PR. A PR that fixes a bug, refactors three unrelated files, and updates the README for an unrelated provider is slow to review and slow to merge. Split it.
- **Tested** — new behaviour should have tests. Bug fixes should include a regression test.
- **Documented** — if you add or change a public API, update the README and any relevant example READMEs.
- **Described** — the PR description should explain what changed and why. "Fixes #123" as the entire description isn't enough for anything non-trivial.

Don't worry about having a perfect PR. The review process exists to catch things collaboratively. Submit early if you want early feedback — mark it as a Draft if it isn't ready to merge yet.

---

## Commit style

All commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) format. This is enforced automatically by a pre-commit hook.

```
<type>(<scope>): <short summary>

<optional body — explain why, not just what>
```

### Types

| Type       | When to use                                          |
| ---------- | ---------------------------------------------------- |
| `feat`     | New feature or new provider                          |
| `fix`      | Bug fix                                              |
| `docs`     | Documentation only — no code changed                 |
| `style`    | Formatting, whitespace — zero logic change           |
| `refactor` | Code restructuring without any behaviour change      |
| `perf`     | Performance improvement with measurable impact       |
| `test`     | Adding or updating tests only                        |
| `chore`    | Maintenance tasks, dependency updates, config tweaks |
| `ci`       | CI/CD pipeline changes                               |
| `build`    | Build system or toolchain changes                    |
| `revert`   | Reverting a previous commit                          |

### Examples

```
feat(providers): add AssemblyAI STT provider
fix(DeepgramSTT): flush buffer when server closes with 4XX status
docs(examples): clarify proxy setup steps for Next.js deployments
test(AnthropicLLM): add coverage for abort signal handling mid-stream
refactor(AudioCapture): simplify permission request flow
chore(deps): update @anthropic-ai/sdk to 0.32.0
```

### Rules

- The summary is lowercase and does not end with a period
- The summary is 72 characters or fewer
- Use the imperative mood: "add feature", not "added feature" or "adds feature"
- The scope is optional but helpful — use the class name, file name, or feature area
- The body (if present) explains _why_ this change was made, not _what_ changed — the diff shows the what

---

## Code style

The codebase uses ESLint and Prettier, both enforced automatically on commit. Run `pnpm lint:fix && pnpm format` before you push to keep the diffs clean.

Key rules:

- **No `any`.** TypeScript strict mode is on throughout. If you genuinely need an escape hatch, add a comment explaining why — `// eslint-disable-next-line @typescript-eslint/no-explicit-any — reason here`. These will be flagged in review.
- **Single quotes, trailing commas where valid, semicolons.** Prettier handles this automatically.
- **No unused variables.** TypeScript strict mode catches them, and ESLint will fail on them.
- **No side effects at module load time.** Providers must not connect, request microphone permission, or allocate audio resources until an explicit method call. Importing a provider should be free.
- **Imports** — follow the existing path alias patterns. Don't add new path aliases without discussing it first.
- **Error handling** — don't swallow errors silently. If you catch an exception, either handle it meaningfully or re-throw it. Providers should emit error events rather than throwing, so callers can handle them asynchronously.

---

## Writing tests

Tests live in `tests/` and mirror the `src/` directory structure. The project uses Jest with `ts-jest` and `jsdom` for browser API simulation.

### Guidelines

**Test behaviour, not implementation.** Test what a function does from the outside — its inputs and outputs, the events it emits, the errors it throws. If you find yourself mocking private methods to make a test work, the test is probably too tightly coupled to implementation details. Change the angle.

**Use descriptive names.** A test named `should emit transcription.final when isFinal is true` tells you exactly what broke. A test named `works correctly` tells you nothing when it fails at 2am.

**Cover error paths.** The happy path is usually well-tested. Bugs live in error handling, reconnection logic, edge cases at boundaries, and what happens when an async operation is cancelled mid-flight. These are the paths most worth adding.

**Handle async properly.** Use `async/await` throughout. Mixing callback-style async with Jest matchers leads to false positives where tests pass even when assertions don't run.

**Group with `describe` blocks.** Related tests together, with method names as inner describe blocks:

```typescript
describe('NativeSTT', () => {
  describe('startCapture()', () => {
    it('emits transcription.interim for partial results', async () => {
      // arrange
      const stt = new NativeSTT();
      const handler = jest.fn();
      stt.on('transcription.interim', handler);

      // act
      await stt.startCapture();
      simulatePartialResult('hello world');

      // assert
      expect(handler).toHaveBeenCalledWith({ transcript: 'hello world', isFinal: false });
    });

    it('emits transcription.final when the result is final', async () => {
      // ...
    });

    it('emits transcription.error when the recognition API fails', async () => {
      // ...
    });

    it('resolves cleanly if stopCapture() is called before the first result', async () => {
      // the kind of edge case where bugs actually live
    });
  });
});
```

Run the suite in different modes depending on what you need:

```bash
pnpm test              # full suite, once
pnpm test:watch        # re-runs affected tests on save, good for TDD
pnpm test:coverage     # full suite with coverage report in coverage/
```

---

## Adding a provider

New providers are the most impactful contribution you can make to CompositeVoice. Every new input, STT, LLM, TTS, or output backend makes the SDK more useful to more people. Here's the complete process.

### Understanding the 5-role pipeline

CompositeVoice uses a 5-role pipeline architecture. Every provider declares which roles it covers via a `roles` property:

```
[input] -> InputQueue -> [stt] -> [llm] -> [tts] -> OutputQueue -> [output]
```

| Role     | Purpose                                     | Interface              |
| -------- | ------------------------------------------- | ---------------------- |
| `input`  | Captures audio from a source (mic, buffer)  | `AudioInputProvider`   |
| `stt`    | Converts audio to text                      | `LiveSTTProvider` / `RestSTTProvider` |
| `llm`    | Generates a text response                   | `LLMProvider`          |
| `tts`    | Converts text to audio                      | `LiveTTSProvider` / `RestTTSProvider` |
| `output` | Plays audio to a destination (speakers, file) | `AudioOutputProvider` |

A single provider can cover multiple roles. For example, `NativeSTT` covers both `input` and `stt` because the Web Speech API manages its own microphone internally. Similarly, `NativeTTS` covers `tts` and `output` because `SpeechSynthesis` handles both synthesis and playback.

### 1. Declare the `roles` property

**Every provider must declare its roles.** This is how the SDK knows where to place your provider in the pipeline. Set the `roles` property as a `readonly` array of `ProviderRole` values:

```typescript
import type { ProviderRole } from 'composite-voice';

// Single-role provider (most common)
public readonly roles: readonly ProviderRole[] = ['stt'];

// Multi-role provider (when the underlying API manages its own I/O)
public readonly roles: readonly ProviderRole[] = ['input', 'stt'];
```

The `resolveProviders()` function reads `roles` from each provider in the `providers` array and assigns them to pipeline slots. If a role is covered twice, the SDK throws a `ConfigurationError` naming both conflicting providers.

### 2. Create the provider file

Place your implementation in the correct category:

```
src/providers/input/your-provider/YourProviderInput.ts
src/providers/stt/your-provider/YourProviderSTT.ts
src/providers/llm/your-provider/YourProviderLLM.ts
src/providers/tts/your-provider/YourProviderTTS.ts
src/providers/output/your-provider/YourProviderOutput.ts
```

### 3. Choose the right base class or interface

**For STT, LLM, and TTS providers,** extend the appropriate base class:

| Category | Connection type       | Base class        |
| -------- | --------------------- | ----------------- |
| STT      | Simple / one-shot     | `BaseSTTProvider` |
| STT      | WebSocket / streaming | `LiveSTTProvider` |
| STT      | HTTP REST             | `RestSTTProvider` |
| LLM      | Any                   | `BaseLLMProvider` |
| TTS      | Simple / one-shot     | `BaseTTSProvider` |
| TTS      | WebSocket / streaming | `LiveTTSProvider` |
| TTS      | HTTP REST             | `RestTTSProvider` |

These base classes set their `roles` property automatically (e.g., `BaseSTTProvider` sets `roles = ['stt']`). Override `roles` only if your provider covers additional roles.

**For input and output providers,** implement the interface directly:

| Category | Interface              | Required methods                                                |
| -------- | ---------------------- | --------------------------------------------------------------- |
| Input    | `AudioInputProvider`   | `start()`, `stop()`, `pause()`, `resume()`, `isActive()`, `onAudio(callback)`, `getMetadata()` |
| Output   | `AudioOutputProvider`  | `configure(metadata)`, `enqueue(chunk)`, `flush()`, `stop()`, `pause()`, `resume()`, `isPlaying()`, `onPlaybackStart(cb)`, `onPlaybackEnd(cb)`, `onPlaybackError(cb)` |

Input and output providers also need the `BaseProvider` lifecycle methods (`initialize()`, `dispose()`, `isReady()`).

### 4. Implement the `AudioInputProvider` interface (input providers)

If you're adding a new audio input source (e.g., a file reader, a WebRTC stream, a hardware device), implement `AudioInputProvider`:

```typescript
import type { AudioInputProvider, AudioChunk, AudioMetadata, ProviderType } from 'composite-voice';
import type { ProviderRole } from 'composite-voice';

class MyCustomInput implements AudioInputProvider {
  public readonly type: ProviderType = 'rest';
  public readonly roles: readonly ProviderRole[] = ['input'];

  private callback?: (chunk: AudioChunk) => void;
  private active = false;

  async initialize() { /* set up resources */ }
  async dispose() { /* release resources */ }
  isReady() { return true; }

  start() { this.active = true; /* begin capture */ }
  stop() { this.active = false; /* end capture */ }
  pause() { /* pause capture */ }
  resume() { /* resume capture */ }
  isActive() { return this.active; }

  onAudio(callback: (chunk: AudioChunk) => void) {
    this.callback = callback;
  }

  getMetadata(): AudioMetadata {
    return { sampleRate: 16000, encoding: 'linear16', channels: 1, bitDepth: 16 };
  }
}
```

Key points:
- `onAudio(callback)` is called by the orchestrator _before_ `start()`. Store the callback and invoke it whenever a new audio chunk is available.
- `getMetadata()` describes the audio format. The SDK uses this to auto-configure the STT provider's encoding and sample rate.
- For server-side providers, avoid any browser dependencies (`navigator`, `window`, `AudioContext`). See `BufferInput` as a reference.

### 5. Implement the `AudioOutputProvider` interface (output providers)

If you're adding a new audio output destination (e.g., a file writer, a WebRTC sink, a hardware device), implement `AudioOutputProvider`:

```typescript
import type { AudioOutputProvider, AudioChunk, AudioMetadata, ProviderType } from 'composite-voice';
import type { ProviderRole } from 'composite-voice';

class MyCustomOutput implements AudioOutputProvider {
  public readonly type: ProviderType = 'rest';
  public readonly roles: readonly ProviderRole[] = ['output'];

  async initialize() { /* set up resources */ }
  async dispose() { /* release resources */ }
  isReady() { return true; }

  configure(metadata: AudioMetadata) { /* set up playback format */ }
  enqueue(chunk: AudioChunk) { /* buffer chunk for playback */ }
  async flush() { /* wait for all queued audio to finish */ }
  stop() { /* stop playback immediately */ }
  pause() { /* pause playback */ }
  resume() { /* resume playback */ }
  isPlaying() { return false; }

  onPlaybackStart(callback: () => void) { /* store callback */ }
  onPlaybackEnd(callback: () => void) { /* store callback */ }
  onPlaybackError(callback: (error: Error) => void) { /* store callback */ }
}
```

Key points:
- `configure(metadata)` is called once when the TTS emits format metadata. Use it to set up sample rate, encoding, etc.
- `enqueue(chunk)` is called for each chunk of synthesized audio. Chunks arrive in order.
- `flush()` should resolve when the last enqueued chunk has finished playing.
- For server-side providers that discard audio, see `NullOutput` — all methods are no-ops.

### 6. Study the reference implementations

Before writing your own, read at least one existing provider in the same category:

- `src/providers/input/MicrophoneInput.ts` — browser microphone input wrapping AudioCapture
- `src/providers/input/BufferInput.ts` — server-side push-based input (zero browser dependencies)
- `src/providers/stt/native/NativeSTT.ts` — multi-role (`input`+`stt`), no external dependencies
- `src/providers/stt/deepgram/DeepgramSTT.ts` — WebSocket with reconnection logic and backoff
- `src/providers/llm/anthropic/AnthropicLLM.ts` — HTTP streaming, abort signal handling, token accumulation
- `src/providers/tts/deepgram/DeepgramTTS.ts` — WebSocket streaming TTS with audio buffering
- `src/providers/output/BrowserAudioOutput.ts` — browser speaker output wrapping AudioPlayer
- `src/providers/output/NullOutput.ts` — server-side no-op output

Pattern-matching an existing provider will save you from a lot of the subtle requirements that aren't obvious from the type signatures alone.

### 7. Add the SDK as a peer dependency

If your provider needs a third-party SDK (e.g., `@assemblyai/streaming-sdk`), add it as an **optional peer dependency** in `package.json` — not as a regular dependency. Users should only need to install it if they actually use your provider.

### 8. Export the provider

Add the export to the correct category index file:

- `src/providers/input/index.ts`
- `src/providers/stt/index.ts`
- `src/providers/llm/index.ts`
- `src/providers/tts/index.ts`
- `src/providers/output/index.ts`

And add it to the top-level export in `src/index.ts`.

### 9. Write tests

Create a test file at `tests/unit/providers/<category>/YourProvider.test.ts`. At minimum, cover:

- Successful initialisation and disposal (no leaks, no dangling listeners)
- The happy path: audio capture, transcription, LLM response, speech output, or playback as appropriate
- Error handling — connection failure, non-2xx API response, aborted request
- Reconnection behaviour, if your provider supports it
- That `roles` is declared correctly

Use the existing mock infrastructure in `tests/mocks/` for WebSocket and HTTP stubs — check what's already there before writing your own.

### 10. Document it

- Add a row to the providers table in the main README
- Add the required environment variables to `sample.env` in any examples that use your provider
- Add configuration documentation if there are options that aren't obvious
- Add a new example under `examples/` if your provider introduces patterns that aren't demonstrated elsewhere (e.g., a new input source, a new streaming mode)

### Provider checklist

- [ ] Implementation file in `src/providers/<category>/<name>/`
- [ ] `roles` property declared with correct role(s)
- [ ] Correct base class extended or interface implemented
- [ ] All abstract/interface methods implemented
- [ ] Exported from category index and top-level index
- [ ] Peer dependency added if needed
- [ ] Tests written covering happy path, errors, disposal, and roles declaration
- [ ] README providers table updated
- [ ] `sample.env` entries added for required API keys
- [ ] Example added if new patterns are introduced

---

## Getting help

- **Questions about using the SDK** — [GitHub Discussions](https://github.com/lukeocodes/composite-voice/discussions). This is the right place for "how do I..." questions, integration questions, and anything where you're not sure if it's a bug or a misunderstanding.
- **Bug reports** — [GitHub Issues](https://github.com/lukeocodes/composite-voice/issues). Use the template; it asks for the details that make bugs diagnosable.
- **Security vulnerabilities** — [GitHub Security Advisory](https://github.com/lukeocodes/composite-voice/security/advisories/new). Private channel, only visible to the maintainer.
- **Code of Conduct** — [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)

If something in this guide is unclear, incomplete, or just wrong, that's a documentation bug. Please open an issue or a PR. The best contributor guides are the ones that get corrected by the people who actually use them.
