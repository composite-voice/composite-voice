---
title: Turn-Taking
description: Control how the SDK manages microphone capture during agent speech — strategies for echo prevention and barge-in.
order: 3
---

### What is turn-taking?

When a voice agent speaks through the speakers, the microphone can pick up that audio and feed it back to the STT provider. The STT provider then transcribes the agent's own speech, which triggers a new LLM request, which triggers more TTS playback -- creating an infinite feedback loop.

Turn-taking is the system that prevents this. It controls whether the SDK pauses microphone capture while the agent is speaking, based on the provider combination, browser capabilities, and your configuration.

### The `pauseCaptureOnPlayback` setting

The top-level control is `pauseCaptureOnPlayback`, which accepts three values:

| Value     | Behavior                                                                                      |
| --------- | --------------------------------------------------------------------------------------------- |
| `'auto'`  | The SDK decides whether to pause based on the configured strategy and provider combination.    |
| `true`    | Always pause microphone capture during TTS playback. Prevents all echo.                       |
| `false`   | Never pause microphone capture. Full-duplex mode -- requires reliable hardware echo cancellation. |

The default is `'auto'`.

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new NativeSTT(),
    new AnthropicLLM({ apiKey: 'sk-ant-...', model: 'claude-haiku-4-5-20251001' }),
    new NativeTTS(),
  ],
  turnTaking: {
    pauseCaptureOnPlayback: 'auto',
  },
});
```

### Auto strategies

When `pauseCaptureOnPlayback` is `'auto'`, the SDK uses the `autoStrategy` setting to decide. There are three strategies:

#### Conservative (default)

Pauses microphone capture unless the STT provider uses `navigator.mediaDevices.getUserMedia()`, which supports browser-level echo cancellation.

In practice, this means:
- **[NativeSTT](/guides/stt/native-stt)** (Web Speech API) -- always pauses, because the SpeechRecognition API has no echo cancellation support
- **[DeepgramSTT](/guides/stt/deepgram-stt)** and **[AssemblyAISTT](/guides/stt/assemblyai-stt)** (MediaDevices) -- does not pause, because getUserMedia can enable `echoCancellation: true`

```typescript
const agent = new CompositeVoice({
  providers: [/* ...your providers */],
  turnTaking: {
    pauseCaptureOnPlayback: 'auto',
    autoStrategy: 'conservative',
  },
});
```

This is the safest auto strategy and is the default.

#### Aggressive

Only pauses for provider combinations explicitly listed in `alwaysPauseCombinations`. All other combinations run in full-duplex mode.

```typescript
const agent = new CompositeVoice({
  providers: [/* ...your providers */],
  turnTaking: {
    pauseCaptureOnPlayback: 'auto',
    autoStrategy: 'aggressive',
  },
});
```

With the default `alwaysPauseCombinations`, this still pauses for any STT combination that includes [NativeSTT](/guides/stt/native-stt), because NativeSTT is listed with a wildcard TTS match (see below). For WebSocket-based STT providers like [DeepgramSTT](/guides/stt/deepgram-stt), aggressive mode allows full-duplex.

#### Detect

Attempts to detect echo cancellation support at runtime by checking the browser's `navigator.mediaDevices.getSupportedConstraints()` API. If the browser reports support for `echoCancellation`, `noiseSuppression`, and `autoGainControl`, the SDK allows full-duplex. Otherwise, it pauses.

```typescript
const agent = new CompositeVoice({
  providers: [/* ...your providers */],
  turnTaking: {
    pauseCaptureOnPlayback: 'auto',
    autoStrategy: 'detect',
  },
});
```

The detect strategy checks two things:
1. Whether the STT provider uses MediaDevices (SpeechRecognition API providers always get paused regardless of browser support)
2. Whether the browser supports the required audio processing constraints

This is the most adaptive strategy, but it checks browser **capability**, not whether echo cancellation works with the user's hardware. Laptops with poor speaker/microphone isolation may still produce echo even when the browser reports support.

### The `alwaysPauseCombinations` list

When using the `'aggressive'` auto strategy, the SDK checks each STT/TTS provider pair against a list of known problematic combinations. If the combination matches, capture is paused regardless of the strategy.

The default list is:

```typescript
alwaysPauseCombinations: [
  { stt: 'NativeSTT', tts: 'NativeTTS' },
  { stt: 'NativeSTT', tts: 'any' },  // NativeSTT always needs pause
]
```

The special value `'any'` acts as a wildcard that matches any provider name. In the default configuration, every combination that uses `NativeSTT` will pause, because `NativeSTT` uses the Web Speech API which has no echo cancellation.

You can override this list to add your own known-bad combinations:

```typescript
const agent = new CompositeVoice({
  providers: [/* ...your providers */],
  turnTaking: {
    pauseCaptureOnPlayback: 'auto',
    autoStrategy: 'aggressive',
    alwaysPauseCombinations: [
      { stt: 'NativeSTT', tts: 'any' },
      { stt: 'MyCustomSTT', tts: 'NativeTTS' },
    ],
  },
});
```

### When to use each strategy

| Scenario                                                  | Recommended setting                                   |
| --------------------------------------------------------- | ----------------------------------------------------- |
| Using [NativeSTT](/guides/stt/native-stt) (Web Speech API)                        | `'auto'` with `'conservative'` (default) -- NativeSTT always needs pause |
| Using [DeepgramSTT](/guides/stt/deepgram-stt) or [AssemblyAISTT](/guides/stt/assemblyai-stt) on a laptop        | `'auto'` with `'conservative'` or `'detect'`          |
| Using [DeepgramSTT](/guides/stt/deepgram-stt) with external speakers + good mic     | `'auto'` with `'aggressive'` or `pauseCaptureOnPlayback: false` |
| Headphones (no echo possible)                             | `pauseCaptureOnPlayback: false`                       |
| Unsure about the user's audio setup                       | `pauseCaptureOnPlayback: true` (always safe)          |
| Kiosk or embedded device with known hardware              | `pauseCaptureOnPlayback: false` after testing          |

### Barge-in behavior

Barge-in is the ability for the user to interrupt the agent while it is speaking. How barge-in works depends on the turn-taking configuration.

#### Automatic barge-in

When the microphone is active during agent speech (full-duplex mode), the SDK handles barge-in **automatically**. If any transcription result arrives while the agent is in the `thinking` or `speaking` state, the SDK immediately:

1. Increments an internal `llmGenerationId` so the in-flight generation detects it has been superseded
2. Aborts the LLM `AbortController`, cancelling the current generation
3. Aborts any eager/speculative generation in progress
4. Clears the output queue and stops the output provider
5. Disconnects the Live TTS WebSocket (and reconnects it when the new response begins)

The pipeline then processes the user's new utterance normally -- no application code is required.

#### Manual barge-in

The `stopSpeaking()` method is still available for programmatic barge-in when you need explicit control:

```typescript
// Example: barge-in triggered by a UI button
button.addEventListener('click', async () => {
  await agent.stopSpeaking();
});
```

`stopSpeaking()` performs the same cleanup as automatic barge-in: it aborts the LLM generation, clears the output queue, disconnects Live TTS, and transitions the agent back to `listening`.

#### When barge-in is available

**When `pauseCaptureOnPlayback` resolves to `true`:**
The microphone is paused during playback. Automatic barge-in is not available because no transcription events arrive. The user must wait for the agent to finish, or you can use `stopSpeaking()` for manual barge-in (e.g., from a UI button).

**When `pauseCaptureOnPlayback` resolves to `false`:**
The microphone stays active during playback (full-duplex mode). Automatic barge-in is fully active.

**When `pauseCaptureOnPlayback` is `'auto'` with `'conservative'`:**
Whether automatic barge-in is available depends on the STT provider. With [DeepgramSTT](/guides/stt/deepgram-stt) (which supports echo cancellation via MediaDevices), the microphone stays active and automatic barge-in works. With [NativeSTT](/guides/stt/native-stt), the microphone is paused and only manual barge-in via `stopSpeaking()` is available.

### Configuration examples

**Default (recommended starting point):**
```typescript
const agent = new CompositeVoice({
  providers: [/* ...your providers */],
  // turnTaking is optional -- these are the defaults:
  turnTaking: {
    pauseCaptureOnPlayback: 'auto',
    autoStrategy: 'conservative',
    alwaysPauseCombinations: [
      { stt: 'NativeSTT', tts: 'NativeTTS' },
      { stt: 'NativeSTT', tts: 'any' },
    ],
  },
});
```

**Production Deepgram pipeline with full-duplex:**
```typescript
import { CompositeVoice, DeepgramSTT, AnthropicLLM, DeepgramTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new DeepgramSTT({
      proxyUrl: '/api/proxy/deepgram',
      interimResults: true,
      options: { model: 'nova-3', endpointing: 300 },
    }),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
      systemPrompt: 'You are a helpful voice assistant.',
      maxTokens: 200,
    }),
    new DeepgramTTS({
      proxyUrl: '/api/proxy/deepgram',
      options: { model: 'aura-2-thalia-en', encoding: 'linear16', sampleRate: 24000 },
    }),
  ],
  turnTaking: {
    pauseCaptureOnPlayback: false,  // full-duplex -- DeepgramSTT handles echo cancellation
  },
});

// Barge-in happens automatically in full-duplex mode.
// The SDK detects user speech during agent output and interrupts immediately.
// Use stopSpeaking() only if you need programmatic barge-in (e.g., a UI button).
```

**Always-safe mode for unknown environments:**
```typescript
const agent = new CompositeVoice({
  providers: [/* ...your providers */],
  turnTaking: {
    pauseCaptureOnPlayback: true,  // always pause -- no echo, no barge-in
  },
});
```

### How the SDK decides

The decision flow for `pauseCaptureOnPlayback: 'auto'` is:

```
pauseCaptureOnPlayback === true?   → PAUSE (always)
pauseCaptureOnPlayback === false?  → CONTINUE (full-duplex)
pauseCaptureOnPlayback === 'auto'?
  └─ autoStrategy: 'conservative'
  │    └─ STT uses MediaDevices with echo cancellation? → CONTINUE
  │    └─ STT uses SpeechRecognition?                   → PAUSE
  │
  └─ autoStrategy: 'aggressive'
  │    └─ STT+TTS in alwaysPauseCombinations?           → PAUSE
  │    └─ otherwise                                     → CONTINUE
  │
  └─ autoStrategy: 'detect'
       └─ Browser supports echo cancellation constraints
       │  AND STT uses MediaDevices?                    → CONTINUE
       └─ otherwise                                     → PAUSE
```

The SDK logs its decision at the `debug` log level. Enable debug logging to see the reasoning:

```typescript
const agent = new CompositeVoice({
  providers: [/* ...your providers */],
  logging: { enabled: true, level: 'debug' },
});
// Console: "Turn-taking: Auto mode with conservative strategy (DeepgramSTT + DeepgramTTS)"
// Console: "Turn-taking: Conservative - CONTINUE (DeepgramSTT uses mediadevices, echo cancellation: supported)"
```

### Related

- [Pipeline Architecture](/advanced/pipeline) for how turn-taking fits into the overall voice pipeline
- [Getting Started](/guides/getting-started) for basic agent configuration
- [DeepgramSTT guide](/guides/stt/deepgram-stt) for WebSocket-based STT with echo cancellation support
- [NativeSTT guide](/guides/stt/native-stt) for the Web Speech API provider and its limitations
