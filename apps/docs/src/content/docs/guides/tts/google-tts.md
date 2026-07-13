---
title: GoogleTTS
description: Convert text to speech using Google Cloud Text-to-Speech's Chirp 3, Neural2, Studio, and WaveNet voices via a simple REST API.
order: 7
---

Use GoogleTTS when you want Google Cloud Text-to-Speech's voice catalog -- from lightweight Standard and WaveNet voices to Neural2, Studio, and the Chirp 3: HD generation -- via a simple REST call. Each `synthesize()` request returns the complete audio as a Blob; no WebSocket management required.

## Prerequisites

- A Google Cloud API key with the [Text-to-Speech API](https://cloud.google.com/text-to-speech/docs) enabled, or a CompositeVoice proxy server
- No additional dependencies required. GoogleTTS uses native `fetch` internally.

## Basic setup

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, GoogleTTS, BrowserAudioOutput } from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  providers: [
    new NativeSTT(),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
    }),
    new GoogleTTS({
      proxyUrl: '/api/proxy/google-tts',
      languageCode: 'en-US',
      voiceName: 'en-US-Chirp3-HD-Kore',
      audioEncoding: 'MP3',
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
| `apiKey` | `string` | -- | Google Cloud API key (direct mode; sent via `X-goog-api-key` header) |
| `proxyUrl` | `string` | -- | Proxy server URL (recommended for production) |
| `languageCode` | `string` | `'en-US'` | BCP-47 language/region code for the voice |
| `voiceName` | `string` | Google default | Specific voice, e.g. `en-US-Chirp3-HD-Kore`, `en-US-Neural2-F` |
| `ssmlGender` | `string` | -- | `MALE`, `FEMALE`, or `NEUTRAL` -- voice preference when `voiceName` is omitted |
| `audioEncoding` | `string` | `'MP3'` | `MP3`, `OGG_OPUS`, `LINEAR16`, `MULAW`, `ALAW` |
| `speakingRate` | `number` | `1.0` | Speaking rate multiplier (0.25 -- 4.0) |
| `pitch` | `number` | `0` | Pitch adjustment in semitones (-20 to +20) |
| `volumeGainDb` | `number` | `0` | Volume gain in dB (-96.0 to +16.0) |
| `sampleRateHertz` | `number` | voice native | Output sample rate in Hz |
| `effectsProfileId` | `string[]` | -- | Device effects profiles, e.g. `['headphone-class-device']` |
| `endpoint` | `string` | -- | Custom API endpoint URL |
| `maxRetries` | `number` | `3` | Retry count for failed requests |

### Available voices

Voice names encode the language, family, and variant. Current families include **Chirp 3: HD** (latest generation, e.g. `en-US-Chirp3-HD-Kore`), **Neural2** (`en-US-Neural2-F`), **Studio** (`en-US-Studio-O`), **WaveNet** (`en-US-Wavenet-D`), **Polyglot**, **News**, **Casual**, and **Standard**. List everything available for your project with Google's [`GET /v1/voices`](https://cloud.google.com/text-to-speech/docs/list-voices-and-types) endpoint. (The older Journey voices were retired and folded into Chirp 3: HD.)

### Output encodings

| Encoding | Use case |
|---|---|
| `MP3` | Good compression, wide browser support (default) |
| `OGG_OPUS` | Good compression, open format |
| `LINEAR16` | Uncompressed 16-bit PCM with WAV header, highest quality |
| `MULAW` / `ALAW` | G.711 telephony formats (with WAV header) |

## Complete example

```typescript
import { CompositeVoice, MicrophoneInput, DeepgramSTT, AnthropicLLM, GoogleTTS, BrowserAudioOutput } from '@lukeocodes/composite-voice';

const tts = new GoogleTTS({
  proxyUrl: '/api/proxy/google-tts',
  languageCode: 'en-GB',
  voiceName: 'en-GB-Neural2-A',
  audioEncoding: 'MP3',
  speakingRate: 1.1,
  effectsProfileId: ['headphone-class-device'],
});

const voice = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
    }),
    tts,
    new BrowserAudioOutput(),
  ],
});

voice.on('tts.start', () => console.log('Speaking...'));
voice.on('tts.end', () => console.log('Done speaking'));

await voice.initialize();
await voice.startListening();
```

## SSML support

Input that starts with `<speak` is sent as SSML instead of plain text, giving you control over pauses, pronunciation, and emphasis:

```typescript
await tts.synthesize('<speak>Hello <break time="300ms"/> world. <say-as interpret-as="characters">SDK</say-as></speak>');
```

See the [Google Cloud SSML reference](https://cloud.google.com/text-to-speech/docs/ssml) for the supported tags. Note that some newer voice families (e.g. Chirp 3: HD) have limited SSML support -- prefer Neural2/Studio/WaveNet voices for heavy SSML use.

## Tips

- GoogleTTS is REST-based, not streaming. The full audio Blob is returned after the API processes the entire input. For real-time streaming, consider [DeepgramTTS](/guides/tts/deepgram-tts).
- The Google API returns audio base64-encoded (`audioContent`); GoogleTTS decodes it into a playable Blob for you.
- Use `proxyUrl` in production so your API key stays server-side -- set `googleCloudApiKey` in your proxy config. The same key also powers [GoogleSTT](/guides/stt/google-stt) via the `google-stt` route.
- Authentication uses a Google Cloud **API key** (injected as the `X-goog-api-key` header; Google also accepts it as a `?key=` query parameter). Google's OAuth2 service-account authentication is out of scope for this SDK -- it requires server-side token minting and refresh, which is exactly what the proxy pattern replaces. Restrict your API key to the Text-to-Speech API in the Google Cloud console.

## Further reading

- [API reference](/api/classes/googletts)
- [Providers reference](/reference/providers)
- [Getting started](/guides/getting-started)
