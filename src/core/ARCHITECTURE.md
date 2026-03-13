# CompositeVoice Internal Architecture: Communication Patterns

This document is for **SDK developers** working on the CompositeVoice codebase. It
explains the three intentional communication patterns used throughout the SDK and
why each one exists.

## Three Communication Tiers

CompositeVoice uses three distinct communication patterns. This is deliberate,
not accidental -- each pattern is optimized for its relationship type.

### Tier 1: Callbacks (Provider -> Orchestrator)

**Where:** `BaseSTTProvider.onTranscription()`, `BaseTTSProvider.onAudio()`,
`BaseTTSProvider.onMetadata()`

**Pattern:** Providers expose `onX()` registration methods. The orchestrator
(`CompositeVoice`) registers exactly one callback per provider during
`setupProviders()`. Subclasses emit results via protected `emitX()` methods.

**Why callbacks and not events?**

- **1:1 relationship.** Each provider has exactly one consumer (the orchestrator).
  An EventEmitter's overhead (listener sets, wildcard dispatch, error isolation)
  is unnecessary here.
- **Synchronous, zero overhead.** Provider callbacks are direct function calls
  with no serialization, no type discrimination, and no intermediate event objects.
  On the hot audio path (TTS emitting chunks at 20ms intervals), this matters.
- **Provider isolation.** Providers have no dependency on the SDK's event system.
  They don't import `EventEmitter`, don't know about `CompositeVoiceEvent` types,
  and can be tested in complete isolation with a simple `jest.fn()` callback.
- **Single responsibility.** Providers produce raw results; the orchestrator
  decides how to transform them into typed events for consumers.

**Callback naming convention:**

| Method | Visibility | Purpose |
|--------|-----------|---------|
| `onX(callback)` | `public` | Register the callback (called by orchestrator) |
| `emitX(data)` | `protected` | Fire the callback (called by subclass internals) |

Both STT and TTS providers follow this convention. If no callback is registered
when `emitX()` is called, the behavior is:

- **STT:** Logs a warning and drops the result (transcriptions without a consumer are bugs).
- **TTS:** Silently drops the chunk (audio without a player is a valid no-op during teardown).

### Tier 2: Typed EventEmitter (Orchestrator -> Consumers)

**Where:** `CompositeVoice.on()`, `CompositeVoice.once()`, `CompositeVoice.off()`

**Pattern:** The `EventEmitter` class provides typed, wildcard-capable event
dispatch. Events are discriminated unions (`CompositeVoiceEvent`) keyed by a
`type` string field. Consumers subscribe via `agent.on('transcription.final', ...)`.

**Why a full EventEmitter?**

- **1:many relationship.** Multiple consumers subscribe to the same events (UI
  updates, logging, analytics, debugging).
- **Public API surface.** This is the contract between the SDK and application
  code. It must be stable, typed, and well-documented.
- **Wildcard support.** The `'*'` subscription enables debugging and logging
  without knowing every event type.
- **Async support.** `emit()` awaits async listeners; `emitSync()` fires without
  awaiting for hot paths.

**Important:** The orchestrator is the *only* producer of events. Providers never
emit events directly. This single point of event production makes the event flow
easy to trace and debug.

### Tier 3: Direct Method Calls (Internal State Machines)

**Where:** `AgentStateMachine`, `SimpleAudioCaptureStateMachine`,
`SimpleAudioPlaybackStateMachine`, `SimpleProcessingStateMachine`

**Pattern:** State machines expose typed methods like `setBuffering()`,
`setIdle()`, `setError()`. The orchestrator calls these directly. The
`AgentStateMachine` subscribes to sub-machine state changes via `onStateChange()`
callbacks to derive the high-level agent state.

**Why direct calls?**

- **Internal coordination.** State machines are implementation details, not part
  of the public API.
- **No indirection needed.** The orchestrator knows exactly which state machine to
  update and when. Adding an event layer would add latency and complexity for
  zero benefit.
- **Synchronous guarantees.** State transitions must be immediate and ordered.
  An async event dispatch could cause race conditions in state derivation.

## Data Flow Diagram

```
                     Tier 1 (callbacks)              Tier 2 (events)
                    ┌───────────────────┐           ┌──────────────────┐
  STT Provider ──── onTranscription() ──┤           │                  │
                                        ├── CompositeVoice ──── on() ──── Consumer
  TTS Provider ──── onAudio() ─────────┤   (orchestrator)      │        (app code)
               ──── onMetadata() ──────┘           │            │
                                                    │   once()   │
                     Tier 3 (direct calls)          │   off()    │
                    ┌───────────────────┐           │   '*'      │
  State Machines ── setBuffering() ─────┤           └────────────┘
                 ── setIdle() ──────────┤
                 ── onStateChange() ────┘
```

## When to Use Each Pattern

| Adding a... | Use | Example |
|------------|-----|---------|
| New provider callback | Tier 1 (callback) | `BaseLLMProvider` adding `onTokenCount()` |
| New public event | Tier 2 (EventEmitter) | Adding `'llm.toolCall'` event |
| New state machine transition | Tier 3 (direct call) | Adding `'reconnecting'` state |
| Debug/test bridge from Tier 1 to Tier 2 | `ProviderEventAdapter` | See below |

## ProviderEventAdapter (Optional Bridge)

The `ProviderEventAdapter` (`src/core/ProviderEventAdapter.ts`) is an optional
utility that bridges Tier 1 callbacks to a Tier 2 EventEmitter. It is **not**
used by the default pipeline. Use it when you need provider-level event
subscriptions outside of CompositeVoice:

- **Testing:** Subscribe to raw provider output without wiring up the full pipeline.
- **Debugging:** Log provider callbacks as events alongside pipeline events.
- **Custom pipelines:** Build alternative orchestration without CompositeVoice.

```typescript
import { ProviderEventAdapter } from 'composite-voice';

const adapter = new ProviderEventAdapter();
adapter.bridgeSTT(mySTTProvider);
adapter.bridgeTTS(myTTSProvider);

adapter.on('tts.audio', (event) => {
  console.log('Raw TTS chunk:', event.chunk.data.byteLength, 'bytes');
});
```

## LLM Provider: Why No Callbacks?

`BaseLLMProvider` does not use the callback pattern. Instead, its `generate()`
and `generateFromMessages()` methods return `AsyncIterable<string>`. The
orchestrator consumes this iterable directly in `processLLM()`:

```typescript
const stream = await llm.generateFromMessages(messages, options);
for await (const chunk of stream) {
  // emit events, feed TTS, etc.
}
```

This is the right choice because LLM generation is **pull-based** (the consumer
drives iteration speed) rather than **push-based** (the provider drives timing).
The `AsyncIterable` pattern naturally supports backpressure, cancellation via
`AbortSignal`, and composability with `for await...of`.
