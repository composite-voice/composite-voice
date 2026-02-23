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
- **Add a new provider** — new STT, LLM, or TTS backends are the heart of what makes this SDK useful. See [Adding a provider](#adding-a-provider) for the full walkthrough.
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
pnpm example:00-native-anthropic-native:dev
```

Available example servers:

```bash
pnpm example:00-native-anthropic-native:dev       # NativeSTT + AnthropicLLM + NativeTTS
pnpm example:01-deepgram-anthropic-deepgram:dev   # DeepgramSTT + AnthropicLLM + DeepgramTTS
pnpm example:02-conversation-history:dev          # multi-turn conversation with history
pnpm example:03-eager-pipeline:dev                # streaming TTS before LLM finishes
pnpm example:04-proxy-server:dev                  # server-side proxy, zero browser keys
```

Each example needs its own `.env` file with API credentials. Copy the sample template and fill in your keys:

```bash
cp examples/00-native-anthropic-native/sample.env examples/00-native-anthropic-native/.env
# open .env and add your keys — it's gitignored, so it won't get committed
```

---

## Project structure

```
src/
├── CompositeVoice.ts          # main orchestrator — wires STT, LLM, and TTS together
├── core/
│   ├── audio/                 # AudioCapture (microphone input), AudioPlayer (speech output)
│   ├── events/                # type-safe EventEmitter
│   ├── state/                 # agent state machine (idle → listening → thinking → speaking)
│   └── types/                 # shared TypeScript types and interfaces
├── providers/
│   ├── base/                  # abstract base classes — the contracts each provider must fulfil
│   ├── stt/                   # speech-to-text providers (NativeSTT, DeepgramSTT, ...)
│   ├── llm/                   # language model providers (AnthropicLLM, OpenAILLM, ...)
│   └── tts/                   # text-to-speech providers (NativeTTS, DeepgramTTS, ...)
├── proxy/                     # server-side proxy middleware (keeps API keys off the browser)
└── utils/                     # shared utility functions

tests/
├── unit/                      # unit tests, mirroring the src/ directory structure
├── integration/               # end-to-end pipeline tests (full STT → LLM → TTS cycle)
├── mocks/                     # shared mock providers, stubs, and fake responses
└── setup.ts                   # browser API mocks — AudioContext, WebSocket, MediaStream, etc.

examples/
├── 00-native-anthropic-native/       # minimal setup using only browser-native APIs
├── 01-deepgram-anthropic-deepgram/   # production-quality STT + TTS via Deepgram
├── 02-conversation-history/          # multi-turn conversation with accumulated context
├── 03-eager-pipeline/                # start speaking before the LLM finishes (lower latency)
└── 04-proxy-server/                  # full proxy setup — no API keys in the browser
```

The most useful files to read before making changes to the core pipeline are `CompositeVoice.ts` and the base classes in `src/providers/base/`. If you're adding or modifying a provider, start with an existing provider in the same category.

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

New providers are the most impactful contribution you can make to CompositeVoice. Every new STT, LLM, or TTS backend makes the SDK more useful to more people. Here's the complete process.

### 1. Create the provider file

Place your implementation in the correct category:

```
src/providers/stt/your-provider/YourProviderSTT.ts
src/providers/llm/your-provider/YourProviderLLM.ts
src/providers/tts/your-provider/YourProviderTTS.ts
```

### 2. Choose the right base class

| Category | Connection type       | Base class        |
| -------- | --------------------- | ----------------- |
| STT      | Simple / one-shot     | `BaseSTTProvider` |
| STT      | WebSocket / streaming | `LiveSTTProvider` |
| STT      | HTTP REST             | `RestSTTProvider` |
| LLM      | Any                   | `BaseLLMProvider` |
| TTS      | Simple / one-shot     | `BaseTTSProvider` |
| TTS      | WebSocket / streaming | `LiveTTSProvider` |
| TTS      | HTTP REST             | `RestTTSProvider` |

### 3. Implement the required abstract methods

Each base class declares abstract methods you must implement — `onInitialize`, `onDispose`, `startCapture`, `startSpeaking`, and so on depending on category. TypeScript will tell you if you're missing something at compile time. Don't implement anything beyond what the interface requires unless it's needed to make the provider work correctly.

### 4. Study the reference implementations

Before writing your own, read at least one existing provider in the same category:

- `src/providers/stt/native/NativeSTT.ts` — the simplest possible STT, no external dependencies, good starting point
- `src/providers/stt/deepgram/DeepgramSTT.ts` — WebSocket with reconnection logic and backoff
- `src/providers/llm/anthropic/AnthropicLLM.ts` — HTTP streaming, abort signal handling, token accumulation
- `src/providers/tts/deepgram/DeepgramTTS.ts` — WebSocket streaming TTS with audio buffering

Pattern-matching an existing provider will save you from a lot of the subtle requirements that aren't obvious from the type signatures alone.

### 5. Add the SDK as a peer dependency

If your provider needs a third-party SDK (e.g., `@assemblyai/streaming-sdk`), add it as an **optional peer dependency** in `package.json` — not as a regular dependency. Users should only need to install it if they actually use your provider.

### 6. Export the provider

Add the export to the correct category index file:

- `src/providers/stt/index.ts`
- `src/providers/llm/index.ts`
- `src/providers/tts/index.ts`

And add it to the top-level export in `src/index.ts`.

### 7. Write tests

Create a test file at `tests/unit/providers/<category>/YourProvider.test.ts`. At minimum, cover:

- Successful initialisation and disposal (no leaks, no dangling listeners)
- The happy path: transcription, LLM response, or speech output as appropriate
- Error handling — connection failure, non-2xx API response, aborted request
- Reconnection behaviour, if your provider supports it

Use the existing mock infrastructure in `tests/mocks/` for WebSocket and HTTP stubs — check what's already there before writing your own.

### 8. Document it

- Add a row to the providers table in the main README
- Add the required environment variables to `sample.env` in any examples that use your provider
- Add configuration documentation if there are options that aren't obvious
- Add a new example under `examples/` if your provider introduces patterns that aren't demonstrated elsewhere (e.g., a new reconnection strategy, a new streaming mode)

### Provider checklist

- [ ] Implementation file in `src/providers/<category>/<name>/`
- [ ] Correct base class extended
- [ ] All abstract methods implemented
- [ ] Exported from category index and top-level index
- [ ] Peer dependency added if needed
- [ ] Tests written covering happy path, errors, and disposal
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
