# CompositeVoice

[![npm version](https://badge.fury.io/js/%40lukeocodes%2Fcomposite-voice.svg)](https://www.npmjs.com/package/@lukeocodes/composite-voice)
[![CI](https://github.com/lukeocodes/composite-voice/actions/workflows/ci.yml/badge.svg)](https://github.com/lukeocodes/composite-voice/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

**An SDK for building AI voice agents — wire together any combination of input, STT, LLM, TTS, and output providers behind one unified 5-role pipeline.**

```typescript
import { CompositeVoice, AnthropicLLM } from '@lukeocodes/composite-voice';

// Text agent — NullInput + NullOutput auto-filled
const agent = new CompositeVoice({
  providers: [new AnthropicLLM({ apiKey: 'sk-ant-...', model: 'claude-haiku-4-5-20251001' })],
});

await agent.initialize();
// Add NativeSTT + NativeTTS for voice, or cloud providers for production audio.
```

---

## Why CompositeVoice?

Building a voice agent from scratch means solving many hard problems simultaneously: microphone capture, WebSocket reconnection, turn-taking logic, interleaving STT/LLM/TTS lifecycles, and stitching together provider SDKs that share nothing in common. It is easy to spend weeks before your first working demo.

CompositeVoice handles the plumbing. You declare the pipeline; the SDK runs it.

| Feature                         | What it means for you                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **5-role pipeline**             | Audio flows through 5 roles: `input → stt → llm → tts → output`. Each role is a pluggable provider. Multi-role providers (e.g., NativeSTT = input+stt) reduce boilerplate.                        |
| **Provider-agnostic**           | Deepgram, AssemblyAI, Soniox, Gladia, Anthropic, OpenAI, Groq, Gemini, Mistral, ElevenLabs, Cartesia, Speechify, Murf, LMNT, Smallest.ai, Rime, MiniMax, or browser built-ins — mix and match freely. Swapping a provider is one constructor change.                 |
| **Type-safe throughout**        | Every event payload, config option, and provider interface is fully typed. TypeScript autocomplete works end-to-end.                                                                              |
| **Zero-config text agent**      | Pass an empty providers array (or just an LLM) and the SDK defaults to a text-only agent — AnthropicLLM + NullInput + NullOutput. Add voice providers to progressively enhance. |
| **Smart text routing**          | LLM output is split into visual and spoken streams. Code fences are buffered and never sent to TTS. Markdown is stripped for natural speech while the UI gets full formatting.                    |
| **Event-driven**                | Subscribe to any stage of the pipeline: individual transcription words, LLM tokens, TTS audio chunks, queue stats, and state transitions.                                                         |
| **Race-condition-free**         | Audio frames are buffered in a queue during STT connection. No frames are ever lost, even when the WebSocket handshake takes time.                                                                |
| **Conversation memory**         | Multi-turn history that grows and trims automatically, included in every LLM call.                                                                                                                |
| **Eager LLM generation**        | Start generating a response before the user finishes speaking — cuts perceived latency noticeably.                                                                                                |
| **Server-side proxy**           | Keep API keys completely off the client. Proxy middleware included for Express, Next.js, and plain Node.js — supports all providers.                                                              |
| **Server-side pipelines**       | Run the full pipeline in Node.js, Bun, or Deno with `BufferInput` and `NullOutput` — no browser APIs required.                                                                                    |
| **Agent providers**             | Collapse STT + LLM + TTS into a single connection. `DeepgramAgent` uses one WebSocket to the Deepgram Voice Agent API — the SDK auto-fills mic input and speaker output.                          |
| **Extensible**                  | Abstract base classes for all 5 roles plus `BaseAgentProvider` for multi-role agents. The `OpenAICompatibleLLM` base class means any OpenAI-compatible API works out of the box.                   |

---

## Table of contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [5-role pipeline](#5-role-pipeline)
- [Provider roles](#provider-roles)
- [Providers](#providers)
- [Configuration](#configuration)
- [Events](#events)
- [Agent states](#agent-states)
- [Conversation history](#conversation-history)
- [Eager LLM pipeline](#eager-llm-pipeline)
- [Smart text routing](#smart-text-routing)
- [Tool use / function calling](#tool-use--function-calling)
- [Barge-in](#barge-in)
- [Turn-taking](#turn-taking)
- [Server-side proxy](#server-side-proxy)
- [Server-side usage](#server-side-usage)
- [Custom providers](#custom-providers)
- [Examples](#examples)
- [Browser support](#browser-support)
- [Contributing](#contributing)
- [Community](#community)
- [License](#license)

---

## Installation

```bash
pnpm add @lukeocodes/composite-voice
```

Node.js 18 or later is required.

Most providers use native `fetch` or native WebSocket — no SDKs to install. Optional peer dependencies:

```bash
pnpm add @mlc-ai/web-llm      # WebLLMLLM — in-browser inference (>=0.2.74)
pnpm add ws                   # server-side proxy WebSocket support, Node.js only (>=8.0.0)
```

Anthropic, OpenAI, Groq, Gemini, Mistral, Deepgram, AssemblyAI, Soniox, Gladia, ElevenLabs, Cartesia, Speechify, Murf, LMNT, Smallest.ai, Rime, and MiniMax providers all work with zero peer dependencies.

---

## Quick start

### Simplest setup — text agent, zero providers

Pass just an LLM (or even an empty array) and the SDK defaults to a text-only agent. NullInput and NullOutput are auto-filled — no microphone, no speaker. You interact via `agent.pushText()` and subscribe to LLM events.

```typescript
import { CompositeVoice, AnthropicLLM } from '@lukeocodes/composite-voice';

// Just an LLM — NullInput + NullOutput auto-filled for text-only mode
const agent = new CompositeVoice({
  providers: [new AnthropicLLM({ apiKey: 'sk-ant-...', model: 'claude-haiku-4-5-20251001' })],
});

// Or even zero providers — AnthropicLLM (claude-haiku-4-5) auto-filled too
// const agent = new CompositeVoice({ providers: [] });

agent.on('llm.chunk', (e) => process.stdout.write(e.chunk));
agent.on('agent.stateChange', (e) => console.log('State:', e.state));

await agent.initialize();
```

### Add voice — browser built-ins

Add NativeSTT and NativeTTS for a voice agent using the browser's Web Speech API and SpeechSynthesis. Works in Chrome and Edge.

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new NativeSTT({ language: 'en-US' }),
    new AnthropicLLM({
      apiKey: 'sk-ant-...',
      model: 'claude-haiku-4-5-20251001',
      systemPrompt: 'You are a helpful voice assistant. Keep responses brief.',
      maxTokens: 200,
    }),
    new NativeTTS(),
  ],
});

agent.on('transcription.final', (e) => console.log('You said:', e.text));
agent.on('llm.chunk', (e) => process.stdout.write(e.chunk));
agent.on('agent.stateChange', (e) => console.log('State:', e.state));

await agent.initialize();
await agent.startListening();
```

See [Example 00](./examples/00-minimal-voice-agent/) for a full runnable demo with UI.

### Production setup — cloud providers, auto-filled audio I/O

Supply cloud STT and TTS providers and the SDK auto-fills `MicrophoneInput` and `BrowserAudioOutput` for you. Audio is buffered between stages, eliminating the race condition where first frames could be lost during STT WebSocket handshake.

```typescript
import {
  CompositeVoice,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
} from '@lukeocodes/composite-voice';

// 3-provider config — MicrophoneInput + BrowserAudioOutput auto-filled
const agent = new CompositeVoice({
  providers: [
    new DeepgramSTT({
      apiKey: 'your-deepgram-key',
      options: {
        model: 'nova-3',
        smartFormat: true,
        interimResults: true,
        endpointing: 300,
      },
    }),
    new AnthropicLLM({
      apiKey: 'your-anthropic-key',
      model: 'claude-haiku-4-5-20251001',
      systemPrompt: 'You are a helpful voice assistant. Keep responses brief.',
      maxTokens: 200,
    }),
    new DeepgramTTS({
      apiKey: 'your-deepgram-key',
      options: { model: 'aura-2-thalia-en', encoding: 'linear16', sampleRate: 24000 },
    }),
  ],
});

await agent.initialize();
await agent.startListening();
```

See [Example 20](./examples/20-deepgram-pipeline/) for the full runnable demo.

---

## 5-role pipeline

Every voice agent follows the same 5-stage pipeline:

```
[InputProvider]  →  InputQueue  →  [STT]  →  [LLM]  →  [TTS]  →  OutputQueue  →  [OutputProvider]
     input             ↑           stt        llm        tts           ↑              output
                  buffers during                                 buffers during
                  STT connection                                 output setup
```

| Stage | Role     | What it does                 | Example providers                               |
| ----- | -------- | ---------------------------- | ----------------------------------------------- |
| 1     | `input`  | Captures audio from a source | `MicrophoneInput`, `BufferInput`, `NativeSTT`   |
| 2     | `stt`    | Converts audio to text       | `DeepgramSTT`, `AssemblyAISTT`, `NativeSTT`     |
| 3     | `llm`    | Generates a text response    | `AnthropicLLM`, `OpenAILLM`, `WebLLMLLM`        |
| 4     | `tts`    | Converts text to audio       | `DeepgramTTS`, `ElevenLabsTTS`, `NativeTTS`     |
| 5     | `output` | Plays audio to a destination | `BrowserAudioOutput`, `NullOutput`, `NativeTTS` |

Audio frames are buffered in queues between stages. The input queue holds frames while the STT WebSocket connects, then flushes them in order — no audio is ever lost. The output queue does the same for TTS-to-speaker handoff.

The agent state machine moves through well-defined states — `idle -> ready -> listening -> thinking -> speaking` — emitting events at every transition. Your UI subscribes to these events; the SDK manages the lifecycle.

---

## Provider roles

Every provider declares a `roles` property listing which pipeline slots it fills. The SDK resolves the full 5-role pipeline from a flat `providers` array.

### Multi-role providers

Some providers handle multiple roles. NativeSTT manages its own microphone internally (Web Speech API), so it covers both `input` and `stt`. NativeTTS manages its own speaker output, so it covers `tts` and `output`. These are explicit providers you add when you want voice — they are not auto-filled defaults.

```typescript
// Voice agent with browser built-ins — NativeSTT covers input+stt, NativeTTS covers tts+output
const agent = new CompositeVoice({
  providers: [
    new NativeSTT(),        // roles: ['input', 'stt']
    new AnthropicLLM({...}), // roles: ['llm']
    new NativeTTS(),        // roles: ['tts', 'output']
  ],
});
```

### Explicit 5-provider config

When using providers that handle a single role each, supply all 5:

```typescript
// 5-provider config — each role filled by a separate provider
const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput(),        // roles: ['input']
    new DeepgramSTT({...}),       // roles: ['stt']
    new AnthropicLLM({...}),      // roles: ['llm']
    new DeepgramTTS({...}),       // roles: ['tts']
    new BrowserAudioOutput(),     // roles: ['output']
  ],
});
```

### Defaults

When you omit certain roles, the SDK auto-fills them:

- **`input` + `stt` both uncovered** → auto-fills with `NullInput` (text-only, no microphone)
- **`tts` + `output` both uncovered** → auto-fills with `NullOutput` (text-only, no speaker)
- **`llm` uncovered** → auto-fills with `AnthropicLLM` (`claude-haiku-4-5`)
- **`stt` provided without `input`** → auto-fills with `MicrophoneInput`
- **`tts` provided without `output`** → auto-fills with `BrowserAudioOutput`

This means the minimal config is an empty providers array (text-only agent with AnthropicLLM):

```typescript
// Zero-config — AnthropicLLM + NullInput + NullOutput auto-filled
const agent = new CompositeVoice({ providers: [] });

// Or just an LLM — NullInput + NullOutput auto-filled for text-only mode
const agent = new CompositeVoice({
  providers: [new AnthropicLLM({ apiKey: '...', model: 'claude-haiku-4-5-20251001' })],
});
```

---

## Providers

### Audio Input

| Provider          | Environment   | Roles           | Peer dependency |
| ----------------- | ------------- | --------------- | --------------- |
| `MicrophoneInput` | Browser       | `input`         | None            |
| `BufferInput`     | Node/Bun/Deno | `input`         | None            |
| `NativeSTT`       | Browser       | `input` + `stt` | None            |

`MicrophoneInput` wraps the browser's `getUserMedia` + `AudioContext` into a provider. `BufferInput` accepts pushed `ArrayBuffer` data for server-side pipelines. `NativeSTT` manages its own microphone internally.

### Speech-to-Text (STT)

| Provider        | Transport      | Browser support     | Peer dependency |
| --------------- | -------------- | ------------------- | --------------- |
| `NativeSTT`     | Web Speech API | Chrome, Edge        | None            |
| `DeepgramSTT`   | WebSocket      | All modern browsers | None            |
| `DeepgramFlux`  | WebSocket      | All modern browsers | None            |
| `AssemblyAISTT` | WebSocket      | All modern browsers | None            |
| `ElevenLabsSTT` | WebSocket      | All modern browsers | None            |
| `SonioxSTT`     | WebSocket      | All modern browsers | None            |
| `GladiaSTT`     | HTTP init + WebSocket | All modern browsers | None     |

All STT providers emit an `utteranceComplete: true` flag on transcription results to signal when an utterance is ready for LLM processing. This flag is the canonical trigger for LLM generation. The `speechFinal` event is retained for display purposes but is deprecated as the LLM trigger — use `utteranceComplete` instead.

**`NativeSTT` options:**

```typescript
new NativeSTT({
  language: 'en-US', // BCP-47 language tag
  continuous: true, // keep listening between pauses
  interimResults: true, // emit partial results while speaking
  startTimeout: 5000, // ms before erroring if no audio detected
});
```

**`DeepgramSTT` options (V1/Nova):**

```typescript
new DeepgramSTT({
  apiKey: 'your-key', // omit and use proxyUrl for server-side key injection
  language: 'en-US',
  options: {
    model: 'nova-3', // nova-3 = best accuracy
    smartFormat: true,
    punctuation: true,
    interimResults: true,
    endpointing: 300, // ms of silence before speech_final fires
    vadEvents: true,
  },
});
```

**`DeepgramFlux` options (V2/Flux — supports eager LLM):**

```typescript
new DeepgramFlux({
  apiKey: 'your-key', // omit and use proxyUrl for server-side key injection
  options: {
    model: 'flux-general-en',
    eagerEotThreshold: 0.5, // enables eager end-of-turn signals
    eotThreshold: 0.7,
  },
});
```

**`AssemblyAISTT` options:**

```typescript
new AssemblyAISTT({
  apiKey: 'your-key', // omit and use proxyUrl for server-side key injection
  language: 'en', // language code
  sampleRate: 16000, // audio sample rate in Hz
  wordBoost: ['CompositeVoice'], // boost recognition of specific words
  interimResults: true, // partial transcripts while speaking
});
```

**`ElevenLabsSTT` options:**

```typescript
new ElevenLabsSTT({
  apiKey: 'your-key', // omit and use proxyUrl for server-side key injection
  model: 'scribe_v2_realtime', // default model
  audioFormat: 'pcm_16000', // audio format
  language: 'en', // BCP 47, ISO 639-1, or ISO 639-3
  commitStrategy: 'vad', // 'vad' (default) or 'manual'
  includeTimestamps: true, // word-level timestamps
});
```

**`SonioxSTT` options:**

```typescript
new SonioxSTT({
  apiKey: 'your-key', // omit and use proxyUrl for server-side key injection
  model: 'stt-rt-v5', // default real-time model
  audioFormat: 'pcm_s16le', // raw format, or 'auto' for container formats
  sampleRate: 16000, // audio sample rate in Hz
  languageHints: ['en', 'es'], // bias recognition (auto-detects 60+ languages)
  enableEndpointDetection: true, // default — finalizes utterances on silence
});
```

**`GladiaSTT` options:**

```typescript
new GladiaSTT({
  apiKey: 'your-key', // omit and use proxyUrl for server-side key injection
  model: 'solaria-1', // default live transcription model
  encoding: 'wav/pcm', // 'wav/pcm' (default), 'wav/alaw', or 'wav/ulaw'
  sampleRate: 16000, // audio sample rate in Hz
  languages: ['en', 'es'], // pin or restrict language detection
  endpointing: 0.3, // seconds of silence before finalizing an utterance
});
```

### Language Models (LLM)

| Provider              | Transport         | Peer dependency    | Notes                                                   |
| --------------------- | ----------------- | ------------------ | ------------------------------------------------------- |
| `AnthropicLLM`        | HTTP streaming    | None               | Claude models. Streams by default. **Pipeline default.** |
| `OpenAILLM`           | HTTP              | None               | GPT models.                                             |
| `GroqLLM`             | HTTP              | None               | Groq-hosted models. Ultra-fast inference.               |
| `GeminiLLM`           | HTTP              | None               | Google Gemini models via OpenAI-compatible API.         |
| `MistralLLM`          | HTTP              | None               | Mistral open and commercial models.                     |
| `WebLLMLLM`           | In-browser WebGPU | `@mlc-ai/web-llm`  | Fully offline. No API keys. Runs entirely client-side.  |
| `OpenAICompatibleLLM` | HTTP              | None               | Base class — extend for any OpenAI-compatible endpoint. |

**`AnthropicLLM` options:**

```typescript
new AnthropicLLM({
  apiKey: 'your-key', // omit and use proxyUrl for server-side key injection
  model: 'claude-haiku-4-5-20251001',
  systemPrompt: 'You are a helpful voice assistant.',
  maxTokens: 200,
  temperature: 0.7,
  stream: true, // default: true
});
```

**`OpenAILLM` options:**

```typescript
new OpenAILLM({
  apiKey: 'your-key', // omit and use proxyUrl for server-side key injection
  model: 'gpt-4o-mini',
  systemPrompt: 'You are a helpful voice assistant.',
  maxTokens: 200,
  temperature: 0.7,
});
```

**`GroqLLM` options:**

```typescript
new GroqLLM({
  apiKey: 'your-key', // or groqApiKey; omit and use proxyUrl for proxy mode
  model: 'llama-3.3-70b-versatile', // default model
  systemPrompt: 'You are a helpful voice assistant.',
  maxTokens: 200,
});
```

**`GeminiLLM` options:**

```typescript
new GeminiLLM({
  apiKey: 'your-key', // or geminiApiKey; omit and use proxyUrl for proxy mode
  model: 'gemini-2.0-flash', // default model
  systemPrompt: 'You are a helpful voice assistant.',
  maxTokens: 200,
});
```

**`MistralLLM` options:**

```typescript
new MistralLLM({
  apiKey: 'your-key', // or mistralApiKey; omit and use proxyUrl for proxy mode
  model: 'mistral-small-latest', // default model
  systemPrompt: 'You are a helpful voice assistant.',
  maxTokens: 200,
});
```

**`WebLLMLLM` options:**

```typescript
new WebLLMLLM({
  model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', // runs entirely in-browser via WebGPU
  onLoadProgress: (progress) => console.log(progress), // model download progress
  chatOpts: { context_window_size: 2048 }, // optional model config overrides
});
```

### Text-to-Speech (TTS)

| Provider        | Transport           | Browser support     | Peer dependency |
| --------------- | ------------------- | ------------------- | --------------- |
| `NativeTTS`     | SpeechSynthesis API | All modern browsers | None            |
| `DeepgramTTS`   | WebSocket           | All modern browsers | None            |
| `OpenAITTS`     | HTTP (REST)         | All modern browsers | None            |
| `ElevenLabsTTS` | WebSocket           | All modern browsers | None            |
| `CartesiaTTS`   | WebSocket           | All modern browsers | None            |
| `SpeechifyTTS`  | HTTP (REST)         | All modern browsers | None            |
| `MurfTTS`       | HTTP (REST)         | All modern browsers | None            |
| `LMNTTTS`       | HTTP (REST)         | All modern browsers | None            |
| `SmallestTTS`   | HTTP (REST)         | All modern browsers | None            |
| `RimeTTS`       | HTTP (REST)         | All modern browsers | None            |
| `MiniMaxTTS`    | HTTP (REST)         | All modern browsers | None            |

**`NativeTTS` options:**

```typescript
new NativeTTS({
  rate: 1.0, // speech rate (0.1 – 10)
  pitch: 1.0, // voice pitch (0 – 2)
  volume: 1.0, // volume (0 – 1)
  preferLocal: true, // prefer on-device voices over cloud voices
});
```

**`DeepgramTTS` options:**

```typescript
new DeepgramTTS({
  apiKey: 'your-key', // omit and use proxyUrl for server-side key injection
  options: {
    model: 'aura-2-thalia-en',
    encoding: 'linear16',
    sampleRate: 24000,
  },
});
```

**`OpenAITTS` options:**

```typescript
new OpenAITTS({
  apiKey: 'your-key', // omit and use proxyUrl for server-side key injection
  model: 'tts-1', // 'tts-1' (fast) or 'tts-1-hd' (quality)
  voice: 'alloy', // 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
  responseFormat: 'mp3', // 'mp3' | 'opus' | 'aac' | 'flac' | 'wav'
  speed: 1.0, // 0.25 – 4.0
});
```

**`ElevenLabsTTS` options:**

```typescript
new ElevenLabsTTS({
  apiKey: 'your-key', // omit and use proxyUrl for server-side key injection
  voiceId: 'your-voice-id', // required — ElevenLabs voice ID
  modelId: 'eleven_turbo_v2_5', // fast low-latency model
  stability: 0.5, // voice stability (0 – 1)
  similarityBoost: 0.75, // similarity boost (0 – 1)
  outputFormat: 'pcm_16000', // 'pcm_16000' | 'pcm_22050' | 'pcm_24000' | 'mp3_44100_128' | ...
});
```

**`CartesiaTTS` options:**

```typescript
new CartesiaTTS({
  apiKey: 'your-key', // omit and use proxyUrl for server-side key injection
  voiceId: 'your-voice-id', // required — Cartesia voice ID
  modelId: 'sonic-2', // 'sonic-2' | 'sonic' | 'sonic-multilingual'
  language: 'en', // language code
  outputSampleRate: 16000, // sample rate in Hz
  speed: 1.0, // speech speed multiplier
  emotion: ['positivity:high'], // emotion tags for voice expression
});
```

**`SpeechifyTTS` options:**

```typescript
new SpeechifyTTS({
  apiKey: 'your-key', // omit and use proxyUrl for server-side key injection
  voiceId: 'geffen_32', // required — Speechify voice ID (catalog or cloned)
  model: 'simba-english', // 'simba-english' | 'simba-multilingual' | 'simba-3.0' | 'simba-3.2'
  audioFormat: 'mp3', // 'mp3' | 'wav' | 'ogg' | 'aac'
  language: 'en-US', // optional — auto-detected when omitted
});
```

**`MurfTTS` options:**

```typescript
new MurfTTS({
  apiKey: 'your-key', // omit and use proxyUrl for server-side key injection
  voiceId: 'en-US-natalie', // required — Murf voice ID from GET /v1/speech/voices
  modelVersion: 'GEN2', // Murf model generation (default)
  format: 'mp3', // 'mp3' | 'wav' | 'flac' | 'alaw' | 'ulaw'
  style: 'Conversational', // optional — per-voice speaking style
  rate: 0, // -50 to 50 speech rate
  pitch: 0, // -50 to 50 voice pitch
  variation: 1, // 0 to 5 — pause/pitch/speed variation
});
```

**`LMNTTTS` options:**

```typescript
new LMNTTTS({
  apiKey: 'your-key', // omit and use proxyUrl for server-side key injection
  voice: 'leah', // required — LMNT voice ID (catalog or cloned)
  model: 'blizzard', // LMNT's current speech model
  format: 'mp3', // 'mp3' | 'wav' | 'aac' | 'ulaw' | 'webm' | 'pcm_s16le' | 'pcm_f32le'
  sampleRate: 24000, // 8000 | 16000 | 24000
  language: 'en', // optional — auto-detected when omitted
  temperature: 0.7, // expressiveness (lower = more neutral)
  topP: 0.9, // stability (lower = more consistent)
});
```

**`SmallestTTS` options:**

```typescript
new SmallestTTS({
  apiKey: 'your-key', // omit and use proxyUrl for server-side key injection
  voiceId: 'meher', // required — Waves voice ID (catalog or cloned)
  model: 'lightning_v3.1', // 'lightning_v3.1' | 'lightning_v3.1_pro'
  outputFormat: 'wav', // 'wav' | 'mp3' | 'pcm' | 'ulaw' | 'alaw'
  sampleRate: 44100, // 8000 | 16000 | 24000 | 44100
  speed: 1.0, // 0.5 – 2.0
  language: 'en', // ISO 639-1 code matching the voice
});
```

**`RimeTTS` options:**

```typescript
new RimeTTS({
  apiKey: 'your-key', // omit and use proxyUrl for server-side key injection
  speaker: 'astra', // required — Rime voice from the per-model catalogs
  model: 'arcana', // 'coda' | 'arcana' | 'arcanav3' | 'arcanav2' | 'mistv3' | 'mistv2'
  audioFormat: 'mp3', // 'mp3' | 'wav' | 'ogg' | 'webm' | 'pcm' | 'mulaw'
  language: 'en', // ISO 639-1 or 639-2/3 code
  samplingRate: 24000, // output sample rate in Hz
});
```

**`MiniMaxTTS` options:**

```typescript
new MiniMaxTTS({
  apiKey: 'your-key', // omit and use proxyUrl for server-side key injection
  voiceId: 'English_expressive_narrator', // required — MiniMax system or cloned voice ID
  model: 'speech-02-hd', // speech-2.8/2.6/02/01, each in -hd and -turbo variants
  audioFormat: 'mp3', // 'mp3' | 'wav' | 'flac' | 'pcm'
  emotion: 'calm', // optional emotion control
  groupId: 'your-group-id', // optional — only for older group-scoped API keys
});
```

### Agent Providers

Agent providers collapse the three middle pipeline roles (`stt` + `llm` + `tts`) into a single connection. Instead of wiring up separate STT, LLM, and TTS providers, one agent provider handles the entire server-side loop over a single WebSocket. The SDK auto-fills `MicrophoneInput` and `BrowserAudioOutput` for audio I/O, so a working voice agent requires just one provider in your config.

| Provider        | Transport | Roles               | Peer Dependency | Description                                                                    |
| --------------- | --------- | ------------------- | --------------- | ------------------------------------------------------------------------------ |
| `DeepgramAgent` | WebSocket | `stt` + `llm` + `tts` | None            | Deepgram Voice Agent API — single WebSocket handles STT, LLM, and TTS server-side |

### Audio Output

| Provider             | Environment   | Roles            | Peer dependency |
| -------------------- | ------------- | ---------------- | --------------- |
| `BrowserAudioOutput` | Browser       | `output`         | None            |
| `NullOutput`         | Node/Bun/Deno | `output`         | None            |
| `NativeTTS`          | Browser       | `tts` + `output` | None            |

`BrowserAudioOutput` wraps the browser's `AudioContext` for speaker playback. `NullOutput` silently discards audio for server-side pipelines. `NativeTTS` manages its own speaker output internally via the SpeechSynthesis API.

---

## Configuration

Full `CompositeVoice` configuration reference:

```typescript
const agent = new CompositeVoice({
  // Required: array of provider instances covering the 5 pipeline roles
  providers: [
    new MicrophoneInput({ sampleRate: 16000 }),
    new DeepgramSTT({ apiKey: '...' }),
    new AnthropicLLM({ apiKey: '...' }),
    new DeepgramTTS({ apiKey: '...' }),
    new BrowserAudioOutput(),
  ],

  // Audio buffer queue tuning (for separate input/STT and TTS/output providers)
  queue: {
    input: { maxSize: 2000, overflowStrategy: 'drop-oldest' },
    output: { maxSize: 500 },
  },

  // Conversation memory (disabled by default)
  conversationHistory: {
    enabled: true,
    maxTurns: 10, // 0 = unlimited; each turn = one user + assistant exchange
    maxTokens: 4000, // approximate token budget (chars/4 heuristic)
    preserveSystemMessages: true, // keep system messages during trimming (default: true)
  },

  // Eager/speculative LLM generation (requires DeepgramFlux)
  eagerLLM: {
    enabled: true,
    cancelOnTextChange: true, // restart generation if the preflight transcript was wrong
    similarityThreshold: 0.8, // word-overlap threshold for accepting speculative response
  },

  // Turn-taking: whether to pause the mic during TTS playback
  turnTaking: {
    pauseCaptureOnPlayback: 'auto', // 'auto' | true | false (default: 'auto')
    autoStrategy: 'conservative', // 'conservative' | 'aggressive' | 'detect' (default: 'conservative')
  },

  // Logging
  logging: {
    enabled: true,
    level: 'info', // 'debug' | 'info' | 'warn' | 'error'
  },

  // LLM→TTS backpressure
  pipeline: {
    maxPendingChunks: 10, // pause LLM if TTS has 10+ unprocessed chunks
  },

  // WebSocket reconnection (applies to Deepgram providers)
  reconnection: {
    enabled: true, // required — enables reconnection
    maxAttempts: 5,
    initialDelay: 1000, // ms before first retry
    maxDelay: 30000, // cap on retry interval
    backoffMultiplier: 2, // exponential backoff factor
  },

  // Automatic error recovery
  autoRecover: true,

  // Recovery strategy (when autoRecover is true)
  recovery: {
    maxAttempts: 3,
    initialDelay: 1000,
    backoffMultiplier: 2,
    maxDelay: 10000,
  },
});
```

---

## Events

Subscribe to any part of the voice pipeline with a type-safe event system:

```typescript
agent.on('event.name', handler); // subscribe
agent.off('event.name', handler); // unsubscribe
agent.once('event.name', handler); // fire once, then auto-unsubscribe
```

### Agent events

| Event               | Payload                            | Description                                  |
| ------------------- | ---------------------------------- | -------------------------------------------- |
| `agent.ready`       | —                                  | SDK initialized and ready to start listening |
| `agent.stateChange` | `{ state, previousState }`         | Agent moved to a new state                   |
| `agent.error`       | `{ error, recoverable, context? }` | System-level error                           |

### Transcription events

| Event                       | Payload                 | Description                                                                                                     |
| --------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `transcription.start`       | —                       | Transcription session opened                                                                                    |
| `transcription.interim`     | `{ text, confidence? }` | Partial transcript — updates word by word while the user is speaking                                            |
| `transcription.final`       | `{ text, confidence? }` | Confirmed transcript segment                                                                                    |
| `transcription.speechFinal` | `{ text, confidence? }` | Full utterance ended. The `utteranceComplete` flag on the transcription result is what triggers LLM processing. |
| `transcription.preflight`   | `{ text, confidence? }` | Early end-of-turn signal (DeepgramFlux only)                                                                    |
| `transcription.error`       | `{ error }`             | Transcription error                                                                                             |

### LLM events

| Event          | Payload                  | Description                        |
| -------------- | ------------------------ | ---------------------------------- |
| `llm.start`    | `{ prompt }`             | LLM generation started             |
| `llm.chunk`    | `{ chunk, accumulated }` | Text token received from the model |
| `llm.complete` | `{ text, tokensUsed? }`  | Full response assembled            |
| `llm.error`    | `{ error }`              | LLM error                          |

### TTS events

| Event          | Payload        | Description                                            |
| -------------- | -------------- | ------------------------------------------------------ |
| `tts.start`    | `{ text }`     | Synthesis started                                      |
| `tts.audio`    | `{ chunk }`    | Audio chunk ready for playback                         |
| `tts.metadata` | `{ metadata }` | Audio format metadata                                  |
| `tts.complete` | —              | Synthesis complete (playback may still be in progress) |
| `tts.error`    | `{ error }`    | TTS error                                              |

### Audio events

| Event                  | Payload     | Description            |
| ---------------------- | ----------- | ---------------------- |
| `audio.capture.start`  | —           | Microphone opened      |
| `audio.capture.stop`   | —           | Microphone closed      |
| `audio.capture.error`  | `{ error }` | Capture failure        |
| `audio.playback.start` | —           | Audio playback started |
| `audio.playback.end`   | —           | Audio playback ended   |
| `audio.playback.error` | `{ error }` | Playback failure       |

### Queue events

| Event            | Payload                                                             | Description                                     |
| ---------------- | ------------------------------------------------------------------- | ----------------------------------------------- |
| `queue.overflow` | `{ queueName, droppedChunks, currentSize }`                         | Queue exceeded `maxSize`, chunks were dropped   |
| `queue.stats`    | `{ queueName, size, totalEnqueued, totalDequeued, oldestChunkAge }` | Pipeline health snapshot from `getQueueStats()` |

```typescript
agent.on('queue.overflow', (e) => {
  console.warn(`Queue "${e.queueName}" dropped ${e.droppedChunks} chunks (size: ${e.currentSize})`);
});

agent.on('queue.stats', (e) => {
  console.log(`Queue "${e.queueName}": ${e.size} buffered, ${e.totalEnqueued} total`);
});
```

---

## Agent states

The agent moves through a well-defined state machine. Every transition emits an `agent.stateChange` event so your UI can always reflect what the agent is doing.

```
idle -> ready -> listening -> thinking -> speaking
                    ^                       |
                    |_______________________|
                              |
                           (error)
```

| State       | Description                                          |
| ----------- | ---------------------------------------------------- |
| `idle`      | Not yet initialized                                  |
| `ready`     | Initialized, waiting to start                        |
| `listening` | Capturing audio and transcribing                     |
| `thinking`  | LLM is generating a response                         |
| `speaking`  | TTS audio is playing                                 |
| `error`     | Recoverable error — call `startListening()` to retry |

```typescript
agent.on('agent.stateChange', ({ state, previousState }) => {
  console.log(`${previousState} -> ${state}`);
});
```

The `error` state is recoverable. The agent does not shut down on errors — it waits for you to call `startListening()` again, which lets you add your own retry UI or backoff logic.

---

## Conversation history

Enable multi-turn memory so the LLM remembers previous exchanges within a session. Without this, each user utterance is sent to the LLM in isolation.

```typescript
const agent = new CompositeVoice({
  providers: [stt, llm, tts],
  conversationHistory: {
    enabled: true,
    maxTurns: 10, // keep last 10 user + assistant pairs; 0 = unlimited
  },
});
```

Each completed turn is automatically appended and included in the next LLM call:

```
You:  "My name is Sam."
AI:   "Nice to meet you, Sam!"
You:  "What's my name?"
AI:   "Your name is Sam."   // LLM remembers the earlier exchange
```

Access and manage history programmatically:

```typescript
// Retrieve the full conversation as an array of LLMMessage objects
const history = agent.getHistory();

// Wipe the history without reinitializing the agent
agent.clearHistory();
```

See [Example 01](./examples/01-conversation-history/) for a demo with a full chat-thread UI.

---

## Eager LLM pipeline

With the [DeepgramFlux](./apps/docs/src/content/docs/guides/stt/deepgram-flux.md) provider, the SDK can begin LLM generation before the user finishes speaking. DeepgramFlux emits a `preflight` event — an early end-of-turn prediction — which the SDK uses to speculatively start the LLM. If the final transcript is sufficiently similar to the preflight (based on `similarityThreshold`), the response continues uninterrupted. If it differs significantly, generation restarts with the correct text.

**Enabling eager LLM:**

```typescript
const agent = new CompositeVoice({
  providers: [
    new DeepgramFlux({
      apiKey: 'your-key',
      options: { model: 'flux-general-en', eagerEotThreshold: 0.5 },
    }),
    llm,
    tts,
  ],
  eagerLLM: {
    enabled: true,
    cancelOnTextChange: true, // restart if the preflight text diverged
    similarityThreshold: 0.8, // 80% word overlap required to keep response
  },
});
```

**How it works:**

```
User is still speaking
        |
        v
preflight fires  -->  LLM starts generating (speculative)
        |
        v
speech_final arrives
        |
        +---> text unchanged?  -->  LLM continues streaming uninterrupted
        |
        +---> text changed?    -->  LLM cancelled, restarts with correct text
```

The result is noticeably lower perceived latency on natural speech patterns where the end of an utterance is predictable. See [Example 21](./examples/21-eager-pipeline/) for a demo with real-time pipeline timing.

---

## Smart text routing

LLM responses often contain markdown, code blocks, and formatting that sounds terrible when read aloud by TTS. CompositeVoice automatically splits LLM output into separate **visual** and **spoken** streams:

- **Code fences** are buffered entirely and never sent to TTS — no more hearing "opening backtick backtick backtick javascript function hello..."
- **Markdown** is stripped from the spoken stream (headings, bold, links, lists) while the visual stream preserves full formatting for the UI
- **Partial fences** are held in a buffer until the closing fence arrives, so incomplete code blocks never leak to either stream

```typescript
// Subscribe to the visual stream (full markdown + code) for your UI
voice.on('llm.chunk', ({ chunk }) => appendToUI(chunk));

// The spoken stream is handled automatically — TTS receives clean text only
// No configuration needed; smart routing is built into the pipeline
```

The routing is handled by `LLMTextRouter` and `ChunkSplitter` internally. The TTS provider receives pre-processed text via `ttsStrip`, which removes markdown syntax while preserving natural sentence structure.

---

## Tool use / function calling

LLM providers that implement `ToolAwareLLMProvider` can invoke tools (function calls) during generation. Currently, `AnthropicLLM` supports this. Text output is streamed to TTS as usual, while tool calls are handled via the `onToolCall` callback. After tool execution, the LLM is called again with the tool result to generate a natural language follow-up.

```typescript
const voice = new CompositeVoice({
  providers: [
    new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
    new AnthropicLLM({ proxyUrl: '/api/proxy/anthropic', model: 'claude-sonnet-4-6' }),
    new DeepgramTTS({ proxyUrl: '/api/proxy/deepgram' }),
  ],
  tools: {
    definitions: [
      {
        name: 'get_weather',
        description: 'Get the current weather for a location',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'City name' },
          },
          required: ['location'],
        },
      },
    ],
    onToolCall: async (toolCall) => {
      // Execute the tool and return the result
      const weather = await fetchWeather(toolCall.arguments.location);
      return { result: JSON.stringify(weather) };
    },
  },
});
```

> **Note:** Tool use is supported by `AnthropicLLM` and all OpenAI-compatible providers (`OpenAILLM`, `GroqLLM`, `GeminiLLM`, `MistralLLM`, `OpenAICompatibleLLM`) via the `ToolAwareLLMProvider` interface. `WebLLMLLM` does not support tools.

---

## Barge-in

The SDK automatically interrupts the agent when the user speaks while the agent is in the `thinking` or `speaking` state. This is called **barge-in** — the user can cut in at any time without waiting for the agent to finish.

When barge-in is triggered, the SDK:

1. Aborts the in-flight LLM generation (via `AbortSignal`)
2. Clears the TTS output queue
3. Resets the TTS provider
4. Transitions back to `listening` state

Barge-in happens automatically when the STT provider detects speech during agent output. You can also trigger it programmatically:

```typescript
// Programmatic barge-in — immediately stop the agent and return to listening
agent.stopSpeaking();
```

No configuration is required — barge-in is always active.

---

## Turn-taking

Turn-taking controls whether the microphone is paused while the AI is speaking. The right strategy depends on whether your audio setup provides echo cancellation.

```typescript
const agent = new CompositeVoice({
  providers: [stt, llm, tts],
  turnTaking: {
    pauseCaptureOnPlayback: 'auto',
    autoStrategy: 'conservative',
  },
});
```

| `pauseCaptureOnPlayback` | `autoStrategy`             | Behaviour                                                                                                                                                                     |
| ------------------------ | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'auto'` (default)       | `'conservative'` (default) | Pauses the mic for `NativeSTT` (no echo cancellation); leaves it open for `DeepgramSTT` (relies on hardware echo cancellation). When pausing, uses the conservative strategy. |
| `true`                   | —                          | Always pauses the mic during TTS playback. Safe choice if you are unsure about echo cancellation.                                                                             |
| `false`                  | —                          | Never pauses. Only suitable with reliable hardware echo cancellation.                                                                                                         |
| `'auto'`                 | `'detect'`                 | Attempts to detect echo cancellation support at runtime before choosing a strategy.                                                                                           |
| `'auto'`                 | `'aggressive'`             | When auto-detection decides to pause, uses the aggressive strategy (shorter pause windows).                                                                                   |

---

## Server-side proxy

Keep API keys completely out of the browser. The proxy middleware forwards browser requests to provider APIs and injects credentials server-side. Your deployed client bundle contains zero secrets.

The proxy supports all API-based providers: Deepgram, Anthropic, OpenAI, Groq, Gemini, Mistral, AssemblyAI, Soniox, Gladia, ElevenLabs, Cartesia, Speechify, Murf, LMNT, Smallest.ai, Rime, and MiniMax. (Browser built-ins and WebLLM run locally and need no proxy.)

### Express

```typescript
import express from 'express';
import { createServer } from 'http';
import { createExpressProxy } from '@lukeocodes/composite-voice/proxy';

const app = express();
const server = createServer(app);

const proxy = createExpressProxy({
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  groqApiKey: process.env.GROQ_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  mistralApiKey: process.env.MISTRAL_API_KEY,
  assemblyaiApiKey: process.env.ASSEMBLYAI_API_KEY,
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,
  cartesiaApiKey: process.env.CARTESIA_API_KEY,
  speechifyApiKey: process.env.SPEECHIFY_API_KEY,
  murfApiKey: process.env.MURF_API_KEY,
  lmntApiKey: process.env.LMNT_API_KEY,
  smallestApiKey: process.env.SMALLEST_API_KEY,
  rimeApiKey: process.env.RIME_API_KEY,
  minimaxApiKey: process.env.MINIMAX_API_KEY,
  sonioxApiKey: process.env.SONIOX_API_KEY,
  gladiaApiKey: process.env.GLADIA_API_KEY,
  pathPrefix: '/proxy',
});

app.use(proxy.middleware);
proxy.attachWebSocket(server); // required for WebSocket connections

app.use(express.static('dist'));
server.listen(3010);
```

### Next.js App Router

```typescript
// app/proxy/[...path]/route.ts
import { createNextJsProxy } from '@lukeocodes/composite-voice/proxy';

const proxy = createNextJsProxy({
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
});

export const GET = proxy.handler;
export const POST = proxy.handler;
```

### Plain Node.js

```typescript
import { createServer } from 'http';
import { createNodeProxy } from '@lukeocodes/composite-voice/proxy';

const proxy = createNodeProxy({
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  pathPrefix: '/proxy',
});

const server = createServer(proxy.handler);
proxy.attachWebSocket(server);
server.listen(3010);
```

### Browser side

Replace `apiKey` with `proxyUrl` in any provider config. The provider will route requests through your server instead of calling the provider API directly.

```typescript
const stt = new DeepgramSTT({
  proxyUrl: `${window.location.origin}/proxy/deepgram`,
  options: { model: 'nova-3', interimResults: true, endpointing: 300 },
});

const llm = new AnthropicLLM({
  proxyUrl: `${window.location.origin}/proxy/anthropic`,
  model: 'claude-haiku-4-5-20251001',
  systemPrompt: 'You are a helpful voice assistant.',
  maxTokens: 200,
});

const tts = new DeepgramTTS({
  proxyUrl: `${window.location.origin}/proxy/deepgram`,
  options: { model: 'aura-2-thalia-en', encoding: 'linear16', sampleRate: 24000 },
});

const agent = new CompositeVoice({ providers: [stt, llm, tts] });
```

See [Example 10](./examples/10-proxy-server/) for a complete production-ready setup.

### Proxy security

The proxy supports optional security middleware for rate limiting, body size limits, WebSocket message size limits, and custom authentication. All options are opt-in — when omitted, the proxy behaves identically to a proxy without the `security` field.

```typescript
const proxy = createExpressProxy({
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  security: {
    rateLimit: { maxRequests: 100, windowMs: 60000 },
    maxBodySize: 1024 * 1024, // 1 MB
    maxWsMessageSize: 64 * 1024, // 64 KB
    authenticate: (req) => {
      return req.headers['x-api-token'] === process.env.APP_TOKEN;
    },
  },
});
```

| Option             | What it does                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `rateLimit`        | Per-IP request throttling. Requests over the limit receive `429 Too Many Requests`.                                                        |
| `maxBodySize`      | Rejects HTTP bodies larger than the limit with `413 Payload Too Large`.                                                                    |
| `maxWsMessageSize` | Closes WebSocket connections that send messages exceeding the limit (code 1009).                                                           |
| `authenticate`     | Custom auth function — return `true` to allow, `false` to reject with `401`. Called for both HTTP requests and WebSocket upgrade requests. |

---

## Server-side usage

The SDK runs outside the browser. Use `BufferInput` and `NullOutput` for Node.js, Bun, or Deno pipelines where there is no microphone or speaker.

```typescript
import {
  CompositeVoice,
  BufferInput,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
  NullOutput,
} from '@lukeocodes/composite-voice';

// Define the audio format you will push
const input = new BufferInput({
  sampleRate: 16000,
  encoding: 'linear16',
  channels: 1,
  bitDepth: 16,
});

const agent = new CompositeVoice({
  providers: [
    input,
    new DeepgramSTT({ apiKey: process.env.DEEPGRAM_API_KEY }),
    new AnthropicLLM({ apiKey: process.env.ANTHROPIC_API_KEY, model: 'claude-haiku-4-5-20251001' }),
    new DeepgramTTS({ apiKey: process.env.DEEPGRAM_API_KEY }),
    new NullOutput(),
  ],
});

await agent.initialize();
await agent.startListening();

// Push audio from any source (file, stream, WebSocket, etc.)
input.push(audioBuffer);
```

`BufferInput` and `NullOutput` have zero browser dependencies — no `navigator`, `window`, or `AudioContext`.

---

## Custom providers

All built-in providers implement abstract base classes. You can plug in any provider for any of the 5 pipeline roles by extending the appropriate base class and emitting the expected events.

### Base classes and interfaces

| Base class / Interface | Role     | Use for                                                          |
| ---------------------- | -------- | ---------------------------------------------------------------- |
| `AudioInputProvider`   | `input`  | Custom audio capture (microphone, file, stream)                  |
| `BaseSTTProvider`      | `stt`    | Any speech-to-text provider                                      |
| `BaseLLMProvider`      | `llm`    | Any language model                                               |
| `OpenAICompatibleLLM`  | `llm`    | Any LLM with an OpenAI-compatible API (Groq, Gemini, Mistral...) |
| `BaseTTSProvider`      | `tts`    | Any text-to-speech provider                                      |
| `BaseAgentProvider`    | `stt` + `llm` + `tts` | Agent providers that handle STT, LLM, and TTS in one connection |
| `AudioOutputProvider`  | `output` | Custom audio playback (speakers, file, stream)                   |

Every custom provider must declare its `roles` property.

### AudioInputProvider skeleton

```typescript
import type {
  AudioInputProvider,
  AudioChunk,
  AudioMetadata,
  ProviderType,
  ProviderRole,
} from '@lukeocodes/composite-voice';

class MyInput implements AudioInputProvider {
  public readonly type: ProviderType = 'rest';
  public readonly roles: readonly ProviderRole[] = ['input'];

  private callback: ((chunk: AudioChunk) => void) | null = null;

  async initialize(): Promise<void> {
    /* set up your audio source */
  }
  async dispose(): Promise<void> {
    /* clean up */
  }
  isReady(): boolean {
    return true;
  }

  start(): void {
    /* begin capturing and call this.callback with AudioChunk objects */
  }
  stop(): void {
    /* stop capturing */
  }
  pause(): void {
    /* pause capturing */
  }
  resume(): void {
    /* resume capturing */
  }
  isActive(): boolean {
    return false;
  }
  onAudio(callback: (chunk: AudioChunk) => void): void {
    this.callback = callback;
  }
  getMetadata(): AudioMetadata {
    return { sampleRate: 16000, encoding: 'linear16', channels: 1, bitDepth: 16 };
  }
}
```

### STT provider skeleton

```typescript
import { BaseSTTProvider } from '@lukeocodes/composite-voice';

class MySTT extends BaseSTTProvider {
  // Declare the roles this provider covers
  public readonly roles = ['stt'] as const;

  protected async onInitialize(): Promise<void> {
    // Connect to your STT service, set up any clients or state.
  }

  protected async onDispose(): Promise<void> {
    // Clean up connections and resources.
  }

  async startCapture(): Promise<void> {
    // Stream audio from the microphone to your service, then emit results
    // via the base class helper (it handles event delivery and routing):
    this.emitTranscription({ text, isFinal: false });
    this.emitTranscription({ text, isFinal: true, utteranceComplete: true });
  }

  async stopCapture(): Promise<void> {
    // Flush and close the stream.
  }
}
```

### LLM provider skeleton

```typescript
import { BaseLLMProvider, LLMMessage, LLMGenerationOptions } from '@lukeocodes/composite-voice';

class MyLLM extends BaseLLMProvider {
  protected async onInitialize(): Promise<void> {
    // Set up your LLM client.
  }

  async *generateFromMessages(
    messages: LLMMessage[],
    options?: LLMGenerationOptions
  ): AsyncGenerator<string> {
    // Stream tokens from your model — yield each chunk as it arrives.
    for await (const token of myModelStream(messages)) {
      yield token;
    }
  }

  async *generate(prompt: string, options?: LLMGenerationOptions): AsyncGenerator<string> {
    yield* this.generateFromMessages(this.promptToMessages(prompt), options);
  }
}
```

### OpenAI-compatible LLM

The fastest way to add a new LLM provider that has an OpenAI-compatible API:

```typescript
import { OpenAICompatibleLLM, OpenAICompatibleLLMConfig } from '@lukeocodes/composite-voice';

class MyLLM extends OpenAICompatibleLLM {
  constructor(config: OpenAICompatibleLLMConfig) {
    super({ endpoint: 'https://api.my-provider.com/v1', ...config });
  }
}

// Use it exactly like any other LLM provider
const llm = new MyLLM({
  apiKey: 'your-key',
  model: 'my-model',
  systemPrompt: 'You are a helpful voice assistant.',
});
```

### TTS provider skeleton

```typescript
import { BaseTTSProvider } from '@lukeocodes/composite-voice';

class MyTTS extends BaseTTSProvider {
  public readonly roles = ['tts'] as const;

  protected async onInitialize(): Promise<void> {
    // Set up your TTS client.
  }

  async synthesize(text: string): Promise<void> {
    this.emit('tts.start', { text });
    // Stream audio chunks from your service, then emit:
    this.emit('tts.audio', { chunk: audioBuffer });
    this.emit('tts.complete');
  }
}
```

### AudioOutputProvider skeleton

```typescript
import type {
  AudioOutputProvider,
  AudioChunk,
  AudioMetadata,
  ProviderType,
  ProviderRole,
} from '@lukeocodes/composite-voice';

class MyOutput implements AudioOutputProvider {
  public readonly type: ProviderType = 'rest';
  public readonly roles: readonly ProviderRole[] = ['output'];

  async initialize(): Promise<void> {
    /* set up your audio destination */
  }
  async dispose(): Promise<void> {
    /* clean up */
  }
  isReady(): boolean {
    return true;
  }

  configure(metadata: AudioMetadata): void {
    /* configure output format */
  }
  enqueue(chunk: AudioChunk): void {
    /* write audio chunk to destination */
  }
  async flush(): Promise<void> {
    /* wait for all enqueued audio to finish */
  }
  stop(): void {
    /* stop playback */
  }
  pause(): void {
    /* pause playback */
  }
  resume(): void {
    /* resume playback */
  }
  isPlaying(): boolean {
    return false;
  }
  onPlaybackStart(callback: () => void): void {
    /* register callback */
  }
  onPlaybackEnd(callback: () => void): void {
    /* register callback */
  }
  onPlaybackError(callback: (error: Error) => void): void {
    /* register callback */
  }
}
```

For a full implementation guide, see [CONTRIBUTING.md](./CONTRIBUTING.md#adding-a-provider). The built-in providers in `src/providers/` are the best reference implementations.

---

## Examples

30 standalone Vite apps in [`examples/`](./examples/), organized by category. Each introduces a real feature or provider — no filler.

### Getting started (00–06)

Browser-native providers and core SDK patterns. Only an Anthropic API key is required for most examples.

| #                                         | What it demonstrates                                                    | API keys needed      | Port |
| ----------------------------------------- | ----------------------------------------------------------------------- | -------------------- | ---- |
| [00](./examples/00-minimal-voice-agent/)  | Minimum viable voice agent                                              | Anthropic            | 3000 |
| [01](./examples/01-conversation-history/) | Multi-turn conversation memory                                          | Anthropic            | 3001 |
| [02](./examples/02-system-persona/)       | System prompt persona configuration                                     | Anthropic            | 3002 |
| [03](./examples/03-event-inspector/)      | Full event timeline and debugging                                       | Anthropic            | 3003 |
| [04](./examples/04-error-recovery/)       | Error simulation and automatic recovery                                 | Anthropic            | 3004 |
| [05](./examples/05-turn-taking/)          | Turn-taking strategy visualization                                      | Anthropic            | 3005 |
| [06](./examples/06-advanced-config/)      | Advanced config — multi-role and 5-provider patterns with queue options | Anthropic + Deepgram | 3006 |

### Production patterns (10–13)

Proxy servers, custom providers, and deployment-ready configurations.

| #                                    | What it demonstrates                        | API keys needed      | Port |
| ------------------------------------ | ------------------------------------------- | -------------------- | ---- |
| [10](./examples/10-proxy-server/)    | Express proxy — API keys stay on the server | Deepgram + Anthropic | 3010 |
| [11](./examples/11-nextjs-proxy/)    | Next.js App Router proxy                    | Anthropic            | 3011 |
| [12](./examples/12-custom-provider/) | Custom LLM provider (extends base class)    | None                 | 3012 |
| [13](./examples/13-multi-language/)  | Multi-language support and switching        | Anthropic            | 3013 |

### Deepgram (20–24)

Production-quality STT and TTS with Deepgram-specific features.

| #                                                  | What it demonstrates                       | API keys needed      | Port |
| -------------------------------------------------- | ------------------------------------------ | -------------------- | ---- |
| [20](./examples/20-deepgram-pipeline/)             | Full Deepgram STT + TTS pipeline           | Deepgram + Anthropic | 3020 |
| [21](./examples/21-eager-pipeline/)                | Eager/preflight speculative generation     | Deepgram + Anthropic | 3021 |
| [22](./examples/22-deepgram-options/)              | STT configuration panel (model, VAD, etc.) | Deepgram + Anthropic | 3022 |
| [23](./examples/23-deepgram-voices/)               | TTS voice gallery — preview Aura 2 voices  | Deepgram + Anthropic | 3023 |
| [24](./examples/24-deepgram-conversation-history/) | Deepgram pipeline + conversation history   | Deepgram + Anthropic | 3024 |

### Deepgram Voice Agent (70)

Single-WebSocket voice agent using the Deepgram Voice Agent API.

| #                                        | What it demonstrates                                               | API keys needed | Port |
| ---------------------------------------- | ------------------------------------------------------------------ | --------------- | ---- |
| [70](./examples/70-deepgram-agent/)      | Deepgram Voice Agent API (single-WebSocket STT+LLM+TTS)           | Deepgram        | 3070 |

### Anthropic (30–31)

Claude model comparison and streaming configuration.

| #                                               | What it demonstrates                         | API keys needed | Port |
| ----------------------------------------------- | -------------------------------------------- | --------------- | ---- |
| [30](./examples/30-anthropic-models/)           | Side-by-side model comparison (Haiku/Sonnet) | Anthropic       | 3030 |
| [31](./examples/31-anthropic-streaming-config/) | Streaming config (temperature, tokens, topP) | Anthropic       | 3031 |

### OpenAI (40–42)

GPT models and OpenAI TTS integration.

| #                                        | What it demonstrates                     | API keys needed   | Port |
| ---------------------------------------- | ---------------------------------------- | ----------------- | ---- |
| [40](./examples/40-openai-pipeline/)     | OpenAI LLM with browser-native STT/TTS   | OpenAI            | 3040 |
| [41](./examples/41-openai-deepgram/)     | OpenAI LLM + Deepgram STT/TTS production | OpenAI + Deepgram | 3041 |
| [42](./examples/42-openai-tts-pipeline/) | OpenAI LLM + OpenAI TTS                  | OpenAI            | 3042 |

### WebLLM (50)

Fully offline voice agent — no API keys, no server.

| #                                    | What it demonstrates                     | API keys needed | Port |
| ------------------------------------ | ---------------------------------------- | --------------- | ---- |
| [50](./examples/50-webllm-pipeline/) | In-browser LLM via WebGPU (100% offline) | None            | 3050 |

### Groq (60)

Ultra-fast inference with Groq-hosted models.

| #                                  | What it demonstrates        | API keys needed | Port |
| ---------------------------------- | --------------------------- | --------------- | ---- |
| [60](./examples/60-groq-pipeline/) | Groq LLM + Deepgram STT/TTS | Groq + Deepgram | 3060 |

### AssemblyAI (70)

Real-time transcription with word-level timing.

| #                                        | What it demonstrates                   | API keys needed                   | Port |
| ---------------------------------------- | -------------------------------------- | --------------------------------- | ---- |
| [70](./examples/70-assemblyai-pipeline/) | AssemblyAI STT + Claude + Deepgram TTS | AssemblyAI + Anthropic + Deepgram | 3070 |

### ElevenLabs (80–81)

Ultra-low-latency streaming TTS and real-time STT with natural voices.

| #                                        | What it demonstrates                       | API keys needed                   | Port |
| ---------------------------------------- | ------------------------------------------ | --------------------------------- | ---- |
| [80](./examples/80-elevenlabs-pipeline/) | ElevenLabs TTS + Deepgram STT + Claude     | ElevenLabs + Deepgram + Anthropic | 3080 |
| [81](./examples/81-elevenlabs-stt/)      | ElevenLabs STT (Scribe V2) standalone demo | ElevenLabs                        | 3081 |

### Cartesia (90)

Low-latency TTS with emotion controls.

| #                                      | What it demonstrates                   | API keys needed            | Port |
| -------------------------------------- | -------------------------------------- | -------------------------- | ---- |
| [90](./examples/90-cartesia-pipeline/) | Cartesia TTS + Deepgram STT + Groq LLM | Cartesia + Deepgram + Groq | 3090 |

### Gemini (100)

Google Gemini models via OpenAI-compatible API.

| #                                      | What it demonstrates                   | API keys needed                | Port |
| -------------------------------------- | -------------------------------------- | ------------------------------ | ---- |
| [100](./examples/100-gemini-pipeline/) | Gemini LLM + Deepgram STT + ElevenLabs | Gemini + Deepgram + ElevenLabs | 3100 |

### Mistral (110)

Mistral open and commercial models.

| #                                       | What it demonstrates                    | API keys needed                 | Port |
| --------------------------------------- | --------------------------------------- | ------------------------------- | ---- |
| [110](./examples/110-mistral-pipeline/) | Mistral LLM + Deepgram STT + ElevenLabs | Mistral + Deepgram + ElevenLabs | 3110 |

### Running examples

```bash
pnpm install && pnpm build

# Getting started
pnpm example:00-minimal-voice-agent:dev          # http://localhost:3000
pnpm example:01-conversation-history:dev         # http://localhost:3001
pnpm example:02-system-persona:dev               # http://localhost:3002
pnpm example:03-event-inspector:dev              # http://localhost:3003
pnpm example:04-error-recovery:dev               # http://localhost:3004
pnpm example:05-turn-taking:dev                  # http://localhost:3005
pnpm example:06-advanced-config:dev              # http://localhost:3006

# Production patterns
pnpm example:10-proxy-server:dev                 # http://localhost:3010
pnpm example:11-nextjs-proxy:dev                 # http://localhost:3011
pnpm example:12-custom-provider:dev              # http://localhost:3012
pnpm example:13-multi-language:dev               # http://localhost:3013

# Deepgram
pnpm example:20-deepgram-pipeline:dev            # http://localhost:3020
pnpm example:21-eager-pipeline:dev               # http://localhost:3021
pnpm example:22-deepgram-options:dev             # http://localhost:3022
pnpm example:23-deepgram-voices:dev              # http://localhost:3023
pnpm example:24-deepgram-conversation-history:dev # http://localhost:3024

# Deepgram Voice Agent
pnpm example:70-deepgram-agent:dev               # http://localhost:3070

# Anthropic
pnpm example:30-anthropic-models:dev             # http://localhost:3030
pnpm example:31-anthropic-streaming-config:dev   # http://localhost:3031

# OpenAI
pnpm example:40-openai-pipeline:dev              # http://localhost:3040
pnpm example:41-openai-deepgram:dev              # http://localhost:3041
pnpm example:42-openai-tts-pipeline:dev          # http://localhost:3042

# WebLLM (offline)
pnpm example:50-webllm-pipeline:dev              # http://localhost:3050

# Groq
pnpm example:60-groq-pipeline:dev               # http://localhost:3060

# AssemblyAI
pnpm example:70-assemblyai-pipeline:dev          # http://localhost:3070

# ElevenLabs
pnpm example:80-elevenlabs-pipeline:dev          # http://localhost:3080
pnpm example:81-elevenlabs-stt:dev               # http://localhost:3081

# Cartesia
pnpm example:90-cartesia-pipeline:dev            # http://localhost:3090

# Gemini
pnpm example:100-gemini-pipeline:dev             # http://localhost:3100

# Mistral
pnpm example:110-mistral-pipeline:dev            # http://localhost:3110
```

---

## Browser support

| Browser       | NativeSTT     | DeepgramSTT | DeepgramFlux | AssemblyAISTT | ElevenLabsSTT | SonioxSTT | GladiaSTT | NativeTTS | DeepgramTTS | OpenAITTS | ElevenLabsTTS | CartesiaTTS | SpeechifyTTS | MurfTTS | LMNTTTS | SmallestTTS | RimeTTS | MiniMaxTTS |
| ------------- | ------------- | ----------- | ------------ | ------------- | ------------- | --------- | --------- | --------- | ----------- | --------- | ------------- | ----------- | ------------ | ------- | ------- | ----------- | ------- | ---------- |
| Chrome / Edge | Full          | Full        | Full         | Full          | Full          | Full      | Full      | Full      | Full        | Full      | Full          | Full        | Full         | Full    | Full    | Full        | Full    | Full       |
| Firefox       | Not supported | Full        | Full         | Full          | Full          | Full      | Full      | Full      | Full        | Full      | Full          | Full        | Full         | Full    | Full    | Full        | Full    | Full       |
| Safari        | Limited       | Full        | Full         | Full          | Full          | Full      | Full      | Full      | Full        | Full      | Full          | Full        | Full         | Full    | Full    | Full        | Full    | Full       |

`NativeSTT` depends on the [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API), which is only fully supported in Chromium-based browsers. `NativeSTT` is unreliable in Safari. All WebSocket-based providers (Deepgram, AssemblyAI, Soniox, Gladia, ElevenLabs, Cartesia) and REST-based providers (OpenAI, Speechify, Murf, LMNT, Smallest.ai, Rime, MiniMax) work across all modern browsers.

For cross-browser production deployments, use `DeepgramSTT`, `AssemblyAISTT`, `SonioxSTT`, `GladiaSTT`, or `ElevenLabsSTT` for STT, and any cloud TTS provider.

---

## Contributing

Contributions are welcome — new providers, bug fixes, documentation improvements, and feature requests. Every contribution matters, and there are options at every experience level.

- [CONTRIBUTING.md](./CONTRIBUTING.md) — development setup, workflow, and conventions
- [GitHub Issues](https://github.com/lukeocodes/composite-voice/issues) — bug reports and feature requests
- [GitHub Discussions](https://github.com/lukeocodes/composite-voice/discussions) — questions, ideas, and show & tell
- [Code of Conduct](./CODE_OF_CONDUCT.md) — community standards
- [Security Policy](./SECURITY.md) — how to report vulnerabilities privately

New here? Look for issues labelled [`good first issue`](https://github.com/lukeocodes/composite-voice/labels/good%20first%20issue).

---

## Community

CompositeVoice is built in the open and shaped by the people who use it.

- **[GitHub Discussions](https://github.com/lukeocodes/composite-voice/discussions)** — share what you built, ask questions, propose ideas
- **[GitHub Issues](https://github.com/lukeocodes/composite-voice/issues)** — bug reports and concrete feature requests
- **[Good first issues](https://github.com/lukeocodes/composite-voice/labels/good%20first%20issue)** — well-scoped tasks for new contributors
- **[Security advisories](https://github.com/lukeocodes/composite-voice/security/advisories/new)** — private channel for vulnerability reports

If you build something with CompositeVoice, share it in Discussions. Seeing real applications is one of the best ways to understand what the SDK does well and where it still has gaps.

---

## License

MIT © [Luke Oliff](https://github.com/lukeocodes)
