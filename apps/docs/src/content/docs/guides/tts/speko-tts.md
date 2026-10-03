---
title: SpekoTTS
description: Route each synthesis request to the best TTS provider with the Speko Relay voice-model router.
order: 7
---

Use SpekoTTS when you want one integration that routes across many TTS providers instead of committing to a single vendor. Speko is a voice-model router: its relay benchmarks TTS providers in real time and routes each `POST /v1/tts/speech` request to the best one for your objective -- lowest latency, highest quality, lowest cost, or a balance -- with automatic failover across healthy providers. You can also pin an exact provider and model when you need deterministic output.

## Prerequisites

- A [Speko API key](https://platform.speko.ai) (`sk_speko_...`) or a CompositeVoice proxy server
- No additional dependencies required. SpekoTTS uses native `fetch` internally.

## Basic setup

```typescript
import {
  CompositeVoice,
  NativeSTT,
  AnthropicLLM,
  SpekoTTS,
  BrowserAudioOutput,
} from 'composite-voice';

const voice = new CompositeVoice({
  providers: [
    new NativeSTT(),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
    }),
    new SpekoTTS({
      proxyUrl: '/api/proxy/speko',
      routing: { mode: 'auto', objective: 'latency' },
    }),
    new BrowserAudioOutput(),
  ],
});

await voice.initialize();
await voice.startListening();
```

## Configuration options

| Option       | Type     | Default       | Description                                                       |
| ------------ | -------- | ------------- | ----------------------------------------------------------------- |
| `apiKey`     | `string` | --            | Speko API key (direct mode)                                       |
| `proxyUrl`   | `string` | --            | Proxy server URL (recommended for production)                     |
| `routing`    | `object` | relay default | Routing object -- see below                                       |
| `voice`      | `string` | route default | Provider voice ID (only meaningful with explicit routing)         |
| `encoding`   | `string` | `'pcm_s16le'` | Output encoding: `pcm_s16le` or `opus`                            |
| `sampleRate` | `number` | `24000`       | Output sample rate in Hz (8000-192000)                            |
| `channels`   | `number` | `1`           | Output channel count (1-8)                                        |
| `endpoint`   | `string` | --            | Custom relay/gateway URL                                          |
| `maxRetries` | `number` | `3`           | Retry count for failed requests (retries reuse the same key)      |

### Routing

The `routing` object is a tagged union selected by `mode`:

```typescript
// Auto mode -- Speko picks the provider for your objective
routing: { mode: 'auto', objective: 'latency' }
// objective: 'balanced' (default) | 'quality' | 'latency' | 'cost'
// Optionally restrict or exclude providers:
routing: { mode: 'auto', objective: 'cost', allow_providers: ['deepgram', 'cartesia'] }

// Explicit mode -- pin one provider and model, no failover
routing: { mode: 'explicit', provider: 'elevenlabs', model: 'eleven_turbo_v2' }
```

Omitting `routing` entirely uses the relay default, `{ mode: 'auto', objective: 'balanced' }`. In explicit mode both `provider` and `model` are required, and the auto-mode fields are rejected.

## Tips

- SpekoTTS is REST-based: the full audio Blob is returned per request. Speko also offers a streaming WebSocket TTS API (`/v1/tts/stream`); this provider intentionally uses the simpler REST endpoint.
- The relay returns containerless audio. With `encoding: 'pcm_s16le'` (the default) the provider wraps the bytes in a WAV header so the browser can decode and play them; `opus` is returned raw for custom audio pipelines.
- Every request needs a unique `Idempotency-Key` header -- the provider generates one per `synthesize()` call automatically.
- The relay's TTS endpoints are currently English-only, and billing is per character accepted for synthesis (reported back in the `Speko-Usage-Characters` response header, logged at debug level).
- Use `proxyUrl` in production so your API key stays server-side -- set `spekoApiKey` in your proxy config. The same proxy route also serves [SpekoSTT](/guides/stt/speko-stt).

## Further reading

- [Speko Relay documentation](https://docs.speko.ai/relay)
- [API reference](/api/classes/spekotts)
- [Providers reference](/reference/providers)
- [Getting started](/guides/getting-started)
