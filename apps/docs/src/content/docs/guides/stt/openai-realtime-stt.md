---
title: OpenAIRealtimeSTT
description: Add real-time speech recognition with server-side VAD turn detection to your voice pipeline using OpenAI's Realtime API transcription intent.
order: 6
---

Use OpenAIRealtimeSTT when you need real-time transcription backed by OpenAI's transcription models (`gpt-4o-mini-transcribe`, `gpt-4o-transcribe`, `whisper-1`, `gpt-realtime-whisper`) with server or semantic VAD turn detection and optional input noise reduction.

## Prerequisites

- An [OpenAI](https://platform.openai.com) API key

No peer dependencies are required. OpenAIRealtimeSTT connects to `wss://api.openai.com/v1/realtime?intent=transcription` through a raw WebSocket managed by the SDK's built-in `WebSocketManager`.

For production, set up a [proxy server](https://github.com/composite-voice/composite-voice/tree/main/examples/10-proxy-server) so your API key stays server-side, or mint [ephemeral client secrets](https://platform.openai.com/docs/guides/realtime) server-side (`POST /v1/realtime/client_secrets`) and pass an async `apiKey` factory.

## Basic setup

```typescript
import { CompositeVoice, MicrophoneInput, OpenAIRealtimeSTT, AnthropicLLM, NativeTTS } from 'composite-voice';

const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput({ sampleRate: 24000 }),
    new OpenAIRealtimeSTT({
      proxyUrl: '/api/proxy/openai-realtime',
      model: 'gpt-4o-mini-transcribe',
      language: 'en',
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
| `apiKey` | `string \| () => Promise<string>` | -- | OpenAI API key, or an async factory returning an ephemeral client secret |
| `model` | `string` | `'gpt-4o-mini-transcribe'` | Transcription model (`gpt-4o-mini-transcribe`, `gpt-4o-transcribe`, `whisper-1`, `gpt-realtime-whisper`) |
| `inputAudioFormat` | `string` | `'audio/pcm'` | `audio/pcm` (24 kHz mono), `audio/pcmu`, or `audio/pcma` |
| `language` | `string` | -- | ISO 639-1 code (e.g. `'en'`) to improve accuracy and latency |
| `prompt` | `string` | -- | Text to guide style or domain-term spelling (not for `gpt-realtime-whisper`) |
| `turnDetection` | `object \| null` | `{ type: 'server_vad' }` | `server_vad`, `semantic_vad`, or `null` for manual commits |
| `noiseReduction` | `string` | -- | `'near_field'` (headphones) or `'far_field'` (laptop/room mics) |
| `transcriptionDelay` | `string` | -- | Latency/accuracy tradeoff for `gpt-realtime-whisper` (`minimal` ... `xhigh`) |
| `organizationId` | `string` | -- | OpenAI organization ID (direct mode auth subprotocol) |
| `projectId` | `string` | -- | OpenAI project ID (direct mode auth subprotocol) |
| `interimResults` | `boolean` | `true` | Emit partial transcripts while the user speaks |
| `timeout` | `number` | `10000` | Connection timeout in milliseconds |

See the [API reference](/api/classes/openairealtimestt) for the full list.

## Complete example

```typescript
import { CompositeVoice, MicrophoneInput, OpenAIRealtimeSTT, AnthropicLLM, NativeTTS } from 'composite-voice';

const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput({ sampleRate: 24000 }),
    new OpenAIRealtimeSTT({
      proxyUrl: '/api/proxy/openai-realtime',
      model: 'gpt-4o-transcribe',
      language: 'en',
      prompt: 'Keywords: CompositeVoice, Deepgram, Soniox',
      turnDetection: { type: 'semantic_vad', eagerness: 'medium' },
      noiseReduction: 'near_field',
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

The Realtime API streams incremental transcript text as `conversation.item.input_audio_transcription.delta` events -- OpenAIRealtimeSTT accumulates deltas per input item and emits them as interim results. When server VAD (the default) detects that the speaker has stopped, it commits the audio buffer, and the finished transcript arrives as a `conversation.item.input_audio_transcription.completed` event -- the provider then emits the utterance with `utteranceComplete: true`, which is the flag CompositeVoice checks to trigger LLM processing.

`semantic_vad` uses a turn-detection model to wait longer when the utterance sounds unfinished (e.g. trails off with "uhhm"), trading latency for fewer premature turn boundaries. Set `turnDetection: null` to disable VAD entirely and commit audio manually via `finalize()` -- required for `gpt-realtime-whisper`, which does not support server-side turn detection.

## Authentication

Browsers cannot set WebSocket headers, so direct mode authenticates with OpenAI's documented WebSocket subprotocols: `'realtime'` plus `'openai-insecure-api-key.<KEY>'` (and optionally `'openai-organization.<ORG>'` / `'openai-project.<PROJECT>'`). The key slot accepts either a standard API key or an ephemeral client secret. Never ship a standard API key to the browser -- either:

- **Proxy mode (recommended):** pass `proxyUrl` and let the proxy inject an `Authorization: Bearer` header upstream, or
- **Ephemeral client secrets:** mint one server-side via `POST /v1/realtime/client_secrets` and pass an async `apiKey` factory so a fresh secret is fetched on each connection.

## Tips and gotchas

- **Capture at 24 kHz.** Raw PCM input only supports a 24 kHz mono sample rate -- configure `MicrophoneInput({ sampleRate: 24000 })` to match.
- **Always keep keys server-side in production.** Either pass `proxyUrl` or mint ephemeral client secrets server-side and supply them via an async `apiKey` factory.
- **No peer dependencies.** OpenAIRealtimeSTT uses the SDK's built-in `WebSocketManager` -- no extra packages to install.
- **Audio is sent as base64 JSON events.** The Realtime API accepts audio as `input_audio_buffer.append` events, so chunks are base64-encoded (~33% wire overhead versus binary frames).
- **Prompts steer vocabulary.** Pass product names or domain terms via `prompt` so the model spells them correctly (not supported by `gpt-realtime-whisper`).
- **Noise reduction helps VAD.** `near_field` suits close-talking microphones; `far_field` suits laptop or conference-room microphones. It runs before both VAD and the model.
- **Token usage in metadata.** Final results include `metadata.usage` with the API's reported token counts when available.
- **Automatic reconnection.** The `WebSocketManager` reconnects with exponential backoff (up to 5 attempts, 1s initial delay, 30s max delay) and the provider re-sends the session configuration after each reconnect.
- **No preflight signals.** OpenAIRealtimeSTT does not emit preflight/eager end-of-turn events. If you need the eager LLM pipeline, use [DeepgramFlux](/guides/stt/deepgram-flux) instead.

## Related resources

- [Proxy server example](https://github.com/composite-voice/composite-voice/tree/main/examples/10-proxy-server) -- secure your API key server-side
- [API reference: OpenAIRealtimeSTT](/api/classes/openairealtimestt)
- [Providers reference](/reference/providers)
