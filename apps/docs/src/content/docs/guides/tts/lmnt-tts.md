---
title: LMNTTTS
description: Convert text to speech using LMNT's Blizzard model via a simple REST API.
order: 7
---

Use LMNTTTS when you want low-latency, high-quality speech synthesis from LMNT's Blizzard model via a simple REST call. Each `synthesize()` request returns the complete audio as a Blob -- no WebSocket management required. Voices from LMNT's catalog and instant voice cloning are both supported through the `voice` option.

## Prerequisites

- An [LMNT API key](https://app.lmnt.com/account) or a CompositeVoice proxy server
- No additional dependencies required. LMNTTTS uses native `fetch` internally.

## Basic setup

```typescript
import {
  CompositeVoice,
  NativeSTT,
  AnthropicLLM,
  LMNTTTS,
  BrowserAudioOutput,
} from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  providers: [
    new NativeSTT(),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
    }),
    new LMNTTTS({
      proxyUrl: '/api/proxy/lmnt',
      voice: 'leah',
      model: 'blizzard',
      format: 'mp3',
    }),
    new BrowserAudioOutput(),
  ],
});

await voice.initialize();
await voice.startListening();
```

## Configuration options

| Option        | Type     | Default      | Description                                                                  |
| ------------- | -------- | ------------ | ---------------------------------------------------------------------------- |
| `apiKey`      | `string` | --           | LMNT API key (direct mode)                                                   |
| `proxyUrl`    | `string` | --           | Proxy server URL (recommended for production)                                |
| `voice`       | `string` | **required** | Voice ID from `GET /v1/ai/voice/list` or a cloned voice                      |
| `model`       | `string` | `'blizzard'` | The speech model to use                                                      |
| `format`      | `string` | `'mp3'`      | Output format: `mp3`, `wav`, `aac`, `ulaw`, `webm`, `pcm_s16le`, `pcm_f32le` |
| `sampleRate`  | `number` | API default  | Output sample rate: `8000`, `16000`, or `24000` Hz                           |
| `language`    | `string` | auto-detect  | Two-letter ISO 639-1 code (e.g. `en`), or `auto`                             |
| `temperature` | `number` | API default  | Expressiveness -- lower is more neutral, higher is more dynamic              |
| `topP`        | `number` | API default  | Stability -- lower is more consistent, higher is more flexible               |
| `endpoint`    | `string` | --           | Custom API endpoint URL                                                      |
| `maxRetries`  | `number` | `3`          | Retry count for failed requests                                              |

### Available voices

List voices with LMNT's [`GET /v1/ai/voice/list`](https://docs.lmnt.com/api-reference/voice/list-voices) endpoint, or create your own with [instant voice cloning](https://docs.lmnt.com/guides/voice-cloning). The catalog voice `leah` is a good starting point.

### Output formats

| Format                    | Use case                                                     |
| ------------------------- | ------------------------------------------------------------ |
| `mp3`                     | 96kbps MP3; good compression, wide browser support (default) |
| `wav`                     | 16-bit PCM in a WAV container; uncompressed, highest quality |
| `aac`                     | Optimized for mobile devices                                 |
| `ulaw`                    | 8-bit G711 µ-law with WAV header; telephony                  |
| `webm`                    | WebM container with Opus codec                               |
| `pcm_s16le` / `pcm_f32le` | Raw PCM without a container; for custom audio pipelines      |

## Complete example

```typescript
import {
  CompositeVoice,
  MicrophoneInput,
  DeepgramSTT,
  AnthropicLLM,
  LMNTTTS,
  BrowserAudioOutput,
} from '@lukeocodes/composite-voice';

const tts = new LMNTTTS({
  proxyUrl: '/api/proxy/lmnt',
  voice: 'leah',
  model: 'blizzard',
  format: 'mp3',
  language: 'en',
  temperature: 0.7,
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

## Expressiveness controls

- **`temperature`** -- influences how expressive and emotionally varied the speech becomes. Lower values (like `0.3`) create more neutral, consistent speaking styles; higher values (like `1.0`) allow more dynamic emotional range.
- **`topP`** -- controls the stability of the generated speech. A lower value (like `0.3`) produces more consistent, reliable speech; a higher value (like `0.9`) gives more flexibility but might occasionally produce unusual intonations.
- **`language`** -- Blizzard supports 31 languages. Specifying the language is recommended for faster generation; omit it (or use `auto`) for automatic detection.

## Tips

- LMNTTTS is REST-based, not streaming. The full audio Blob is returned after the API processes the entire input (max 5000 characters per request). For real-time streaming, consider [DeepgramTTS](/guides/tts/deepgram-tts).
- LMNT also offers a full-duplex streaming WebSocket API (speech sessions); this provider intentionally uses the simpler REST endpoint, and streaming support may be added later.
- Use `proxyUrl` in production so your API key stays server-side -- set `lmntApiKey` in your proxy config.

## Further reading

- [API reference](/api/classes/lmnttts)
- [Providers reference](/reference/providers)
- [Getting started](/guides/getting-started)
