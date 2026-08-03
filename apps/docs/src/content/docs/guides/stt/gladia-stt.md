---
title: GladiaSTT
description: Add real-time speech recognition with server-side endpointing to your voice pipeline using Gladia's v2 live API and Solaria models.
order: 6
---

Use GladiaSTT when you need real-time transcription with configurable server-side endpointing for turn-taking, language pinning or per-utterance code switching, and word-level timestamps from Gladia's Solaria model family.

## Prerequisites

- A [Gladia](https://app.gladia.io) API key

No peer dependencies are required. GladiaSTT initiates the session with native `fetch` and streams audio through a raw WebSocket managed by the SDK's built-in `WebSocketManager`.

Gladia's live flow has two steps: a `POST /v2/live` session-init request (this is where the API key goes, via the `x-gladia-key` header) that returns a WebSocket URL with an embedded single-use token, then a direct WebSocket connection to that URL. Because only the init request needs credentials, the proxy forwards just that one POST — audio always streams straight to Gladia.

For production, set up a [proxy server](https://github.com/composite-voice/composite-voice/tree/main/examples/10-proxy-server) so your API key stays server-side.

## Basic setup

```typescript
import { CompositeVoice, MicrophoneInput, GladiaSTT, AnthropicLLM, NativeTTS } from 'composite-voice';

const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new GladiaSTT({
      proxyUrl: '/api/proxy/gladia',
      languages: ['en'],
    }),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
      systemPrompt: 'You are a helpful voice assistant. Keep responses brief.',
    }),
    new NativeTTS(),
  ],
});

await agent.initialize();
await agent.startListening();
```

## Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `proxyUrl` | `string` | -- | URL of your CompositeVoice proxy endpoint (recommended) |
| `apiKey` | `string \| () => Promise<string>` | -- | Gladia API key, or an async factory returning a fresh key |
| `model` | `string` | `'solaria-1'` | Gladia live transcription model |
| `encoding` | `string` | `'wav/pcm'` | Audio encoding (`wav/pcm`, `wav/alaw`, `wav/ulaw`) |
| `sampleRate` | `number` | `16000` | Sample rate in Hz (8000, 16000, 32000, 44100, 48000) |
| `bitDepth` | `number` | `16` | Bit depth (8, 16, 24, 32) |
| `channels` | `number` | `1` | Number of audio channels (1-8) |
| `region` | `'us-west' \| 'eu-west'` | -- | Processing region for the session |
| `endpointing` | `number` | `0.05` | Silence in seconds (0.01-10) before an utterance is finalized |
| `maximumDurationWithoutEndpointing` | `number` | `5` | Max utterance seconds (5-60) before a forced endpoint |
| `languages` | `string[]` | -- | ISO 639-1 codes; one pins the language, several restrict detection |
| `codeSwitching` | `boolean` | `false` | Re-detect the language on every utterance |
| `preProcessing` | `object` | -- | Gladia `pre_processing` options (e.g. `audio_enhancer`) |
| `realtimeProcessing` | `object` | -- | Gladia `realtime_processing` options (custom vocabulary, translation, ...) |
| `customMetadata` | `object` | -- | Arbitrary metadata attached to the session |
| `interimResults` | `boolean` | `true` | Emit partial transcripts while the user speaks |
| `timeout` | `number` | `10000` | Session-init and connection timeout in milliseconds |

See the [API reference](/api/classes/gladiastt) for the full list.

## Complete example

```typescript
import { CompositeVoice, MicrophoneInput, GladiaSTT, AnthropicLLM, NativeTTS } from 'composite-voice';

const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new GladiaSTT({
      proxyUrl: '/api/proxy/gladia',
      languages: ['en', 'es'],
      codeSwitching: true,
      endpointing: 0.3,
    }),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
      maxTokens: 256,
      systemPrompt: 'You are a helpful voice assistant. Keep responses under two sentences.',
    }),
    new NativeTTS({ voiceLang: 'en-US' }),
  ],
  conversationHistory: { enabled: true, maxTurns: 10 },
  logging: { enabled: true, level: 'info' },
});

agent.on('transcription.final', (event) => {
  console.log('User said:', event.text);
});

agent.on('response.text', (event) => {
  console.log('Assistant:', event.text);
});

await agent.initialize();
await agent.startListening();
```

## Utterance completion

Gladia segments speech into utterances server-side using its `endpointing` setting: after the configured silence, the current utterance is closed and a `transcript` message with `is_final: true` arrives. While the user speaks, partial transcripts stream in with `is_final: false` and are emitted as interim results. Because every final transcript closes an utterance, GladiaSTT emits each one with `utteranceComplete: true` -- the flag CompositeVoice checks to trigger LLM processing.

Gladia's default endpointing (0.05 s) is very aggressive and can split sentences at every short pause. For conversational agents, set `endpointing` to around `0.3`-`0.8` seconds for more natural turns. `maximumDurationWithoutEndpointing` (default 5 s) caps how long a single utterance can run before Gladia forces an endpoint.

## Tips and gotchas

- **Always keep keys server-side in production.** Pass `proxyUrl` and the proxy injects the `x-gladia-key` header into the session-init request. Only that one POST goes through the proxy -- the audio WebSocket connects directly to the tokenized URL Gladia returns, so proxy bandwidth stays negligible.
- **No peer dependencies.** GladiaSTT uses native `fetch` and the SDK's built-in `WebSocketManager` -- no extra packages to install.
- **Audio is sent as raw binary frames.** No base64 encoding overhead -- the provider forwards `ArrayBuffer` chunks directly. The bytes must match the session's `encoding`, `sampleRate`, `bitDepth`, and `channels`.
- **Tune `endpointing` for your use case.** Low values give snappy turn-taking but may split sentences; higher values wait longer before finalizing.
- **Word detail in metadata.** Final results include `metadata.words` (word-level timing and confidence) plus the utterance `language`, `channel`, `start`, and `end`.
- **Pin the language when you can.** With minimal audio context, live language detection is sensitive -- set `languages: ['en']` to pin it, or enable `codeSwitching` for multilingual conversations.
- **Automatic reconnection resumes the session.** The WebSocket URL embeds the session token, so the `WebSocketManager`'s reconnection (up to 5 attempts with exponential backoff) reattaches to the same Gladia session.
- **Sessions are capped at 3 hours** by Gladia. Reconnect with a fresh `connect()` for longer workloads.
- **Graceful disconnect.** `disconnect()` sends a `stop_recording` message so Gladia transcribes any buffered audio before the socket closes. You can also call `stopRecording()` manually. The session id is available via `getSessionId()` for fetching full results from `GET /v2/live/{id}` afterwards.
- **No preflight signals.** GladiaSTT does not emit preflight/eager end-of-turn events. If you need the eager LLM pipeline, use [DeepgramFlux](/guides/stt/deepgram-flux) instead.

## Related resources

- [Proxy server example](https://github.com/composite-voice/composite-voice/tree/main/examples/10-proxy-server) -- secure your API key server-side
- [API reference: GladiaSTT](/api/classes/gladiastt)
- [Providers reference](/reference/providers)
