---
title: DeepgramSTT
description: Add production-grade real-time speech recognition to your voice pipeline with Deepgram's WebSocket API.
order: 2
---

Use DeepgramSTT for production voice pipelines that need high accuracy, word-level timestamps, and preflight signals for the eager LLM pipeline.

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
| `options.model` | `string` | `'nova-3'` | Transcription model: `nova-3`, `nova-2`, `nova` |
| `options.smartFormat` | `boolean` | `true` | Auto-punctuation and formatting |
| `options.punctuation` | `boolean` | `true` | Add punctuation to results |
| `options.endpointing` | `boolean \| number` | `false` | Milliseconds of silence before end-of-speech |
| `options.diarize` | `boolean` | `false` | Speaker identification |
| `options.keywords` | `string[]` | -- | Boost recognition of specific terms |

See the [API reference](/api/classes/deepgramstt) for the full list.

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
  eagerLLM: { enabled: true, cancelOnTextChange: true },
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
- **Preflight signals for eager LLM.** Nova-3 can emit early end-of-turn signals before `speech_final` is confirmed. Enable `eagerLLM: { enabled: true }` in your CompositeVoice config to start LLM generation speculatively and reduce latency.
- **Connection timeout.** The WebSocket connection defaults to a 10-second timeout. Adjust with `timeout` in the config if your network is slow.

## Related resources

- [Deepgram pipeline example](https://github.com/lukeocodes/composite-voice/tree/main/examples/20-deepgram-pipeline) -- full Deepgram STT + TTS pipeline
- [Eager pipeline example](https://github.com/lukeocodes/composite-voice/tree/main/examples/21-eager-pipeline) -- preflight signals with speculative LLM
- [Deepgram options example](https://github.com/lukeocodes/composite-voice/tree/main/examples/22-deepgram-options) -- explore transcription options
- [Proxy server example](https://github.com/lukeocodes/composite-voice/tree/main/examples/10-proxy-server) -- secure your API key server-side
- [API reference: DeepgramSTT](/api/classes/deepgramstt)
- [Providers reference](/reference/providers)
