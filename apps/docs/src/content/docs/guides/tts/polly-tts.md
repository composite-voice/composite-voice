---
title: PollyTTS
description: Convert text to speech using Amazon Polly's neural, generative, long-form, and standard voices via SigV4-signed REST calls.
order: 7
---

Use PollyTTS when you want speech synthesis backed by Amazon Polly. Each `synthesize()` call makes a single SigV4-signed request to Polly's `SynthesizeSpeech` API and returns the raw audio as a Blob -- no WebSocket management and no AWS SDK required.

## Prerequisites

- An AWS account with `polly:SynthesizeSpeech` permission
- Either AWS credentials (ideally **temporary** STS/Cognito credentials for browsers) or a CompositeVoice proxy server

No additional dependencies are required. PollyTTS uses native `fetch` and signs requests with the SDK's built-in WebCrypto SigV4 signer.

## Basic setup

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, PollyTTS, BrowserAudioOutput } from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  providers: [
    new NativeSTT(),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
    }),
    new PollyTTS({
      proxyUrl: '/api/proxy/polly',
      voiceId: 'Joanna',
      engine: 'neural',
      outputFormat: 'mp3',
    }),
    new BrowserAudioOutput(),
  ],
});

await voice.initialize();
await voice.startListening();
```

## Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `proxyUrl` | `string` | -- | Proxy server URL (recommended for production browsers) |
| `credentials` | `AwsCredentials \| () => Promise<AwsCredentials>` | -- | AWS credentials, or an async factory returning temporary credentials |
| `region` | `string` | -- | AWS region (required in direct mode, e.g. `us-east-1`) |
| `voiceId` | `string` | **required** | Polly voice (e.g. `Joanna`, `Matthew`, `Amy`) |
| `engine` | `string` | `'neural'` | `neural`, `generative`, `long-form`, or `standard` |
| `outputFormat` | `string` | `'mp3'` | `mp3`, `ogg_vorbis`, `ogg_opus`, or `pcm` |
| `sampleRate` | `number` | engine default | Output sample rate in Hz (format-dependent) |
| `textType` | `'text' \| 'ssml'` | `'text'` | Whether input is plain text or SSML |
| `languageCode` | `string` | -- | Only needed for bilingual voices (e.g. Aditi) |
| `lexiconNames` | `string[]` | -- | Up to 5 pronunciation lexicons to apply |
| `endpoint` | `string` | -- | Custom API endpoint URL |
| `maxRetries` | `number` | `3` | Retry count for failed requests |

### Voices and engines

List voices with Polly's [`DescribeVoices`](https://docs.aws.amazon.com/polly/latest/dg/API_DescribeVoices.html) API or browse the [voice list](https://docs.aws.amazon.com/polly/latest/dg/voicelist.html). Each voice supports a subset of engines -- `Joanna` and `Matthew` support `neural` and `generative`; pick a voice/engine pair that Polly documents as compatible or the API returns `EngineNotSupportedException`.

### Output formats

| Format | MIME type | Use case |
|---|---|---|
| `mp3` | `audio/mpeg` | Good compression, wide browser support (default) |
| `ogg_vorbis` | `audio/ogg` | Good compression, open format |
| `ogg_opus` | `audio/ogg` | Modern low-latency codec (48 kHz) |
| `pcm` | `audio/pcm` | Raw signed 16-bit little-endian mono samples |

## Temporary credentials for browsers

Never embed long-lived AWS keys in client code. Vend temporary credentials from your backend and pass an async factory -- it is invoked on every `synthesize()`, so each request is signed with fresh credentials:

```typescript
const tts = new PollyTTS({
  credentials: async () => {
    const res = await fetch('/api/aws-temp-credentials');
    return res.json(); // { accessKeyId, secretAccessKey, sessionToken }
  },
  region: 'us-east-1',
  voiceId: 'Joanna',
});
```

## Complete example

```typescript
import { CompositeVoice, MicrophoneInput, TranscribeSTT, AnthropicLLM, PollyTTS, BrowserAudioOutput } from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new TranscribeSTT({ proxyUrl: '/api/proxy/transcribe', languageCode: 'en-US' }),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
    }),
    new PollyTTS({
      proxyUrl: '/api/proxy/polly',
      voiceId: 'Ruth',
      engine: 'generative',
      outputFormat: 'mp3',
    }),
    new BrowserAudioOutput(),
  ],
});

voice.on('tts.start', () => console.log('Speaking...'));
voice.on('tts.end', () => console.log('Done speaking'));

await voice.initialize();
await voice.startListening();
```

## How authentication works

Polly's REST API is authenticated with AWS Signature Version 4 -- the signature covers the host, path, and exact request body, so a static API-key header cannot be injected the way other providers work.

- **Direct mode** -- each request is signed client-side with your `credentials` (an `Authorization: AWS4-HMAC-SHA256 ...` header computed with WebCrypto).
- **Proxy mode** -- the browser sends an unsigned request to your proxy, which SigV4-signs the upstream request with its own credentials (set `aws` in the proxy config). The browser never sees AWS keys.

## Tips

- Use `textType: 'ssml'` and Polly's rich [SSML support](https://docs.aws.amazon.com/polly/latest/dg/ssml.html) to control prosody, breaks, and pronunciation.
- PollyTTS is REST-based, not streaming: the full audio Blob is returned per request. For real-time streaming TTS, consider [DeepgramTTS](/guides/tts/deepgram-tts).
- `SynthesizeSpeech` accepts up to 6,000 characters (3,000 billed); CompositeVoice's sentence chunking keeps typical LLM responses well under this.
- The `generative` engine is Polly's most human-like; `neural` is a lower-latency default; `standard` is cheapest.

## Further reading

- [Amazon Polly SynthesizeSpeech API](https://docs.aws.amazon.com/polly/latest/dg/API_SynthesizeSpeech.html)
- [API reference](/api/classes/pollytts)
- [Providers reference](/reference/providers)
- [Getting started](/guides/getting-started)
