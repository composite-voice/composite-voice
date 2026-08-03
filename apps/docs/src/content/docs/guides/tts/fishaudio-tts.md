---
title: FishAudioTTS
description: Convert text to speech using Fish Audio's S1/S2 models via REST with msgpack-encoded requests.
order: 7
---

Use FishAudioTTS when you want expressive speech synthesis from Fish Audio's speech models (S1, S2 Pro, S2.1 Pro) via a simple REST call. Each `synthesize()` request returns the complete audio as a Blob -- no WebSocket management required. Voices from Fish Audio's catalog are selected with `referenceId`, and instant voice cloning is supported by sending raw reference audio inline.

:::caution[Requires @msgpack/msgpack]
FishAudioTTS is the only provider in CompositeVoice with a request-encoding peer dependency. Fish Audio's API takes MessagePack-encoded request bodies (`Content-Type: application/msgpack`), so you must install the optional peer dependency before using this provider:

```bash
pnpm add @msgpack/msgpack
```

The package is loaded lazily during `initialize()` -- if it is missing, initialization fails with install instructions. All other providers remain zero-dependency.
:::

## Prerequisites

- A [Fish Audio API key](https://fish.audio/) or a CompositeVoice proxy server
- The `@msgpack/msgpack` package (optional peer dependency, `>=3.0.0`) -- see the callout above

## Basic setup

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, FishAudioTTS, BrowserAudioOutput } from 'composite-voice';

const voice = new CompositeVoice({
  providers: [
    new NativeSTT(),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
    }),
    new FishAudioTTS({
      proxyUrl: '/api/proxy/fishaudio',
      referenceId: 'your-voice-id',
      model: 's2.1-pro',
      format: 'mp3',
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
| `apiKey` | `string` | -- | Fish Audio API key (direct mode) |
| `proxyUrl` | `string` | -- | Proxy server URL (recommended for production) |
| `referenceId` | `string` | model default voice | Voice model ID from the Fish Audio catalog (sent as `reference_id`) |
| `model` | `string` | `'s2.1-pro-free'` | Model generation HTTP header: `s1`, `s2-pro`, `s2.1-pro`, `s2.1-pro-free` |
| `format` | `string` | `'mp3'` | Output format: `mp3`, `wav`, `pcm`, `opus` |
| `mp3Bitrate` | `number` | `128` | MP3 bitrate in kbps: `64`, `128`, `192` |
| `chunkLength` | `number` | `300` | Characters per internal synthesis chunk (100--300) |
| `normalize` | `boolean` | `true` | Normalize numbers and dates in the text |
| `latency` | `string` | `'normal'` | `'normal'` (most stable) or `'balanced'` (~300ms time-to-first-audio) |
| `speed` | `number` | `1.0` | Speech speed multiplier (0.5--2.0), sent as `prosody.speed` |
| `volume` | `number` | `0` | Volume adjustment, sent as `prosody.volume` |
| `references` | `array` | -- | Inline `{ audio, text }` samples for instant voice cloning |
| `maxRetries` | `number` | `3` | Retry count for failed requests |

### Wire format

FishAudioTTS POSTs to `https://api.fish.audio/v1/tts` with a MessagePack-encoded body and two notable headers: `Authorization: Bearer <key>` and `model: <generation>` (Fish Audio selects the model generation via an HTTP header, not a body field). The response is raw audio bytes, buffered into a Blob.

Fish Audio also accepts JSON for text-only requests, but inline reference audio requires binary encoding -- so this provider always sends msgpack.

### Model generations

- **`s2.1-pro`** -- Recommended production model; improved quality, latency, and throughput over S2 Pro.
- **`s2.1-pro-free`** -- Free tier of S2.1 Pro for testing and development (the default, matching the API's own default).
- **`s2-pro`** -- Previous generation.
- **`s1`** -- Oldest generation still available.

### Output formats

| Format | Use case |
|---|---|
| `mp3` | Good compression, wide browser support (default) |
| `wav` | Uncompressed, highest quality |
| `pcm` | Raw samples for custom playback pipelines |
| `opus` | Efficient voice compression |

## Complete example

```typescript
import { CompositeVoice, MicrophoneInput, DeepgramSTT, AnthropicLLM, FishAudioTTS, BrowserAudioOutput } from 'composite-voice';

const tts = new FishAudioTTS({
  proxyUrl: '/api/proxy/fishaudio',
  referenceId: 'your-voice-id',
  model: 's2.1-pro',
  format: 'mp3',
  latency: 'balanced',
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

## Instant voice cloning

Pass raw reference audio (best with a clean 10--30s sample) plus its transcript -- no training step required. This is the feature that makes the msgpack wire format necessary: the audio bytes are sent as binary inside the request body.

```typescript
const sample = await fetch('/voices/me.wav').then((r) => r.arrayBuffer());

const tts = new FishAudioTTS({
  proxyUrl: '/api/proxy/fishaudio',
  references: [{ audio: sample, text: 'Transcript of the reference sample.' }],
});
```

## Tips

- FishAudioTTS is REST-based, not streaming. The full audio Blob is returned after the API processes the entire input. For real-time streaming, consider [DeepgramTTS](/guides/tts/deepgram-tts).
- Use `latency: 'balanced'` for interactive agents -- it lowers time-to-first-audio to roughly 300ms at a small stability cost.
- Use `proxyUrl` in production so your API key stays server-side -- set `fishAudioApiKey` in your proxy config. Msgpack bodies are opaque binary to the proxy and pass through untouched.
- Browse voices in the [Fish Audio playground](https://fish.audio/) and copy the voice model ID into `referenceId`.

## Further reading

- [API reference](/api/classes/fishaudiotts)
- [Providers reference](/reference/providers)
- [Getting started](/guides/getting-started)
