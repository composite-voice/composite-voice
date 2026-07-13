---
title: SmallestTTS
description: Convert text to speech using Smallest.ai's Lightning models via the Waves REST API.
order: 7
---

Use SmallestTTS when you want ultra-low-latency speech synthesis from Smallest.ai's Lightning models via a simple REST call. Each `synthesize()` request hits the unified Waves `POST /waves/v1/tts` endpoint and returns the complete audio as a Blob -- no WebSocket management required. Voices from the Waves catalog and cloned voices are both supported through the `voiceId` option.

## Prerequisites

- A [Smallest.ai API key](https://waves.smallest.ai/) or a CompositeVoice proxy server
- No additional dependencies required. SmallestTTS uses native `fetch` internally.

## Basic setup

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, SmallestTTS, BrowserAudioOutput } from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  providers: [
    new NativeSTT(),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
    }),
    new SmallestTTS({
      proxyUrl: '/api/proxy/smallest',
      voiceId: 'meher',
      model: 'lightning_v3.1',
      outputFormat: 'wav',
    }),
    new BrowserAudioOutput(),
  ],
});

await voice.initialize();
await voice.startListening();
```

## Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | -- | Smallest.ai API key (direct mode) |
| `proxyUrl` | `string` | -- | Proxy server URL (recommended for production) |
| `voiceId` | `string` | **required** | Voice identifier from the Waves catalog or a cloned voice |
| `model` | `string` | `'lightning_v3.1'` | `lightning_v3.1`, `lightning_v3.1_pro` |
| `outputFormat` | `string` | `'wav'` | Output format: `wav`, `mp3`, `pcm`, `ulaw`, `alaw` |
| `sampleRate` | `number` | `44100` | Output sample rate: `8000`, `16000`, `24000`, `44100` |
| `speed` | `number` | `1.0` | Speech speed multiplier, `0.5` to `2.0` |
| `language` | `string` | `'en'` | ISO 639-1 code matching the voice (e.g. `en`, `hi`, `es`) |
| `endpoint` | `string` | -- | Custom API endpoint URL |
| `maxRetries` | `number` | `3` | Retry count for failed requests |

### Available voices

Browse and preview voices in the [Waves console](https://waves.smallest.ai/), or clone your own. The quickstart voices `meher`, `magnus`, and `olivia` are good starting points.

### Output formats

| Format | Use case |
|---|---|
| `wav` | Directly playable in browsers, uncompressed (default) |
| `mp3` | Good compression, wide browser support |
| `pcm` | Raw 16-bit PCM, lowest latency, needs a decoder to play |
| `ulaw` | mu-law encoding for telephony |
| `alaw` | A-law encoding for telephony |

## Complete example

```typescript
import { CompositeVoice, MicrophoneInput, DeepgramSTT, AnthropicLLM, SmallestTTS, BrowserAudioOutput } from '@lukeocodes/composite-voice';

const tts = new SmallestTTS({
  proxyUrl: '/api/proxy/smallest',
  voiceId: 'meher',
  model: 'lightning_v3.1_pro',
  outputFormat: 'wav',
  sampleRate: 24000,
  speed: 1.0,
});

const voice = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
    }),
    tts,
    new BrowserAudioOutput(),
  ],
});

voice.on('tts.start', () => console.log('Speaking...'));
voice.on('tts.end', () => console.log('Done speaking'));

await voice.initialize();
await voice.startListening();
```

## Model selection

- **`lightning_v3.1`** -- The standard 44 kHz Lightning model with natural, expressive speech. Supports 12 languages (English, Hindi, Spanish, and 9 Indian languages) plus voice cloning. Best default.
- **`lightning_v3.1_pro`** -- Curated 44 kHz voice pool with improved naturalness across American, British, and Indian accents, at the same latency.

Older Lightning models (`lightning`, `lightning-large`, `lightning-v2`) and their per-model `get_speech` endpoints are deprecated by Smallest.ai; SmallestTTS only targets the unified `/waves/v1/tts` endpoint.

## Tips

- Smallest.ai recommends keeping each request under roughly 250 characters of text for the lowest latency.
- SmallestTTS is REST-based, not streaming. The full audio Blob is returned after the API processes the entire input. For real-time streaming, consider [DeepgramTTS](/guides/tts/deepgram-tts).
- The API's own default output format is raw `pcm`; SmallestTTS defaults to `wav` instead so the returned Blob is directly playable in browsers.
- Use `proxyUrl` in production so your API key stays server-side -- set `smallestApiKey` in your proxy config.

## Further reading

- [API reference](/api/classes/smallesttts)
- [Providers reference](/reference/providers)
- [Getting started](/guides/getting-started)
