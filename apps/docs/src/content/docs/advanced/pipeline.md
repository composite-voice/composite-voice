---
title: Pipeline Architecture
description: How the voice pipeline works — audio flow, state machine, eager mode, and custom providers.
order: 1
---

### The voice pipeline
CompositeVoice connects five pipeline roles into a streaming pipeline:

```
Input → STT → LLM → TTS → Output
```

Audio flows left to right. Each role processes its input incrementally and passes results downstream:

1. **Input** captures audio and delivers PCM chunks to the pipeline. Built-in providers: `MicrophoneInput` (opens the browser microphone, default 16kHz, 100ms per chunk) and `BufferInput` (accepts programmatic audio buffers).
2. **STT** receives audio chunks and emits transcription results (interim and final).
3. **LLM** receives the final transcript and streams text tokens.
4. **TTS** receives text tokens as they arrive and streams audio chunks.
5. **Output** buffers and plays audio through the speakers. Built-in providers: `BrowserAudioOutput` (Web Audio API playback) and `NullOutput` (discards audio, useful for testing).

### State machine
The SDK tracks a high-level agent state derived from three sub-states: capture, processing, and playback.

```
┌──────┐    start()    ┌───────┐   user speaks   ┌───────────┐
│ idle │──────────────→│ ready │────────────────→│ listening │
└──────┘               └───────┘                  └─────┬─────┘
                                                        │
                                           utteranceComplete detected
                                                        │
                                                        ▼
┌───────────┐   playback ends   ┌──────────┐   LLM starts   ┌──────────┐
│ listening │←─────────────────│ speaking │←────────────────│ thinking │
└───────────┘                   └──────────┘                 └──────────┘
```

Subscribe to state changes:
```typescript
voice.on('agent.stateChange', ({ state }) => {
  // Update your UI based on the current state
});
```

The state machine handles edge cases: if the user speaks while the assistant is still talking (barge-in), the pipeline cancels TTS playback and returns to `listening`.

### Streaming throughout
The pipeline streams at every stage. The LLM does not wait for the complete transcript — it starts generating as soon as `utteranceComplete` is set on the transcription result. The TTS does not wait for the complete LLM response — it synthesizes each text chunk as it arrives. This reduces end-to-end latency from seconds to hundreds of milliseconds.

```
Time ──────────────────────────────────────────────→

User speaks:    ████████████░░░░░░░░░░░░░░░░░░░░░░░
STT interim:    ░░░░████░░░░░░░░░░░░░░░░░░░░░░░░░░░
STT final:      ░░░░░░░░░░██░░░░░░░░░░░░░░░░░░░░░░░
LLM streaming:  ░░░░░░░░░░░░████████░░░░░░░░░░░░░░░
TTS streaming:  ░░░░░░░░░░░░░░░████████░░░░░░░░░░░░
Audio playback: ░░░░░░░░░░░░░░░░░░████████░░░░░░░░░
```

### Eager LLM pipeline
The eager pipeline reduces latency further by starting LLM generation before the final transcript arrives.

**How it works:**
1. The [DeepgramFlux](/guides/stt/deepgram-flux) provider detects likely end-of-speech and fires a `transcription.preflight` event
2. The SDK immediately sends the current transcript to the LLM
3. If the user keeps speaking, the SDK cancels the in-flight LLM request and restarts with the updated text
4. If the preflight was correct (user stopped speaking), the LLM response is already 100-300ms ahead

Compare the standard pipeline to the eager pipeline:

```
Standard pipeline
Time ──────────────────────────────────────────────→

User speaks:    ████████████░░░░░░░░░░░░░░░░░░░░░░░
STT interim:    ░░░░████░░░░░░░░░░░░░░░░░░░░░░░░░░░
STT final:      ░░░░░░░░████░░░░░░░░░░░░░░░░░░░░░░░
                           ↑ utteranceComplete triggers LLM
LLM streaming:  ░░░░░░░░░░░░████████░░░░░░░░░░░░░░░
TTS streaming:  ░░░░░░░░░░░░░░░████████░░░░░░░░░░░░
Audio playback: ░░░░░░░░░░░░░░░░░░████████░░░░░░░░░
```

```
Eager pipeline (with preflight)
Time ──────────────────────────────────────────────→

User speaks:    ████████████░░░░░░░░░░░░░░░░░░░░░░░
STT interim:    ░░░░████░░░░░░░░░░░░░░░░░░░░░░░░░░░
STT preflight:  ░░░░░░░░█░░░░░░░░░░░░░░░░░░░░░░░░░░
                        ↑ preflight triggers LLM
STT final:      ░░░░░░░░████░░░░░░░░░░░░░░░░░░░░░░░
LLM streaming:  ░░░░░░░░░████████░░░░░░░░░░░░░░░░░░
TTS streaming:  ░░░░░░░░░░░░████████░░░░░░░░░░░░░░░
Audio playback: ░░░░░░░░░░░░░░░████████░░░░░░░░░░░░
                        ↑──↑ ~200ms saved
```

The preflight signal fires before `utteranceComplete` is confirmed. The LLM starts generating immediately — by the time the final transcript with `utteranceComplete: true` arrives, the LLM is already 100-300ms into its response. If `cancelOnTextChange` is enabled and the final text differs significantly from the preflight (below `similarityThreshold`), the SDK cancels the speculative response and restarts.

The SDK uses [textSimilarity](/api/functions/textsimilarity) to compare preflight and final transcripts — an order-aware word-overlap score from 0 to 1. If the score meets the `similarityThreshold` (default: 0.8), the response is kept.

```typescript
const voice = new CompositeVoice({
  providers: [
    new DeepgramFlux({
      proxyUrl: '/api/proxy/deepgram',
      options: {
        model: 'flux-general-en',
        eagerEotThreshold: 0.5,
      },
    }),
    new AnthropicLLM({ proxyUrl: '/api/proxy/anthropic' }),
    new DeepgramTTS({ proxyUrl: '/api/proxy/deepgram' }),
  ],
  eagerLLM: {
    enabled: true,
    cancelOnTextChange: true,
    similarityThreshold: 0.8,  // accept if >=80% word overlap
  },
});
```

**Requirements:** [DeepgramFlux](/guides/stt/deepgram-flux) with a Flux model (e.g. `flux-general-en`). [DeepgramSTT](/guides/stt/deepgram-stt) (V1/Nova) does not emit preflight signals. Other STT providers do not emit preflight events.

### Custom providers
Extend the base classes to add your own input, STT, LLM, TTS, or output provider.

**Custom LLM provider:**
```typescript
import { BaseLLMProvider, LLMMessage, LLMGenerationOptions } from '@lukeocodes/composite-voice';

class MyLLM extends BaseLLMProvider {
  protected async onInitialize(): Promise<void> {
    // Set up your client, validate config
  }

  protected async onDispose(): Promise<void> {
    // Clean up resources
  }

  // Primary method — called by CompositeVoice pipeline
  async *processMessages(messages: LLMMessage[], options?: LLMGenerationOptions): AsyncIterable<string> {
    const response = await fetch('https://my-model.example.com/chat', {
      method: 'POST',
      body: JSON.stringify({ messages }),
      signal: options?.signal,  // support cancellation
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value);
    }
  }

  // Compatibility methods — override these if you need standalone usage
  async *generate(prompt: string, options?: LLMGenerationOptions): AsyncIterable<string> {
    const messages = this.promptToMessages(prompt);
    yield* this.processMessages(messages, options);
  }

  async *generateFromMessages(messages: LLMMessage[], options?: LLMGenerationOptions): AsyncIterable<string> {
    yield* this.processMessages(messages, options);
  }
}
```

**Custom WebSocket TTS provider:**
```typescript
import { LiveTTSProvider, TTSProviderConfig } from '@lukeocodes/composite-voice';

class MyTTS extends LiveTTSProvider {
  private ws: WebSocket | null = null;

  protected async onInitialize(): Promise<void> {}
  protected async onDispose(): Promise<void> {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    this.ws = new WebSocket('wss://my-tts.example.com');
    this.ws.onmessage = (event) => {
      this.emitAudio({
        data: event.data,
        timestamp: Date.now(),
        metadata: { sampleRate: 16000, encoding: 'linear16', channels: 1, bitDepth: 16 },
      });
    };
  }

  sendTextToSocket(chunk: string): void {
    this.ws?.send(JSON.stringify({ text: chunk }));
  }

  async finalizeSocket(): Promise<void> {
    this.ws?.send(JSON.stringify({ flush: true }));
  }

  async disconnect(): Promise<void> {
    this.ws?.close();
    this.ws = null;
  }
}
```

**Provider hierarchy:**
```
BaseProvider
├── BaseInputProvider     ← audio input (implement startCapture, stopCapture)
│   ├── MicrophoneInput   ← browser microphone via getUserMedia
│   └── BufferInput       ← programmatic audio buffers
├── BaseSTTProvider
│   ├── LiveSTTProvider    ← WebSocket STT (implement connect, sendAudioToSocket, disconnect)
│   └── RestSTTProvider    ← REST STT (implement transcribe)
├── BaseLLMProvider        ← all LLMs (implement processMessages, generate, generateFromMessages)
├── BaseTTSProvider
│   ├── LiveTTSProvider    ← WebSocket TTS (implement connect, sendTextToSocket, finalizeSocket, disconnect)
│   └── RestTTSProvider    ← REST TTS (implement synthesize)
└── BaseOutputProvider    ← audio output (implement playAudio, stopPlayback)
    ├── BrowserAudioOutput ← Web Audio API playback
    └── NullOutput         ← discards audio (testing)
```

### Guard and handler methods

Every provider exposes two types of standard methods:

**Handler methods** receive data and perform the provider's core function:
- STT: `sendAudioToSocket(chunk)` -- sends audio to the service for transcription
- LLM: `processMessages(messages, options)` -- sends messages to the LLM
- TTS: `sendTextToSocket(text)` -- sends text for synthesis

**Guard methods** assert conditions on results and return boolean. CompositeVoice calls these to decide what to do with each result:
- `isUtteranceComplete(result)` -- is this a complete utterance ready for the LLM?
- `isPreflight(result)` -- is this a speculative end-of-turn signal?
- `isAudioReady(chunk)` -- does this chunk contain valid audio for playback?

**Base connection helpers** (on all providers):
- `assertAuth()` -- validates `apiKey` or `proxyUrl` is configured
- `resolveBaseUrl(defaultUrl)` -- resolves `proxyUrl` > `endpoint` > default
- `resolveApiKey()` -- returns `apiKey` or `'proxy'` in proxy mode
- `resolveWsProtocols()` -- WebSocket subprotocol array for auth
- `isProxyMode` -- `true` when using proxy

### Audio internals

**MicrophoneInput** wraps `navigator.mediaDevices.getUserMedia()` with an AudioWorkletNode (or ScriptProcessorNode as fallback in older browsers). It delivers fixed-size PCM chunks at the configured sample rate and chunk duration.

**BrowserAudioOutput** uses a Web Audio API AudioContext with buffering. It accumulates audio chunks until `minBufferDuration` is reached, then begins playback. When `smoothing` is enabled, it crossfades between chunks to eliminate clicks.
