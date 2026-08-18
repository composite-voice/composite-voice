---
title: SpekoSTT
description: Route live transcription sessions to the best STT provider with the Speko Relay voice-model router.
order: 6
---

Use SpekoSTT when you want one streaming integration that routes across many STT providers instead of committing to a single vendor. Speko is a voice-model router: its relay benchmarks STT providers in real time and routes each WebSocket session to the best one for your objective -- lowest latency, highest quality, lowest cost, or a balance -- with automatic failover across healthy providers in auto mode.

## Prerequisites

- A [Speko API key](https://platform.speko.ai) (`sk_speko_...`)
- In browsers: a CompositeVoice proxy server with `spekoApiKey` configured
- On Node servers with direct `apiKey` mode: the optional [`ws`](https://www.npmjs.com/package/ws) package (the same optional peer dependency the proxy uses)

**How you authenticate depends on where the pipeline runs.** The Speko Relay authenticates WebSocket upgrades with `Authorization` and `Idempotency-Key` headers:

- **Browsers** cannot set headers on a WebSocket handshake, so a proxy is required — the CompositeVoice proxy injects both server-side, generating a fresh idempotency key for every connection. (Alternatively, point `endpoint` at your own backend that terminates the Speko WebSocket.)
- **Node servers** (phone agents, meeting bots, headless pipelines) can pass `apiKey` and connect directly to `wss://relay.speko.dev` — the provider sends both headers itself, with a fresh `Idempotency-Key` per connection. No proxy hop needed.

```typescript
// Server-side (Node): direct connection, no proxy
const stt = new SpekoSTT({
  apiKey: process.env.SPEKO_API_KEY,
  routing: { mode: 'auto', objective: 'latency' },
});
```

## Basic setup

```typescript
import {
  CompositeVoice,
  MicrophoneInput,
  SpekoSTT,
  AnthropicLLM,
  NativeTTS,
} from 'composite-voice';

const voice = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new SpekoSTT({
      proxyUrl: '/api/proxy/speko',
      routing: { mode: 'auto', objective: 'latency' },
    }),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
    }),
    new NativeTTS(),
  ],
});

await voice.initialize();
await voice.startListening();
```

## Configuration options

| Option           | Type      | Default       | Description                                               |
| ---------------- | --------- | ------------- | --------------------------------------------------------- |
| `proxyUrl`       | `string`  | --            | Proxy server URL (**required in browsers**)               |
| `apiKey`         | `string`  | --            | Direct relay connection — **Node servers only**, needs the optional `ws` package |
| `endpoint`       | `string`  | --            | Custom backend/gateway URL that terminates the Speko WS   |
| `routing`        | `object`  | relay default | Routing object -- same shape as [SpekoTTS](/guides/tts/speko-tts#routing) |
| `audioFormat`    | `string`  | `'pcm_s16le'` | Input encoding: `pcm_s16le` or `opus`                     |
| `sampleRate`     | `number`  | `16000`       | Input sample rate in Hz (8000-192000)                     |
| `numChannels`    | `number`  | `1`           | Input channel count (1-8)                                 |
| `language`       | `string`  | `'en'`        | ISO 639-1 language code (the relay is currently English-only) |
| `interimResults` | `boolean` | `true`        | Emit interim results from `transcript.delta` frames       |

When a separate input provider is used (e.g. `MicrophoneInput`), `audioFormat`, `sampleRate`, and `numChannels` are auto-configured from the input's audio metadata unless you set them explicitly.

## How results map to the pipeline

- `transcript.delta` frames are accumulated and emitted as interim results (`isFinal: false`).
- Each `transcript.final` frame is emitted with `isFinal: true` and `utteranceComplete: true`, triggering the LLM stage. Finalized segments are available under `result.metadata.segments`.
- A terminal `error` frame (e.g. `budget_exhausted`, `lease_expired`) is surfaced as an error-shaped result, and an unexpected socket loss emits the standard connection-lost result so `FallbackSTT` chains can fail over.

## Tips

- Call `finalize()` to send `input.commit` and force the relay to finalize all pending audio immediately -- useful for manual turn-taking.
- Audio is streamed as binary WebSocket frames in the configured format; the relay caps frames at 1 MiB.
- Pin a provider with `routing: { mode: 'explicit', provider: 'deepgram', model: '...' }` when you need deterministic behavior; auto mode gets you failover.
- The same `spekoApiKey` proxy route also serves [SpekoTTS](/guides/tts/speko-tts) over HTTP.
- Running the pipeline server-side (e.g. with `TwilioMediaStream` or `ZoomRtmsInput`)? Skip the proxy and use `apiKey` directly — one less hop, and the key never leaves your server either way.

## Further reading

- [Speko Relay documentation](https://docs.speko.ai/relay)
- [API reference](/api/classes/spekostt)
- [Providers reference](/reference/providers)
- [Getting started](/guides/getting-started)
