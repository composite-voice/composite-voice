---
title: Events
description: Complete event reference — every event type, its payload, and when it fires.
order: 2
---

### How events work

CompositeVoice uses an event-driven architecture. Subscribe with `on()`, unsubscribe with `off()`, or listen once with `once()`. The `on()` method returns an unsubscribe function for convenience.

```typescript
// Subscribe
voice.on('agent.stateChange', ({ state }) => { ... });

// Unsubscribe via returned function
const unsubscribe = voice.on('transcription.speechFinal', ({ text }) => { ... });
unsubscribe();

// Unsubscribe via off()
const handler = ({ text }) => { ... };
voice.on('transcription.speechFinal', handler);
voice.off('transcription.speechFinal', handler);

// Listen once
voice.once('agent.ready', () => { ... });

// Wildcard — receive every event
voice.on('*', (event) => {
  console.log(`[${event.type}]`, event);
});
```

Every event extends `BaseEvent`, which includes a `timestamp` (Unix ms) and an optional `metadata` record.

### Agent events

| Event | Payload | Description |
|-------|---------|-------------|
| `agent.ready` | `{}` | Pipeline initialized, ready to start |
| `agent.stateChange` | `{ state: AgentState, previousState: AgentState }` | State transition occurred |
| `agent.error` | `{ error: Error, recoverable: boolean, context?: string }` | Top-level pipeline error |

**AgentState values:** `'idle'` &rarr; `'ready'` &rarr; `'listening'` &rarr; `'thinking'` &rarr; `'speaking'` &rarr; back to `'listening'` (or `'error'`)

Typical flow:

```
idle → ready → listening → thinking → speaking → listening → ...
```

### Transcription events

| Event | Payload | Description |
|-------|---------|-------------|
| `transcription.start` | `{}` | STT provider began listening for speech |
| `transcription.interim` | `{ text, confidence? }` | Partial recognition result (updates as user speaks) |
| `transcription.final` | `{ text, confidence? }` | Confirmed recognition segment |
| `transcription.speechFinal` | `{ text, confidence? }` | End-of-utterance detected — triggers LLM generation |
| `transcription.preflight` | `{ text, confidence? }` | Early end-of-speech signal ([DeepgramFlux](/guides/stt/deepgram-flux) only) — triggers eager LLM |
| `transcription.error` | `{ error: Error, recoverable: boolean }` | STT provider error |

The pipeline sends `speechFinal` text to the LLM. `interim` events update in real time as the user speaks. Multi-segment providers (Deepgram) may emit several `transcription.final` events for a single utterance; only the last one is followed by `transcription.speechFinal`.

### LLM events

| Event | Payload | Description |
|-------|---------|-------------|
| `llm.start` | `{ prompt }` | Generation started |
| `llm.chunk` | `{ chunk, accumulated }` | Text token received (streaming); `accumulated` holds the full response so far |
| `llm.complete` | `{ text, tokensUsed? }` | Full response complete |
| `llm.error` | `{ error: Error, recoverable: boolean }` | LLM provider error |

LLM text streams to TTS as it arrives. Each `llm.chunk` forwards its text to the TTS provider for incremental synthesis (when using a live/WebSocket TTS provider).

### TTS events

| Event | Payload | Description |
|-------|---------|-------------|
| `tts.start` | `{ text }` | Synthesis started |
| `tts.audio` | `{ chunk: AudioChunk }` | Audio chunk received |
| `tts.metadata` | `{ metadata: AudioMetadata }` | Audio format information (sample rate, encoding, channels) |
| `tts.complete` | `{}` | Synthesis finished (playback may still be in progress) |
| `tts.error` | `{ error: Error, recoverable: boolean }` | TTS provider error |

### Audio events

| Event | Payload | Description |
|-------|---------|-------------|
| `audio.capture.start` | `{}` | Microphone capture started |
| `audio.capture.stop` | `{}` | Microphone capture stopped |
| `audio.capture.error` | `{ error: Error }` | Microphone access or capture error |
| `audio.playback.start` | `{}` | Audio playback started |
| `audio.playback.end` | `{}` | Audio playback finished |
| `audio.playback.error` | `{ error: Error }` | Playback error |

### Queue events

| Event | Payload | Description |
|-------|---------|-------------|
| `queue.overflow` | `{ queueName: string, droppedChunks: number, currentSize: number }` | Queue exceeded capacity, chunks were dropped according to the overflow strategy |
| `queue.stats` | `{ queueName: string, size: number, totalEnqueued: number, totalDequeued: number, oldestChunkAge: number }` | Pipeline health snapshot — useful for monitoring buffer pressure |

Queue events fire on the input and output buffer queues. Subscribe to `queue.overflow` to detect when audio frames are being dropped, and `queue.stats` for real-time monitoring of pipeline health.

```typescript
voice.on('queue.overflow', ({ queueName, droppedChunks, currentSize }) => {
  console.warn(`Queue "${queueName}" dropped ${droppedChunks} chunks (${currentSize} remaining)`);
});

voice.on('queue.stats', ({ queueName, size, totalEnqueued, totalDequeued, oldestChunkAge }) => {
  console.log(`Queue "${queueName}": ${size} buffered, ${totalEnqueued} enqueued, ${totalDequeued} dequeued`);
});
```

### Event flow diagram

```
User speaks
  → transcription.start
  → transcription.interim (repeating)
  → transcription.final
  → transcription.speechFinal
      → agent.stateChange { state: 'thinking' }
      → llm.start
      → llm.chunk (repeating)
          → tts.start
          → tts.audio (repeating)
              → audio.playback.start
              → agent.stateChange { state: 'speaking' }
      → llm.complete
      → tts.complete
      → audio.playback.end
      → agent.stateChange { state: 'listening' }
```

### Error events

All error events include an `error` property and a `recoverable` boolean. Agent-level errors (`agent.error`) also carry an optional `context` string identifying the subsystem that failed (e.g., `'initialization'`, `'pipeline'`).

The SDK defines `CompositeVoiceError` as the base error class. Check `error.code` for a machine-readable identifier (`'PROVIDER_INIT_ERROR'`, `'TIMEOUT_ERROR'`, `'WEBSOCKET_ERROR'`, etc.) and `error.recoverable` to determine if the error is transient.

```typescript
voice.on('agent.error', ({ error, recoverable, context }) => {
  if (error instanceof CompositeVoiceError) {
    console.error(`[${error.code}] ${error.message}`);
  }
  if (!recoverable) {
    showFatalError(error.message);
  }
});
```
