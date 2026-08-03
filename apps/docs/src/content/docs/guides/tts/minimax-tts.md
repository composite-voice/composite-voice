---
title: MiniMaxTTS
description: Convert text to speech using MiniMax's Speech models via a simple REST API.
order: 7
---

Use MiniMaxTTS when you want expressive speech synthesis from MiniMax's Speech models via a simple REST call. Each `synthesize()` request returns the complete audio as a Blob -- no WebSocket management required. MiniMax offers 300+ system voices across 30+ languages plus cloned voices, all selected through the `voiceId` option, with emotion, speed, volume, and pitch controls.

## Prerequisites

- A [MiniMax API key](https://www.minimax.io/platform/) or a CompositeVoice proxy server
- No additional dependencies required. MiniMaxTTS uses native `fetch` internally.

## Basic setup

```typescript
import {
  CompositeVoice,
  NativeSTT,
  AnthropicLLM,
  MiniMaxTTS,
  BrowserAudioOutput,
} from 'composite-voice';

const voice = new CompositeVoice({
  providers: [
    new NativeSTT(),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
    }),
    new MiniMaxTTS({
      proxyUrl: '/api/proxy/minimax',
      voiceId: 'English_expressive_narrator',
      model: 'speech-02-hd',
      audioFormat: 'mp3',
    }),
    new BrowserAudioOutput(),
  ],
});

await voice.initialize();
await voice.startListening();
```

## Configuration options

| Option              | Type     | Default          | Description                                                                                                                                    |
| ------------------- | -------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiKey`            | `string` | --               | MiniMax API key (direct mode)                                                                                                                  |
| `proxyUrl`          | `string` | --               | Proxy server URL (recommended for production)                                                                                                  |
| `voiceId`           | `string` | **required**     | MiniMax system voice ID or a cloned voice                                                                                                      |
| `model`             | `string` | `'speech-02-hd'` | `speech-2.8-hd`, `speech-2.8-turbo`, `speech-2.6-hd`, `speech-2.6-turbo`, `speech-02-hd`, `speech-02-turbo`, `speech-01-hd`, `speech-01-turbo` |
| `groupId`           | `string` | --               | MiniMax Group ID, sent as the `GroupId` query parameter (only needed for older group-scoped keys)                                              |
| `audioFormat`       | `string` | `'mp3'`          | Output format: `mp3`, `wav`, `flac`, `pcm`                                                                                                     |
| `sampleRate`        | `number` | `32000`          | Output sample rate: `8000`, `16000`, `22050`, `24000`, `32000`, `44100`                                                                        |
| `bitrate`           | `number` | `128000`         | Output bitrate (mp3 only): `32000`, `64000`, `128000`, `256000`                                                                                |
| `channel`           | `1 \| 2` | `1`              | Mono or stereo output                                                                                                                          |
| `speed`             | `number` | `1`              | Speech speed, range `[0.5, 2]`                                                                                                                 |
| `volume`            | `number` | `1`              | Speech volume, range `(0, 10]`                                                                                                                 |
| `pitch`             | `number` | `0`              | Pitch adjustment in semitones, range `[-12, 12]`                                                                                               |
| `emotion`           | `string` | neutral          | `happy`, `sad`, `angry`, `fearful`, `disgusted`, `surprised`, `calm`, `fluent`, `whisper`                                                      |
| `languageBoost`     | `string` | --               | Pronunciation hint, e.g. `'English'`, `'Chinese'`, or `'auto'`                                                                                 |
| `pronunciationDict` | `object` | --               | Custom pronunciations, e.g. `{ tone: ['omg/oh my god'] }`                                                                                      |
| `endpoint`          | `string` | --               | Custom API endpoint URL (e.g. a regional host)                                                                                                 |
| `maxRetries`        | `number` | `3`              | Retry count for failed requests                                                                                                                |

### Available voices

MiniMax ships 300+ system voices such as `English_expressive_narrator` and `English_Graceful_Lady`. List them with the platform's `POST /v1/get_voice` endpoint, or clone your own via MiniMax's voice cloning API and pass the resulting voice ID.

### Output formats

| Format | Use case                                         |
| ------ | ------------------------------------------------ |
| `mp3`  | Good compression, wide browser support (default) |
| `wav`  | Uncompressed with WAV container                  |
| `flac` | Lossless compression                             |
| `pcm`  | Raw samples for custom playback pipelines        |

## Complete example

```typescript
import {
  CompositeVoice,
  MicrophoneInput,
  DeepgramSTT,
  AnthropicLLM,
  MiniMaxTTS,
  BrowserAudioOutput,
} from 'composite-voice';

const tts = new MiniMaxTTS({
  proxyUrl: '/api/proxy/minimax',
  voiceId: 'English_expressive_narrator',
  model: 'speech-02-hd',
  audioFormat: 'mp3',
  emotion: 'calm',
  speed: 1.1,
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

- **`speech-02-hd` / `speech-02-turbo`** -- Widely deployed Speech-02 generation. `hd` prioritizes audio quality (default); `turbo` prioritizes latency.
- **`speech-2.6-hd` / `speech-2.6-turbo`** -- Speech 2.6 generation with broader language coverage.
- **`speech-2.8-hd` / `speech-2.8-turbo`** -- Latest generation with the best naturalness.
- **`speech-01-hd` / `speech-01-turbo`** -- Previous generation, kept for compatibility.

## Group ID

Older MiniMax API keys are scoped to a group and require a `GroupId` query parameter on every request; newer keys embed the group and work without it. If your requests fail with an authentication error, set the `groupId` option to the Group ID shown in your MiniMax console -- MiniMaxTTS appends it as `?GroupId=<id>`. The query parameter passes through the CompositeVoice proxy unchanged, so `groupId` works in proxy mode too.

## Tips

- The default base URL is the global endpoint (`https://api.minimax.io`). Use the `endpoint` option to target a regional host such as `https://api-uw.minimax.io` (western US).
- MiniMaxTTS is REST-based, not streaming. The full audio Blob is returned after the API processes the entire input. For real-time streaming, consider [DeepgramTTS](/guides/tts/deepgram-tts).
- The MiniMax API returns audio hex-encoded; MiniMaxTTS decodes it into a playable Blob for you.
- Use `proxyUrl` in production so your API key stays server-side -- set `minimaxApiKey` in your proxy config.

## Further reading

- [API reference](/api/classes/minimaxtts)
- [Providers reference](/reference/providers)
- [Getting started](/guides/getting-started)
