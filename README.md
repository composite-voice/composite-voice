# CompositeVoice

[![npm version](https://badge.fury.io/js/%40lukeocodes%2Fcomposite-voice.svg)](https://www.npmjs.com/package/@lukeocodes/composite-voice)
[![CI](https://github.com/lukeocodes/composite-voice/actions/workflows/ci.yml/badge.svg)](https://github.com/lukeocodes/composite-voice/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An extensible, lightweight browser SDK for building AI voice agents. CompositeVoice wires together Speech-to-Text, a Language Model, and Text-to-Speech behind a single, unified interface — swap any provider without touching the rest of your code.

```
User Speech → STT Provider → LLM Provider → TTS Provider → Audio Output
```

---

## Why CompositeVoice?

Building a voice agent from scratch means solving a dozen hard problems at once: microphone management, real-time audio streaming, WebSocket reconnections, turn-taking logic, state management, and stitching three different SDKs together. CompositeVoice handles all of that so you can focus on what your agent actually says.

- **Provider-agnostic** — swap Deepgram for the browser's Web Speech API, or Claude for GPT, with a one-line change
- **Type-safe events** — every event is typed and discoverable through TypeScript autocomplete
- **Batteries included** — turn-taking, conversation history, eager LLM pipeline, and server-side proxy built in
- **Zero dependencies at runtime** — provider SDKs are optional peer dependencies; install only what you use

---

## Table of contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Providers](#providers)
- [Configuration](#configuration)
- [Events](#events)
- [Agent states](#agent-states)
- [Conversation history](#conversation-history)
- [Eager LLM pipeline](#eager-llm-pipeline)
- [Turn-taking](#turn-taking)
- [Server-side proxy](#server-side-proxy)
- [Custom providers](#custom-providers)
- [Examples](#examples)
- [Browser support](#browser-support)
- [Contributing](#contributing)
- [License](#license)

---

## Installation

```bash
npm install @lukeocodes/composite-voice
# or
pnpm add @lukeocodes/composite-voice
# or
yarn add @lukeocodes/composite-voice
```

### Provider peer dependencies

Install only the provider SDKs you need — all are optional:

```bash
pnpm add @anthropic-ai/sdk   # Anthropic Claude
pnpm add @deepgram/sdk        # Deepgram STT / TTS
pnpm add openai               # OpenAI GPT
pnpm add ws                   # server-side proxy WebSocket support only
```

---

## Quick start

### Simplest possible agent (one API key)

Uses the browser's built-in Web Speech API and SpeechSynthesis — only one API key needed:

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new NativeSTT({ language: 'en-US' }),
  llm: new AnthropicLLM({
    apiKey: 'your-anthropic-key',
    model: 'claude-haiku-4-6',
    systemPrompt: 'You are a helpful voice assistant. Keep responses brief.',
    maxTokens: 200,
  }),
  tts: new NativeTTS(),
});

await agent.initialize();

agent.on('transcription.final', (e) => console.log('You said:', e.text));
agent.on('llm.chunk', (e) => process.stdout.write(e.chunk));
agent.on('agent.stateChange', (e) => console.log('State:', e.state));

await agent.startListening();
```

### Best-in-class setup (Deepgram + Anthropic)

Real-time WebSocket STT, fastest Claude model, and streaming TTS at 24 kHz:

```typescript
import { CompositeVoice, DeepgramSTT, AnthropicLLM, DeepgramTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new DeepgramSTT({
    apiKey: process.env.DEEPGRAM_API_KEY,
    options: {
      model: 'nova-3',
      smartFormat: true,
      interimResults: true,
      endpointing: 300,
    },
  }),
  llm: new AnthropicLLM({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-haiku-4-6',
    systemPrompt: 'You are a helpful voice assistant. Keep responses brief.',
    maxTokens: 200,
  }),
  tts: new DeepgramTTS({
    apiKey: process.env.DEEPGRAM_API_KEY,
    options: {
      model: 'aura-2-thalia-en',
      encoding: 'linear16',
      sampleRate: 24000,
    },
  }),
});

await agent.initialize();
await agent.startListening();
```

---

## Providers

### Speech-to-Text (STT)

| Provider | Transport | Notes |
|----------|-----------|-------|
| `NativeSTT` | Browser Web Speech API | No API key. `managedAudio = true` — the browser controls the mic directly. Chrome/Edge only. |
| `DeepgramSTT` | WebSocket | Deepgram nova-3 real-time streaming. Requires `@deepgram/sdk`. |

**`NativeSTT` config:**

```typescript
new NativeSTT({
  language: 'en-US',      // BCP-47 language tag
  continuous: true,        // keep recognising between pauses
  interimResults: true,    // emit partial results
})
```

**`DeepgramSTT` config:**

```typescript
new DeepgramSTT({
  apiKey: 'your-key',      // or use proxyUrl for server-side key injection
  language: 'en-US',
  options: {
    model: 'nova-3',        // or 'flux-general-en' for v2 preflight events
    smartFormat: true,
    punctuation: true,
    interimResults: true,
    endpointing: 300,       // ms of silence before speech_final fires
    vadEvents: true,
  },
})
```

### Language Models (LLM)

| Provider | Notes |
|----------|-------|
| `AnthropicLLM` | Claude models. Requires `@anthropic-ai/sdk`. Default: `claude-haiku-4-6`. |
| `OpenAILLM` | GPT models. Requires `openai`. |

**`AnthropicLLM` config:**

```typescript
new AnthropicLLM({
  apiKey: 'your-key',       // or use proxyUrl
  model: 'claude-haiku-4-6',
  systemPrompt: 'You are a helpful voice assistant.',
  maxTokens: 200,
  temperature: 0.7,
  stream: true,             // default: true
})
```

**`OpenAILLM` config:**

```typescript
new OpenAILLM({
  apiKey: 'your-key',
  model: 'gpt-4o-mini',
  systemPrompt: 'You are a helpful voice assistant.',
  maxTokens: 200,
  temperature: 0.7,
})
```

### Text-to-Speech (TTS)

| Provider | Transport | Notes |
|----------|-----------|-------|
| `NativeTTS` | Browser SpeechSynthesis | No API key. `managedAudio = true`. Works in Chrome, Edge, Safari, Firefox. |
| `DeepgramTTS` | WebSocket | Deepgram aura-2 streaming at 24 kHz. Requires `@deepgram/sdk`. |

**`NativeTTS` config:**

```typescript
new NativeTTS({
  rate: 1.0,           // speech rate (0.1–10)
  pitch: 1.0,          // voice pitch (0–2)
  volume: 1.0,         // volume (0–1)
  preferLocal: true,   // prefer on-device voices over cloud voices
})
```

**`DeepgramTTS` config:**

```typescript
new DeepgramTTS({
  apiKey: 'your-key',  // or use proxyUrl
  options: {
    model: 'aura-2-thalia-en',
    encoding: 'linear16',
    sampleRate: 24000,
  },
})
```

---

## Configuration

Full `CompositeVoice` configuration reference:

```typescript
const agent = new CompositeVoice({
  // Required
  stt: sttProvider,
  llm: llmProvider,
  tts: ttsProvider,

  // Conversation memory
  conversationHistory: {
    enabled: true,
    maxTurns: 10,     // 0 = unlimited
  },

  // Eager/speculative LLM generation
  eagerLLM: {
    enabled: true,
    cancelOnTextChange: true,
  },

  // Turn-taking: when to pause the mic during TTS playback
  turnTaking: {
    strategy: 'auto',  // 'auto' | 'conservative' | 'aggressive' | 'detect'
  },

  // Audio settings
  audio: {
    sampleRate: 16000,
    channels: 1,
  },

  // Logging
  logging: {
    enabled: true,
    level: 'info',    // 'debug' | 'info' | 'warn' | 'error'
  },

  // WebSocket reconnection
  reconnection: {
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
  },
});
```

---

## Events

CompositeVoice uses a type-safe event system. All events are typed and discoverable via TypeScript autocomplete.

```typescript
agent.on('event.name', (event) => { ... });
agent.off('event.name', handler);
agent.once('event.name', handler);
```

### Agent events

| Event | Payload | Description |
|-------|---------|-------------|
| `agent.ready` | `{ state }` | SDK fully initialized |
| `agent.stateChange` | `{ state, previousState }` | Agent state changed |
| `agent.error` | `{ error }` | System-level error |

### Transcription events

| Event | Payload | Description |
|-------|---------|-------------|
| `transcription.start` | — | Transcription session opened |
| `transcription.interim` | `{ text, isFinal }` | Partial transcript (streaming) |
| `transcription.final` | `{ text, isFinal }` | Confirmed transcript segment |
| `transcription.speechFinal` | `{ text, speechFinal }` | Full utterance ended |
| `transcription.preflight` | `{ text, isPreflight }` | Early end-of-turn prediction (Deepgram v2) |
| `transcription.error` | `{ error }` | Transcription error |

### LLM events

| Event | Payload | Description |
|-------|---------|-------------|
| `llm.start` | `{ prompt }` | LLM generation started |
| `llm.chunk` | `{ chunk }` | Text token received |
| `llm.complete` | `{ text }` | Full response assembled |
| `llm.error` | `{ error }` | LLM error |

### TTS events

| Event | Payload | Description |
|-------|---------|-------------|
| `tts.start` | `{ text }` | Synthesis started |
| `tts.audio` | `{ chunk }` | Audio chunk ready |
| `tts.metadata` | `{ metadata }` | Audio format metadata |
| `tts.complete` | — | Playback finished |
| `tts.error` | `{ error }` | TTS error |

### Audio events

| Event | Payload | Description |
|-------|---------|-------------|
| `audio.capture.start` | — | Microphone opened |
| `audio.capture.stop` | — | Microphone closed |
| `audio.capture.error` | `{ error }` | Capture failure |
| `audio.playback.start` | — | Audio playback started |
| `audio.playback.end` | — | Audio playback ended |
| `audio.playback.error` | `{ error }` | Playback failure |

---

## Agent states

The agent moves through a well-defined set of states:

```
idle → ready → listening → thinking → speaking → listening → ...
```

| State | Description |
|-------|-------------|
| `idle` | Not initialized |
| `ready` | Initialized, waiting to listen |
| `listening` | Actively capturing and transcribing audio |
| `thinking` | LLM is processing the transcript |
| `speaking` | TTS audio is playing |
| `error` | Error state — can recover by calling `startListening()` again |

```typescript
agent.on('agent.stateChange', ({ state, previousState }) => {
  console.log(`${previousState} → ${state}`);
});
```

---

## Conversation history

Enable multi-turn memory so the LLM remembers previous exchanges:

```typescript
const agent = new CompositeVoice({
  stt, llm, tts,
  conversationHistory: {
    enabled: true,
    maxTurns: 10,   // keep last 10 user+assistant pairs; 0 = unlimited
  },
});
```

Each completed turn is appended to an internal history array and included in subsequent LLM calls.

```typescript
const history = agent.getHistory();   // LLMMessage[]
agent.clearHistory();
```

---

## Eager LLM pipeline

With Deepgram v2 models (e.g. `flux-general-en`), the SDK can begin LLM generation before the utterance fully ends using the early `preflight` end-of-turn signal:

```typescript
const agent = new CompositeVoice({
  stt: new DeepgramSTT({ apiKey, options: { model: 'flux-general-en', ... } }),
  llm,
  tts,
  eagerLLM: {
    enabled: true,
    cancelOnTextChange: true,  // cancel and restart if preflight text differs from speech_final
  },
});
```

The `preflight` signal arrives ahead of `speech_final`, giving the LLM a head start. If `speech_final` confirms the same text, the in-progress generation continues. If the text changed, it is cancelled and restarted.

---

## Turn-taking

Control whether the microphone is paused while the AI is speaking:

```typescript
const agent = new CompositeVoice({
  stt, llm, tts,
  turnTaking: {
    strategy: 'auto',
  },
});
```

| Strategy | Behaviour |
|----------|-----------|
| `auto` (default) | Pauses for `NativeSTT`; does not pause for `DeepgramSTT` (uses echo cancellation) |
| `conservative` | Always pause the mic during TTS playback |
| `aggressive` | Never pause (for hardware echo cancellation) |
| `detect` | Try to detect echo cancellation support at runtime |

---

## Server-side proxy

Keep API keys out of the browser entirely. The proxy middleware forwards browser requests to providers and injects credentials server-side.

### Express

```typescript
import { createExpressProxy } from '@lukeocodes/composite-voice/proxy';

const proxy = createExpressProxy({
  deepgramApiKey:  process.env.DEEPGRAM_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  pathPrefix: '/proxy',
});

app.use(proxy.middleware);
proxy.attachWebSocket(server);   // required for Deepgram WebSocket connections
```

### Next.js App Router

```typescript
import { createNextJsProxy } from '@lukeocodes/composite-voice/proxy';

const proxy = createNextJsProxy({
  deepgramApiKey:  process.env.DEEPGRAM_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
});

export const GET  = proxy.handler;
export const POST = proxy.handler;
```

### Browser side

Use `proxyUrl` instead of `apiKey`:

```typescript
const stt = new DeepgramSTT({
  proxyUrl: `${window.location.origin}/proxy/deepgram`,
  options: { model: 'nova-3', ... },
});

const llm = new AnthropicLLM({
  proxyUrl: `${window.location.origin}/proxy/anthropic`,
  model: 'claude-haiku-4-6',
});
```

---

## Custom providers

Extend the abstract base classes to add any provider:

```typescript
import { BaseSTTProvider } from '@lukeocodes/composite-voice';

class MySTT extends BaseSTTProvider {
  protected async onInitialize(): Promise<void> {
    // connect to your service
  }

  protected async onDispose(): Promise<void> {
    // clean up
  }

  async startCapture(): Promise<void> {
    // stream audio to your service
    // call this.emit('transcription.interim', { text, isFinal: false })
    // call this.emit('transcription.final', { text, isFinal: true })
  }

  async stopCapture(): Promise<void> {
    // stop streaming
  }
}
```

Use `LiveSTTProvider` / `LiveTTSProvider` for WebSocket providers, or `RestSTTProvider` / `RestTTSProvider` for request/response ones. See [CONTRIBUTING.md](./CONTRIBUTING.md#adding-a-provider) for the full checklist.

---

## Examples

Five standalone Vite apps in [`examples/`](./examples/), designed to be explored in order:

| # | Directory | Stack | API keys needed |
|---|-----------|-------|-----------------|
| 00 | [`00-native-anthropic-native`](./examples/00-native-anthropic-native/) | NativeSTT + Anthropic + NativeTTS | Anthropic only |
| 01 | [`01-deepgram-anthropic-deepgram`](./examples/01-deepgram-anthropic-deepgram/) | DeepgramSTT + Anthropic + DeepgramTTS | Deepgram + Anthropic |
| 02 | [`02-conversation-history`](./examples/02-conversation-history/) | NativeSTT + Anthropic + NativeTTS + history | Anthropic only |
| 03 | [`03-eager-pipeline`](./examples/03-eager-pipeline/) | DeepgramSTT + Anthropic + DeepgramTTS + eager LLM | Deepgram + Anthropic |
| 04 | [`04-proxy-server`](./examples/04-proxy-server/) | Full stack via server proxy | Server-side only |

Run any example from the repo root:

```bash
pnpm install && pnpm build
pnpm example:00-native-anthropic-native:dev          # http://localhost:3000
pnpm example:01-deepgram-anthropic-deepgram:dev      # http://localhost:3001
pnpm example:02-conversation-history:dev             # http://localhost:3002
pnpm example:03-eager-pipeline:dev                   # http://localhost:3003
pnpm example:04-proxy-server:dev                     # http://localhost:3004
```

---

## Browser support

| Browser | NativeSTT | DeepgramSTT | NativeTTS | DeepgramTTS |
|---------|-----------|-------------|-----------|-------------|
| Chrome / Edge | Full | Full | Full | Full |
| Firefox | Not supported | Full | Full | Full |
| Safari | Limited | Full | Full | Full |

`NativeSTT` depends on the [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API), which is only fully supported in Chromium-based browsers.

---

## Contributing

Contributions are welcome — bug reports, feature requests, documentation improvements, and new provider implementations all appreciated.

See [CONTRIBUTING.md](./CONTRIBUTING.md) to get started.

---

## License

MIT © [Luke Oliff](https://github.com/lukeocodes)

---

## Notes

This project started as a warts-and-all experiment in AI-assisted development. The [prompt log](./prompt-log/) documents the full history of prompts used during the initial build. The codebase has since been cleaned up, tested, and is genuinely useful — but the origin story is worth knowing.
