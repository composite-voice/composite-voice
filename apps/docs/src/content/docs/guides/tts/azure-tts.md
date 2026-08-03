---
title: AzureTTS
description: Convert text to speech using Microsoft Azure's neural voices via the Speech service REST API.
order: 7
---

Use AzureTTS when you want Microsoft Azure's catalog of hundreds of neural voices across 140+ locales via a simple REST call. Each `synthesize()` request POSTs an SSML document to your regional Speech endpoint and returns the complete audio as a Blob -- no WebSocket management required. Speaking styles (`cheerful`, `newscast`, ...) and rate/pitch controls are exposed as config options.

## Prerequisites

- An [Azure Speech resource](https://portal.azure.com) (key + region) or a CompositeVoice proxy server
- No additional dependencies required. AzureTTS uses native `fetch` internally.

## Basic setup

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, AzureTTS, BrowserAudioOutput } from 'composite-voice';

const voice = new CompositeVoice({
  providers: [
    new NativeSTT(),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
    }),
    new AzureTTS({
      proxyUrl: '/api/proxy/azure-tts',
      voiceName: 'en-US-AriaNeural',
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
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
| `apiKey` | `string \| () => Promise<string>` | -- | Speech resource key, or an async factory returning a 10-minute bearer token |
| `proxyUrl` | `string` | -- | Proxy server URL (recommended for production) |
| `region` | `string` | -- | Azure region, e.g. `eastus` (**required in direct mode**) |
| `voiceName` | `string` | **required** | Neural voice, e.g. `en-US-AriaNeural` |
| `outputFormat` | `string` | `'audio-24khz-48kbitrate-mono-mp3'` | `X-Microsoft-OutputFormat` value (mp3, wav, ogg, webm, raw pcm) |
| `language` | `string` | derived from `voiceName` | SSML `xml:lang` locale (e.g. `en-US`) |
| `style` | `string` | -- | Speaking style via `<mstts:express-as>` (e.g. `cheerful`) |
| `styleDegree` | `number` | `1` | Style intensity, 0.01–2 |
| `rate` | `number` | -- | Speech rate multiplier via `<prosody>` (1.25 → `+25.00%`) |
| `pitch` | `number` | -- | Pitch shift in semitones via `<prosody>` (−2 → `-2st`) |
| `userAgent` | `string` | -- | `User-Agent` header value (server-side runtimes only) |
| `endpoint` | `string` | -- | Custom API endpoint URL (overrides `region`) |
| `maxRetries` | `number` | `3` | Retry count for failed requests |

### Available voices

List voices with `GET https://<region>.tts.speech.microsoft.com/cognitiveservices/voices/list` (send your key as `Ocp-Apim-Subscription-Key`), or browse the [voice gallery](https://learn.microsoft.com/azure/ai-services/speech-service/language-support?tabs=tts). Voice names look like `en-US-AriaNeural`, `en-GB-SoniaNeural`, or `de-DE-KatjaNeural`. Some voices support speaking styles -- check the voice's `StyleList`.

### Output formats

| Format family | Example | Use case |
|---|---|---|
| `audio-*-mp3` | `audio-24khz-48kbitrate-mono-mp3` | Good compression, wide browser support (default) |
| `riff-*-pcm` | `riff-24khz-16bit-mono-pcm` | Uncompressed WAV, highest quality |
| `ogg-*-opus` | `ogg-24khz-16bit-mono-opus` | Good compression, open format |
| `webm-*-opus` | `webm-24khz-16bit-mono-opus` | MediaSource-friendly streaming container |
| `raw-*-pcm` | `raw-24khz-16bit-mono-pcm` | Headerless PCM for custom audio pipelines |

## Complete example

```typescript
import { CompositeVoice, MicrophoneInput, DeepgramSTT, AnthropicLLM, AzureTTS, BrowserAudioOutput } from 'composite-voice';

const tts = new AzureTTS({
  proxyUrl: '/api/proxy/azure-tts',
  voiceName: 'en-US-AriaNeural',
  style: 'cheerful',
  rate: 1.1,
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

## Authentication modes

- **Subscription key (direct):** pass your Speech resource key as a string `apiKey` -- it is sent as the `Ocp-Apim-Subscription-Key` header.
- **Bearer token (direct):** pass an async `apiKey` factory that fetches a token from your server (which exchanges the key at `POST https://<region>.api.cognitive.microsoft.com/sts/v1.0/issueToken`). Tokens are valid for 10 minutes and are sent as `Authorization: Bearer`; the factory is called on every request so refreshed tokens are picked up automatically.
- **Proxy (recommended):** pass `proxyUrl` and configure `azureSpeechApiKey` + `azureSpeechRegion` in your proxy -- the key never reaches the browser.

## Tips

- User text is XML-escaped automatically before being embedded in the SSML `<speak>` document, so `&`, `<`, and quotes in LLM output are safe.
- AzureTTS is REST-based, not streaming. The full audio Blob is returned after the API processes the entire input. For real-time streaming, consider [DeepgramTTS](/guides/tts/deepgram-tts).
- Synthesis is capped at 10 minutes of audio per request by the service.
- If you select a 48 kHz output format, the high-fidelity 48 kHz voice model is invoked automatically.

## Further reading

- [API reference](/api/classes/azuretts)
- [Providers reference](/reference/providers)
- [Getting started](/guides/getting-started)
