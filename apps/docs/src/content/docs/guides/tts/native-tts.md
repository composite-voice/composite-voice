---
title: NativeTTS
description: Use the browser's built-in SpeechSynthesis API for text-to-speech with zero API keys or external dependencies.
order: 1
---

Use NativeTTS when you need speech synthesis without API keys, external services, or peer dependencies. It wraps the browser's SpeechSynthesis API and works offline in Chrome, Edge, and Safari.

## Prerequisites

- A browser that supports the [SpeechSynthesis API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis) (Chrome, Edge, Safari, Firefox)
- No API keys required
- No peer dependencies

## Basic setup

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  providers: [
    new NativeSTT(),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
    }),
    new NativeTTS({
      voiceName: 'Samantha',
      rate: 1.0,
      pitch: 0,
    }),
  ],
});

await voice.initialize();
await voice.startListening();
```

## Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `voiceName` | `string` | `undefined` | Partial, case-insensitive match against available voice names |
| `voice` | `string` | `'default'` | Alias for `voiceName` |
| `voiceLang` | `string` | `undefined` | BCP 47 language tag to filter voices (e.g., `'en-US'`, `'fr'`) |
| `preferLocal` | `boolean` | `true` | Prefer locally-installed voices (lower latency, works offline) |
| `rate` | `number` | `1.0` | Speech rate multiplier |
| `pitch` | `number` | `0` | Pitch in semitones (-20 to 20), normalized to the Web Speech range (0 to 2) |

Voice selection follows this priority: name match, then language match, then local voice preference, then first available voice.

## Complete example

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const tts = new NativeTTS({
  voiceName: 'Google US English',
  voiceLang: 'en-US',
  preferLocal: true,
  rate: 1.1,
  pitch: 2,
});

const voice = new CompositeVoice({
  providers: [
    new NativeSTT({ language: 'en-US' }),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
    }),
    tts,
  ],
});

voice.on('agent.stateChange', ({ state }) => {
  console.log('State:', state);
});

await voice.initialize();
await voice.startListening();
```

## Voice enumeration

NativeTTS exposes the browser's full voice list. Use this to build a voice picker or log what is available on the current device.

```typescript
const tts = new NativeTTS();
await tts.initialize();

const voices = tts.getAvailableVoices();
voices.forEach((v) => {
  console.log(`${v.name} (${v.lang}) ${v.localService ? '[local]' : '[network]'}`);
});

// Switch voice at runtime
tts.setVoice('Google UK English Female');
```

## Playback controls

NativeTTS manages its own audio -- the browser plays speech directly through the device speakers. CompositeVoice does not receive audio data from this provider.

```typescript
tts.pause();    // Pause current speech
tts.resume();   // Resume paused speech
tts.cancel();   // Stop and clear the utterance queue
tts.isSpeaking(); // true while speech is active
tts.isPaused();   // true while paused
```

## Tips

- Voice availability varies by browser and operating system. Always test on your target platform.
- Local voices (`localService: true`) have lower latency and work offline. Set `preferLocal: true` to favor them.
- NativeTTS is best suited for prototyping and demos. For production voice quality, consider [DeepgramTTS](/guides/tts/deepgram-tts).

## Further reading

- [API reference](/api/classes/nativetts)
- [Providers reference](/reference/providers)
- [Getting started](/guides/getting-started)
