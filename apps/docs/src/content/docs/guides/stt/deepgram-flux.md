---
title: DeepgramFlux
description: Low-latency real-time speech recognition with eager end-of-turn signals for the speculative LLM pipeline.
order: 3
---

Use DeepgramFlux for the lowest-latency voice pipelines. It connects to Deepgram's V2 (Flux) streaming API, which delivers turn-based transcription with eager end-of-turn signals — the key ingredient for the [eager LLM pipeline](/advanced/pipeline#eager-llm-pipeline).

## Prerequisites

- A [Deepgram](https://deepgram.com) API key
- The `@deepgram/sdk` (v5+) peer dependency installed:

```bash
npm install @deepgram/sdk@^5
```

For production, set up a [proxy server](https://github.com/lukeocodes/composite-voice/tree/main/examples/10-proxy-server) so your API key stays server-side.

## Basic setup

```typescript
import { CompositeVoice, DeepgramFlux, AnthropicLLM, DeepgramTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new DeepgramFlux({
    proxyUrl: '/api/proxy/deepgram',
    options: {
      model: 'flux-general-en',
      eagerEotThreshold: 0.5,
    },
  }),
  llm: new AnthropicLLM({
    proxyUrl: '/api/proxy/anthropic',
    model: 'claude-haiku-4-5',
    systemPrompt: 'You are a helpful voice assistant. Keep responses brief.',
  }),
  tts: new DeepgramTTS({
    proxyUrl: '/api/proxy/deepgram',
    voice: 'aura-2-thalia-en',
  }),
  eagerLLM: {
    enabled: true,
    cancelOnTextChange: true,
    similarityThreshold: 0.8,
  },
});

await agent.start();
```

## Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `proxyUrl` | `string` | -- | URL of your CompositeVoice proxy endpoint (recommended) |
| `apiKey` | `string` | -- | Deepgram API key (development only) |
| `language` | `string` | `'en-US'` | Language code |
| `interimResults` | `boolean` | `true` | Emit partial transcripts while the user speaks |
| `options.model` | `string` | `'flux-general-en'` | Flux transcription model |
| `options.encoding` | `string` | -- | Audio encoding: `'linear16'`, `'linear32'`, `'mulaw'`, `'alaw'`, `'opus'`, `'ogg-opus'` |
| `options.sampleRate` | `number` | -- | Audio sample rate in Hz (required when `encoding` is set) |
| `options.eotThreshold` | `number` | `0.7` | Confidence (0.5–0.9) required to confirm end-of-turn |
| `options.eagerEotThreshold` | `number` | -- | Confidence (0.3–0.9) to fire `EagerEndOfTurn` (enables eager mode) |
| `options.eotTimeoutMs` | `number` | `5000` | Max ms before forcing end-of-turn regardless of confidence |
| `options.keyterms` | `string[]` | -- | Specialized terminology to boost recognition |
| `options.tag` | `string` | -- | Label for usage reporting in the Deepgram console |
| `options.mipOptOut` | `boolean` | `false` | Opt out of the Deepgram Model Improvement Program |

See the [API reference](/api/classes/deepgramflux) for the full list.

## How Flux differs from DeepgramSTT

DeepgramFlux uses Deepgram's V2 API (`listen.v2`), which is fundamentally different from the V1 API used by [DeepgramSTT](/guides/stt/deepgram-stt):

| | DeepgramSTT (V1) | DeepgramFlux (V2) |
|---|---|---|
| **API** | `listen.live` | `listen.v2` |
| **Models** | Nova-3, Nova-2 | Flux (e.g., `flux-general-en`) |
| **Transcription model** | Event-streaming (`Results` events) | Turn-based (`TurnInfo` events) |
| **Events** | `is_final`, `speech_final` | `StartOfTurn`, `Update`, `EagerEndOfTurn`, `TurnResumed`, `EndOfTurn` |
| **Preflight signals** | No | Yes (`EagerEndOfTurn` → `isPreflight: true`) |
| **Eager LLM pipeline** | Not supported | Supported |
| **Utterance buffering** | SDK buffers `is_final` segments until `speech_final` | Turn lifecycle managed by Deepgram |

**Use DeepgramFlux when:** you want the lowest latency via the eager LLM pipeline, or you prefer the turn-based conversation model.

**Use DeepgramSTT when:** you need Nova-3's broader language support, domain-specific models (medical, finance), or V1-specific features like diarization.

## TurnInfo events

Flux delivers transcription through `TurnInfo` events that map to the CompositeVoice transcription model:

| V2 event | SDK result | Description |
|---|---|---|
| `StartOfTurn` | `isFinal: false` | Speech detected, turn has begun |
| `Update` | `isFinal: false` | Partial transcript update (like interim results) |
| `EagerEndOfTurn` | `isPreflight: true` | Early end-of-turn prediction — triggers eager LLM |
| `TurnResumed` | `isFinal: false` | User resumed speaking after an eager end-of-turn |
| `EndOfTurn` | `isFinal: true, speechFinal: true` | Confirmed end of utterance — triggers standard LLM |

## Eager LLM pipeline

The killer feature of DeepgramFlux is the `EagerEndOfTurn` signal. When Deepgram predicts that the speaker is about to stop talking, it fires this event early — before the final `EndOfTurn` confirmation. The SDK uses it to start LLM generation speculatively.

Configure the threshold to balance speed vs. accuracy:

```typescript
const stt = new DeepgramFlux({
  proxyUrl: '/api/proxy/deepgram',
  options: {
    model: 'flux-general-en',
    eagerEotThreshold: 0.5,  // lower = faster but more false positives
    eotThreshold: 0.7,       // higher = more certain before confirming end-of-turn
  },
});
```

Enable the eager pipeline in CompositeVoice:

```typescript
const agent = new CompositeVoice({
  stt,
  llm: new AnthropicLLM({ proxyUrl: '/api/proxy/anthropic' }),
  tts: new DeepgramTTS({ proxyUrl: '/api/proxy/deepgram' }),
  eagerLLM: {
    enabled: true,
    cancelOnTextChange: true,
    similarityThreshold: 0.8,  // accept if >=80% word overlap
  },
});
```

The `similarityThreshold` controls how different the final text can be from the preflight text before the speculative response is cancelled. A value of `0.8` means that if 80%+ of the words match (in order), the response is kept. See [`textSimilarity`](/api/functions/textsimilarity) for details on how similarity is computed.

## Complete example

```typescript
import { CompositeVoice, DeepgramFlux, AnthropicLLM, DeepgramTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new DeepgramFlux({
    proxyUrl: '/api/proxy/deepgram',
    language: 'en',
    options: {
      model: 'flux-general-en',
      eagerEotThreshold: 0.5,
      eotThreshold: 0.7,
      eotTimeoutMs: 5000,
      keyterms: ['CompositeVoice'],
    },
  }),
  llm: new AnthropicLLM({
    proxyUrl: '/api/proxy/anthropic',
    model: 'claude-haiku-4-5',
    maxTokens: 256,
    systemPrompt: 'You are a helpful voice assistant. Keep responses under two sentences.',
  }),
  tts: new DeepgramTTS({
    proxyUrl: '/api/proxy/deepgram',
    voice: 'aura-2-thalia-en',
  }),
  eagerLLM: {
    enabled: true,
    cancelOnTextChange: true,
    similarityThreshold: 0.8,
  },
  conversationHistory: { enabled: true, maxTurns: 10 },
  logging: { enabled: true, level: 'info' },
});

agent.on('transcription:preflight', (event) => {
  console.log('Eager end-of-turn:', event.text);
});

agent.on('transcription:speechFinal', (event) => {
  console.log('Confirmed:', event.text);
});

await agent.start();
```

## Tips and gotchas

- **Always use a proxy in production.** Pass `proxyUrl` instead of `apiKey` so your Deepgram key never reaches the browser. The SDK converts `http(s)` to `ws(s)` automatically.
- **Install the peer dependency.** DeepgramFlux dynamically imports `@deepgram/sdk` V5 at initialization. If the package is missing, you get a clear error with install instructions.
- **Set `eagerEotThreshold` to enable preflight.** Without this option, DeepgramFlux will not emit `EagerEndOfTurn` events, and the eager LLM pipeline will have no preflight signals to work with.
- **Connection timeout.** The WebSocket connection defaults to a 10-second timeout. Adjust with `timeout` in the config if your network is slow.
- **Keep-alive.** Use `sendKeepAlive()` to prevent the V2 WebSocket from timing out during long pauses.

## Related resources

- [Eager pipeline example](https://github.com/lukeocodes/composite-voice/tree/main/examples/21-eager-pipeline) -- preflight signals with speculative LLM
- [Deepgram pipeline example](https://github.com/lukeocodes/composite-voice/tree/main/examples/20-deepgram-pipeline) -- full Deepgram STT + TTS pipeline
- [Proxy server example](https://github.com/lukeocodes/composite-voice/tree/main/examples/10-proxy-server) -- secure your API key server-side
- [Pipeline architecture](/advanced/pipeline#eager-llm-pipeline) -- how the eager pipeline works
- [API reference: DeepgramFlux](/api/classes/deepgramflux)
- [API reference: DeepgramFluxConfig](/api/interfaces/deepgramfluxconfig)
- [Providers reference](/reference/providers)
