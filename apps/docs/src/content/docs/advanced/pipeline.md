---
title: Pipeline Architecture
description: How the voice pipeline works — audio flow, state machine, eager mode, and custom providers.
order: 1
---

### The voice pipeline
CompositeVoice connects three provider stages into a streaming pipeline:

```
Microphone → STT → LLM → TTS → Speaker
```

Audio flows left to right. Each stage processes its input incrementally and passes results downstream:

1. **AudioCapture** opens the microphone and delivers PCM chunks (default: 16kHz, 100ms per chunk)
2. **STT** receives audio chunks and emits transcription results (interim and final)
3. **LLM** receives the final transcript and streams text tokens
4. **TTS** receives text tokens as they arrive and streams audio chunks
5. **AudioPlayer** buffers and plays audio through the speakers

### State machine
The SDK tracks a high-level agent state derived from three sub-states: capture, processing, and playback.

```
┌──────┐    start()    ┌───────┐   user speaks   ┌───────────┐
│ idle │──────────────→│ ready │────────────────→│ listening │
└──────┘               └───────┘                  └─────┬─────┘
                                                        │
                                              speechFinal detected
                                                        │
                                                        ▼
┌───────────┐   playback ends   ┌──────────┐   LLM starts   ┌──────────┐
│ listening │←─────────────────│ speaking │←────────────────│ thinking │
└───────────┘                   └──────────┘                 └──────────┘
```

Subscribe to state changes:
```typescript
voice.on('agent:stateChange', ({ state }) => {
  // Update your UI based on the current state
});
```

The state machine handles edge cases: if the user speaks while the assistant is still talking (barge-in), the pipeline cancels TTS playback and returns to `listening`.

### Streaming throughout
The pipeline streams at every stage. The LLM does not wait for the complete transcript — it starts generating as soon as `speechFinal` fires. The TTS does not wait for the complete LLM response — it synthesizes each text chunk as it arrives. This reduces end-to-end latency from seconds to hundreds of milliseconds.

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
1. Deepgram's Flux model (STT V2) detects likely end-of-speech and fires a `transcription:preflight` event
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
                           ↑ speechFinal triggers LLM
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

The preflight signal fires before `speechFinal` is confirmed. The LLM starts generating immediately — by the time `speechFinal` arrives, the LLM is already 100-300ms into its response. If `cancelOnTextChange` is enabled and the final text differs from the preflight, the SDK cancels the speculative response and restarts.

```typescript
const voice = new CompositeVoice({
  stt: new DeepgramSTT({
    proxyUrl: '/api/proxy/deepgram',
    options: { model: 'flux-general-en' },  // preflight requires Flux (STT V2)
  }),
  llm: new AnthropicLLM({ proxyUrl: '/api/proxy/anthropic' }),
  tts: new DeepgramTTS({ proxyUrl: '/api/proxy/deepgram' }),
  eagerLLM: {
    enabled: true,
    cancelOnTextChange: true,
  },
});
```

**Requirements:** Deepgram STT with a Flux model (STT V2), e.g. `flux-general-en`. Nova models (STT V1) do not emit preflight signals. Other STT providers do not emit preflight events.

### Custom providers
Extend the base classes to add your own STT, LLM, or TTS provider.

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

  async *generate(prompt: string, options?: LLMGenerationOptions): AsyncIterable<string> {
    const messages = this.promptToMessages(prompt);
    yield* this.generateFromMessages(messages, options);
  }

  async *generateFromMessages(messages: LLMMessage[], options?: LLMGenerationOptions): AsyncIterable<string> {
    // Call your model and yield text chunks
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

  sendText(chunk: string): void {
    this.ws?.send(JSON.stringify({ text: chunk }));
  }

  async finalize(): Promise<void> {
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
├── BaseSTTProvider
│   ├── LiveSTTProvider    ← WebSocket STT (implement connect, sendAudio, disconnect)
│   └── RestSTTProvider    ← REST STT (implement transcribe)
├── BaseLLMProvider        ← all LLMs (implement generate, generateFromMessages)
└── BaseTTSProvider
    ├── LiveTTSProvider    ← WebSocket TTS (implement connect, sendText, finalize, disconnect)
    └── RestTTSProvider    ← REST TTS (implement synthesize)
```

### Audio internals

**AudioCapture** wraps `navigator.mediaDevices.getUserMedia()` with a ScriptProcessorNode (or AudioWorklet where supported). It delivers fixed-size PCM chunks at the configured sample rate and chunk duration.

**AudioPlayer** uses a Web Audio API AudioContext with buffering. It accumulates audio chunks until `minBufferDuration` is reached, then begins playback. When `smoothing` is enabled, it crossfades between chunks to eliminate clicks.
