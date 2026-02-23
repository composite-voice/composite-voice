# Contributing to CompositeVoice

First off — thank you. Whether you're fixing a typo, filing a bug report, improving the docs, or building a new provider, every contribution makes CompositeVoice better for everyone.

This guide covers everything from "I spotted a typo" to "I want to implement a new STT provider." Jump to the section that fits where you are.

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

Not all contributions are code. All of these are genuinely valued:

**No code required:**

- **Report a bug** — a clear, reproducible report saves hours of debugging. Use the [bug report template](https://github.com/lukeocodes/composite-voice/issues/new?template=bug_report.md).
- **Request a feature** — describe the problem you're trying to solve, not just the solution you have in mind. Use the [feature request template](https://github.com/lukeocodes/composite-voice/issues/new?template=feature_request.md).
- **Improve the docs** — typos, clearer examples, missing edge cases, better explanations. Documentation PRs merge quickly.
- **Answer questions** — help others in [GitHub Discussions](https://github.com/lukeocodes/composite-voice/discussions). Your experience is valuable.
- **Show what you built** — share your project in Discussions. It helps others learn what's possible.

**With code:**

- **Fix a bug** — ideally with a test that confirms it stays fixed.
- **Add a new provider** — new STT, LLM, or TTS backends are always welcome. See [Adding a provider](#adding-a-provider).
- **Improve test coverage** — especially error paths and edge cases.
- **Performance improvements** — please include before/after benchmark data.

**Before starting large changes** — new top-level config options, architectural changes, new external dependencies, or breaking public API changes — please [open an issue](https://github.com/lukeocodes/composite-voice/issues/new) first. This prevents duplicate effort and avoids spending time on something that might not fit the project direction. For small fixes and documentation improvements, open a PR directly.

---

## Your first contribution

Not sure where to start? Look for issues labelled:

- [`good first issue`](https://github.com/lukeocodes/composite-voice/labels/good%20first%20issue) — small, well-scoped tasks that don't require deep codebase knowledge
- [`help wanted`](https://github.com/lukeocodes/composite-voice/labels/help%20wanted) — issues where the direction is clear but maintainer capacity is limited
- [`documentation`](https://github.com/lukeocodes/composite-voice/labels/documentation) — docs improvements that don't require running code

If nothing fits, try running one of the [examples](./examples/) and note anything that feels rough, unclear, or underdocumented. A clear bug report is worth as much as a code fix.

Don't hesitate to comment on an issue to say you're working on it — it helps prevent duplicate effort.

---

## Getting started

### Prerequisites

- **Node.js** 18 or later
- **pnpm** 10 or later — `npm install -g pnpm`
- **Git**

### Fork and clone

1. Fork the repository — click **Fork** at the top of [this page](https://github.com/lukeocodes/composite-voice).
2. Clone your fork:

```bash
git clone https://github.com/your-username/composite-voice.git
cd composite-voice
```

3. Add the upstream remote so you can pull future changes:

```bash
git remote add upstream https://github.com/lukeocodes/composite-voice.git
```

### Install and verify

```bash
pnpm install
pnpm build
pnpm test
```

All three commands should succeed. If anything fails, [open an issue](https://github.com/lukeocodes/composite-voice/issues) with the error output — we'll help you get set up.

---

## Development workflow

### Core commands

```bash
# Rebuild the SDK on every file change (watch mode)
pnpm dev

# Run the full test suite
pnpm test

# Run tests in watch mode during development
pnpm test:watch

# Generate a coverage report
pnpm test:coverage

# TypeScript type checking (no emit)
pnpm type-check

# Linting
pnpm lint
pnpm lint:fix

# Code formatting
pnpm format
pnpm format:check
```

### Testing changes in a browser

The fastest way to see your SDK changes running live:

```bash
# Terminal 1 — rebuild the SDK on every src/ change
pnpm dev

# Terminal 2 — run any example (resolves the SDK from local dist/)
pnpm example:00-native-anthropic-native:dev    # http://localhost:3000
```

Vite hot-reloads the example when the SDK rebuild finishes. Changes in `src/` appear in the browser within a second or two. Set up your example's `.env` file first (copy `sample.env`).

### Project structure

```
src/
├── CompositeVoice.ts          # Main orchestrator — wires STT, LLM, TTS together
├── index.ts                   # Public API exports
├── core/
│   ├── audio/                 # AudioCapture, AudioPlayer
│   ├── events/                # Type-safe EventEmitter
│   ├── state/                 # Agent and audio state machines
│   └── types/                 # Shared type definitions
├── providers/
│   ├── base/                  # Abstract base classes (extend these to add providers)
│   ├── stt/                   # NativeSTT, DeepgramSTT
│   ├── llm/                   # AnthropicLLM, OpenAILLM
│   └── tts/                   # NativeTTS, DeepgramTTS
├── proxy/                     # Server-side proxy (isolated entry point, never browser-bundled)
│   ├── adapters/              # Express, Next.js, plain Node.js
│   └── core/                  # HTTP and WebSocket forwarding
└── utils/                     # Audio processing, errors, logging, WebSocket manager

tests/
├── unit/                      # Unit tests — mirror src/ structure exactly
├── integration/               # Full pipeline tests with mock providers
├── mocks/                     # Shared mock provider implementations
└── setup.ts                   # Browser API mocks for jsdom

examples/
├── 00-native-anthropic-native/    # Simplest possible setup
├── 01-deepgram-anthropic-deepgram/ # Production WebSocket pipeline
├── 02-conversation-history/       # Multi-turn memory
├── 03-eager-pipeline/             # Speculative LLM generation
└── 04-proxy-server/               # Server-side API key proxy
```

---

## Submitting a pull request

1. **Sync with upstream** before starting work:

   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **Create a branch** from `main`:

   ```bash
   git checkout -b fix/describe-the-bug
   git checkout -b feat/describe-the-feature
   git checkout -b docs/what-you-improved
   ```

3. **Make focused commits.** One logical change per commit. This makes it easier to review and easier to revert if needed.

4. **Write or update tests** for any behaviour you've changed. New code without tests is likely to regress.

5. **Verify everything passes** before pushing:

   ```bash
   pnpm type-check && pnpm lint && pnpm test
   ```

6. **Push and open a PR** against `main`. Fill in the PR template — link related issues with `Fixes #123`.

### What makes a PR easy to review

- **Small and focused** — one feature or fix per PR, not a refactor + feature + fix bundled together
- **Clear description** — explain _why_ the change was needed, not just what it does
- **Tests that show before/after** — especially for bug fixes
- **No unrelated changes** — avoid sneaking in drive-by cleanups in an unrelated PR

Code review is a conversation, not a verdict. Change requests are normal. We'll work through it together.

---

## Commit style

This project uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by a pre-commit hook. Commits that don't match the format are rejected before they're created.

### Format

```
<type>(<optional scope>): <short description>

<optional body>

<optional footer>
```

### Types

| Type       | When to use                                |
| ---------- | ------------------------------------------ |
| `feat`     | New feature or capability                  |
| `fix`      | Bug fix                                    |
| `docs`     | Documentation only — no code changed       |
| `style`    | Formatting, whitespace — no logic changed  |
| `refactor` | Code restructured without behaviour change |
| `perf`     | Measurable performance improvement         |
| `test`     | Adding or correcting tests                 |
| `chore`    | Build scripts, dependency bumps, tooling   |
| `ci`       | CI/CD configuration                        |
| `build`    | Build system changes                       |
| `revert`   | Reverting a previous commit                |

### Examples

```
feat(proxy): add Next.js App Router adapter
fix(deepgram-stt): handle socket close during reconnection
docs(readme): add turn-taking configuration table
test(native-tts): cover error event when synthesis fails
chore(deps): bump @anthropic-ai/sdk to 0.30.0
```

### Breaking changes

Add `!` after the type/scope and include a `BREAKING CHANGE:` footer:

```
feat(config)!: rename systemPrompt to system

BREAKING CHANGE: the `systemPrompt` option has been renamed to `system`
to align with the Anthropic SDK convention. Update all `AnthropicLLM`
and `OpenAILLM` configurations accordingly.
```

---

## Code style

- **TypeScript strict mode is on.** Avoid `any`. If you genuinely need an escape hatch, add a comment explaining why.
- **Formatting** is enforced by Prettier — run `pnpm format` and it handles everything automatically.
- **Linting** is enforced by ESLint — run `pnpm lint:fix` to auto-fix what can be fixed.
- **Public API surface** — exported classes and public methods should have JSDoc comments.
- Keep functions small and names descriptive. Prefer explicit types over inferred ones at public API boundaries.
- Don't add error handling for scenarios that can't happen at runtime. Trust TypeScript and framework guarantees.
- Don't add backwards-compatibility shims or dead code. If something is unused, delete it.

The coverage threshold is **50% globally**. New code should aim higher, especially for branching logic.

---

## Writing tests

Tests live in `tests/` and mirror the `src/` directory structure. If you add `src/providers/stt/whisper/WhisperSTT.ts`, its test goes in `tests/unit/providers/stt/WhisperSTT.test.ts`.

The test environment is **jsdom** — a simulated browser. APIs that jsdom doesn't provide (`AudioContext`, `MediaDevices`, Web Speech, `WebSocket`) are mocked in `tests/setup.ts`.

```typescript
describe('MyProvider', () => {
  it('emits an error event when initialization fails', async () => {
    const provider = new MyProvider({
      /* intentionally invalid config */
    });
    const errors: Error[] = [];
    provider.on('error', (e) => errors.push(e.error));

    await expect(provider.initialize()).rejects.toThrow();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('expected error text');
  });
});
```

Guidelines:

- **Test behaviour, not implementation.** What does a consumer of this code observe?
- **Cover both happy paths and error paths.** Error paths are where bugs hide.
- **Name tests descriptively.** `it('emits an error when the connection fails')` not `it('handles errors')`.
- Run `pnpm test:watch` during development — it re-runs affected tests automatically on file changes.

---

## Adding a provider

Providers extend one of the abstract base classes in `src/providers/base/`:

| Base class        | Use for                                    |
| ----------------- | ------------------------------------------ |
| `BaseSTTProvider` | Any speech-to-text provider                |
| `LiveSTTProvider` | WebSocket-based real-time STT              |
| `RestSTTProvider` | Request/response STT (batch transcription) |
| `BaseLLMProvider` | Any language model                         |
| `BaseTTSProvider` | Any text-to-speech provider                |
| `LiveTTSProvider` | WebSocket-based streaming TTS              |
| `RestTTSProvider` | Request/response TTS                       |

### Implementation checklist

- [ ] Extends the correct abstract base class
- [ ] Implements all abstract methods (`onInitialize`, `onDispose`, and provider-specific methods)
- [ ] Emits the correct events — see `src/core/events/types.ts` for the complete list
- [ ] Supports `proxyUrl` as an alternative to `apiKey` if the provider makes cross-origin requests
- [ ] Exported from `src/providers/{stt,llm,tts}/index.ts`
- [ ] Re-exported from `src/index.ts`
- [ ] Has a unit test in `tests/unit/providers/`
- [ ] Has a `sample.env` entry in any affected examples
- [ ] Documented in `README.md` under the Providers section

### Reference implementations

Study these before writing your own:

- **WebSocket STT:** [`src/providers/stt/deepgram/DeepgramSTT.ts`](./src/providers/stt/deepgram/DeepgramSTT.ts)
- **HTTP streaming LLM:** [`src/providers/llm/anthropic/AnthropicLLM.ts`](./src/providers/llm/anthropic/AnthropicLLM.ts)
- **WebSocket TTS:** [`src/providers/tts/deepgram/DeepgramTTS.ts`](./src/providers/tts/deepgram/DeepgramTTS.ts)
- **Browser-native STT:** [`src/providers/stt/native/NativeSTT.ts`](./src/providers/stt/native/NativeSTT.ts)

---

## Getting help

- **Questions and ideas** — [GitHub Discussions](https://github.com/lukeocodes/composite-voice/discussions)
- **Bug reports** — [GitHub Issues](https://github.com/lukeocodes/composite-voice/issues)
- **Security vulnerabilities** — [GitHub Security Advisory](https://github.com/lukeocodes/composite-voice/security/advisories/new) — private channel, please don't use public issues
- **Code of conduct** — [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)

We want every contributor to feel welcome here. If something in this guide is unclear or out of date, that's a bug — please open an issue or send a PR to fix it.
