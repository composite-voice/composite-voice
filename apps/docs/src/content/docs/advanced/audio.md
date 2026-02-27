---
title: Audio Configuration
description: Configure microphone capture and audio playback — sample rates, buffering, noise suppression, and more.
order: 7
---

### How audio flows through the SDK

CompositeVoice manages two internal audio subsystems that sit at opposite ends of the voice pipeline:

1. **AudioCapture** -- opens the microphone and delivers PCM chunks to the STT provider.
2. **AudioPlayer** -- receives audio chunks from the TTS provider and plays them through the speakers.

Both subsystems are configured through the top-level `audio` option when you create a `CompositeVoice` instance:

```typescript
import { CompositeVoice } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt,
  llm,
  tts,
  audio: {
    input: { /* AudioInputConfig */ },
    output: { /* AudioOutputConfig */ },
  },
});
```

Any option you omit falls back to a sensible default. You only need to specify values you want to override.

### Audio capture (microphone input)

`AudioCapture` wraps the browser's `getUserMedia` and Web Audio API into a start/stop interface. When capture starts, the following pipeline is assembled:

```
getUserMedia (MediaStream)
    |
MediaStreamAudioSourceNode
    |
ScriptProcessorNode (buffer processing)
    |
Downsample if hardware rate differs from config
    |
Float32 -> Int16 PCM conversion
    |
Callback delivers ArrayBuffer to STT provider
```

The SDK requests microphone access with the constraints you specify (sample rate, channel count, echo cancellation, noise suppression, automatic gain control). An `AudioContext` is created at the configured sample rate, and a `ScriptProcessorNode` processes audio in fixed-size buffers derived from the `chunkDuration` setting.

If the hardware sample rate differs from your configured rate (e.g., the microphone captures at 48kHz but you configured 16kHz), the SDK automatically downsamples using sample-window averaging before converting to 16-bit PCM.

### AudioInputConfig reference

| Option              | Type      | Default  | Description                                                                 |
|---------------------|-----------|----------|-----------------------------------------------------------------------------|
| `sampleRate`        | `number`  | `16000`  | Sample rate in Hz. Most STT providers work best at 16000.                   |
| `format`            | `string`  | `'pcm'`  | Audio format. Currently `'pcm'` (16-bit linear) is fully implemented.       |
| `channels`          | `number`  | `1`      | Channel count. Use `1` (mono) for speech.                                   |
| `chunkDuration`     | `number`  | `100`    | Duration of each audio chunk in milliseconds.                               |
| `echoCancellation`  | `boolean` | `true`   | Enable browser echo cancellation. Prevents TTS audio from being re-transcribed. |
| `noiseSuppression`  | `boolean` | `true`   | Enable browser noise suppression. Reduces background noise for cleaner transcription. |
| `autoGainControl`   | `boolean` | `true`   | Enable automatic gain control. Normalizes volume when users move relative to the mic. |

The defaults are exported as `DEFAULT_AUDIO_INPUT_CONFIG`:

```typescript
{
  sampleRate: 16000,
  format: 'pcm',
  channels: 1,
  chunkDuration: 100,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}
```

### Audio playback (speaker output)

`AudioPlayer` uses the Web Audio API to play TTS audio through the speakers. It supports two modes:

- **Complete playback** -- play a single audio `Blob` via `play()` (used by REST-based TTS providers like [OpenAITTS](/guides/tts/openai-tts)).
- **Streaming playback** -- queue individual `AudioChunk` objects via `addChunk()`, buffered and played sequentially (used by WebSocket-based TTS providers like [DeepgramTTS](/guides/tts/deepgram-tts), [ElevenLabsTTS](/guides/tts/elevenlabs-tts), [CartesiaTTS](/guides/tts/cartesia-tts)).

For streaming playback, the player implements a buffering strategy:

1. Chunks arrive from the TTS provider and are pushed into an internal queue.
2. The player waits until the buffered duration meets `minBufferDuration` before starting playback.
3. Each chunk is decoded into an `AudioBuffer` (via `decodeAudioData`, with a raw-PCM fallback using `AudioMetadata`).
4. Chunks are played sequentially through `AudioBufferSourceNode` instances connected to the `AudioContext` destination.
5. When `enableSmoothing` is active, crossfading is applied between adjacent chunks to eliminate clicks at boundaries.

### AudioOutputConfig reference

| Option              | Type      | Default  | Description                                                                       |
|---------------------|-----------|----------|-----------------------------------------------------------------------------------|
| `bufferSize`        | `number`  | `4096`   | Buffer size in samples for audio processing.                                      |
| `minBufferDuration` | `number`  | `200`    | Minimum buffered audio (ms) before playback starts. Prevents choppy output.       |
| `sampleRate`        | `number`  | *auto*   | AudioContext sample rate. Defaults to the TTS provider's metadata or browser default. |
| `enableSmoothing`   | `boolean` | `true`   | Apply crossfading between chunks to eliminate clicks and pops at boundaries.       |

The defaults are exported as `DEFAULT_AUDIO_OUTPUT_CONFIG`:

```typescript
{
  bufferSize: 4096,
  minBufferDuration: 200,
  enableSmoothing: true,
}
```

### Managed audio vs. raw audio providers

Not all providers use the SDK's `AudioCapture` and `AudioPlayer`. The distinction matters when deciding which audio settings apply:

**Managed audio providers** handle their own audio I/O through browser APIs, bypassing the SDK's audio subsystems entirely:

- **[NativeSTT](/guides/stt/native-stt)** uses the Web Speech API (`SpeechRecognition`), which captures microphone audio internally. Your `AudioInputConfig` settings (sample rate, noise suppression, etc.) do not apply.
- **[NativeTTS](/guides/tts/native-tts)** uses the SpeechSynthesis API, which plays audio directly through the browser's built-in speech engine. Your `AudioOutputConfig` settings (buffer size, smoothing, etc.) do not apply.

**Raw audio providers** stream audio data through the SDK, and your configuration applies fully:

- **[DeepgramSTT](/guides/stt/deepgram-stt)**, **[AssemblyAISTT](/guides/stt/assemblyai-stt)** -- receive PCM chunks from `AudioCapture`. All input config options take effect.
- **[DeepgramTTS](/guides/tts/deepgram-tts)**, **[ElevenLabsTTS](/guides/tts/elevenlabs-tts)**, **[CartesiaTTS](/guides/tts/cartesia-tts)** -- send audio chunks to `AudioPlayer`. All output config options take effect.
- **[OpenAITTS](/guides/tts/openai-tts)** -- sends a complete audio blob to `AudioPlayer` for one-shot playback.

If you use NativeSTT or NativeTTS, the audio config is still accepted without error; it simply has no effect on those providers.

### When to adjust audio settings

**Mobile devices** -- mobile browsers often run at 48kHz natively. The SDK downsamples to your configured rate automatically, but you can reduce `chunkDuration` to 50ms for lower latency on fast connections, or increase it to 200ms to reduce processing overhead on slower devices:

```typescript
const agent = new CompositeVoice({
  stt, llm, tts,
  audio: {
    input: {
      sampleRate: 16000,
      chunkDuration: 200, // less frequent chunks, less CPU on mobile
    },
  },
});
```

**Noisy environments** -- all three browser audio processing features are enabled by default. If you find that noise suppression interferes with speech detection (rare), you can disable it selectively:

```typescript
audio: {
  input: {
    echoCancellation: true,
    noiseSuppression: false, // disable if it clips speech in your environment
    autoGainControl: true,
  },
}
```

**Low-latency needs** -- reduce `minBufferDuration` to start playback sooner. This risks audio glitches on slow networks, so test thoroughly:

```typescript
audio: {
  output: {
    minBufferDuration: 50,  // start playing after just 50ms of buffered audio
    bufferSize: 2048,       // smaller processing buffer
  },
}
```

**High-quality audio** -- if your TTS provider outputs 24kHz or 48kHz audio, match the output sample rate to avoid unnecessary resampling:

```typescript
audio: {
  output: {
    sampleRate: 24000, // match Deepgram Aura 2 output
  },
}
```

### Full configuration example

```typescript
import {
  CompositeVoice,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
} from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new DeepgramSTT({
    apiKey: 'your-deepgram-key',
    options: { model: 'nova-3', interimResults: true, endpointing: 300 },
  }),
  llm: new AnthropicLLM({
    apiKey: 'your-anthropic-key',
    model: 'claude-haiku-4-5-20251001',
    systemPrompt: 'You are a helpful voice assistant.',
    maxTokens: 200,
  }),
  tts: new DeepgramTTS({
    apiKey: 'your-deepgram-key',
    options: { model: 'aura-2-thalia-en', encoding: 'linear16', sampleRate: 24000 },
  }),
  audio: {
    input: {
      sampleRate: 16000,
      format: 'pcm',
      channels: 1,
      chunkDuration: 100,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    output: {
      bufferSize: 4096,
      minBufferDuration: 200,
      sampleRate: 24000,
      enableSmoothing: true,
    },
  },
});

await agent.initialize();
await agent.startListening();
```
