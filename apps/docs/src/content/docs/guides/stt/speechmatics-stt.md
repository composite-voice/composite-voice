---
title: SpeechmaticsSTT
description: Add real-time speech recognition with end-of-utterance detection to your voice pipeline using Speechmatics' WebSocket API.
order: 6
---

Use SpeechmaticsSTT when you need real-time transcription across 50+ languages with configurable accuracy/latency trade-offs, built-in end-of-utterance detection for turn-taking, and optional speaker diarization.

## Prerequisites

- A [Speechmatics](https://portal.speechmatics.com) API key

No peer dependencies are required. SpeechmaticsSTT connects through a raw WebSocket managed by the SDK's built-in `WebSocketManager`.

For production, set up a [proxy server](https://github.com/lukeocodes/composite-voice/tree/main/examples/10-proxy-server) so your API key stays server-side, or generate [temporary keys](https://docs.speechmatics.com) (JWTs) server-side and pass an async `apiKey` factory.

## Basic setup

```typescript
import {
  CompositeVoice,
  MicrophoneInput,
  SpeechmaticsSTT,
  AnthropicLLM,
  NativeTTS,
} from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new SpeechmaticsSTT({
      proxyUrl: '/api/proxy/speechmatics',
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

| Option                         | Type                              | Default       | Description                                                                 |
| ------------------------------ | --------------------------------- | ------------- | --------------------------------------------------------------------------- |
| `proxyUrl`                     | `string`                          | --            | URL of your CompositeVoice proxy endpoint (recommended)                     |
| `apiKey`                       | `string \| () => Promise<string>` | --            | Speechmatics temporary key (JWT), or an async factory returning one         |
| `region`                       | `string`                          | `'eu'`        | Real-time SaaS region (`'eu'` or `'us'`) for direct connections             |
| `language`                     | `string`                          | `'en'`        | ISO language code for the transcription session                             |
| `audioFormat`                  | `string`                          | `'pcm_s16le'` | Raw encoding (`pcm_s16le`, `pcm_f32le`, `mulaw`) or `'file'` for containers |
| `sampleRate`                   | `number`                          | `16000`       | Audio sample rate in Hz (raw formats only)                                  |
| `operatingPoint`               | `'standard' \| 'enhanced'`        | --            | Accuracy/latency trade-off (server default: `standard`)                     |
| `maxDelay`                     | `number`                          | `1`           | Max seconds (0.7–4) between speech and its final transcript                 |
| `maxDelayMode`                 | `'flexible' \| 'fixed'`           | --            | Whether `maxDelay` may flex to keep entities intact                         |
| `endOfUtteranceSilenceTrigger` | `number`                          | `0.75`        | Silence (0–2 s) before end of utterance; `0` disables                       |
| `enableSpeakerDiarization`     | `boolean`                         | `false`       | Label words with speaker identifiers                                        |
| `additionalVocab`              | `array`                           | --            | Custom dictionary (strings or `{ content, sounds_like }` objects)           |
| `outputLocale`                 | `string`                          | --            | Transcript spelling locale (e.g. `'en-GB'`)                                 |
| `domain`                       | `string`                          | --            | Language-pack domain (e.g. `'finance'`, `'medical'`)                        |
| `interimResults`               | `boolean`                         | `true`        | Emit partial transcripts (`AddPartialTranscript`) while the user speaks     |
| `timeout`                      | `number`                          | `10000`       | Connection timeout in milliseconds                                          |

See the [API reference](/api/classes/speechmaticsstt) for the full list.

## Complete example

```typescript
import {
  CompositeVoice,
  MicrophoneInput,
  SpeechmaticsSTT,
  AnthropicLLM,
  NativeTTS,
} from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new SpeechmaticsSTT({
      proxyUrl: '/api/proxy/speechmatics',
      language: 'en',
      operatingPoint: 'enhanced',
      endOfUtteranceSilenceTrigger: 0.6,
      additionalVocab: [
        'CompositeVoice',
        { content: 'Speechmatics', sounds_like: ['speech matics'] },
      ],
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

Speechmatics streams `AddPartialTranscript` messages (work-in-progress text) and `AddTranscript` messages (final segments). SpeechmaticsSTT accumulates final segments into the current utterance and emits interim results as partials arrive. When Speechmatics detects `endOfUtteranceSilenceTrigger` seconds of silence after speech, it sends an `EndOfUtterance` message -- the provider then emits the utterance with `utteranceComplete: true`, which is the flag CompositeVoice checks to trigger LLM processing.

Keep `endOfUtteranceSilenceTrigger` at its default (`0.75`, within Speechmatics' recommended 0.5–0.8 s range for voice agents) for voice-agent pipelines. Setting it to `0` disables detection -- no `utteranceComplete` result is emitted until the stream ends, though you can call `forceEndOfUtterance()` to finalize the current utterance manually.

## Tips and gotchas

- **Always keep keys server-side in production.** Either pass `proxyUrl` (the proxy injects an `Authorization: Bearer` header upstream) or generate Speechmatics temporary keys (JWTs, via `POST https://mp.speechmatics.com/v1/api_keys?type=rt`) on your server and supply them via an async `apiKey` factory.
- **Direct mode uses a `jwt` query parameter.** Browsers cannot set WebSocket headers, so the resolved `apiKey` is appended to the URL as `?jwt=...` -- Speechmatics' documented browser mechanism. Prefer short-lived temporary keys over your long-lived API key here.
- **No peer dependencies.** SpeechmaticsSTT uses the SDK's built-in `WebSocketManager` -- no extra packages to install.
- **`maxDelay` must exceed `endOfUtteranceSilenceTrigger`.** The provider defaults (`1` and `0.75`) respect this constraint; keep it in mind when tuning either value.
- **Pick a region.** Direct connections default to `region: 'eu'` (`eu.rt.speechmatics.com`); pass `'us'` for the US endpoint. The built-in proxy route targets the EU endpoint.
- **Audio is sent as raw binary frames.** No base64 encoding overhead -- the provider forwards `ArrayBuffer` chunks directly as `AddAudio` messages.
- **Custom vocabulary improves accuracy.** Pass product names or technical terms via `additionalVocab`, optionally with `sounds_like` pronunciations.
- **Word detail in metadata.** Final results include `metadata.results` — the word/punctuation results with per-word timing (`start_time`/`end_time`) and confidence, plus speaker labels when diarization is enabled.
- **Automatic reconnection.** The `WebSocketManager` reconnects with exponential backoff (up to 5 attempts, 1s initial delay, 30s max delay) if the connection drops.
- **No preflight signals.** SpeechmaticsSTT does not emit preflight/eager end-of-turn events. If you need the eager LLM pipeline, use [DeepgramFlux](/guides/stt/deepgram-flux) instead.
- **Graceful disconnect.** When you call `disconnect()`, the provider sends an `EndOfStream` message (with the last audio sequence number) so Speechmatics finalizes pending transcripts and replies with `EndOfTranscript` before the socket closes.

## Related resources

- [Proxy server example](https://github.com/lukeocodes/composite-voice/tree/main/examples/10-proxy-server) -- secure your API key server-side
- [API reference: SpeechmaticsSTT](/api/classes/speechmaticsstt)
- [Providers reference](/reference/providers)
