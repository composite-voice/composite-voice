# Contributing to CompositeVoice

Thank you for your interest in contributing. Whether you're fixing a bug, adding a new provider, improving documentation, or just asking a question — you're welcome here.

This document covers everything you need to get started.

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

**No code needed:**
- Report a bug — a clear bug report is enormously helpful
- Request a feature — describe the use case, not just the solution
- Improve documentation — fix typos, add examples, clarify confusing sections
- Answer questions in Discussions
- Share the project if you find it useful

**With code:**
- Fix a bug (ideally with a test that proves it's fixed)
- Implement a new provider (see [Adding a provider](#adding-a-provider))
- Improve test coverage for edge cases
- Performance improvements (with benchmark data)
- Accessibility or browser compatibility fixes

**Before starting large changes** (architectural changes, new dependencies, public API changes, new top-level config options) — please open an issue first so we can discuss the approach. This saves everyone time.

For straightforward bug fixes and small improvements, open a pull request directly.

---

## Getting started

### Prerequisites

- **Node.js** 18 or later
- **pnpm** 10 or later (`npm install -g pnpm`)
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

If both commands pass, your environment is ready. If something fails, [open an issue](https://github.com/lukeocodes/composite-voice/issues) and we'll help.

---

## Development workflow

```bash
# Watch mode — rebuilds the SDK on every file save
pnpm dev

# Run the full test suite
pnpm test

# Run tests in watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage

# TypeScript type checking
pnpm type-check

# Linting
pnpm lint
pnpm lint:fix     # auto-fix

# Formatting
pnpm format
pnpm format:check
```

### Testing against an example

```bash
pnpm build
pnpm example:00-native-anthropic-native:dev
```

Nx builds the SDK automatically before starting the example, so after your first `pnpm build` you can just run the example command directly while `pnpm dev` is running in another terminal.

---

## Submitting a pull request

1. **Create a branch** from `main`:

   ```bash
   git checkout -b fix/describe-what-you-fixed
   # or
   git checkout -b feat/describe-what-you-added
   ```

2. **Make focused commits** — one logical change per commit. It's easier to review and easier to revert if needed.

3. **Write or update tests** for your change. New behaviour without a test is likely to regress.

4. **Verify everything passes:**

   ```bash
   pnpm type-check && pnpm lint && pnpm test
   ```

5. **Push your branch** and open a pull request against `main`.

6. **Fill in the PR description.** Explain what the change does and why. Link to any related issues with `Fixes #123`.

Pull requests are reviewed by the maintainer. We may ask for changes before merging — please don't take this personally. Code review is a conversation, not a judgement.

---

## Commit style

This project uses [Conventional Commits](https://www.conventionalcommits.org/). A pre-commit hook (via commitlint) enforces the format.

```
<type>(<optional scope>): <short description>

<optional body>

<optional footer>
```

**Types:**

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
| `ci` | CI configuration |
| `build` | Build system changes |
| `revert` | Reverting a previous commit |

**Examples:**

```
feat(proxy): add Next.js App Router adapter
fix(deepgram-stt): handle socket close during reconnection
docs(readme): add turn-taking configuration table
test(native-tts): cover error event when synthesis fails
chore(deps): bump @anthropic-ai/sdk to 0.30.0
```

Breaking changes: add `!` after the type/scope and include a `BREAKING CHANGE:` footer:

```
feat(config)!: rename systemPrompt to system

BREAKING CHANGE: the `systemPrompt` option has been renamed to `system`
to align with the Anthropic SDK convention.
```

---

## Code style

- TypeScript strict mode is on. Avoid `any` — if you genuinely need it, add a comment explaining why.
- Formatting is enforced by Prettier (`pnpm format`).
- Linting is enforced by ESLint (`pnpm lint:fix`).
- All public API surface should have JSDoc comments.
- Keep functions small and names descriptive. Prefer explicit types over inferred ones in public APIs.
- Don't add error handling for things that can't go wrong. Trust TypeScript and framework guarantees.

---

## Writing tests

Tests live in `tests/` and mirror the structure of `src/`.

```
tests/
├── unit/          # Unit tests, mirroring src/
├── integration/   # End-to-end tests for the full pipeline
├── mocks/         # Shared mock implementations
└── setup.ts       # Browser API mocks (AudioContext, MediaDevices, etc.)
```

The test environment is **jsdom** (a simulated browser). Browser APIs that don't exist in jsdom (`AudioContext`, `MediaDevices`, Web Speech, `WebSocket`) are mocked in `tests/setup.ts`.

**A good test:**

```typescript
describe('MyFeature', () => {
  it('emits an error event when initialization fails', async () => {
    const provider = new MyProvider({ /* bad config */ });
    const errors: Error[] = [];
    provider.on('error', (e) => errors.push(e.error));

    await expect(provider.initialize()).rejects.toThrow();
    expect(errors).toHaveLength(1);
  });
});
```

The coverage threshold is 50% across branches, functions, lines, and statements. New code should aim higher — especially for branching logic and error paths.

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

**Checklist for a new provider:**

- [ ] Extends the correct abstract base class
- [ ] Implements all abstract methods (`onInitialize`, `onDispose`, and the provider-specific ones)
- [ ] Emits the correct events (see `src/core/events/types.ts` for the full list)
- [ ] Supports `proxyUrl` as an alternative to `apiKey` if the provider has CORS restrictions
- [ ] Exported from the correct `src/providers/{stt,llm,tts}/index.ts`
- [ ] Re-exported from `src/index.ts`
- [ ] Has a unit test in `tests/unit/providers/`
- [ ] Has a `sample.env` entry in any affected examples
- [ ] Documented in `README.md` under the Providers section

A good reference implementation is `src/providers/stt/deepgram/DeepgramSTT.ts` for a WebSocket provider, or `src/providers/llm/anthropic/AnthropicLLM.ts` for an HTTP streaming provider.

---

## Getting help

- **Questions and ideas** — [GitHub Discussions](https://github.com/lukeocodes/composite-voice/discussions)
- **Bug reports** — [GitHub Issues](https://github.com/lukeocodes/composite-voice/issues)
- **Security vulnerabilities** — [GitHub Security Advisory](https://github.com/lukeocodes/composite-voice/security/advisories/new) (private)
- **Code of conduct** — [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
