# Contributing to CompositeVoice

First off — thank you. Whether you're opening your first issue, fixing a bug, adding a new provider, or just asking a question, you're making this project better for everyone.

This guide covers everything you need to get from zero to a merged pull request.

---

## Table of contents

- [Ways to contribute](#ways-to-contribute)
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

Not all contributions are code. All of these are genuinely valuable:

**No code needed:**
- Report a bug — a clear, reproducible bug report saves hours of debugging
- Request a feature — describe the problem you're trying to solve, not just the solution
- Improve documentation — typo fixes, clearer examples, missing edge cases
- Answer questions in [Discussions](https://github.com/lukeocodes/composite-voice/discussions)
- Share what you've built with CompositeVoice

**With code:**
- Fix a bug (ideally with a test that proves it stays fixed)
- Implement a new provider (see [Adding a provider](#adding-a-provider))
- Improve test coverage for edge cases and error paths
- Performance improvements (with benchmark data to back them up)
- Browser compatibility fixes

**Before starting large changes** — new top-level config options, architectural changes, new external dependencies, or breaking public API changes — please [open an issue](https://github.com/lukeocodes/composite-voice/issues/new) first. A short description of your intent is enough. This prevents duplicate work and saves you from spending time on something that might be rejected for reasons that aren't obvious up front.

For bug fixes and small improvements, open a pull request directly.

---

## Getting started

### Prerequisites

- **Node.js** 18 or later
- **pnpm** 10 or later — `npm install -g pnpm`
- **Git**

### Fork and clone

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/your-username/composite-voice.git
cd composite-voice
pnpm install
```

### Build and verify

```bash
pnpm build
pnpm test
```

If both commands pass, your environment is ready. If something fails, [open an issue](https://github.com/lukeocodes/composite-voice/issues) and include the full output — we'll help.

---

## Development workflow

### Core commands

```bash
# Watch mode — rebuilds the SDK on every file save
pnpm dev

# Run the full test suite
pnpm test

# Run tests in watch mode
pnpm test:watch

# Coverage report (must meet 50% threshold)
pnpm test:coverage

# TypeScript type checking
pnpm type-check

# Linting
pnpm lint
pnpm lint:fix     # auto-fix what's fixable

# Formatting
pnpm format
pnpm format:check
```

### Testing against an example

The easiest way to see your changes in action is to run one of the example apps:

```bash
# Build the SDK first
pnpm build

# Then run an example (SDK is resolved from the workspace dist/)
pnpm example:00-native-anthropic-native:dev       # http://localhost:3000
pnpm example:01-deepgram-anthropic-deepgram:dev   # http://localhost:3001
```

While developing, run `pnpm dev` in one terminal and the example in another. Vite will pick up SDK changes after each rebuild.

### Project structure

```
src/
├── CompositeVoice.ts          # Main orchestrator class
├── index.ts                   # Public API barrel export
├── core/
│   ├── audio/                 # AudioCapture, AudioPlayer
│   ├── events/                # Type-safe EventEmitter
│   ├── state/                 # Agent and audio state machines
│   └── types/                 # Shared type definitions
├── providers/
│   ├── base/                  # Abstract base classes
│   ├── stt/                   # NativeSTT, DeepgramSTT
│   ├── llm/                   # AnthropicLLM, OpenAILLM
│   └── tts/                   # NativeTTS, DeepgramTTS
├── proxy/                     # Server-side proxy (isolated entry point)
└── utils/                     # Audio processing, errors, logging, etc.

tests/
├── unit/                      # Mirrors src/ structure
├── integration/               # Full pipeline tests
├── mocks/                     # Shared mock provider implementations
└── setup.ts                   # Browser API mocks (jsdom)

examples/
├── 00-native-anthropic-native/
├── 01-deepgram-anthropic-deepgram/
├── 02-conversation-history/
├── 03-eager-pipeline/
└── 04-proxy-server/
```

---

## Submitting a pull request

1. **Create a branch** from `main`:

   ```bash
   git checkout -b fix/describe-the-bug
   # or
   git checkout -b feat/describe-the-feature
   # or
   git checkout -b docs/what-you-improved
   ```

2. **Make focused commits.** One logical change per commit. It's easier to review and easier to revert if needed.

3. **Write or update tests** for any changed behaviour. New code without tests is likely to regress.

4. **Verify everything passes:**

   ```bash
   pnpm type-check && pnpm lint && pnpm test
   ```

5. **Push your branch** and open a pull request against `main`.

6. **Fill in the PR description.** Use the template — it's short. Link related issues with `Fixes #123`.

Pull requests are reviewed by the maintainer. We may ask for changes before merging. Please don't take this personally — code review is a conversation, and the goal is a better end result for everyone.

---

## Commit style

This project enforces [Conventional Commits](https://www.conventionalcommits.org/) via a pre-commit hook. Messages that don't match the format will be rejected by commitlint.

### Format

```
<type>(<optional scope>): <short description>

<optional body>

<optional footer>
```

### Types

| Type | Use for |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, whitespace (no logic change) |
| `refactor` | Code restructuring without behaviour change |
| `perf` | Performance improvement |
| `test` | Adding or correcting tests |
| `chore` | Build scripts, dependency bumps, tooling |
| `ci` | CI configuration changes |
| `build` | Build system changes |
| `revert` | Reverting a previous commit |

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
to align with the Anthropic SDK convention. Update all call sites.
```

---

## Code style

- **TypeScript strict mode is on.** Avoid `any` — if you genuinely need an escape hatch, add a comment explaining why.
- **Formatting** is enforced by Prettier (`pnpm format`). There's nothing to debate — just run it.
- **Linting** is enforced by ESLint (`pnpm lint:fix`).
- **Public API surface** should have JSDoc comments on classes and methods.
- Keep functions small and names descriptive. Prefer explicit types over inferred ones at public API boundaries.
- Don't add error handling for things that cannot go wrong at runtime. Trust TypeScript and internal guarantees.
- Don't add backwards-compatibility shims, feature flags, or dead code paths. If something is unused, remove it.

---

## Writing tests

Tests live in `tests/` and mirror the `src/` directory structure.

```
tests/
├── unit/          # Unit tests — mirror src/
├── integration/   # End-to-end tests for the full pipeline
├── mocks/         # Shared mock provider implementations
└── setup.ts       # Browser API mocks (AudioContext, MediaDevices, Web Speech, WebSocket)
```

The test environment is **jsdom** (a simulated browser). Browser APIs that jsdom doesn't provide (`AudioContext`, `MediaDevices`, Web Speech API, `WebSocket`) are mocked in `tests/setup.ts`.

### What makes a good test

```typescript
describe('MyFeature', () => {
  it('emits an error event when initialization fails', async () => {
    const provider = new MyProvider({ /* intentionally bad config */ });
    const errors: Error[] = [];
    provider.on('error', (e) => errors.push(e.error));

    await expect(provider.initialize()).rejects.toThrow();
    expect(errors).toHaveLength(1);
  });
});
```

- Test behaviour, not implementation. What does a user observe when X happens?
- Cover the happy path and the error paths.
- Name tests descriptively: `it('emits an error when ...')` not `it('works')`.
- The coverage threshold is 50% globally. New code should aim higher — especially branching logic and error paths.

---

## Adding a provider

Providers extend one of the abstract base classes in `src/providers/base/`:

| Base class | Use for |
|------------|---------|
| `BaseSTTProvider` | Any speech-to-text provider |
| `LiveSTTProvider` | WebSocket-based real-time STT |
| `RestSTTProvider` | Request/response STT |
| `BaseLLMProvider` | Any language model |
| `BaseTTSProvider` | Any text-to-speech provider |
| `LiveTTSProvider` | WebSocket-based streaming TTS |
| `RestTTSProvider` | Request/response TTS |

### Implementation checklist

- [ ] Extends the correct abstract base class
- [ ] Implements all abstract methods (`onInitialize`, `onDispose`, and provider-specific methods)
- [ ] Emits the correct events — see `src/core/events/types.ts` for the complete list
- [ ] Supports `proxyUrl` as an alternative to `apiKey` if the provider has CORS restrictions
- [ ] Exported from `src/providers/{stt,llm,tts}/index.ts`
- [ ] Re-exported from `src/index.ts`
- [ ] Has a unit test in `tests/unit/providers/`
- [ ] Has a `sample.env` entry in any affected examples
- [ ] Documented in `README.md` under the Providers section

### Reference implementations

- **WebSocket STT:** `src/providers/stt/deepgram/DeepgramSTT.ts`
- **HTTP streaming LLM:** `src/providers/llm/anthropic/AnthropicLLM.ts`
- **WebSocket TTS:** `src/providers/tts/deepgram/DeepgramTTS.ts`

These are the canonical patterns. Follow them closely for consistency.

---

## Getting help

- **Questions and ideas** — [GitHub Discussions](https://github.com/lukeocodes/composite-voice/discussions)
- **Bug reports** — [GitHub Issues](https://github.com/lukeocodes/composite-voice/issues)
- **Security vulnerabilities** — [GitHub Security Advisory](https://github.com/lukeocodes/composite-voice/security/advisories/new) (private, please don't use public issues)
- **Code of conduct** — [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
