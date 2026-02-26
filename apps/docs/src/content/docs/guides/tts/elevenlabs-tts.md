---
title: ElevenLabsTTS
description: Stream high-quality voice synthesis with ElevenLabs voice cloning, stability controls, and multilingual models.
order: 4
---

Use ElevenLabsTTS for high-fidelity voice cloning and expressive synthesis. Text streams over a WebSocket connection using the ElevenLabs stream-input protocol, and audio chunks arrive incrementally for low-latency playback.

## Prerequisites

- An [ElevenLabs API key](https://elevenlabs.io/) or a CompositeVoice proxy server
- A voice ID from the [ElevenLabs Voice Library](https://elevenlabs.io/voice-library) or your cloned voices
- No additional peer dependencies required

## Basic setup

```typescript
import { CompositeVoice, DeepgramSTT, AnthropicLLM, ElevenLabsTTS } from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  stt: new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
  llm: new AnthropicLLM({
    proxyUrl: '/api/proxy/anthropic',
    model: 'claude-haiku-4-5',
  }),
  tts: new ElevenLabsTTS({
    proxyUrl: '/api/proxy/elevenlabs',
    voiceId: '21m00Tcm4TlvDq8ikWAM',
    modelId: 'eleven_turbo_v2_5',
    outputFormat: 'pcm_24000',
  }),
});

await voice.start();
```

## Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | -- | ElevenLabs API key (direct mode) |
| `proxyUrl` | `string` | -- | Proxy server URL (recommended for production) |
| `voiceId` | `string` | **(required)** | ElevenLabs voice ID |
| `modelId` | `string` | `'eleven_turbo_v2_5'` | Synthesis model |
| `stability` | `number` | `0.5` | Voice consistency (0 to 1) |
| `similarityBoost` | `number` | `0.75` | Closeness to the original voice sample (0 to 1) |
| `outputFormat` | `string` | `'pcm_16000'` | Audio format string (see below) |

### Models

| Model | Description |
|---|---|
| `eleven_turbo_v2_5` | Latest turbo model, optimized for low latency (default) |
| `eleven_turbo_v2` | Previous-generation turbo model |
| `eleven_multilingual_v2` | High-quality multilingual synthesis |
| `eleven_monolingual_v1` | English-only legacy model |

### Output formats

| Format | Encoding | Sample Rate |
|---|---|---|
| `pcm_16000` | 16-bit PCM | 16 kHz |
| `pcm_22050` | 16-bit PCM | 22.05 kHz |
| `pcm_24000` | 16-bit PCM | 24 kHz |
| `pcm_44100` | 16-bit PCM | 44.1 kHz |
| `mp3_44100_128` | MP3 128 kbps | 44.1 kHz |
| `ulaw_8000` | mu-law | 8 kHz (telephony) |

## Complete example

```typescript
import { CompositeVoice, DeepgramSTT, AnthropicLLM, ElevenLabsTTS } from '@lukeocodes/composite-voice';

const tts = new ElevenLabsTTS({
  proxyUrl: '/api/proxy/elevenlabs',
  voiceId: '21m00Tcm4TlvDq8ikWAM',
  modelId: 'eleven_multilingual_v2',
  stability: 0.7,
  similarityBoost: 0.9,
  outputFormat: 'pcm_24000',
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

## Voice cloning controls

ElevenLabs provides two parameters that control how closely the synthesized voice matches the original sample:

- **Stability** (0 to 1) -- Higher values produce more consistent, predictable output. Lower values add variation and expressiveness. Start at `0.5` and adjust to taste.
- **Similarity boost** (0 to 1) -- Higher values match the original voice more closely. Lower values allow more creative variation. Start at `0.75`.

```typescript
const tts = new ElevenLabsTTS({
  proxyUrl: '/api/proxy/elevenlabs',
  voiceId: 'your-cloned-voice-id',
  stability: 0.3,          // More expressive
  similarityBoost: 0.9,    // Stay close to the original voice
});
```

## Streaming protocol

ElevenLabsTTS uses the ElevenLabs stream-input protocol with BOS (Beginning of Stream) and EOS (End of Stream) messages. The SDK handles this automatically. For standalone use:

```typescript
const tts = new ElevenLabsTTS({
  proxyUrl: '/api/proxy/elevenlabs',
  voiceId: '21m00Tcm4TlvDq8ikWAM',
});

await tts.initialize();
await tts.connect();       // Opens WebSocket, sends BOS with voice settings

tts.onAudio((chunk) => {
  // chunk.data contains PCM or MP3 audio
});

tts.sendText('Hello, ');
tts.sendText('world!');
await tts.finalize();      // Sends EOS, flushes remaining audio
await tts.disconnect();
```

## Tips

- Find voice IDs in the [ElevenLabs Voice Library](https://elevenlabs.io/voice-library) or via the list voices API endpoint.
- Use `eleven_turbo_v2_5` for the lowest latency. Use `eleven_multilingual_v2` when you need non-English languages.
- For telephony applications, use `ulaw_8000` output format.
- Lower stability values work well for conversational, expressive speech. Higher values suit narration and formal content.

## Further reading

- [API reference](/api/classes/elevenlabstts)
- [Providers reference](/reference/providers)
- [Getting started](/guides/getting-started)
