---
title: OpenAITTS
description: Convert text to speech using OpenAI's REST API with six voices and two quality tiers.
order: 3
---

Use OpenAITTS when you want high-quality speech synthesis via a simple REST call. Each `synthesize()` request returns the complete audio as a Blob -- no WebSocket management required. Choose between `tts-1` for speed or `tts-1-hd` for quality.

## Prerequisites

- An [OpenAI API key](https://platform.openai.com/api-keys) or a CompositeVoice proxy server
- No additional dependencies required. OpenAITTS uses native `fetch` internally.

## Basic setup

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, OpenAITTS, BrowserAudioOutput } from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  providers: [
    new NativeSTT(),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
    }),
    new OpenAITTS({
      proxyUrl: '/api/proxy/openai',
      model: 'tts-1',
      voice: 'nova',
      responseFormat: 'mp3',
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
| `apiKey` | `string` | -- | OpenAI API key (direct mode) |
| `proxyUrl` | `string` | -- | Proxy server URL (recommended for production) |
| `model` | `string` | `'tts-1'` | `'tts-1'` (fast, low latency) or `'tts-1-hd'` (higher quality) |
| `voice` | `string` | `'alloy'` | Voice identifier |
| `responseFormat` | `string` | `'mp3'` | Output format: `mp3`, `opus`, `aac`, `flac`, `wav` |
| `speed` | `number` | `1.0` | Speech speed multiplier (0.25 to 4.0) |
| `organizationId` | `string` | -- | OpenAI organization ID for billing |
| `endpoint` | `string` | -- | Custom API endpoint URL (e.g., Azure OpenAI) |
| `maxRetries` | `number` | `3` | Retry count for failed requests |

### Available voices

`alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`

Each voice has distinct characteristics. Preview them in the [OpenAI TTS guide](https://platform.openai.com/docs/guides/text-to-speech).

### Output formats

| Format | Use case |
|---|---|
| `mp3` | Good compression, wide browser support (default) |
| `opus` | Best for streaming and low latency |
| `aac` | Optimized for mobile devices |
| `flac` | Lossless compression |
| `wav` | Uncompressed, highest quality |

## Complete example

```typescript
import { CompositeVoice, MicrophoneInput, DeepgramSTT, AnthropicLLM, OpenAITTS, BrowserAudioOutput } from '@lukeocodes/composite-voice';

const tts = new OpenAITTS({
  proxyUrl: '/api/proxy/openai',
  model: 'tts-1-hd',
  voice: 'shimmer',
  responseFormat: 'opus',
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

- **`tts-1`** -- Optimized for real-time use. Lower latency, slightly lower audio quality. Best for voice pipelines where responsiveness matters.
- **`tts-1-hd`** -- Higher audio fidelity at the cost of increased latency. Best when audio quality is the priority.

## Tips

- OpenAI TTS has a 4096-character limit per request. CompositeVoice handles this automatically in the pipeline, but keep it in mind for standalone use.
- The `opus` format gives the best balance of quality and size for browser playback.
- OpenAITTS is REST-based, not streaming. The full audio Blob is returned after the API processes the entire input. For real-time streaming, consider [DeepgramTTS](/guides/tts/deepgram-tts).
- Use `endpoint` to point at Azure OpenAI or any API-compatible endpoint. For CompositeVoice proxy routing, use `proxyUrl` instead.

## Further reading

- [API reference](/api/classes/openaitts)
- [Providers reference](/reference/providers)
- [Getting started](/guides/getting-started)
