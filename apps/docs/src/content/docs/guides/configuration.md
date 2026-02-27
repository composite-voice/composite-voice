---
title: Configuration
description: Configure audio settings, turn-taking strategies, conversation history, and error recovery.
order: 2
---

## Full configuration shape

Pass a configuration object to the `CompositeVoice` constructor. Only the three providers are required; everything else has sensible defaults.

```typescript
import {
  CompositeVoice,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
} from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  // Required -- one of each provider type
  stt: new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
  llm: new AnthropicLLM({ proxyUrl: '/api/proxy/anthropic', model: 'claude-haiku-4-5' }),
  tts: new DeepgramTTS({ proxyUrl: '/api/proxy/deepgram' }),

  // Audio capture and playback
  audio: {
    input: {
      sampleRate: 16000,         // Hz (default: 16000)
      format: 'pcm',            // 'pcm' | 'opus' | 'mp3' | 'wav' | 'webm' (default: 'pcm')
      channels: 1,              // mono (default: 1)
      chunkDuration: 100,       // ms per audio chunk (default: 100)
      echoCancellation: true,   // browser echo cancellation (default: true)
      noiseSuppression: true,   // browser noise suppression (default: true)
      autoGainControl: true,    // browser auto gain (default: true)
    },
    output: {
      bufferSize: 4096,          // samples per buffer (default: 4096)
      minBufferDuration: 200,    // ms before playback starts (default: 200)
      enableSmoothing: true,     // crossfade between chunks (default: true)
    },
  },

  // Conversation history
  conversationHistory: {
    enabled: true,    // maintain multi-turn context (default: false)
    maxTurns: 10,     // 0 = unlimited (default: 0)
  },

  // Turn-taking -- how the SDK handles the mic during TTS playback
  turnTaking: {
    pauseCaptureOnPlayback: 'auto',    // true | false | 'auto' (default: 'auto')
    autoStrategy: 'conservative',      // 'conservative' | 'aggressive' | 'detect' (default: 'conservative')
  },

  // Eager LLM -- speculative generation from preflight signals
  eagerLLM: {
    enabled: false,             // requires DeepgramFlux provider
    cancelOnTextChange: true,   // cancel and restart if text diverges (default: true)
    similarityThreshold: 0.8,   // 0-1 word-overlap threshold (default: 0.8)
  },

  // Error recovery
  autoRecover: true,   // attempt to recover from provider errors automatically

  // Reconnection backoff for WebSocket providers
  reconnection: {
    enabled: true,              // enable auto-reconnection (default: true)
    maxAttempts: 5,             // give up after N failures (default: 5)
    initialDelay: 1000,         // ms before first retry (default: 1000)
    maxDelay: 30000,            // ms ceiling for backoff (default: 30000)
    backoffMultiplier: 2,       // delay doubles each attempt (default: 2)
  },

  // Logging
  logging: {
    enabled: true,       // enable SDK logging (default: false)
    level: 'warn',       // 'debug' | 'info' | 'warn' | 'error' (default: 'info')
  },
});
```

## Turn-taking strategies

Turn-taking controls whether the SDK pauses microphone capture while the agent speaks. This prevents the agent's own audio from being re-transcribed, which would create a feedback loop.

**`pauseCaptureOnPlayback: 'auto'`** (default) -- The SDK picks the best approach based on your provider combination and the `autoStrategy` setting.

**`autoStrategy: 'conservative'`** (default) -- Pauses the microphone whenever TTS plays. Prevents all echo but means the user cannot interrupt the agent mid-sentence.

**`autoStrategy: 'aggressive'`** -- Only pauses for known echo-prone combinations (e.g., NativeSTT + NativeTTS). Allows user interruption with most cloud provider pairs.

**`autoStrategy: 'detect'`** -- Tests echo cancellation at runtime. Pauses only when the browser lacks hardware echo cancellation support.

**`pauseCaptureOnPlayback: true`** -- Always pause. Use this override for guaranteed silence regardless of provider combination.

**`pauseCaptureOnPlayback: false`** -- Never pause. Full-duplex mode. Use this only when you have confirmed that echo cancellation works in your target environment.

## Conversation history

When `enabled: true`, each STT final result and LLM response is appended to an internal message history. The full history is sent to the LLM on every turn, giving the model multi-turn context.

- A "turn" equals one user message plus one assistant response
- `maxTurns` limits how many turns the SDK retains; set `0` for unlimited
- When `maxTurns` is exceeded, the oldest turn is dropped
- Call `voice.clearHistory()` to reset the conversation at any time

```typescript
const voice = new CompositeVoice({
  stt: new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
  llm: new AnthropicLLM({ proxyUrl: '/api/proxy/anthropic', model: 'claude-haiku-4-5' }),
  tts: new DeepgramTTS({ proxyUrl: '/api/proxy/deepgram' }),
  conversationHistory: {
    enabled: true,
    maxTurns: 20,
  },
});

// Later, when the user clicks "New conversation"
voice.clearHistory();
```

## Eager LLM pipeline

The eager LLM pipeline reduces perceived latency by 100-300ms through speculative generation.

Available only with the [DeepgramFlux](/guides/stt/deepgram-flux) provider, which connects to Deepgram's V2 API and emits preflight/eager end-of-turn signals. [DeepgramSTT](/guides/stt/deepgram-stt) (V1/Nova) does not support preflight. When the STT detects end-of-speech early, it fires a `transcription:preflight` event. The SDK starts LLM generation immediately -- before the final transcript arrives.

If `cancelOnTextChange` is `true` and the final transcript differs beyond `similarityThreshold` (default: 0.8), the speculative generation is cancelled via `AbortSignal` and restarted with the confirmed text. If `cancelOnTextChange` is `false`, the SDK accepts the preflight result as-is for lower latency at a small accuracy trade-off.

```typescript
import { CompositeVoice, DeepgramFlux, AnthropicLLM, DeepgramTTS } from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  stt: new DeepgramFlux({
    proxyUrl: '/api/proxy/deepgram',
    options: {
      model: 'flux-general-en',
      eagerEotThreshold: 0.5,
    },
  }),
  llm: new AnthropicLLM({ proxyUrl: '/api/proxy/anthropic', model: 'claude-haiku-4-5' }),
  tts: new DeepgramTTS({ proxyUrl: '/api/proxy/deepgram' }),
  eagerLLM: {
    enabled: true,
    cancelOnTextChange: true,
    similarityThreshold: 0.8,
  },
});
```

## Logging

Enable debug logging during development to trace every event, provider message, and state transition:

```typescript
const voice = new CompositeVoice({
  // ...providers
  logging: {
    enabled: true,
    level: 'debug',
  },
});
```

Log levels from most verbose to least:

| Level | Output |
|-------|--------|
| `debug` | Everything: audio chunks, WebSocket frames, state transitions |
| `info` | Lifecycle events: provider connected, agent started/stopped |
| `warn` | Warnings and errors: reconnection attempts, degraded performance |
| `error` | Errors only: provider failures, unrecoverable exceptions |

The default level when logging is enabled is `info`. Logging is disabled entirely by default (`enabled: false`).

Supply a custom logger function to route SDK logs into your own logging infrastructure:

```typescript
const voice = new CompositeVoice({
  // ...providers
  logging: {
    enabled: true,
    level: 'debug',
    logger: (level, message, ...args) => {
      myLogger.log({ level, message, data: args });
    },
  },
});
```
