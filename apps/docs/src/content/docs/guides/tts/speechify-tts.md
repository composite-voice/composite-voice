---
title: SpeechifyTTS
description: Convert text to speech using Speechify's Simba models via a simple REST API.
order: 6
---

Use SpeechifyTTS when you want high-quality speech synthesis from Speechify's Simba models via a simple REST call. Each `synthesize()` request returns the complete audio as a Blob -- no WebSocket management required. Voices from Speechify's catalog and instant voice cloning are both supported through the `voiceId` option.

## Prerequisites

- A [Speechify API key](https://console.speechify.ai/) or a CompositeVoice proxy server
- No additional dependencies required. SpeechifyTTS uses native `fetch` internally.

## Basic setup

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, SpeechifyTTS, BrowserAudioOutput } from 'composite-voice';

const voice = new CompositeVoice({
  providers: [
    new NativeSTT(),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
    }),
    new SpeechifyTTS({
      proxyUrl: '/api/proxy/speechify',
      voiceId: 'geffen_32',
      model: 'simba-3.2',
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
| `apiKey` | `string` | -- | Speechify API key (direct mode) |
| `proxyUrl` | `string` | -- | Proxy server URL (recommended for production) |
| `voiceId` | `string` | **required** | Voice identifier from `GET /v1/voices` or a cloned voice |
| `model` | `string` | `'simba-english'` | `simba-english`, `simba-multilingual`, `simba-3.0`, `simba-3.2` |
| `audioFormat` | `string` | `'mp3'` | Output format: `mp3`, `wav`, `ogg`, `aac` |
| `language` | `string` | auto-detect | ISO 639-1 code with optional region (e.g. `en-US`) |
| `loudnessNormalization` | `boolean` | `false` | Normalize output loudness |
| `textNormalization` | `boolean` | `false` | Normalize numbers, dates, and abbreviations before synthesis |
| `endpoint` | `string` | -- | Custom API endpoint URL |
| `maxRetries` | `number` | `3` | Retry count for failed requests |

### Available voices

List voices with Speechify's [`GET /v1/voices`](https://docs.sws.speechify.com/) endpoint, or create your own with [instant voice cloning](https://docs.sws.speechify.com/v1/docs/features/voice-cloning). The quickstart voice `geffen_32` is a good starting point for the `simba-3.2` model.

### Output formats

| Format | Use case |
|---|---|
| `mp3` | Good compression, wide browser support (default) |
| `wav` | Uncompressed, highest quality |
| `ogg` | Good compression, open format |
| `aac` | Optimized for mobile devices |

## Complete example

```typescript
import { CompositeVoice, MicrophoneInput, DeepgramSTT, AnthropicLLM, SpeechifyTTS, BrowserAudioOutput } from 'composite-voice';

const tts = new SpeechifyTTS({
  proxyUrl: '/api/proxy/speechify',
  voiceId: 'geffen_32',
  model: 'simba-3.2',
  audioFormat: 'mp3',
  loudnessNormalization: true,
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

- **`simba-english`** -- English-only model optimized for latency. Best default for English voice pipelines.
- **`simba-multilingual`** -- Supports multiple languages; pair with the `language` option or let Speechify auto-detect.
- **`simba-3.0` / `simba-3.2`** -- Newer generation models with improved naturalness. `simba-3.2` is the latest.

## Tips

- Emotion, pitch, and speed are controlled with SSML `<prosody>` tags in the input text rather than config options -- see the [Speechify SSML docs](https://docs.sws.speechify.com/v1/docs/ssml).
- SpeechifyTTS is REST-based, not streaming. The full audio Blob is returned after the API processes the entire input. For real-time streaming, consider [DeepgramTTS](/guides/tts/deepgram-tts).
- The Speechify API returns audio base64-encoded; SpeechifyTTS decodes it into a playable Blob for you.
- Use `proxyUrl` in production so your API key stays server-side -- set `speechifyApiKey` in your proxy config.

## Further reading

- [API reference](/api/classes/speechifytts)
- [Providers reference](/reference/providers)
- [Getting started](/guides/getting-started)
