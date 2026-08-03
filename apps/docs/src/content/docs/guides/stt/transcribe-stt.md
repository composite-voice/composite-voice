---
title: TranscribeSTT
description: Add real-time speech recognition to your voice pipeline using Amazon Transcribe streaming over WebSocket with SigV4-presigned URLs.
order: 6
---

Use TranscribeSTT when you want real-time transcription backed by Amazon Transcribe's streaming API -- with word-level timing, partial-results stabilization for low-latency interim results, custom vocabularies, and speaker partitioning.

## Prerequisites

- An AWS account with `transcribe:StartStreamTranscription` permission
- Either AWS credentials (ideally **temporary** STS/Cognito credentials for browsers) or a CompositeVoice proxy server

No peer dependencies and no AWS SDK are required. TranscribeSTT connects through a raw WebSocket managed by the SDK's built-in `WebSocketManager`, presigns URLs with a built-in WebCrypto SigV4 signer, and frames audio with a built-in `application/vnd.amazon.eventstream` codec.

For production browsers, either set up a [proxy server](https://github.com/composite-voice/composite-voice/tree/main/examples/10-proxy-server) so AWS credentials stay server-side, or vend temporary credentials (STS `AssumeRole` / Cognito Identity Pools) from your backend and pass an async `credentials` factory.

## Basic setup

```typescript
import { CompositeVoice, MicrophoneInput, TranscribeSTT, AnthropicLLM, NativeTTS } from 'composite-voice';

const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new TranscribeSTT({
      proxyUrl: '/api/proxy/transcribe',
      languageCode: 'en-US',
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
| `credentials` | `AwsCredentials \| () => Promise<AwsCredentials>` | -- | AWS credentials, or an async factory returning temporary credentials |
| `region` | `string` | -- | AWS region (required in direct mode, e.g. `us-east-1`) |
| `languageCode` | `string` | `'en-US'` | Language of the input audio |
| `mediaEncoding` | `string` | `'pcm'` | `pcm` (signed 16-bit LE), `ogg-opus`, or `flac` |
| `sampleRate` | `number` | `16000` | Audio sample rate in Hz (8000–48000) |
| `enablePartialResultsStabilization` | `boolean` | `false` | Stabilize interim results for lower latency |
| `partialResultsStability` | `'high' \| 'medium' \| 'low'` | server default | Stability level (high = fastest, low = most accurate) |
| `vocabularyName` | `string` | -- | Custom vocabulary to apply |
| `vocabularyFilterName` | `string` | -- | Custom vocabulary filter to apply |
| `vocabularyFilterMethod` | `'remove' \| 'mask' \| 'tag'` | -- | How the filter is applied |
| `showSpeakerLabel` | `boolean` | `false` | Label items with speaker identifiers (diarization) |
| `identifyLanguage` | `boolean` | `false` | Automatic language identification (pair with `languageOptions`) |
| `languageOptions` | `string[]` | -- | Candidate languages for identification |
| `preferredLanguage` | `string` | -- | Preferred candidate to speed up identification |
| `sessionId` | `string` | -- | UUID for request tracking |
| `interimResults` | `boolean` | `true` | Emit partial transcripts while the user speaks |
| `timeout` | `number` | `10000` | Connection timeout in milliseconds |

See the [API reference](/api/classes/transcribestt) for the full list.

## Temporary credentials for browsers

Never embed long-lived AWS keys in client code. Vend temporary credentials from your backend and pass an async factory -- it is invoked on every `connect()`, so each presigned URL uses fresh credentials:

```typescript
const stt = new TranscribeSTT({
  credentials: async () => {
    const res = await fetch('/api/aws-temp-credentials');
    return res.json(); // { accessKeyId, secretAccessKey, sessionToken }
  },
  region: 'us-east-1',
  languageCode: 'en-US',
});
```

The `sessionToken` is signed into the presigned URL as `X-Amz-Security-Token`.

## Complete example

```typescript
import { CompositeVoice, MicrophoneInput, TranscribeSTT, AnthropicLLM, NativeTTS } from 'composite-voice';

const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new TranscribeSTT({
      proxyUrl: '/api/proxy/transcribe',
      languageCode: 'en-US',
      enablePartialResultsStabilization: true,
      partialResultsStability: 'high',
      showSpeakerLabel: true,
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

await agent.initialize();
await agent.startListening();
```

## Utterance completion

Amazon Transcribe segments speech automatically. While you speak, it streams the current segment repeatedly with `IsPartial: true` -- TranscribeSTT emits these as interim results. When Transcribe detects a natural pause, it sends the segment once more with `IsPartial: false`; the provider emits that as a final result with `utteranceComplete: true`, which is the flag CompositeVoice checks to trigger LLM processing.

Enable `enablePartialResultsStabilization` with `partialResultsStability: 'high'` to reduce how often interim words are revised, at a small accuracy cost.

## How authentication works

Browsers cannot set headers on WebSocket handshakes, so Transcribe streaming authenticates with a **SigV4-presigned URL**: the SDK signs the endpoint, query parameters (`language-code`, `media-encoding`, `sample-rate`, ...), and a 5-minute expiry into `X-Amz-*` query parameters using WebCrypto.

- **Direct mode** -- the presigned URL is computed client-side from your `credentials` on every `connect()`.
- **Proxy mode** -- the browser connects to your proxy with plain query parameters; the proxy computes the presigned upstream URL with its own credentials (set `aws` in the proxy config). The browser never sees AWS keys.

## Tips and gotchas

- **Audio is event-stream framed.** Each chunk is wrapped in a binary `AudioEvent` message (with CRC32 checksums) before it is sent -- handled transparently by the provider.
- **Send 16 kHz mono PCM.** The defaults (`mediaEncoding: 'pcm'`, `sampleRate: 16000`) match what `MicrophoneInput` produces. The sample rate you configure must match the actual audio.
- **Presigned URLs expire after 5 minutes.** The URL only needs to be valid at connection time -- an established stream keeps running. Reconnects go through `connect()`, which presigns a fresh URL (and re-invokes your `credentials` factory).
- **Exceptions arrive in-band.** Errors like `BadRequestException` are event-stream messages; the provider logs them and emits an error result with `metadata.errorType`.
- **Graceful disconnect.** `disconnect()` sends an empty `AudioEvent` frame so Transcribe finalizes pending segments before the socket closes.
- **No preflight signals.** TranscribeSTT does not emit preflight/eager end-of-turn events. If you need the eager LLM pipeline, use [DeepgramFlux](/guides/stt/deepgram-flux) instead.
- **Word detail in metadata.** Final results include `metadata.items` -- word/punctuation items with `StartTime`/`EndTime`, `Confidence`, and `Speaker` labels when `showSpeakerLabel` is enabled.

## Related resources

- [Proxy server example](https://github.com/composite-voice/composite-voice/tree/main/examples/10-proxy-server) -- keep AWS credentials server-side
- [Amazon Transcribe streaming docs](https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html)
- [API reference: TranscribeSTT](/api/classes/transcribestt)
- [Providers reference](/reference/providers)
