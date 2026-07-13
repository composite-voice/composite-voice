---
title: RevAISTT
description: Add real-time speech recognition with punctuated, confidence-scored transcripts to your voice pipeline using Rev AI's streaming WebSocket API.
order: 6
---

Use RevAISTT when you need real-time transcription with punctuated, confidence-scored final transcripts, profanity filtering, disfluency removal, and custom vocabularies across nine languages.

## Prerequisites

- A [Rev AI](https://www.rev.ai/) access token

No peer dependencies are required. RevAISTT connects through a raw WebSocket managed by the SDK's built-in `WebSocketManager`.

For production, set up a [proxy server](https://github.com/lukeocodes/composite-voice/tree/main/examples/10-proxy-server) so your access token stays server-side.

## Basic setup

```typescript
import { CompositeVoice, MicrophoneInput, RevAISTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new RevAISTT({
      proxyUrl: '/api/proxy/revai',
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
| `apiKey` | `string \| () => Promise<string>` | -- | Rev AI access token, or an async factory returning one |
| `contentType` | `string` | built from audio options | Full `content_type` override (e.g. `'audio/x-flac'`) |
| `layout` | `string` | `'interleaved'` | Channel layout for raw audio |
| `sampleRate` | `number` | `16000` | Audio sample rate in Hz (8000-48000, raw audio only) |
| `audioFormat` | `string` | `'S16LE'` | Raw sample format (case-sensitive GStreamer string) |
| `numChannels` | `number` | `1` | Number of audio channels (1-10, raw audio only) |
| `language` | `string` | `'en'` | Language code (en, fr, de, it, ja, ko, cmn, pt, es) |
| `filterProfanity` | `boolean` | `false` | Replace profanities with asterisks (English only) |
| `removeDisfluencies` | `boolean` | `false` | Remove "ums" and "uhs" (English only) |
| `customVocabularyId` | `string` | -- | Custom vocabulary for domain-specific terms |
| `detailedPartials` | `boolean` | `false` | Timestamps and confidence on partial hypotheses |
| `maxSegmentDurationSeconds` | `number` | -- | Force a final hypothesis every 5-30 seconds |
| `transcriber` | `string` | Rev AI default | Transcription model (e.g. `'machine_v2'`) |
| `enableSpeakerSwitch` | `boolean` | `false` | Label speaker changes (requires `machine_v2`) |
| `skipPostprocessing` | `boolean` | `false` | Skip capitalization/punctuation for lower latency |
| `priority` | `string` | `'speed'` | `'speed'` or `'accuracy'` (English/Spanish, `machine_v2`) |
| `interimResults` | `boolean` | `true` | Emit partial transcripts while the user speaks |
| `timeout` | `number` | `10000` | Connection timeout in milliseconds |

See the [API reference](/api/classes/revaistt) for the full list.

## Complete example

```typescript
import { CompositeVoice, MicrophoneInput, RevAISTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new RevAISTT({
      proxyUrl: '/api/proxy/revai',
      language: 'en',
      filterProfanity: true,
      maxSegmentDurationSeconds: 10,
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

Rev AI streams two kinds of hypotheses. `partial` hypotheses are the engine's best guess of the words spoken so far -- RevAISTT joins them into interim results as you speak. When the engine is confident in a segment (typically after a pause, or when `maxSegmentDurationSeconds` elapses), it sends a `final` hypothesis with punctuation, capitalization, per-word timestamps, and confidence scores. The provider emits each final hypothesis with `utteranceComplete: true`, which is the flag CompositeVoice checks to trigger LLM processing.

Tune `maxSegmentDurationSeconds` (5-30) to force finals sooner during long monologues, at a small accuracy cost.

## Tips and gotchas

- **Always keep keys server-side in production.** Rev AI authenticates the WebSocket via an `access_token` query parameter (upgrade headers are not supported), so a browser-visible `apiKey` ends up on the connection URL. Pass `proxyUrl` instead -- the proxy appends the token server-side.
- **No peer dependencies.** RevAISTT uses the SDK's built-in `WebSocketManager` -- no extra packages to install.
- **Declare your audio format up front.** The `content_type` is fixed for the session and must match the streamed audio exactly. The default (`audio/x-raw;layout=interleaved;rate=16000;format=S16LE;channels=1`) matches `MicrophoneInput`'s 16 kHz mono PCM output.
- **Wait-for-connected is handled for you.** Rev AI requires clients to wait for its `connected` message before sending audio; `connect()` does not resolve until it arrives.
- **English-only options.** `filterProfanity`, `removeDisfluencies`, and `customVocabularyId` cannot be combined with a non-English `language`.
- **Word detail in metadata.** Final results include `metadata.elements` — the hypothesis elements with per-word timing (`ts`/`end_ts`), confidence, and `speaker_id` labels when `enableSpeakerSwitch` is on.
- **Errors arrive as close codes.** Rev AI closes the socket with 4001 (bad token), 4002 (bad `content_type`), or 4013 (no worker available). The provider maps these to descriptive errors and emits an error result on an established session.
- **Graceful disconnect.** When you call `disconnect()`, the provider sends the `EOS` text frame so Rev AI returns the last final hypothesis before closing. Never close the socket without `EOS` -- Rev AI treats that as an invalid payload (1007).
- **No preflight signals.** RevAISTT does not emit preflight/eager end-of-turn events. If you need the eager LLM pipeline, use [DeepgramFlux](/guides/stt/deepgram-flux) instead.

## Related resources

- [Proxy server example](https://github.com/lukeocodes/composite-voice/tree/main/examples/10-proxy-server) -- secure your access token server-side
- [API reference: RevAISTT](/api/classes/revaistt)
- [Providers reference](/reference/providers)
