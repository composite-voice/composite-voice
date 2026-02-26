---
title: DeepgramSTT
description: Add production-grade real-time speech recognition to your voice pipeline with Deepgram's WebSocket API.
order: 2
---

Use DeepgramSTT for production voice pipelines that need high accuracy, word-level timestamps, and — with Flux models (STT V2) — preflight signals for the eager LLM pipeline.

## Prerequisites

- A [Deepgram](https://deepgram.com) API key
- The `@deepgram/sdk` peer dependency installed:

```bash
npm install @deepgram/sdk
```

For production, set up a [proxy server](https://github.com/lukeocodes/composite-voice/tree/main/examples/10-proxy-server) so your API key stays server-side.

## Basic setup

```typescript
import { CompositeVoice, DeepgramSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new DeepgramSTT({
    proxyUrl: '/api/proxy/deepgram',
    options: {
      model: 'nova-3',
      smartFormat: true,
    },
  }),
  llm: new AnthropicLLM({
    proxyUrl: '/api/proxy/anthropic',
    model: 'claude-haiku-4-5',
    systemPrompt: 'You are a helpful voice assistant. Keep responses brief.',
  }),
  tts: new NativeTTS(),
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
| `options.model` | `string` | `'nova-3'` | Transcription model (see model table below) |
| `options.smartFormat` | `boolean` | `true` | Auto-punctuation and formatting |
| `options.punctuation` | `boolean` | `true` | Add punctuation to results |
| `options.endpointing` | `boolean \| number` | `10` | Milliseconds of silence before end-of-speech (`false` to disable) |
| `options.diarize` | `boolean` | `false` | Speaker identification (V1 only) |
| `options.keywords` | `string[]` | -- | Boost recognition of specific terms (with optional weight, e.g. `'Deepgram:2'`) |
| `options.vadEvents` | `boolean` | `false` | Emit `SpeechStarted` events (V1 only) |
| `options.detectEntities` | `boolean` | `false` | Detect entities in the transcript (V1 only) |
| `options.numerals` | `boolean` | `false` | Convert spoken numbers to digits (V1 only) |
| `options.redact` | `string[]` | -- | Redact sensitive info: `'pci'`, `'ssn'`, `'numbers'` (V1 only) |
| `options.multichannel` | `boolean` | `false` | Transcribe each audio channel independently (V1 only) |
| `options.utterances` | `boolean` | `false` | Enable utterance segmentation (V1 only) |

See the [API reference](/api/classes/deepgramstt) for the full list.

### Models

Deepgram offers two STT generations:

**STT V2 (Flux) — turn-based, eager end-of-turn signals:**

| Model | Description |
|---|---|
| `flux-general-en` | English, turn-based architecture, supports eager end-of-turn for speculative LLM |

Flux uses a turn-based conversation model with `TurnInfo` events (`StartOfTurn`, `EagerEndOfTurn`, `TurnResumed`, `EndOfTurn`). It is the only model family that supports [eager LLM generation](/advanced/pipeline#eager-llm-pipeline).

V2-specific config options:

| Option | Type | Default | Description |
|---|---|---|---|
| `eotThreshold` | `number` | `0.7` | Confidence (0.5–0.9) required to confirm end-of-turn |
| `eagerEotThreshold` | `number` | -- | Confidence (0.3–0.9) to fire `EagerEndOfTurn` (enables eager mode) |
| `eotTimeoutMs` | `number` | `5000` | Max ms before forcing end-of-turn regardless of confidence |

**STT V1 (Nova) — highest accuracy, widest language support:**

| Model | Description |
|---|---|
| `nova-3` | Latest V1 model, highest accuracy, recommended default |
| `nova-3-medical` | Optimized for medical terminology |
| `nova-2` | Previous generation — use if you need a language not yet in Nova-3 |
| `nova-2-*` | Domain variants: `meeting`, `finance`, `conversationalai`, `voicemail`, `medical`, `drivethru`, `automotive` |
| `nova` | Legacy, not recommended for new projects |

V1 uses an event-streaming model with `Results` events containing `is_final` and `speech_final` flags. Nova-3 delivers the best accuracy across the widest range of languages. Use Nova-2 variants for domain-specific vocabulary.

## Complete example

```typescript
import { CompositeVoice, DeepgramSTT, AnthropicLLM, DeepgramTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new DeepgramSTT({
    proxyUrl: '/api/proxy/deepgram',
    language: 'en',
    interimResults: true,
    options: {
      model: 'nova-3',
      smartFormat: true,
      punctuation: true,
      endpointing: 300,
      keywords: ['CompositeVoice'],
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
  // eagerLLM requires a Flux model (STT V2) — change model above to 'flux-general-en' to enable
  // eagerLLM: { enabled: true, cancelOnTextChange: true },
  conversationHistory: { enabled: true, maxTurns: 10 },
  logging: { enabled: true, level: 'info' },
});

agent.on('transcription:final', (event) => {
  console.log('User said:', event.text);
});

await agent.start();
```

## Tips and gotchas

- **Always use a proxy in production.** Pass `proxyUrl` instead of `apiKey` so your Deepgram key never reaches the browser. The SDK converts `http(s)` to `ws(s)` automatically.
- **Install the peer dependency.** DeepgramSTT dynamically imports `@deepgram/sdk` at initialization. If the package is missing, you get a clear error with install instructions.
- **Utterance buffering.** Deepgram may split one utterance into multiple `is_final` segments before emitting `speech_final`. DeepgramSTT buffers these segments and delivers the complete utterance text when `speechFinal: true`.
- **Preflight signals for eager LLM.** Flux models (STT V2, e.g. `flux-general-en`) emit early end-of-turn signals before `speech_final` is confirmed. Enable `eagerLLM: { enabled: true }` in your CompositeVoice config to start LLM generation speculatively and reduce latency. Nova models (STT V1) do not support preflight.
- **Connection timeout.** The WebSocket connection defaults to a 10-second timeout. Adjust with `timeout` in the config if your network is slow.

## Related resources

- [Deepgram pipeline example](https://github.com/lukeocodes/composite-voice/tree/main/examples/20-deepgram-pipeline) -- full Deepgram STT + TTS pipeline
- [Eager pipeline example](https://github.com/lukeocodes/composite-voice/tree/main/examples/21-eager-pipeline) -- preflight signals with speculative LLM
- [Deepgram options example](https://github.com/lukeocodes/composite-voice/tree/main/examples/22-deepgram-options) -- explore transcription options
- [Proxy server example](https://github.com/lukeocodes/composite-voice/tree/main/examples/10-proxy-server) -- secure your API key server-side
- [API reference: DeepgramSTT](/api/classes/deepgramstt)
- [Providers reference](/reference/providers)
