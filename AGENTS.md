# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Project Overview

**composite-voice** is a TypeScript SDK for building voice agents with a pluggable 5-role audio pipeline. It supports browser and server-side runtimes with an event-driven architecture.

## 5-Role Pipeline Architecture

The SDK uses a 5-role pipeline where each role is filled by a provider:

```
[InputProvider] → InputQueue → [STTProvider] → [LLMProvider] → [TTSProvider] → OutputQueue → [OutputProvider]
```

The five roles are: `input`, `stt`, `llm`, `tts`, `output` (defined as `ProviderRole` in `src/core/types/roles.ts`).

### Array-Based Config

Providers are configured as a flat array. The SDK resolves them to a typed `ResolvedPipeline` via `resolveProviders()`:

```typescript
const voice = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new DeepgramSTT({
      /* ... */
    }),
    new AnthropicLLM({
      /* ... */
    }),
    new DeepgramTTS({
      /* ... */
    }),
    new BrowserAudioOutput(),
  ],
});
```

### Multi-Role Providers

Some providers cover multiple roles. NativeSTT covers `input` + `stt`, and NativeTTS covers `tts` + `output`. This allows a minimal 3-provider config:

```typescript
const voice = new CompositeVoice({
  providers: [
    new NativeSTT(),
    new AnthropicLLM({
      /* ... */
    }),
    new NativeTTS(),
  ],
});
```

### Auto-Fill Defaults

- If `input` and `stt` are both uncovered, `NullInput()` is auto-filled (covers both — text-only mode)
- If `tts` and `output` are both uncovered, `NullOutput()` is auto-filled (covers both — text-only mode)
- If `stt` is provided without `input`, `MicrophoneInput()` is auto-filled
- If `tts` is provided without `output`, `BrowserAudioOutput()` is auto-filled
- If `llm` is uncovered, `AnthropicLLM({ model: 'claude-haiku-4-5' })` is auto-filled
- `[DeepgramAgent]` (covers `stt` + `llm` + `tts`) → auto-fills `MicrophoneInput` (input) + `BrowserAudioOutput` (output)

### Audio Buffering (Race Condition Fix)

When `input` and `stt` are separate providers, an `AudioBufferQueue` buffers audio frames during the STT WebSocket handshake. The queue drains once the STT connection is established, ensuring no audio is lost.

### Header Cache

`AudioHeaderCache` caches audio container headers (WAV, OGG, MP3, etc.) so they can be re-injected after a WebSocket reconnection.

### Guardrails (LLM → TTS)

`config.guardrails` inserts a chain of pluggable async filters between the LLM and the TTS provider. `GuardrailPipeline` runs the chain; `GuardrailStream` is the per-utterance streaming wrapper for Live TTS. Guardrails only change what is _spoken_ — `llm.chunk` / `llm.complete` still carry raw model output.

- **Two stages** — `'chunk'` (streaming to Live TTS) and `'final'` (whole utterance, REST TTS or buffered mode). `Guardrail.stages` restricts a filter to one.
- **Sentence segmentation** — streaming text accumulates to the _last_ sentence boundary before filtering, so regex patterns are not split across chunks.
- **Blocking asymmetry** — a `'final'` block suppresses the utterance; a `'chunk'` block only suppresses text not yet handed to the provider. `mode: 'buffered'` makes blocking absolute.
- **Failure policy** — a guardrail that throws or exceeds `timeoutMs` is handled by `onError` (`'passthrough'` fails open, `'block'` fails closed) and never propagates.

## Source Structure

```
src/
├── CompositeVoice.ts          # Main orchestrator
├── index.ts                   # Public API exports
├── core/
│   ├── types/
│   │   ├── roles.ts           # ProviderRole, ALL_PROVIDER_ROLES
│   │   ├── providers.ts       # All provider interfaces (Base, STT, LLM, TTS, Input, Output)
│   │   ├── config.ts          # CompositeVoiceConfig, AudioBufferQueueConfig
│   │   ├── guardrails.ts      # Guardrail, GuardrailsConfig, GuardrailContext/Result
│   │   └── audio.ts           # AudioChunk, AudioMetadata, AudioFormat
│   ├── pipeline/
│   │   ├── AudioBufferQueue.ts       # Bounded FIFO queue between pipeline stages
│   │   ├── AudioHeaderCache.ts       # Header caching for reconnection
│   │   ├── GuardrailPipeline.ts      # LLM→TTS async filter chain + streaming wrapper
│   │   ├── resolveProviders.ts       # Maps provider array → ResolvedPipeline
│   │   └── configureSTTFromMetadata.ts  # Auto-configures STT from input metadata
│   ├── events/                # EventEmitter, typed event definitions
│   ├── state/                 # AgentStateMachine, audio/processing state machines
│   └── audio/                 # AudioCapture, AudioPlayer (browser internals)
├── providers/
│   ├── base/                  # Abstract base classes (BaseProvider → Base{STT,LLM,TTS,Agent}Provider)
│   ├── input/                 # MicrophoneInput, BufferInput
│   ├── stt/                   # NativeSTT, DeepgramSTT, DeepgramFlux, AssemblyAISTT, ElevenLabsSTT
│   ├── llm/                   # AnthropicLLM, OpenAILLM, GroqLLM, MistralLLM, GeminiLLM, WebLLMLLM
│   ├── tts/                   # NativeTTS, DeepgramTTS, OpenAITTS, ElevenLabsTTS, CartesiaTTS
│   ├── agent/                 # Agent providers (single connection covers stt+llm+tts)
│   │   └── deepgram/          # DeepgramAgent (Deepgram Voice Agent API)
│   └── output/                # BrowserAudioOutput, NullOutput
├── guardrails/                # Built-in LLM→TTS filters (redaction, pronunciation, blocklist, moderation)
├── proxy/                     # Server-side proxy adapters (Express, Next.js, Node)
└── utils/                     # Logger, errors, audio utilities, format detection, WebSocket manager
```

## Key Patterns

- **Role declaration:** Providers declare `public readonly roles: readonly ProviderRole[]` (e.g., `['stt']` or `['input', 'stt']` for multi-role)
- **Base class hierarchy:** `BaseProvider` → `BaseSTTProvider`/`BaseLLMProvider`/`BaseTTSProvider` → transport-specific → concrete
- **Multi-role detection:** `Object.is(pipeline.input, pipeline.stt)` checks if same instance fills both slots
- **Provider deduplication:** `new Set<BaseProvider>([...])` prevents double init/dispose of multi-role providers
- **Queue draining asymmetry:** Input queue starts draining AFTER STT connects (race condition fix); output queue drains immediately
- **Constructor-name detection:** `provider.constructor.name` identifies providers in pipeline utilities (not duck-typing)
- **Queue events on hot paths:** `AudioBufferQueue` uses `emitSync()` (not async) via an `onOverflow()` callback
- **TSDoc everywhere:** Module files start with `@packageDocumentation`; interfaces use `@remarks`, `@example`, `@see`, ASCII diagrams
- **Agent provider — persistent connection:** `BaseAgentProvider.disconnect()` is a no-op; the single WebSocket stays open between turns so there is no reconnect overhead
- **Agent provider — single WebSocket for stt+llm+tts:** Agent providers declare `roles: ['stt', 'llm', 'tts']` and cover all three middle pipeline slots through one connection; the client only sends raw audio and receives raw audio back
- **Guardrail sink discipline:** all Live TTS text goes through `sendTextToLiveTTS()`, so backpressure only counts text that was actually sent — not text a guardrail dropped
- **Agent provider — async iterable bridge:** `generateFromMessages()` returns an `AsyncIterable<string>` that blocks until the server pushes text; subclasses call `emitAssistantText()` / `markAudioDone()` to resolve the pending iterator

## Quality Gates

```bash
pnpm test             # Full test suite
pnpm tsc --noEmit     # Type checking
```

For examples: `pnpm build` in the example directory.

## Test Structure

```
tests/
├── unit/
│   ├── core/          # Pipeline, audio, events, state machine tests
│   ├── providers/     # Base provider and concrete provider tests
│   ├── proxy/         # Proxy adapter tests
│   └── utils/         # Utility function tests
├── integration/       # Multi-component integration tests
├── e2e/               # End-to-end scenarios
├── fixtures/          # Test data
└── mocks/             # MockProviders.ts (implement interfaces directly, not base classes)
```

## Pre-commit Hooks

`.husky/pre-commit` runs:

1. `pnpm install --frozen-lockfile` — catches out-of-sync lockfile
2. `pnpm test` — full test suite

When modifying `package.json`, always run `pnpm install` first so the lockfile updates before committing.

<!-- BEGIN BEADS INTEGRATION -->

## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Auto-syncs to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" --description="Detailed context" -t bug|feature|task -p 0-4 --json
bd create "Issue title" --description="What this issue is about" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
bd update bd-42 --status in_progress --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task**: `bd update <id> --status in_progress`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" --description="Details about what was found" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`

### Auto-Sync

bd automatically syncs with git:

- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, see README.md and docs/QUICKSTART.md.

<!-- END BEADS INTEGRATION -->

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
