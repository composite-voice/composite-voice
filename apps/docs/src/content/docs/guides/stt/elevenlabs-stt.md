---
title: ElevenLabsSTT
description: Add real-time speech recognition with ElevenLabs Scribe V2 to your voice pipeline via WebSocket streaming.
order: 4
---

Use ElevenLabsSTT when you need low-latency real-time transcription (~150ms) with 90+ language support, voice activity detection, and optional word-level timestamps via ElevenLabs' Scribe V2 Realtime API.

## Prerequisites

- An [ElevenLabs](https://elevenlabs.io/) API key
- No additional peer dependencies required

ElevenLabsSTT connects through a raw WebSocket managed by the SDK's built-in `WebSocketManager`.

For production, set up a [proxy server](https://github.com/lukeocodes/composite-voice/tree/main/examples/10-proxy-server) so your API key stays server-side. The proxy uses the same `elevenlabsApiKey` config used for ElevenLabsTTS.

## Basic setup

```typescript
import { CompositeVoice, ElevenLabsSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new ElevenLabsSTT({
      proxyUrl: '/api/proxy/elevenlabs',
      model: 'scribe_v2_realtime',
      audioFormat: 'pcm_16000',
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
| `apiKey` | `string` | -- | ElevenLabs API key (development only) |
| `token` | `string` | -- | Single-use token for short-lived browser sessions |
| `model` | `string` | `'scribe_v2_realtime'` | Transcription model |
| `audioFormat` | `string` | `'pcm_16000'` | Audio encoding format (see table below) |
| `language` | `string` | -- | Language code (BCP 47 or ISO 639-3). Omit for auto-detection |
| `commitStrategy` | `'vad' \| 'manual'` | `'vad'` | How utterance boundaries are determined |
| `vadSilenceThresholdSecs` | `number` | -- | Seconds of silence before VAD commits |
| `vadThreshold` | `number` | -- | VAD sensitivity (0.0 to 1.0) |
| `minSpeechDurationMs` | `number` | -- | Minimum speech duration before detection |
| `minSilenceDurationMs` | `number` | -- | Minimum silence duration before segment ends |
| `includeTimestamps` | `boolean` | `false` | Include word-level timestamps in results |
| `includeLanguageDetection` | `boolean` | `false` | Include detected language in results |
| `previousText` | `string` | -- | Context text for the model (first chunk only, max ~50 chars) |
| `enableLogging` | `boolean` | -- | When `false`, enables zero-retention mode |
| `interimResults` | `boolean` | `true` | Emit partial transcripts while the user speaks |
| `timeout` | `number` | `10000` | Connection timeout in milliseconds |

See the [API reference](/api/classes/elevenlabsstt) for the full list.

### Audio formats

| Format | Encoding | Sample Rate |
|---|---|---|
| `pcm_16000` | 16-bit PCM | 16 kHz (recommended) |
| `pcm_22050` | 16-bit PCM | 22.05 kHz |
| `pcm_24000` | 16-bit PCM | 24 kHz |
| `pcm_44100` | 16-bit PCM | 44.1 kHz |
| `mulaw_8000` | mu-law | 8 kHz (telephony) |

### Commit strategies

ElevenLabsSTT supports two strategies for determining when a speech segment is finalized:

- **VAD (default)** -- The server automatically detects speech pauses and commits. Best for microphone input. Configure sensitivity with `vadSilenceThresholdSecs` and `vadThreshold`.
- **Manual** -- Your application controls when to commit by calling `sendCommit()`. Useful when you need precise control over segment boundaries.

### Authentication methods

Three methods are supported, with this priority order: `proxyUrl` > `token` > `apiKey`.

- **Proxy (recommended)** -- API key stays server-side. Uses the same `elevenlabsApiKey` config as ElevenLabsTTS.
- **Single-use token** -- Generate a short-lived token server-side via the ElevenLabs API, pass it to the browser. Expires after 15 minutes.
- **API key** -- Direct connection for development only. Never expose in production.

### Language codes

ElevenLabs Scribe V2 uses ISO 639-3 (3-letter) codes internally. ElevenLabsSTT accepts all common formats and converts automatically:

- BCP 47: `en-US`, `fr-FR`, `pt-BR` -- extracted and mapped
- ISO 639-1: `en`, `fr`, `de` -- mapped to ISO 639-3
- ISO 639-3: `eng`, `fra`, `deu` -- passed through directly

Omit the `language` option entirely to enable auto-detection (90+ languages).

## Complete example

```typescript
import { CompositeVoice, ElevenLabsSTT, AnthropicLLM, ElevenLabsTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new ElevenLabsSTT({
      proxyUrl: '/api/proxy/elevenlabs',
      model: 'scribe_v2_realtime',
      audioFormat: 'pcm_16000',
      language: 'en',
      commitStrategy: 'vad',
      includeTimestamps: true,
    }),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
      maxTokens: 256,
      systemPrompt: 'You are a helpful voice assistant. Keep responses under two sentences.',
    }),
    new ElevenLabsTTS({
      proxyUrl: '/api/proxy/elevenlabs',
      voiceId: '21m00Tcm4TlvDq8ikWAM',
      modelId: 'eleven_turbo_v2_5',
    }),
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

ElevenLabsSTT sets `utteranceComplete: true` when the server sends a committed or final transcript (depending on the commit strategy). This is the flag CompositeVoice checks to trigger LLM processing -- interim transcripts do not advance the pipeline.

## Tips and gotchas

- **Always use a proxy in production.** Pass `proxyUrl` instead of `apiKey` so your ElevenLabs key never reaches the browser. The SDK converts `http(s)` to `ws(s)` automatically. The proxy shares the same `elevenlabsApiKey` with [ElevenLabsTTS](/guides/tts/elevenlabs-tts).
- **No peer dependencies.** Like [AssemblyAISTT](/guides/stt/assemblyai-stt), ElevenLabsSTT uses the SDK's built-in `WebSocketManager` -- no extra packages to install.
- **Audio is base64-encoded.** The provider converts raw `ArrayBuffer` audio into base64 JSON messages (`{ audio_base_64: "..." }`) before sending. This is handled automatically.
- **VAD mode is recommended for microphone input.** It automatically detects speech pauses and commits segments. Use manual mode only when you need explicit control.
- **`previousText` is sent once.** The context string is included only on the first audio chunk to help the model. It is not repeated on subsequent chunks.
- **No preflight signals.** ElevenLabsSTT does not emit preflight/eager end-of-turn events. If you need the eager LLM pipeline, use [DeepgramFlux](/guides/stt/deepgram-flux) instead.
- **Session handshake.** The `connect()` call waits for a `session_started` message from the server before resolving, ensuring the session is fully initialized before audio streaming begins.
- **Auto-commit fallback.** Even in manual mode, the server auto-commits after 90 seconds of buffered audio.

## Related resources

- [ElevenLabs STT example](https://github.com/lukeocodes/composite-voice/tree/main/examples/81-elevenlabs-stt) -- standalone STT with proxy
- [ElevenLabs pipeline example](https://github.com/lukeocodes/composite-voice/tree/main/examples/80-elevenlabs-pipeline) -- full ElevenLabs STT + TTS pipeline
- [Proxy server example](https://github.com/lukeocodes/composite-voice/tree/main/examples/10-proxy-server) -- secure your API key server-side
- [ElevenLabsTTS guide](/guides/tts/elevenlabs-tts) -- ElevenLabs text-to-speech provider
- [API reference: ElevenLabsSTT](/api/classes/elevenlabsstt)
- [Providers reference](/reference/providers)
