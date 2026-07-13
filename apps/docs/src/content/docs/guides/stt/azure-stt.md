---
title: AzureSTT
description: Add real-time speech recognition across 100+ locales to your voice pipeline using Microsoft Azure's Speech service WebSocket API.
order: 6
---

Use AzureSTT when you need real-time transcription backed by Microsoft Azure's Speech service, with interim hypotheses while the user speaks, service-side end-of-utterance detection for turn-taking, and continuous recognition across turns on a single connection.

## Prerequisites

- An [Azure Speech resource](https://portal.azure.com) (key + region)

No peer dependencies are required. AzureSTT speaks the Speech service's real-time WebSocket protocol (the same one used by the official `microsoft-cognitiveservices-speech-sdk` package) over a raw WebSocket managed by the SDK's built-in `WebSocketManager`.

For production, set up a [proxy server](https://github.com/lukeocodes/composite-voice/tree/main/examples/10-proxy-server) so your key stays server-side, or issue [10-minute bearer tokens](https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech#authentication) server-side and pass an async `apiKey` factory.

## Basic setup

```typescript
import { CompositeVoice, MicrophoneInput, AzureSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new AzureSTT({
      proxyUrl: '/api/proxy/azure-stt',
      language: 'en-US',
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
| `apiKey` | `string \| () => Promise<string>` | -- | Speech resource key, or an async factory returning a bearer token |
| `region` | `string` | -- | Azure region, e.g. `eastus` (**required in direct mode**) |
| `language` | `string` | `'en-US'` | BCP 47 recognition locale |
| `recognitionMode` | `string` | `'conversation'` | `conversation`, `interactive`, or `dictation` |
| `outputFormat` | `string` | `'simple'` | `simple` (DisplayText only) or `detailed` (NBest + confidence) |
| `profanity` | `string` | `'masked'` | `masked`, `removed`, or `raw` |
| `sampleRate` | `number` | `16000` | PCM sample rate in Hz |
| `numChannels` | `number` | `1` | Number of audio channels |
| `bitsPerSample` | `number` | `16` | Bits per PCM sample |
| `context` | `object` | -- | Extra `speech.context` payload (advanced) |
| `interimResults` | `boolean` | `true` | Emit partial hypotheses while the user speaks |
| `timeout` | `number` | `10000` | Connection timeout in milliseconds |

See the [API reference](/api/classes/azurestt) for the full list.

## Complete example

```typescript
import { CompositeVoice, MicrophoneInput, AzureSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new AzureSTT({
      proxyUrl: '/api/proxy/azure-stt',
      language: 'en-US',
      outputFormat: 'detailed',
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

The Speech service structures recognition into turns: `turn.start` → `speech.startDetected` → `speech.hypothesis` (interim, streamed while the user talks) → `speech.phrase` (final) → `speech.endDetected` → `turn.end`. AzureSTT emits each `speech.hypothesis` as an interim result, and each `speech.phrase` with `RecognitionStatus: "Success"` as a final result with `utteranceComplete: true` -- the flag CompositeVoice checks to trigger LLM processing.

After `turn.end`, the provider automatically starts the next turn (a fresh `X-RequestId` plus new `speech.context` and WAV-header messages), so recognition continues seamlessly across utterances on the same connection.

## Authentication modes

Browsers cannot set WebSocket headers, so in direct mode AzureSTT passes the credential as a query parameter — exactly as the official Azure JS SDK does:

- **Subscription key:** a string `apiKey` is sent as `?Ocp-Apim-Subscription-Key=<key>`.
- **Bearer token:** an async `apiKey` factory is assumed to return a 10-minute token (from `POST https://<region>.api.cognitive.microsoft.com/sts/v1.0/issueToken` server-side) and is sent as `?Authorization=Bearer <token>`. A fresh token is fetched on every `connect()`.
- **Proxy (recommended):** with `proxyUrl`, no credential appears in the browser at all; the proxy injects the `Ocp-Apim-Subscription-Key` header into the upstream connection (`azureSpeechApiKey` + `azureSpeechRegion` in the proxy config).

## Tips and gotchas

- **Audio format.** Stream 16 kHz, 16-bit, mono PCM (the pipeline default). The provider announces the format by sending a WAV/RIFF header as the first audio message of each turn, then wraps every chunk in the service's binary message framing.
- **Recognition modes.** Keep `conversation` for voice agents. `interactive` ends turns aggressively after short utterances (commands/queries); `dictation` enables spoken punctuation.
- **Detailed results.** With `outputFormat: 'detailed'`, final results carry `confidence` and a `metadata.nBest` list with lexical/ITN/display alternatives.
- **Silence handling.** Phrases with `RecognitionStatus` of `NoMatch`, `InitialSilenceTimeout`, or `BabbleTimeout` are logged and skipped -- no empty results reach your pipeline.
- **Automatic reconnection.** The `WebSocketManager` reconnects with exponential backoff (up to 5 attempts) if the connection drops.
- **Graceful disconnect.** `disconnect()` sends a zero-length audio message so the service finalizes the current turn (and delivers any pending phrase) before the socket closes.
- **No preflight signals.** AzureSTT does not emit preflight/eager end-of-turn events. If you need the eager LLM pipeline, use [DeepgramFlux](/guides/stt/deepgram-flux) instead.

## Related resources

- [Proxy server example](https://github.com/lukeocodes/composite-voice/tree/main/examples/10-proxy-server) -- secure your API key server-side
- [API reference: AzureSTT](/api/classes/azurestt)
- [Providers reference](/reference/providers)
