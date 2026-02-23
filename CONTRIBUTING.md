# Contributing to CompositeVoice

Welcome! We're genuinely glad you're here.

CompositeVoice is open source and we believe it gets better when more people contribute to it. Whether this is your first open-source contribution or your thousandth, whether you're fixing a typo or building a new provider — you're in the right place.

This guide covers everything you need to go from "I want to help" to a merged pull request.

---

## Table of contents

- [Ways to contribute](#ways-to-contribute)
- [Your first contribution](#your-first-contribution)
- [Getting started](#getting-started)
- [Development workflow](#development-workflow)
- [Submitting a pull request](#submitting-a-pull-request)
- [Commit style](#commit-style)
- [Code style](#code-style)
- [Writing tests](#writing-tests)
- [Adding a provider](#adding-a-provider)
- [Getting help](#getting-help)

---

## Ways to contribute

Not all contributions are code. These are all genuinely valuable:

**No code required:**
- **Report a bug** — a clear, reproducible bug report saves hours of debugging. Use the [bug report template](https://github.com/lukeocodes/composite-voice/issues/new?template=bug_report.md).
- **Request a feature** — describe the problem you're trying to solve, not just the solution. Use the [feature request template](https://github.com/lukeocodes/composite-voice/issues/new?template=feature_request.md).
- **Improve docs** — typo fixes, clearer examples, missing edge cases, better explanations. Docs PRs merge fast.
- **Answer questions** — help others in [GitHub Discussions](https://github.com/lukeocodes/composite-voice/discussions).
- **Share what you've built** — post in Discussions or link to your project.

**With code:**
- **Fix a bug** — ideally with a test that proves it stays fixed.
- **Implement a new provider** — see [Adding a provider](#adding-a-provider) for the checklist.
- **Improve test coverage** — especially for edge cases and error paths.
- **Performance improvements** — please include benchmark data.
- **Browser compatibility** — fixes for specific browsers or environments.

**Before starting large changes** — new top-level config options, architectural changes, new external dependencies, or breaking public API changes — please [open an issue](https://github.com/lukeocodes/composite-voice/issues/new) first. A short description of your intent is enough. This prevents duplicate work and avoids you spending time on a direction that might not be the right fit.

For bug fixes and small improvements, open a PR directly.

---

## Your first contribution

Not sure where to start? Look for issues labelled:

- [`good first issue`](https://github.com/lukeocodes/composite-voice/labels/good%20first%20issue) — small, well-defined tasks that don't require deep knowledge of the codebase
- [`help wanted`](https://github.com/lukeocodes/composite-voice/labels/help%20wanted) — issues where maintainer input is available but the work is ready to be picked up
- [`documentation`](https://github.com/lukeocodes/composite-voice/labels/documentation) — documentation improvements that don't require running code

If nothing on the list resonates, try running one of the [examples](./examples/) and see if anything feels rough. Good bug reports are worth as much as code.

---

## Getting started

### Prerequisites

- **Node.js** 18 or later
- **pnpm** 10 or later — `npm install -g pnpm`
- **Git**

### Fork and clone

1. Fork the repository on GitHub — click the **Fork** button at the top right of [this page](https://github.com/lukeocodes/composite-voice).
2. Clone your fork:

```bash
git clone https://github.com/your-username/composite-voice.git
cd composite-voice
```

3. Add the upstream remote so you can sync later:

```bash
git remote add upstream https://github.com/lukeocodes/composite-voice.git
```

### Install and verify

```bash
pnpm install
pnpm build
pnpm test
```

If all three commands succeed, your environment is ready.

If something fails, [open an issue](https://github.com/lukeocodes/composite-voice/issues) with the full output — we'll help you get set up.

---

## Development workflow

### Core commands

```bash
# Rebuild the SDK on every file change
pnpm dev

# Run the full test suite
pnpm test

# Run tests in watch mode (reruns affected tests on save)
pnpm test:watch

# Generate a coverage report (must meet the 50% global threshold)
pnpm test:coverage

# TypeScript type checking (no emit)
pnpm type-check

# Linting
pnpm lint
pnpm lint:fix     # auto-fix what can be fixed automatically

# Formatting
pnpm format
pnpm format:check
```

### Testing changes against an example

The fastest way to see your changes in action:

```bash
# Terminal 1: watch mode SDK rebuild
pnpm dev

# Terminal 2: run an example (resolves the SDK from the local dist/)
pnpm example:00-native-anthropic-native:dev    # http://localhost:3000
```

Vite hot-reloads the example whenever the SDK rebuild completes. Changes in `src/` appear in the browser within a second or two.

### Project structure

```
src/
├── CompositeVoice.ts          # Main orchestrator — wires STT, LLM, TTS together
├── index.ts                   # Public API barrel export
├── core/
│   ├── audio/                 # AudioCapture, AudioPlayer
│   ├── events/                # Type-safe EventEmitter
│   ├── state/                 # Agent and audio state machines
│   └── types/                 # Shared type definitions
├── providers/
│   ├── base/                  # Abstract base classes (extend these)
│   ├── stt/                   # NativeSTT, DeepgramSTT
│   ├── llm/                   # AnthropicLLM, OpenAILLM
│   └── tts/                   # NativeTTS, DeepgramTTS
├── proxy/                     # Server-side proxy (isolated entry point)
│   ├── adapters/              # Express, Next.js, plain Node.js
│   └── core/                  # HTTP and WebSocket forwarding
└── utils/                     # Audio processing, errors, logging, WebSocket manager

tests/
├── unit/                      # Unit tests — mirror src/ structure exactly
├── integration/               # Full pipeline tests with mock providers
├── mocks/                     # Shared mock provider implementations
└── setup.ts                   # Browser API mocks for jsdom (AudioContext, Web Speech, etc.)

examples/
├── 00-native-anthropic-native/    # Simplest possible agent
├── 01-deepgram-anthropic-deepgram/ # Best-in-class WebSocket setup
├── 02-conversation-history/       # Multi-turn memory
├── 03-eager-pipeline/             # Speculative LLM generation
└── 04-proxy-server/               # Server-side API key proxy
```

---

## Submitting a pull request

1. **Create a branch** from `main`:

   ```bash
   git checkout -b fix/describe-the-bug
   git checkout -b feat/describe-the-feature
   git checkout -b docs/what-you-improved
   ```

2. **Make focused commits.** One logical change per commit. Easier to review, easier to revert.

3. **Write or update tests** for any behaviour you've changed. New code without tests is likely to regress.

4. **Verify everything passes** before pushing:

   ```bash
   pnpm type-check && pnpm lint && pnpm test
   ```

5. **Push your branch** and open a pull request against `main`.

6. **Fill in the PR description.** Link related issues with `Fixes #123` or `Closes #456`.

Pull requests are reviewed by the maintainer. We may ask for changes before merging. That's normal — code review is a conversation, not a judgment. The goal is a better end result for everyone.

### What makes a PR easy to review

- Small, focused changes (one feature or fix per PR)
- A clear description of *why* the change is needed, not just *what* it does
- Tests that demonstrate the before/after behaviour
- No unrelated changes mixed in

---

## Commit style

This project enforces [Conventional Commits](https://www.conventionalcommits.org/) via a pre-commit hook (`commitlint`). Commits that don't match the format are rejected before they're created.

### Format

```
<type>(<optional scope>): <short description>

<optional body>

<optional footer>
```

### Types

| Type | When to use |
|------|-------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `docs` | Documentation only — no code changed |
| `style` | Formatting, whitespace — no logic changed |
| `refactor` | Code restructured without behaviour change |
| `perf` | Measurable performance improvement |
| `test` | Adding or correcting tests |
| `chore` | Build scripts, dependency bumps, tooling |
| `ci` | CI/CD configuration |
| `build` | Build system changes |
| `revert` | Reverting a previous commit |

### Examples

```
feat(proxy): add Next.js App Router adapter
fix(deepgram-stt): handle socket close during reconnection
docs(readme): add turn-taking configuration table
test(native-tts): cover error event when synthesis fails
chore(deps): bump @anthropic-ai/sdk to 0.30.0
refactor(state): simplify agent state machine transitions
```

### Breaking changes

Add `!` after the type/scope and include a `BREAKING CHANGE:` footer:

```
feat(config)!: rename systemPrompt to system

BREAKING CHANGE: the `systemPrompt` option has been renamed to `system`
to align with the Anthropic SDK convention. Update all call sites.
```

---

## Code style

- **TypeScript strict mode is on.** Avoid `any`. If you genuinely need an escape hatch, add a comment explaining why.
- **Formatting** is enforced by Prettier — just run `pnpm format` and it will sort everything out.
- **Linting** is enforced by ESLint — run `pnpm lint:fix` to auto-fix what's fixable.
- **Public API surface** — classes and public methods should have JSDoc comments.
- Keep functions small and names descriptive. Prefer explicit types over inferred ones at public API boundaries.
- Don't add error handling for things that cannot go wrong at runtime. Trust TypeScript and internal guarantees.
- Don't add backwards-compatibility shims or dead code paths. If something is unused, remove it.

---

## Writing tests

Tests live in `tests/` and mirror the `src/` directory structure exactly. If you add `src/providers/stt/whisper/WhisperSTT.ts`, its test goes in `tests/unit/providers/stt/WhisperSTT.test.ts`.

The test environment is **jsdom** — a simulated browser. Browser APIs that jsdom doesn't provide (`AudioContext`, `MediaDevices`, Web Speech API, `WebSocket`) are mocked in `tests/setup.ts`.

### What makes a good test

```typescript
describe('MyProvider', () => {
  it('emits an error event when initialization fails', async () => {
    const provider = new MyProvider({ /* intentionally invalid config */ });
    const errors: Error[] = [];
    provider.on('error', (e) => errors.push(e.error));

    await expect(provider.initialize()).rejects.toThrow();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('expected error text');
  });

  it('emits interim transcripts as audio arrives', async () => {
    // ...
  });
});
```

Guidelines:
- **Test behaviour, not implementation.** What does a consumer of this code observe?
- **Cover the happy path and error paths.** Error paths are where bugs hide.
- **Name tests descriptively:** `it('emits an error when connection fails')` not `it('handles errors')`.
- **The coverage threshold is 50% globally.** New code should aim higher, especially for branching logic.

---

## Adding a provider

Providers extend one of the abstract base classes in `src/providers/base/`:

| Base class | Use for |
|------------|---------|
| `BaseSTTProvider` | Any speech-to-text provider |
| `LiveSTTProvider` | WebSocket-based real-time STT |
| `RestSTTProvider` | Request/response STT (batch transcription) |
| `BaseLLMProvider` | Any language model |
| `BaseTTSProvider` | Any text-to-speech provider |
| `LiveTTSProvider` | WebSocket-based streaming TTS |
| `RestTTSProvider` | Request/response TTS |

### Implementation checklist

- [ ] Extends the correct abstract base class
- [ ] Implements all abstract methods (`onInitialize`, `onDispose`, and provider-specific methods)
- [ ] Emits the correct events — see `src/core/events/types.ts` for the full list
- [ ] Supports `proxyUrl` as an alternative to `apiKey` if the provider makes cross-origin requests
- [ ] Exported from `src/providers/{stt,llm,tts}/index.ts`
- [ ] Re-exported from `src/index.ts`
- [ ] Has a unit test in `tests/unit/providers/`
- [ ] Has a `sample.env` entry in any affected examples
- [ ] Documented in `README.md` under the Providers section

### Reference implementations

Study these before writing your own — they demonstrate the correct patterns:

- **WebSocket STT:** [`src/providers/stt/deepgram/DeepgramSTT.ts`](./src/providers/stt/deepgram/DeepgramSTT.ts)
- **HTTP streaming LLM:** [`src/providers/llm/anthropic/AnthropicLLM.ts`](./src/providers/llm/anthropic/AnthropicLLM.ts)
- **WebSocket TTS:** [`src/providers/tts/deepgram/DeepgramTTS.ts`](./src/providers/tts/deepgram/DeepgramTTS.ts)
- **Browser-native STT:** [`src/providers/stt/native/NativeSTT.ts`](./src/providers/stt/native/NativeSTT.ts)

---

## Getting help

Stuck? Don't struggle alone.

- **Questions and ideas** — [GitHub Discussions](https://github.com/lukeocodes/composite-voice/discussions) — the best place for open-ended questions
- **Bug reports** — [GitHub Issues](https://github.com/lukeocodes/composite-voice/issues)
- **Security vulnerabilities** — [GitHub Security Advisory](https://github.com/lukeocodes/composite-voice/security/advisories/new) — private channel, please don't use public issues for security reports
- **Code of conduct** — [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)

We want every contributor to feel welcome and supported. If something in this guide is unclear or out of date, that's a bug — please open an issue or send a PR.
