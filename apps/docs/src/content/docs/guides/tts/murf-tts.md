---
title: MurfTTS
description: Convert text to speech using Murf AI's Gen2 model via a simple REST API.
order: 7
---

Use MurfTTS when you want natural, studio-quality speech synthesis from Murf AI's Gen2 model via a simple REST call. Each `synthesize()` request returns the complete audio as a Blob -- no WebSocket management required. Murf's voice library spans 20+ languages, and many voices offer multiple speaking styles (e.g. Conversational, Promo) through the `style` option.

## Prerequisites

- A [Murf API key](https://murf.ai/api) or a CompositeVoice proxy server
- No additional dependencies required. MurfTTS uses native `fetch` internally.

## Basic setup

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, MurfTTS, BrowserAudioOutput } from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  providers: [
    new NativeSTT(),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
    }),
    new MurfTTS({
      proxyUrl: '/api/proxy/murf',
      voiceId: 'en-US-natalie',
      format: 'mp3',
      style: 'Conversational',
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
| `apiKey` | `string` | -- | Murf API key (direct mode) |
| `proxyUrl` | `string` | -- | Proxy server URL (recommended for production) |
| `voiceId` | `string` | **required** | Voice identifier (e.g. `en-US-natalie`) from `GET /v1/speech/voices` |
| `modelVersion` | `string` | `'GEN2'` | Murf model generation |
| `format` | `string` | `'mp3'` | Output format: `mp3`, `wav`, `flac`, `alaw`, `ulaw` |
| `sampleRate` | `number` | `44100` (server default) | `8000`, `24000`, `44100`, or `48000` Hz |
| `channelType` | `string` | `'MONO'` (server default) | `MONO` or `STEREO` |
| `style` | `string` | voice default | Speaking style (varies per voice, e.g. `Conversational`) |
| `rate` | `number` | `0` | Speech rate, `-50` (slowest) to `50` (fastest) |
| `pitch` | `number` | `0` | Voice pitch, `-50` (lowest) to `50` (highest) |
| `variation` | `number` | `1` (server default) | Pause/pitch/speed variation, `0` to `5` |
| `locale` | `string` | voice native locale | Language code for native multilingual voices (e.g. `es-ES`) |
| `endpoint` | `string` | -- | Custom API endpoint URL |
| `maxRetries` | `number` | `3` | Retry count for failed requests |

### Available voices

List voices with Murf's [`GET /v1/speech/voices`](https://murf.ai/api/docs) endpoint. Voice IDs follow a `{locale}-{name}` pattern -- `en-US-natalie` is a good starting point. Each voice lists its supported styles and locales.

### Output formats

| Format | Use case |
|---|---|
| `mp3` | Good compression, wide browser support (default) |
| `wav` | Uncompressed, highest quality |
| `flac` | Lossless compression |
| `alaw` | Telephony (A-law) |
| `ulaw` | Telephony (u-law) |

## Complete example

```typescript
import { CompositeVoice, MicrophoneInput, DeepgramSTT, AnthropicLLM, MurfTTS, BrowserAudioOutput } from '@lukeocodes/composite-voice';

const tts = new MurfTTS({
  proxyUrl: '/api/proxy/murf',
  voiceId: 'en-US-natalie',
  format: 'mp3',
  style: 'Conversational',
  rate: 5,
  variation: 2,
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

## Voice controls

- **`style`** -- Many Murf voices ship multiple speaking styles (e.g. `Conversational`, `Promo`, `Narration`). Pick one that matches your agent's tone; omit it to use the voice's default.
- **`rate` / `pitch`** -- Integers from -50 to 50 on Murf's own scale; 0 is the voice's natural delivery.
- **`variation`** -- Adds natural variation in pauses, pitch, and speed (0–5). Higher values sound less monotone on long responses.
- **`locale`** -- Murf's multilingual voices can speak several languages natively; set `locale` to switch (e.g. `'es-ES'`).

## Tips

- MurfTTS is REST-based, not streaming. The full audio Blob is returned after the API processes the entire input. For real-time streaming, consider [DeepgramTTS](/guides/tts/deepgram-tts).
- MurfTTS requests base64-encoded audio (`encodeAsBase64: true`), so the audio arrives inline in the JSON response and no second download request is needed. If Murf returns an `audioFile` URL instead, the provider fetches it automatically.
- Use `proxyUrl` in production so your API key stays server-side -- set `murfApiKey` in your proxy config.

## Further reading

- [API reference](/api/classes/murftts)
- [Providers reference](/reference/providers)
- [Getting started](/guides/getting-started)
