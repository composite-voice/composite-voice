---
title: Error Recovery
description: Handle errors gracefully — automatic recovery, error events, and production error-handling patterns.
order: 5
---

### Error categories

Errors in a CompositeVoice agent fall into three broad categories:

**Provider errors** occur when a provider fails to initialize, connect, or respond. Examples include invalid API keys, missing peer dependencies, rate limiting, and service outages. These surface as `transcription.error`, `llm.error`, or `tts.error` events depending on which pipeline stage failed.

**Network errors** occur when a WebSocket connection drops, an HTTP request times out, or a proxy endpoint is unreachable. WebSocket providers (DeepgramSTT, DeepgramTTS, AssemblyAISTT, ElevenLabsTTS, CartesiaTTS) are particularly susceptible. The SDK's [reconnection system](/advanced/reconnection) handles many of these automatically.

**Audio errors** occur when microphone access is denied, an audio device disconnects mid-session, or AudioContext playback fails. These surface as `audio.capture.error` or `audio.playback.error` events.

### The `autoRecover` config option

Set `autoRecover: true` on the top-level config to let the SDK attempt automatic recovery from provider errors instead of propagating them immediately. When enabled, the SDK reinitializes crashed providers and resumes the pipeline where possible.

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new NativeSTT({ language: 'en-US' }),
  llm: new AnthropicLLM({
    proxyUrl: `${window.location.origin}/proxy/anthropic`,
    model: 'claude-haiku-4-5-20251001',
    systemPrompt: 'You are a helpful voice assistant.',
    maxTokens: 200,
  }),
  tts: new NativeTTS(),
  autoRecover: true,
});
```

When `autoRecover` is `false` (the default), every error transitions the agent to the `error` state and waits for you to call `startListening()` to retry manually.

### Error events

The SDK emits typed error events at each pipeline stage. Every error event includes an `error` object and a `recoverable` flag.

#### `agent.error`

Emitted for top-level agent errors that are not specific to a single provider. The `context` field identifies where the error originated.

```typescript
agent.on('agent.error', (event) => {
  console.error(`[${event.context}] ${event.error.message}`);
  console.log('Recoverable:', event.recoverable);
});
```

**Payload:**

| Field | Type | Description |
|---|---|---|
| `error` | `Error` | The error that occurred |
| `recoverable` | `boolean` | Whether the SDK can attempt recovery |
| `context` | `string` (optional) | Where the error originated (e.g., `'initialize'`, `'processLLM'`, `'startListening'`) |

#### `transcription.error`

Emitted when the STT provider encounters an error during transcription.

```typescript
agent.on('transcription.error', (event) => {
  console.error('STT error:', event.error.message);
});
```

**Payload:**

| Field | Type | Description |
|---|---|---|
| `error` | `Error` | The STT error |
| `recoverable` | `boolean` | Whether the transcription can be restarted |

#### `llm.error`

Emitted when the LLM provider fails during generation. Common causes include rate limiting, invalid model names, and proxy connectivity issues.

```typescript
agent.on('llm.error', (event) => {
  console.error('LLM error:', event.error.message);
});
```

**Payload:**

| Field | Type | Description |
|---|---|---|
| `error` | `Error` | The LLM error |
| `recoverable` | `boolean` | Whether the generation can be retried |

#### `tts.error`

Emitted when the TTS provider fails during synthesis or playback.

```typescript
agent.on('tts.error', (event) => {
  console.error('TTS error:', event.error.message);
});
```

**Payload:**

| Field | Type | Description |
|---|---|---|
| `error` | `Error` | The TTS error |
| `recoverable` | `boolean` | Whether synthesis can be retried |

#### `audio.capture.error`

Emitted when microphone capture fails. Common causes include device disconnection, permission revocation, and AudioContext issues.

```typescript
agent.on('audio.capture.error', (event) => {
  console.error('Capture error:', event.error.message);
});
```

**Payload:**

| Field | Type | Description |
|---|---|---|
| `error` | `Error` | The capture error |

#### `audio.playback.error`

Emitted when audio playback fails. Common causes include AudioContext suspension, buffer underruns, and browser autoplay policy violations.

```typescript
agent.on('audio.playback.error', (event) => {
  console.error('Playback error:', event.error.message);
});
```

**Payload:**

| Field | Type | Description |
|---|---|---|
| `error` | `Error` | The playback error |

### The `CompositeVoiceError` base class

All SDK-thrown errors extend `CompositeVoiceError`, which adds structured metadata to the standard `Error` class:

```typescript
import { CompositeVoiceError } from '@lukeocodes/composite-voice';

agent.on('agent.error', (event) => {
  if (event.error instanceof CompositeVoiceError) {
    console.log('Code:', event.error.code);             // e.g., 'PROVIDER_CONNECTION_ERROR'
    console.log('Recoverable:', event.error.recoverable); // true or false
    console.log('Context:', event.error.context);         // optional diagnostic data
  }
});
```

**Properties:**

| Property | Type | Description |
|---|---|---|
| `code` | `string` | Machine-readable error code (e.g., `'PROVIDER_INIT_ERROR'`, `'TIMEOUT_ERROR'`) |
| `recoverable` | `boolean` | Whether the error can be retried programmatically |
| `context` | `Record<string, unknown>` (optional) | Structured diagnostic data (provider name, status code, etc.) |

**Error subclasses and their codes:**

| Class | Code | Recoverable | Typical cause |
|---|---|---|---|
| `ProviderInitializationError` | `PROVIDER_INIT_ERROR` | No | Missing API key, missing peer dependency |
| `ProviderConnectionError` | `PROVIDER_CONNECTION_ERROR` | Yes | Network issue, service unavailability |
| `ProviderResponseError` | `PROVIDER_RESPONSE_ERROR` | Yes | HTTP error from provider (e.g., 429 rate limit) |
| `AudioCaptureError` | `AUDIO_CAPTURE_ERROR` | Yes | Device disconnected, stream interrupted |
| `AudioPlaybackError` | `AUDIO_PLAYBACK_ERROR` | Yes | AudioContext failure, decoding error |
| `MicrophonePermissionError` | `MICROPHONE_PERMISSION_DENIED` | No | User denied microphone access |
| `ConfigurationError` | `CONFIGURATION_ERROR` | No | Invalid SDK configuration |
| `InvalidStateError` | `INVALID_STATE_ERROR` | No | Operation attempted in wrong state |
| `TimeoutError` | `TIMEOUT_ERROR` | Yes | WebSocket connection or API call timed out |
| `WebSocketError` | `WEBSOCKET_ERROR` | Yes | WebSocket connection or send failure |

### Recoverable vs. non-recoverable errors

The `recoverable` flag tells you whether it makes sense to retry:

**Recoverable errors** (`recoverable: true`) are transient. The user does not need to change anything -- a retry may succeed. Examples: network timeouts, WebSocket disconnections, rate-limited API responses. With `autoRecover: true`, the SDK handles these automatically. Without it, you can call `agent.startListening()` to restart the pipeline.

**Non-recoverable errors** (`recoverable: false`) require user intervention or a configuration change before retrying will help. Examples: missing API keys, denied microphone permissions, invalid configuration. Surface these to the user with a clear message and instructions.

```typescript
agent.on('agent.error', (event) => {
  if (event.error instanceof CompositeVoiceError) {
    if (event.error.recoverable) {
      showNotification('Temporary issue. Retrying...');
      // The SDK retries automatically when autoRecover is true.
      // Without autoRecover, call agent.startListening() after a delay.
    } else {
      showFatalError(event.error.message);
      // Guide the user: check permissions, verify API keys, etc.
    }
  }
});
```

### Detecting recovery

The agent state machine transitions to `error` when an error occurs and transitions back to a normal state (e.g., `listening`) when recovery succeeds. Watch for this transition to update your UI:

```typescript
agent.on('agent.stateChange', (event) => {
  if (event.previousState === 'error' && event.state !== 'error') {
    showNotification('Recovered successfully');
  }
});
```

### Best practices for production

**Subscribe to all error events.** Do not rely on `agent.error` alone. Provider-specific errors (`llm.error`, `tts.error`, `transcription.error`) fire before the top-level `agent.error`, giving you the chance to log granular diagnostics.

```typescript
const errorEvents = [
  'agent.error',
  'transcription.error',
  'llm.error',
  'tts.error',
  'audio.capture.error',
  'audio.playback.error',
] as const;

for (const event of errorEvents) {
  agent.on(event, (e) => {
    logToService({ event, error: e.error.message, timestamp: e.timestamp });
  });
}
```

**Enable logging in development.** Set `logging.level` to `'debug'` during development to see internal SDK decisions around error recovery and state transitions:

```typescript
const agent = new CompositeVoice({
  stt, llm, tts,
  autoRecover: true,
  logging: { enabled: true, level: 'debug' },
});
```

**Combine `autoRecover` with a custom logger.** Route SDK logs into your observability stack so you can trace errors in production:

```typescript
const agent = new CompositeVoice({
  stt, llm, tts,
  autoRecover: true,
  logging: {
    enabled: true,
    level: 'warn',
    logger: (level, message, ...args) => {
      myLogger.log({ level, message, data: args });
    },
  },
});
```

**Handle microphone permission denial at initialization.** The `MicrophonePermissionError` is the most common non-recoverable error. Catch it early and show a clear prompt:

```typescript
import { MicrophonePermissionError } from '@lukeocodes/composite-voice';

try {
  await agent.initialize();
  await agent.startListening();
} catch (error) {
  if (error instanceof MicrophonePermissionError) {
    showPermissionDialog('Please allow microphone access to use voice features.');
  }
}
```

**Track error counts.** A burst of recoverable errors can indicate a systemic issue (e.g., a misconfigured proxy). Set a threshold and surface a warning when it is exceeded:

```typescript
let errorCount = 0;
const ERROR_THRESHOLD = 5;
const WINDOW_MS = 60_000;

agent.on('agent.error', () => {
  errorCount++;
  setTimeout(() => errorCount--, WINDOW_MS);

  if (errorCount >= ERROR_THRESHOLD) {
    showWarning('Multiple errors detected. Check your network connection.');
  }
});
```

### Full configuration example

```typescript
import {
  CompositeVoice,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
  CompositeVoiceError,
  MicrophonePermissionError,
} from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new DeepgramSTT({
    proxyUrl: `${window.location.origin}/proxy/deepgram`,
    options: { model: 'nova-3', interimResults: true },
  }),
  llm: new AnthropicLLM({
    proxyUrl: `${window.location.origin}/proxy/anthropic`,
    model: 'claude-haiku-4-5-20251001',
    systemPrompt: 'You are a helpful voice assistant. Keep responses brief.',
    maxTokens: 200,
  }),
  tts: new DeepgramTTS({
    proxyUrl: `${window.location.origin}/proxy/deepgram`,
    options: { model: 'aura-2-thalia-en', encoding: 'linear16', sampleRate: 24000 },
  }),
  autoRecover: true,
  reconnection: {
    enabled: true,
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
  },
  logging: { enabled: true, level: 'warn' },
});

// Provider-specific error handlers
agent.on('transcription.error', (e) => {
  console.error('[STT]', e.error.message);
});

agent.on('llm.error', (e) => {
  console.error('[LLM]', e.error.message);
});

agent.on('tts.error', (e) => {
  console.error('[TTS]', e.error.message);
});

agent.on('audio.capture.error', (e) => {
  console.error('[Capture]', e.error.message);
});

agent.on('audio.playback.error', (e) => {
  console.error('[Playback]', e.error.message);
});

// Top-level error handler
agent.on('agent.error', (e) => {
  if (e.error instanceof CompositeVoiceError && !e.error.recoverable) {
    showFatalError(e.error.message);
  }
});

// Recovery detection
agent.on('agent.stateChange', (e) => {
  if (e.previousState === 'error' && e.state !== 'error') {
    showNotification('Connection restored');
  }
});

try {
  await agent.initialize();
  await agent.startListening();
} catch (error) {
  if (error instanceof MicrophonePermissionError) {
    showPermissionDialog('Microphone access is required.');
  } else {
    showFatalError((error as Error).message);
  }
}
```

See the [Events reference](/reference/events) for the full event catalog and [Example 04 (Error Recovery)](https://github.com/lukeocodes/composite-voice/tree/main/examples/04-error-recovery) for a runnable demo with error simulation.
