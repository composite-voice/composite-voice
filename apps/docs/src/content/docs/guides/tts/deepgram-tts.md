---
title: DeepgramTTS
description: Stream low-latency text-to-speech over WebSocket using Deepgram's Aura 2 voice models.
order: 2
---

Use DeepgramTTS for low-latency streaming speech synthesis. Text flows over a persistent WebSocket connection and audio chunks arrive incrementally, so users hear the first words before the full response finishes generating.

## Prerequisites

- A [Deepgram API key](https://console.deepgram.com/) or a CompositeVoice proxy server
- Install the peer dependency:

```bash
npm install @deepgram/sdk
```

## Basic setup

```typescript
import { CompositeVoice, DeepgramSTT, AnthropicLLM, DeepgramTTS } from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  stt: new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
  llm: new AnthropicLLM({
    proxyUrl: '/api/proxy/anthropic',
    model: 'claude-haiku-4-5',
  }),
  tts: new DeepgramTTS({
    proxyUrl: '/api/proxy/deepgram',
    voice: 'aura-2-thalia-en',
    sampleRate: 24000,
    outputFormat: 'linear16',
  }),
});

await voice.start();
```

## Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | -- | Deepgram API key (direct mode) |
| `proxyUrl` | `string` | -- | Proxy server URL (recommended for production) |
| `voice` | `string` | `'aura-2-thalia-en'` | Voice model identifier |
| `sampleRate` | `number` | `24000` | Output sample rate: `8000`, `16000`, `24000`, `32000`, or `48000` Hz |
| `outputFormat` | `string` | `'linear16'` | Audio encoding: `linear16`, `mulaw`, or `alaw` |
| `options.model` | `string` | Falls back to `voice` | Overrides the voice model |
| `options.encoding` | `string` | Falls back to `outputFormat` | Overrides the encoding |
| `options.container` | `string` | `'none'` | Container format: `'none'` (raw) or `'wav'` |
| `options.bitRate` | `number` | -- | Bit rate for encoded formats |

### Available voices

**Aura 2 (recommended) — 40 English voices + 10 Spanish voices:**

Popular English voices: `aura-2-thalia-en`, `aura-2-andromeda-en`, `aura-2-janus-en`, `aura-2-proteus-en`, `aura-2-orion-en`, `aura-2-luna-en`, `aura-2-arcas-en`, `aura-2-athena-en`, `aura-2-helios-en`, `aura-2-zeus-en`, and 30 more.

Spanish voices: `aura-2-sirio-es`, `aura-2-nestor-es`, `aura-2-carina-es`, `aura-2-celeste-es`, `aura-2-alvaro-es`, `aura-2-diana-es`, `aura-2-aquila-es`, `aura-2-selena-es`, `aura-2-estrella-es`, `aura-2-javier-es`.

**Aura 1 (legacy) — 12 English voices:**

`aura-asteria-en`, `aura-luna-en`, `aura-stella-en`, `aura-athena-en`, `aura-hera-en`, `aura-orion-en`, `aura-arcas-en`, `aura-perseus-en`, `aura-angus-en`, `aura-orpheus-en`, `aura-helios-en`, `aura-zeus-en`. Use Aura 1 only if you need a specific voice that did not carry over to Aura 2.

## Complete example

```typescript
import { CompositeVoice, DeepgramSTT, AnthropicLLM, DeepgramTTS } from '@lukeocodes/composite-voice';

const tts = new DeepgramTTS({
  proxyUrl: '/api/proxy/deepgram',
  voice: 'aura-2-andromeda-en',
  sampleRate: 24000,
  outputFormat: 'linear16',
});

const voice = new CompositeVoice({
  stt: new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
  llm: new AnthropicLLM({
    proxyUrl: '/api/proxy/anthropic',
    model: 'claude-haiku-4-5',
  }),
  tts,
  logging: { enabled: true, level: 'debug' },
});

voice.on('tts:start', () => console.log('Speaking...'));
voice.on('tts:end', () => console.log('Done speaking'));

await voice.start();
```

## Streaming lifecycle

DeepgramTTS extends `LiveTTSProvider`. When used inside a CompositeVoice pipeline, the SDK manages the full lifecycle automatically. For standalone use:

```typescript
const tts = new DeepgramTTS({
  proxyUrl: '/api/proxy/deepgram',
  voice: 'aura-2-thalia-en',
});

await tts.initialize();     // Load Deepgram SDK, create client
await tts.connect();         // Open WebSocket

tts.onAudio((chunk) => {
  // chunk.data is an ArrayBuffer of linear16 PCM audio
  // chunk.metadata contains sampleRate, encoding, channels, bitDepth
});

tts.sendText('Hello, world!');
await tts.finalize();        // Flush remaining audio
await tts.disconnect();      // Close WebSocket
```

## Tips

- Use `proxyUrl` in production to keep your API key server-side. Pass `apiKey` only during local development.
- Aura 2 voices deliver better quality than Aura 1. Use `aura-2-thalia-en` as a starting point.
- Set `container: 'none'` (the default) for WebSocket streaming. Use `'wav'` only when you need a self-contained file.
- DeepgramTTS emits metadata events with sample rate and encoding information. Use these to configure downstream audio processing.

## Further reading

- [API reference](/api/classes/deepgramtts)
- [Providers reference](/reference/providers)
- [Getting started](/guides/getting-started)
