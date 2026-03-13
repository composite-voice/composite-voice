---
title: Configuration
description: Configure audio settings, turn-taking strategies, conversation history, and error recovery.
order: 2
---

## Full configuration shape

Pass a configuration object to the `CompositeVoice` constructor. Only the `providers` array is required (with at minimum an LLM provider); everything else has sensible defaults.

```typescript
import {
  CompositeVoice,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
} from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  // Required -- provider instances for the 5-role pipeline
  // Each provider declares its roles (input, stt, llm, tts, output).
  // Uncovered input+stt defaults to NativeSTT; uncovered tts+output defaults to NativeTTS.
  providers: [
    new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
    new AnthropicLLM({ proxyUrl: '/api/proxy/anthropic', model: 'claude-haiku-4-5' }),
    new DeepgramTTS({ proxyUrl: '/api/proxy/deepgram' }),
  ],

  // Audio buffer queues between pipeline stages
  queue: {
    input: {
      maxSize: 1000,                  // max buffered chunks (default: 1000)
      overflowStrategy: 'drop-oldest', // 'drop-oldest' | 'drop-newest' | 'block' (default: 'drop-oldest')
    },
    output: {
      maxSize: 1000,
      overflowStrategy: 'drop-oldest',
    },
  },

  // Conversation history
  conversationHistory: {
    enabled: true,              // maintain multi-turn context (default: false)
    maxTurns: 10,               // 0 = unlimited (default: 0)
    maxTokens: 4000,            // approximate token budget for history (default: unlimited)
    preserveSystemMessages: true, // keep system messages during trimming (default: true)
  },

  // Turn-taking -- how the SDK handles the mic during TTS playback
  turnTaking: {
    pauseCaptureOnPlayback: 'auto',    // true | false | 'auto' (default: 'auto')
    autoStrategy: 'conservative',      // 'conservative' | 'aggressive' | 'detect' (default: 'conservative')
  },

  // Eager LLM -- speculative generation from preflight signals
  eagerLLM: {
    enabled: false,             // requires DeepgramFlux provider (currently disabled)
    cancelOnTextChange: true,   // cancel and restart if text diverges (default: true)
    similarityThreshold: 0.8,   // 0-1 word-overlap threshold (default: 0.8)
  },

  // Pipeline tuning
  pipeline: {
    maxPendingChunks: 10,  // LLM→TTS backpressure: pause LLM when this many chunks are buffered (Live TTS only)
  },

  // Error recovery
  autoRecover: true,   // attempt to recover from provider errors automatically

  // Recovery backoff (only applies when autoRecover is true)
  recovery: {
    maxAttempts: 3,          // max recovery attempts before giving up (default: 3)
    initialDelay: 1000,      // ms before first recovery attempt (default: 1000)
    backoffMultiplier: 2,    // delay multiplier per attempt (default: 2)
    maxDelay: 10000,         // ms ceiling for backoff (default: 10000)
  },

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

Configure audio capture and playback settings on the input and output providers directly, not on the top-level config. For example, `MicrophoneInput` accepts `sampleRate`, `echoCancellation`, `noiseSuppression`, and `autoGainControl`. `BrowserAudioOutput` accepts `bufferSize`, `minBufferDuration`, and `enableSmoothing`. See [Audio](/advanced/audio) for details.

## Turn-taking strategies

Turn-taking controls whether the SDK pauses microphone capture while the agent speaks. This prevents the agent's own audio from being re-transcribed, which would create a feedback loop.

**`pauseCaptureOnPlayback: 'auto'`** (default) -- The SDK picks the best approach based on your provider combination and the `autoStrategy` setting.

**`autoStrategy: 'conservative'`** (default) -- Pauses the microphone whenever TTS plays. Prevents all echo but means the user must wait for the agent to finish before speaking.

**`autoStrategy: 'aggressive'`** -- Only pauses for known echo-prone combinations (e.g., NativeSTT + NativeTTS). Allows user interruption with most cloud provider pairs.

**`autoStrategy: 'detect'`** -- Tests echo cancellation at runtime. Pauses only when the browser lacks hardware echo cancellation support.

**`pauseCaptureOnPlayback: true`** -- Always pause. Use this override for guaranteed silence regardless of provider combination.

**`pauseCaptureOnPlayback: false`** -- Never pause. Full-duplex mode. Use this only when you have confirmed that echo cancellation works in your target environment.

## Conversation history

When `enabled: true`, each STT final result and LLM response is appended to an internal message history. The full history is sent to the LLM on every turn, giving the model multi-turn context.

- A "turn" equals one user message plus one assistant response
- `maxTurns` limits how many turns the SDK retains; set `0` for unlimited. When exceeded, the oldest turn is dropped
- `maxTokens` sets an approximate token budget (using a `ceil(text.length / 4)` heuristic); oldest non-system turns are dropped when the budget is exceeded
- When both `maxTurns` and `maxTokens` are set, the more restrictive limit wins
- `preserveSystemMessages` (default: `true`) keeps system messages from being removed during trimming, ensuring system instructions are always present in the LLM context
- Call `voice.clearHistory()` to reset the conversation at any time

```typescript
const voice = new CompositeVoice({
  providers: [
    new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
    new AnthropicLLM({ proxyUrl: '/api/proxy/anthropic', model: 'claude-haiku-4-5' }),
    new DeepgramTTS({ proxyUrl: '/api/proxy/deepgram' }),
  ],
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

Available only with the [DeepgramFlux](/guides/stt/deepgram-flux) provider, which connects to Deepgram's V2 API and emits preflight/eager end-of-turn signals. [DeepgramSTT](/guides/stt/deepgram-stt) (V1/Nova) does not support preflight. When the STT detects end-of-speech early, it fires a `transcription.preflight` event. The SDK starts LLM generation immediately -- before the final transcript arrives.

If `cancelOnTextChange` is `true` and the final transcript differs beyond `similarityThreshold` (default: 0.8), the speculative generation is cancelled via `AbortSignal` and restarted with the confirmed text. If `cancelOnTextChange` is `false`, the SDK accepts the preflight result as-is for lower latency at a small accuracy trade-off.

```typescript
import { CompositeVoice, DeepgramFlux, AnthropicLLM, DeepgramTTS } from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  providers: [
    new DeepgramFlux({
      proxyUrl: '/api/proxy/deepgram',
      options: {
        model: 'flux-general-en',
        eagerEotThreshold: 0.5,
      },
    }),
    new AnthropicLLM({ proxyUrl: '/api/proxy/anthropic', model: 'claude-haiku-4-5' }),
    new DeepgramTTS({ proxyUrl: '/api/proxy/deepgram' }),
  ],
  eagerLLM: {
    enabled: true,
    cancelOnTextChange: true,
    similarityThreshold: 0.8,
  },
});
```

> **Note:** DeepgramFlux is currently disabled and will throw on construction. It is preserved for future re-enablement when the Deepgram V2 SDK stabilizes.

## Tool use

When the LLM provider supports tool use (currently [AnthropicLLM](/guides/llm/anthropic) only), you can define tools on the top-level config. The `onToolCall` callback is async -- return a `LLMToolResult` with the serialized result content.

```typescript
const voice = new CompositeVoice({
  providers: [/* ...your providers */],
  tools: {
    definitions: [
      {
        name: 'get_weather',
        description: 'Get the current weather for a location',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'City name' },
          },
          required: ['location'],
        },
      },
    ],
    onToolCall: async (toolCall) => {
      // toolCall has: id, name, arguments
      const result = await yourToolHandler(toolCall.name, toolCall.arguments);
      return { toolCallId: toolCall.id, content: JSON.stringify(result) };
    },
  },
});
```

The SDK handles the tool loop internally: when the LLM emits a tool call, the SDK executes your callback, feeds the result back to the LLM, and the LLM generates a spoken follow-up. Text output streams to TTS normally throughout the process.

See the [Anthropic guide](/guides/llm/anthropic#tool-use--function-calling) for a full walkthrough.

## Logging

Enable debug logging during development to trace every event, provider message, and state transition:

```typescript
const voice = new CompositeVoice({
  providers: [/* ...your providers */],
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
  providers: [/* ...your providers */],
  logging: {
    enabled: true,
    level: 'debug',
    logger: (level, message, ...args) => {
      myLogger.log({ level, message, data: args });
    },
  },
});
```
