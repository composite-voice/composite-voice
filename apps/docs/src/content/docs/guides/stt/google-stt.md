---
title: GoogleSTT
description: Transcribe complete utterances with Google Cloud Speech-to-Text via batch REST requests (up to 60 seconds per request).
order: 6
---

Use GoogleSTT when you want Google Cloud Speech-to-Text's recognition models in a browser or server pipeline without any SDK dependencies. GoogleSTT is a **batch (per-utterance) provider**: each `transcribe()` call uploads a complete recording to Google's synchronous `speech:recognize` endpoint and emits the transcript as a single final result.

> **Why is there no live/streaming variant?** Google's streaming recognition API (`StreamingRecognize`) is exposed only over **gRPC** in both the v1 and v2 APIs -- there is no public WebSocket endpoint. Building a browser streaming client would require heavyweight gRPC/protobuf dependencies, which conflicts with this SDK's zero-dependency design. If you need real-time streaming STT, use [DeepgramSTT](/guides/stt/deepgram-stt), [AssemblyAISTT](/guides/stt/assemblyai-stt), [SonioxSTT](/guides/stt/soniox-stt), or [ElevenLabsSTT](/guides/stt/elevenlabs-stt) instead.

## Prerequisites

- A Google Cloud API key with the [Speech-to-Text API](https://cloud.google.com/speech-to-text/docs) enabled, or a CompositeVoice proxy server
- No additional dependencies required. GoogleSTT uses native `fetch` internally.

## Basic setup

GoogleSTT works with any code path that produces complete audio recordings -- for example a `MediaRecorder`-based capture flow, uploaded files, or server-side buffers:

```typescript
import { GoogleSTT } from 'composite-voice';

const stt = new GoogleSTT({
  proxyUrl: '/api/proxy/google-stt',
  language: 'en-US',
  encoding: 'WEBM_OPUS', // what MediaRecorder produces in most browsers
  sampleRate: 48000,
  model: 'latest_short', // optimized for short utterances / voice commands
});

await stt.initialize();

stt.onTranscription((result) => {
  // One final result per transcribe() call, with utteranceComplete: true
  console.log(result.text, result.confidence);
});

// Record an utterance with MediaRecorder, then:
await stt.transcribe(recordedBlob);
```

Because GoogleSTT extends `RestSTTProvider`, its transcription results flow through the same `onTranscription` callback as every other STT provider. Each emitted result is final and carries `utteranceComplete: true` -- the flag CompositeVoice checks to trigger LLM processing -- so a transcribed utterance drives the rest of the pipeline exactly like a live provider's end-of-utterance result.

## Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | -- | Google Cloud API key (direct mode; sent via `X-goog-api-key` header) |
| `proxyUrl` | `string` | -- | Proxy server URL (recommended for production) |
| `language` | `string` | `'en-US'` | BCP-47 language code of the audio |
| `encoding` | `string` | header-derived | `LINEAR16`, `FLAC`, `MULAW`, `ALAW`, `OGG_OPUS`, `WEBM_OPUS`, `MP3`, ... |
| `sampleRate` | `number` | header-derived | Sample rate of the audio in Hz |
| `model` | `string` | Google default | `latest_long`, `latest_short`, `telephony`, `medical_dictation`, ... |
| `punctuation` | `boolean` | `true` | Enable automatic punctuation |
| `enableWordTimeOffsets` | `boolean` | `false` | Include word timings in `metadata.words` |
| `alternativeLanguageCodes` | `string[]` | -- | Up to 3 additional candidate languages |
| `profanityFilter` | `boolean` | `false` | Mask profanity in the transcript |
| `keywords` | `string[]` | -- | Phrase hints (sent as `speechContexts`) to boost recognition |
| `endpoint` | `string` | -- | Custom API endpoint URL |
| `maxRetries` | `number` | `3` | Retry count for failed requests |

### Models

The v1 API's model identifiers include:

- **`latest_short`** -- short utterances and commands; the best fit for voice-agent turns
- **`latest_long`** -- long-form content such as media or spontaneous conversations
- **`telephony` / `telephony_short`** -- 8 kHz phone-call audio
- **`medical_dictation` / `medical_conversation`** -- medical domains
- **`command_and_search`**, **`phone_call`**, **`video`**, **`default`** -- older models

Google's Chirp models (`chirp`, `chirp_2`, `chirp_3`) are **v2-API-only** and served from regional endpoints -- they are not valid values here.

## Word timings

With `enableWordTimeOffsets: true`, final results expose per-word timing in metadata as protobuf duration strings:

```typescript
stt.onTranscription((result) => {
  const words = result.metadata?.words as Array<{ startTime?: string; endTime?: string; word: string }>;
  // [{ startTime: '0s', endTime: '0.400s', word: 'hello' }, ...]
});
```

The result metadata also carries `languageCode` (the language Google detected), `totalBilledTime`, and `requestId` when present.

## Tips and gotchas

- **Batch, not streaming.** There are no interim results -- one final, `utteranceComplete: true` result is emitted per `transcribe()` call after the full recording is uploaded and processed.
- **60-second / 10 MB limit.** The synchronous `speech:recognize` endpoint accepts at most one minute (or 10 MB) of audio per request, whichever is reached first. Longer audio needs Google's `LongRunningRecognize` (not covered by this provider) -- keep recordings to one utterance at a time.
- **Audio is base64-encoded inline.** Expect roughly 33% upload overhead on top of the raw audio size.
- **WAV/FLAC headers are self-describing.** For those formats you may omit `encoding` and `sampleRate`; for raw PCM or Opus audio both should be set to match the recording.
- **No speech, no result.** If Google detects no speech in the audio, GoogleSTT logs it and emits nothing rather than sending an empty utterance to the LLM.
- **Keys stay server-side in production.** Pass `proxyUrl` and set `googleCloudApiKey` in the proxy config -- the proxy injects the `X-goog-api-key` header upstream. The same key also powers [GoogleTTS](/guides/tts/google-tts) via the `google-tts` route.
- **API-key auth only.** Google also supports OAuth2 service-account credentials, but those require token minting/refresh and are out of scope for this SDK. Restrict your API key to the Speech-to-Text API in the Google Cloud console.

## Related resources

- [API reference: GoogleSTT](/api/classes/googlestt)
- [GoogleTTS guide](/guides/tts/google-tts)
- [Providers reference](/reference/providers)
