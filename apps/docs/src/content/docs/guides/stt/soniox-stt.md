---
title: SonioxSTT
description: Add real-time multilingual speech recognition with endpoint detection to your voice pipeline using Soniox's WebSocket API.
order: 5
---

Use SonioxSTT when you need real-time transcription across 60+ languages with automatic language detection, built-in endpoint detection for turn-taking, and optional speaker diarization.

## Prerequisites

- A [Soniox](https://console.soniox.com) API key

No peer dependencies are required. SonioxSTT connects through a raw WebSocket managed by the SDK's built-in `WebSocketManager`.

For production, set up a [proxy server](https://github.com/lukeocodes/composite-voice/tree/main/examples/10-proxy-server) so your API key stays server-side, or generate [temporary API keys](https://soniox.com/docs) server-side and pass an async `apiKey` factory.

## Basic setup

```typescript
import { CompositeVoice, MicrophoneInput, SonioxSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new SonioxSTT({
      proxyUrl: '/api/proxy/soniox',
      languageHints: ['en'],
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
| `apiKey` | `string \| () => Promise<string>` | -- | Soniox API key, or an async factory returning a temporary key |
| `model` | `string` | `'stt-rt-v5'` | Soniox real-time model |
| `audioFormat` | `string` | `'pcm_s16le'` | Raw format (`pcm_s16le`, `mulaw`, `alaw`, ...) or `'auto'` |
| `sampleRate` | `number` | `16000` | Audio sample rate in Hz (raw formats only) |
| `numChannels` | `number` | `1` | Number of audio channels (raw formats only) |
| `languageHints` | `string[]` | -- | ISO 639-1 codes to bias recognition (e.g. `['en', 'es']`) |
| `enableEndpointDetection` | `boolean` | `true` | Finalize tokens when the speaker stops talking |
| `maxEndpointDelayMs` | `number` | `2000` | Max silence (500–3000 ms) before an endpoint is forced |
| `enableSpeakerDiarization` | `boolean` | `false` | Label tokens with speaker identifiers |
| `enableLanguageIdentification` | `boolean` | `false` | Detect the language of each token |
| `context` | `object` | -- | Domain context (`general`, `text`, `terms`) for specialized vocabulary |
| `interimResults` | `boolean` | `true` | Emit partial transcripts while the user speaks |
| `timeout` | `number` | `10000` | Connection timeout in milliseconds |

See the [API reference](/api/classes/sonioxstt) for the full list.

## Complete example

```typescript
import { CompositeVoice, MicrophoneInput, SonioxSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new SonioxSTT({
      proxyUrl: '/api/proxy/soniox',
      languageHints: ['en', 'es'],
      enableLanguageIdentification: true,
      context: { terms: ['CompositeVoice', 'Deepgram', 'Soniox'] },
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

Soniox streams individual tokens flagged as provisional (`is_final: false`) or confirmed (`is_final: true`). SonioxSTT accumulates confirmed tokens into the current utterance and emits interim results as provisional tokens arrive. When Soniox detects an endpoint (the speaker stops talking), it finalizes all pending tokens and sends a special `<end>` token -- the provider then emits the utterance with `utteranceComplete: true`, which is the flag CompositeVoice checks to trigger LLM processing.

Keep `enableEndpointDetection` at its default (`true`) for voice-agent pipelines. Without it, no `utteranceComplete` result is emitted until the stream ends -- though you can call `finalize()` to force pending tokens to finalize manually.

## Tips and gotchas

- **Always keep keys server-side in production.** Either pass `proxyUrl` (the proxy injects an `Authorization: Bearer` header upstream) or generate Soniox temporary API keys on your server and supply them via an async `apiKey` factory.
- **No peer dependencies.** SonioxSTT uses the SDK's built-in `WebSocketManager` -- no extra packages to install.
- **Multilingual by default.** Soniox auto-detects among 60+ languages. Use `languageHints` to bias recognition and `languageHintsStrict` to restrict it.
- **Audio is sent as raw binary frames.** No base64 encoding overhead -- the provider forwards `ArrayBuffer` chunks directly.
- **Context improves accuracy.** Pass product names, technical terms, or domain descriptions via `context` so Soniox prioritizes them during recognition.
- **Automatic reconnection.** The `WebSocketManager` reconnects with exponential backoff (up to 5 attempts, 1s initial delay, 30s max delay) if the connection drops.
- **No preflight signals.** SonioxSTT does not emit preflight/eager end-of-turn events. If you need the eager LLM pipeline, use [DeepgramFlux](/guides/stt/deepgram-flux) instead.
- **Graceful disconnect.** When you call `disconnect()`, the provider sends an empty end-of-stream frame so Soniox finalizes pending tokens before the socket closes.

## Related resources

- [Proxy server example](https://github.com/lukeocodes/composite-voice/tree/main/examples/10-proxy-server) -- secure your API key server-side
- [API reference: SonioxSTT](/api/classes/sonioxstt)
- [Providers reference](/reference/providers)
