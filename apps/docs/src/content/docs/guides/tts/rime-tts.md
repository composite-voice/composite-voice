---
title: RimeTTS
description: Convert text to speech using Rime's Coda, Arcana, and Mist models via a simple REST API.
order: 7
---

Use RimeTTS when you want expressive, low-latency speech synthesis from Rime's Coda, Arcana, and Mist model families via a simple REST call. Each `synthesize()` request returns the complete audio as a Blob -- no WebSocket management required. The output format is selected with the `audioFormat` option, which maps to the request's `Accept` header.

## Prerequisites

- A [Rime API key](https://app.rime.ai/tokens) or a CompositeVoice proxy server
- No additional dependencies required. RimeTTS uses native `fetch` internally.

## Basic setup

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, RimeTTS, BrowserAudioOutput } from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  providers: [
    new NativeSTT(),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
    }),
    new RimeTTS({
      proxyUrl: '/api/proxy/rime',
      speaker: 'astra',
      model: 'arcana',
      audioFormat: 'mp3',
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
| `apiKey` | `string` | -- | Rime API key (direct mode) |
| `proxyUrl` | `string` | -- | Proxy server URL (recommended for production) |
| `speaker` | `string` | **required** | Voice identifier from Rime's per-model voice catalogs |
| `model` | `string` | `'arcana'` | `coda`, `arcana`, `arcanav3`, `arcanav2`, `mistv3`, `mistv2` |
| `audioFormat` | `string` | `'mp3'` | Output format: `mp3`, `wav`, `ogg`, `webm`, `pcm`, `mulaw` |
| `language` | `string` | `'en'` (server-side) | ISO 639-1 or 639-2/3 code (e.g. `en`, `spa`), sent as `lang` |
| `samplingRate` | `number` | `24000` (server-side) | Output sampling rate in Hz |
| `speedAlpha` | `number` | -- | Speech speed multiplier (`mistv2`; `<1.0` faster, `>1.0` slower) |
| `noTextNormalization` | `boolean` | -- | Skip text normalization for lower latency (`mistv2`) |
| `timeScaleFactor` | `number` | -- | `>1.0` slows audio, `<1.0` speeds it up |
| `endpoint` | `string` | -- | Custom API endpoint URL |
| `maxRetries` | `number` | `3` | Retry count for failed requests |

### Available voices

Voice availability depends on the selected model -- browse the per-model catalogs in the [Rime voices documentation](https://docs.rime.ai/api-reference/voices). Voices like `astra` and `celeste` are good starting points.

### Output formats

| Format | Use case |
|---|---|
| `mp3` | Good compression, wide browser support (default) |
| `wav` | Uncompressed 16-bit PCM with RIFF header |
| `ogg` | Opus in an OGG container, good compression |
| `webm` | Opus in a WebM container, native browser streaming |
| `pcm` | Headerless 16-bit linear PCM (`audio/L16`) |
| `mulaw` | Headerless G.711 mu-law (`audio/PCMU`), common in telephony |

## Complete example

```typescript
import { CompositeVoice, MicrophoneInput, DeepgramSTT, AnthropicLLM, RimeTTS, BrowserAudioOutput } from '@lukeocodes/composite-voice';

const tts = new RimeTTS({
  proxyUrl: '/api/proxy/rime',
  speaker: 'astra',
  model: 'arcana',
  audioFormat: 'mp3',
  language: 'en',
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

- **`coda`** -- Rime's flagship conversational model with sub-100ms model latency and multilingual support. Best voice quality.
- **`arcana` / `arcanav3` / `arcanav2`** -- Highly expressive speech with emotional nuance. `arcana` is the default for RimeTTS.
- **`mistv3` / `mistv2`** -- The low-latency Mist family. `mistv3` is the fastest; `mistv2` supports custom pronunciation.

## Tips

- `speedAlpha` and `noTextNormalization` apply to `mistv2`. On `speedAlpha`, values below `1.0` are faster and values above `1.0` are slower. For speed control on other models, use `timeScaleFactor` (which works the other way: `>1.0` slows audio down).
- RimeTTS is REST-based, not streaming. The full audio Blob is returned after the API processes the entire input. For real-time streaming, consider [DeepgramTTS](/guides/tts/deepgram-tts).
- The Rime API returns raw audio bytes in the format requested via the `Accept` header; RimeTTS wraps them in a playable Blob for you.
- Use `proxyUrl` in production so your API key stays server-side -- set `rimeApiKey` in your proxy config.

## Further reading

- [API reference](/api/classes/rimetts)
- [Providers reference](/reference/providers)
- [Getting started](/guides/getting-started)
