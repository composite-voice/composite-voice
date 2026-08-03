---
title: WebSocket Reconnection
description: Automatic reconnection with exponential backoff for WebSocket-based providers.
order: 6
---

### Why reconnection matters

WebSocket connections are long-lived TCP sessions. They can drop at any time due to network interruptions, server restarts, load-balancer timeouts, or mobile connectivity changes. Without automatic reconnection, a single dropped connection silently breaks the voice pipeline -- the user keeps talking, but the audio never reaches the STT provider.

The SDK's `WebSocketManager` handles reconnection transparently. When a WebSocket closes unexpectedly, the manager waits for an exponentially increasing delay and then re-establishes the connection. Your application code does not need to detect the disconnection or initiate the retry.

### Which providers use WebSocket

Five built-in providers communicate over persistent WebSocket connections:

| Provider | Direction | Purpose |
|---|---|---|
| [`DeepgramSTT`](/guides/stt/deepgram-stt) | Browser to Deepgram | Real-time streaming transcription |
| [`AssemblyAISTT`](/guides/stt/assemblyai-stt) | Browser to AssemblyAI | Real-time streaming transcription |
| [`DeepgramTTS`](/guides/tts/deepgram-tts) | Browser to Deepgram | Real-time streaming synthesis |
| [`ElevenLabsTTS`](/guides/tts/elevenlabs-tts) | Browser to ElevenLabs | Real-time streaming synthesis |
| [`CartesiaTTS`](/guides/tts/cartesia-tts) | Browser to Cartesia | Real-time streaming synthesis |

REST-based providers ([NativeSTT](/guides/stt/native-stt), [NativeTTS](/guides/tts/native-tts), [OpenAITTS](/guides/tts/openai-tts), all LLM providers) use HTTP request/response and are not affected by WebSocket reconnection settings.

STT providers ([DeepgramSTT](/guides/stt/deepgram-stt), [AssemblyAISTT](/guides/stt/assemblyai-stt)) maintain a single connection for the entire listening session, so reconnection is critical for reliability. TTS providers ([DeepgramTTS](/guides/tts/deepgram-tts), [ElevenLabsTTS](/guides/tts/elevenlabs-tts), [CartesiaTTS](/guides/tts/cartesia-tts)) typically open a fresh connection per utterance and disable auto-reconnect by default since each synthesis session is short-lived.

### `ReconnectionConfig` options

Configure reconnection behavior at the top level of the `CompositeVoice` config:

```typescript
import { CompositeVoice } from 'composite-voice';

const agent = new CompositeVoice({
  providers: [/* ...your providers */],
  reconnection: {
    enabled: true,
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
  },
});
```

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Whether automatic reconnection is active |
| `maxAttempts` | `number` | `5` | Maximum reconnection attempts before giving up |
| `initialDelay` | `number` (ms) | `1000` | Delay before the first reconnection attempt |
| `maxDelay` | `number` (ms) | `30000` | Upper bound on delay between attempts |
| `backoffMultiplier` | `number` | `2` | Multiplier applied to the delay after each failed attempt |

### Default values

When you omit the `reconnection` config entirely, the SDK applies these defaults:

```typescript
const DEFAULT_RECONNECTION_CONFIG = {
  enabled: true,
  maxAttempts: 5,
  initialDelay: 1000,    // 1 second
  maxDelay: 30000,       // 30 seconds
  backoffMultiplier: 2,
};
```

With these defaults the retry sequence is: **1s, 2s, 4s, 8s, 16s**. The fifth attempt at 16s is below the 30s cap, so it proceeds at 16s. If all five attempts fail, the SDK stops retrying and emits an error.

### Exponential backoff formula

The delay before each reconnection attempt is calculated as:

```
delay = min(initialDelay * backoffMultiplier ^ (attempt - 1), maxDelay)
```

For the default configuration, the delays are:

| Attempt | Formula | Delay |
|---|---|---|
| 1 | `1000 * 2^0` | 1,000 ms (1s) |
| 2 | `1000 * 2^1` | 2,000 ms (2s) |
| 3 | `1000 * 2^2` | 4,000 ms (4s) |
| 4 | `1000 * 2^3` | 8,000 ms (8s) |
| 5 | `1000 * 2^4` | 16,000 ms (16s) |

If the formula produces a value exceeding `maxDelay`, the delay is capped at `maxDelay`. For example, with `maxDelay: 10000`, attempts 4 and 5 would both wait 10 seconds.

### What happens when max attempts are exhausted

After `maxAttempts` consecutive failures, the `WebSocketManager` stops retrying and emits a `WebSocketError` with the message `"Max reconnection attempts reached"`. This error propagates up through the provider and surfaces as a pipeline-level error event:

- For STT providers: `transcription.error` followed by `agent.error`
- For TTS providers: `tts.error` followed by `agent.error`

The agent transitions to the `error` state. From there, you can retry manually by calling `agent.startListening()`, which reinitializes the WebSocket connection from scratch.

```typescript
agent.on('agent.error', (event) => {
  if (event.error.message.includes('Max reconnection attempts')) {
    showRetryButton('Connection lost. Click to reconnect.');
  }
});

retryButton.addEventListener('click', async () => {
  await agent.startListening();
});
```

### Connection state machine

The `WebSocketManager` tracks connection state through a well-defined state machine:

```
DISCONNECTED ──→ CONNECTING ──→ CONNECTED
                                    │
                            (unexpected close)
                                    │
                                    ▼
                             RECONNECTING ──→ CONNECTING ──→ CONNECTED
                                    │
                         (max attempts reached)
                                    │
                                    ▼
                                  CLOSED

CONNECTED ──→ CLOSING ──→ CLOSED   (graceful disconnect)
```

- **DISCONNECTED** -- No active connection. Initial state.
- **CONNECTING** -- A connection attempt is in progress.
- **CONNECTED** -- WebSocket is open and ready for data.
- **RECONNECTING** -- Waiting for the backoff delay before the next connection attempt.
- **CLOSING** -- A graceful close has been initiated (e.g., `agent.stopListening()`).
- **CLOSED** -- Terminal state after a graceful close. No reconnection attempts.

Graceful disconnections (triggered by `stopListening()` or `dispose()`) transition directly to `CLOSED` and do not trigger reconnection.

### Configuration examples

#### Aggressive retry (unreliable networks, mobile)

Retry frequently with a high attempt count. Suitable for mobile apps or environments with intermittent connectivity:

```typescript
const agent = new CompositeVoice({
  providers: [/* ...your providers */],
  reconnection: {
    enabled: true,
    maxAttempts: 10,
    initialDelay: 500,       // start fast
    maxDelay: 15000,         // cap at 15 seconds
    backoffMultiplier: 1.5,  // slower ramp-up
  },
});
```

Retry sequence: 500ms, 750ms, 1.1s, 1.7s, 2.5s, 3.8s, 5.7s, 8.5s, 12.8s, 15s.

#### Conservative retry (stable networks, cost-sensitive)

Fewer attempts with longer delays. Avoids hammering a provider that may be experiencing an outage:

```typescript
const agent = new CompositeVoice({
  providers: [/* ...your providers */],
  reconnection: {
    enabled: true,
    maxAttempts: 3,
    initialDelay: 2000,
    maxDelay: 60000,
    backoffMultiplier: 3,
  },
});
```

Retry sequence: 2s, 6s, 18s.

#### Disabled (manual control)

Turn off auto-reconnect when you want full control over retry logic. Useful for custom health-check flows or when the application has its own reconnection strategy:

```typescript
const agent = new CompositeVoice({
  providers: [/* ...your providers */],
  reconnection: {
    enabled: false,
  },
});

agent.on('agent.error', async (event) => {
  // Implement your own retry logic
  await customHealthCheck();
  await agent.startListening();
});
```

### Interaction with `autoRecover`

The `reconnection` config and the `autoRecover` config work at different levels:

- **`reconnection`** operates at the WebSocket transport layer. It re-establishes the raw socket connection.
- **`autoRecover`** operates at the agent pipeline layer. It reinitializes crashed providers and resumes the pipeline.

For maximum resilience, enable both:

```typescript
const agent = new CompositeVoice({
  providers: [/* ...your providers */],
  reconnection: {
    enabled: true,
    maxAttempts: 5,
  },
  autoRecover: true,
});
```

With this configuration, a dropped WebSocket triggers the reconnection system first. If reconnection succeeds, the pipeline continues uninterrupted. If reconnection fails after all attempts, the error bubbles up to the agent level where `autoRecover` takes over and attempts to reinitialize the affected provider.

See [Error Recovery](/advanced/error-recovery) for details on the `autoRecover` system and the full error event catalog.
