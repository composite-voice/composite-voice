---
title: CartesiaTTS
description: Stream ultra-low-latency speech synthesis with Cartesia's Sonic models, emotion controls, and context-based streaming.
order: 5
---

Use CartesiaTTS for the lowest-latency streaming synthesis available. Cartesia's Sonic models deliver fast time-to-first-byte, and the context-based streaming protocol links multiple text chunks into a single coherent utterance with consistent prosody.

## Prerequisites

- A [Cartesia API key](https://play.cartesia.ai/) or a CompositeVoice proxy server
- A voice ID from the [Cartesia Voice Library](https://play.cartesia.ai/voices)
- No additional peer dependencies required

## Basic setup

```typescript
import { CompositeVoice, MicrophoneInput, DeepgramSTT, AnthropicLLM, CartesiaTTS, BrowserAudioOutput } from 'composite-voice';

const voice = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
    }),
    new CartesiaTTS({
      proxyUrl: '/api/proxy/cartesia',
      voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
      modelId: 'sonic-2',
      outputEncoding: 'pcm_s16le',
      outputSampleRate: 24000,
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
| `apiKey` | `string` | -- | Cartesia API key (direct mode) |
| `proxyUrl` | `string` | -- | Proxy server URL (recommended for production) |
| `voiceId` | `string` | **(required)** | Cartesia voice ID |
| `modelId` | `string` | `'sonic-2'` | Synthesis model |
| `language` | `string` | `'en'` | BCP 47 language code |
| `outputEncoding` | `string` | `'pcm_s16le'` | Audio encoding format |
| `outputSampleRate` | `number` | `16000` | Sample rate in Hz |
| `speed` | `number` | -- | Speech speed multiplier (>1 faster, <1 slower) |
| `emotion` | `string[]` | -- | Emotion tags for voice expression |
| `cartesiaVersion` | `string` | `'2024-06-10'` | API version string |

### Models

| Model | Description |
|---|---|
| `sonic-2` | Latest model, best quality and speed (default) |
| `sonic` | Previous-generation model |
| `sonic-multilingual` | Multi-language support |

### Output encodings

| Encoding | Description |
|---|---|
| `pcm_s16le` | 16-bit signed little-endian PCM (default) |
| `pcm_f32le` | 32-bit float little-endian PCM |
| `pcm_mulaw` | mu-law PCM (telephony) |
| `pcm_alaw` | A-law PCM (telephony) |

## Complete example

```typescript
import { CompositeVoice, MicrophoneInput, DeepgramSTT, AnthropicLLM, CartesiaTTS, BrowserAudioOutput } from 'composite-voice';

const tts = new CartesiaTTS({
  proxyUrl: '/api/proxy/cartesia',
  voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
  modelId: 'sonic-2',
  language: 'en',
  outputEncoding: 'pcm_s16le',
  outputSampleRate: 24000,
  emotion: ['positivity:high', 'curiosity'],
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
  logging: { enabled: true, level: 'debug' },
});

voice.on('tts.start', () => console.log('Speaking...'));
voice.on('tts.end', () => console.log('Done speaking'));

await voice.initialize();
await voice.startListening();
```

## Emotion tags

Cartesia supports emotion controls that shape the voice's expressiveness. Pass an array of tags to the `emotion` option.

```typescript
const tts = new CartesiaTTS({
  proxyUrl: '/api/proxy/cartesia',
  voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
  emotion: ['positivity:high', 'curiosity'],
});
```

Tags follow the format `emotion_name` or `emotion_name:intensity`. Examples: `'positivity:high'`, `'curiosity'`, `'anger:low'`, `'surprise'`. Combine multiple tags to create nuanced expressions.

## Context-based streaming

CartesiaTTS uses a `context_id` to link multiple text chunks into a single coherent utterance. The first chunk starts a new context, and subsequent chunks continue it with `continue: true`. This preserves prosody and intonation across chunk boundaries.

The SDK handles context management automatically. For standalone use:

```typescript
const tts = new CartesiaTTS({
  proxyUrl: '/api/proxy/cartesia',
  voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
});

await tts.initialize();
await tts.connect();       // Opens WebSocket, generates context ID

tts.onAudio((chunk) => {
  // chunk.data contains raw PCM audio
});

tts.sendText('Hello, ');   // First chunk: continue = false
tts.sendText('world!');    // Continuation: continue = true
await tts.finalize();      // Sends end-of-input, resets context
await tts.disconnect();
```

After `finalize()`, the context resets. The next `sendText()` call starts a fresh utterance with a new context ID.

## Tips

- Use `sonic-2` for the best combination of latency and quality. Use `sonic-multilingual` for non-English languages.
- The `speed` option accepts any positive number. Values above 1 speed up speech; values below 1 slow it down.
- Combine `emotion` tags for richer expression -- e.g., `['positivity:high', 'curiosity']` for an enthusiastic, inquisitive tone.
- For telephony, use `pcm_mulaw` or `pcm_alaw` encoding with an 8000 Hz sample rate.
- Cartesia emits word-level timestamp events during streaming. These arrive as metadata alongside audio chunks.

## Further reading

- [API reference](/api/classes/cartesiatts)
- [Providers reference](/reference/providers)
- [Getting started](/guides/getting-started)
