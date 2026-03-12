---
title: NativeSTT
description: Add speech-to-text to your voice pipeline using the browser's built-in Web Speech API -- no API keys required.
order: 1
---

Use NativeSTT for prototyping and demos where you need speech recognition without API keys or external dependencies.

## Prerequisites

- A Chromium-based browser (Chrome, Edge) or Safari. Firefox does not support the Web Speech API. De-Googled forks (Ungoogled Chromium, Brave) will not work — see [Tips and gotchas](#tips-and-gotchas).
- Microphone access granted by the user.

No API keys or peer dependencies are required.

## Basic setup

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new NativeSTT({
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

NativeSTT manages its own audio capture. The browser's `SpeechRecognition` API accesses the microphone directly, so CompositeVoice skips its internal `AudioCapture` setup.

## Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `language` | `string` | `'en-US'` | BCP 47 language tag (e.g., `'fr-FR'`, `'es-ES'`) |
| `continuous` | `boolean` | `true` | Keep listening after each utterance ends |
| `interimResults` | `boolean` | `true` | Emit partial transcripts while the user speaks |
| `maxAlternatives` | `number` | `1` | Number of recognition alternatives per result |
| `startTimeout` | `number` | `5000` | Milliseconds to wait for the recognition engine to start |

See the [API reference](/api/classes/nativestt) for the full list.

## Complete example

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new NativeSTT({
      language: 'en-US',
      continuous: true,
      interimResults: true,
      maxAlternatives: 1,
    }),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
      maxTokens: 256,
      systemPrompt: 'You are a helpful voice assistant. Keep responses under two sentences.',
    }),
    new NativeTTS({ voiceLang: 'en-US' }),
  ],
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

## Tips and gotchas

- **Browser support is limited.** Chrome and Edge have full support. Safari offers partial support via `webkitSpeechRecognition`. Firefox does not support the Web Speech API at all.
- **De-Googled browsers will not work.** The Web Speech API in Chromium sends audio to Google's servers for recognition. Privacy-focused forks like **Ungoogled Chromium** and **Brave** strip out Google services, so `SpeechRecognition` will silently fail. If you use one of these browsers, switch to a WebSocket-based provider like [DeepgramSTT](/guides/stt/deepgram-stt), [AssemblyAISTT](/guides/stt/assemblyai-stt), or [ElevenLabsSTT](/guides/stt/elevenlabs-stt).
- **Microphone permission prompt.** NativeSTT pre-checks permission via `getUserMedia` before starting recognition. If the user denies access, `connect()` throws a `ProviderConnectionError`.
- **Turn-taking pauses capture.** NativeSTT always appears in the SDK's `alwaysPauseCombinations` list, so the microphone pauses during TTS playback regardless of your turn-taking strategy.
- **No preflight signals.** NativeSTT does not emit preflight/eager end-of-turn events. If you need the eager LLM pipeline, switch to [DeepgramSTT](/guides/stt/deepgram-stt).
- **`sendAudio()` is a no-op.** Because the browser manages audio capture, calling `sendAudio()` on NativeSTT does nothing.

## Related resources

- [Minimal voice agent example](https://github.com/lukeocodes/composite-voice/tree/main/examples/00-minimal-voice-agent) -- uses NativeSTT with NativeTTS
- [Multi-language example](https://github.com/lukeocodes/composite-voice/tree/main/examples/13-multi-language) -- switch languages at runtime
- [API reference: NativeSTT](/api/classes/nativestt)
- [Providers reference](/reference/providers)
