---
title: DeepgramSTT
description: Add production-grade real-time speech recognition to your voice pipeline with Deepgram's WebSocket API.
order: 2
---

Use DeepgramSTT for production voice pipelines that need high accuracy, word-level timestamps, and wide language/model support via Deepgram's V1 (Nova) streaming API.

> **Looking for eager end-of-turn / preflight signals?** Use [DeepgramFlux](/guides/stt/deepgram-flux) instead — it connects to Deepgram's V2 API and supports the [eager LLM pipeline](/advanced/pipeline#eager-llm-pipeline).

## Prerequisites

- A [Deepgram](https://deepgram.com) API key
- No additional peer dependencies required

DeepgramSTT connects through a raw native `WebSocket` connection that it manages directly.

For production, set up a [proxy server](https://github.com/lukeocodes/composite-voice/tree/main/examples/10-proxy-server) so your API key stays server-side.

## Basic setup

```typescript
import { CompositeVoice, MicrophoneInput, DeepgramSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new DeepgramSTT({
      proxyUrl: '/api/proxy/deepgram',
      options: {
        model: 'nova-3',
        smartFormat: true,
      },
    }),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
      systemPrompt: 'You are a helpful voice assistant. Keep responses brief.',
    }),
    new NativeTTS(),
  ],
});

await agent.initialize();
await agent.startListening();
```

## Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `proxyUrl` | `string` | -- | URL of your CompositeVoice proxy endpoint (recommended) |
| `apiKey` | `string` | -- | Deepgram API key (development only) |
| `authType` | `'token' \| 'bearer'` | `'token'` | Controls WebSocket auth. Default: `'token'` (subprotocol `['token', apiKey]`). Set to `'bearer'` for OAuth tokens. |
| `language` | `string` | `'en-US'` | Language code |
| `interimResults` | `boolean` | `true` | Emit partial transcripts while the user speaks |
| `options.model` | `string` | `'nova-3'` | Transcription model (see model table below) |
| `options.smartFormat` | `boolean` | `true` | Auto-punctuation and formatting |
| `options.punctuation` | `boolean` | `true` | Add punctuation to results |
| `options.endpointing` | `boolean \| number` | `false` | Milliseconds of silence before end-of-speech (`false` to disable) |
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

DeepgramSTT uses Deepgram's V1 (Nova) model family:

| Model | Description |
|---|---|
| `nova-3` | Latest model, highest accuracy, recommended default |
| `nova-3-medical` | Optimized for medical terminology |
| `nova-2` | Previous generation — use if you need a language not yet in Nova-3 |
| `nova-2-*` | Domain variants: `meeting`, `finance`, `conversationalai`, `voicemail`, `medical`, `drivethru`, `automotive` |
| `nova` | Legacy, not recommended for new projects |

V1 uses an event-streaming model with `Results` events containing `is_final` and `speech_final` flags. Nova-3 delivers the best accuracy across the widest range of languages. Use Nova-2 variants for domain-specific vocabulary.

> **For Flux models** (e.g., `flux-general-en`) with turn-based transcription and eager end-of-turn signals, use the [DeepgramFlux](/guides/stt/deepgram-flux) provider instead.

## Complete example

```typescript
import { CompositeVoice, MicrophoneInput, DeepgramSTT, AnthropicLLM, DeepgramTTS, BrowserAudioOutput } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new DeepgramSTT({
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
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
      maxTokens: 256,
      systemPrompt: 'You are a helpful voice assistant. Keep responses under two sentences.',
    }),
    new DeepgramTTS({
      proxyUrl: '/api/proxy/deepgram',
      voice: 'aura-2-thalia-en',
    }),
    new BrowserAudioOutput(),
  ],
  // eagerLLM requires DeepgramFlux — see the DeepgramFlux guide for eager pipeline setup
  conversationHistory: { enabled: true, maxTurns: 10 },
  logging: { enabled: true, level: 'info' },
});

agent.on('transcription.final', (event) => {
  console.log('User said:', event.text);
});

await agent.initialize();
await agent.startListening();
```

## How utterance completion works

DeepgramSTT buffers `is_final` segments from the Deepgram WebSocket and emits the complete utterance text when `speech_final` arrives. Internally, this sets `utteranceComplete: true` on the `TranscriptionResult`, which is the flag CompositeVoice checks to trigger LLM processing. The older `speechFinal` field is still present on transcription events for display purposes but is deprecated for pipeline triggering -- `utteranceComplete` is now the canonical signal.

## Tips and gotchas

- **Always use a proxy in production.** Pass `proxyUrl` instead of `apiKey` so your Deepgram key never reaches the browser. The SDK converts `http(s)` to `ws(s)` automatically.
- **No peer dependencies.** DeepgramSTT uses a raw native WebSocket, not the `@deepgram/sdk`. No extra packages to install.
- **Utterance buffering.** Deepgram may split one utterance into multiple `is_final` segments before emitting `speech_final`. DeepgramSTT buffers these segments and delivers the complete utterance text when `utteranceComplete: true`.
- **No preflight signals.** DeepgramSTT (V1/Nova) does not emit preflight/eager end-of-turn events. For the eager LLM pipeline, use [DeepgramFlux](/guides/stt/deepgram-flux) instead.
- **Connection timeout.** The WebSocket connection defaults to a 10-second timeout. Adjust with `timeout` in the config if your network is slow.

## Related resources

- [Deepgram pipeline example](https://github.com/lukeocodes/composite-voice/tree/main/examples/20-deepgram-pipeline) -- full Deepgram STT + TTS pipeline
- [Eager pipeline example](https://github.com/lukeocodes/composite-voice/tree/main/examples/21-eager-pipeline) -- preflight signals with speculative LLM (uses DeepgramFlux)
- [Deepgram options example](https://github.com/lukeocodes/composite-voice/tree/main/examples/22-deepgram-options) -- explore transcription options
- [DeepgramFlux guide](/guides/stt/deepgram-flux) -- V2 Flux provider with eager end-of-turn signals
- [Proxy server example](https://github.com/lukeocodes/composite-voice/tree/main/examples/10-proxy-server) -- secure your API key server-side
- [API reference: DeepgramSTT](/api/classes/deepgramstt)
- [Providers reference](/reference/providers)
