# CompositeVoice

[![npm version](https://badge.fury.io/js/%40lukeocodes%2Fcomposite-voice.svg)](https://www.npmjs.com/package/@lukeocodes/composite-voice)
[![CI](https://github.com/lukeocodes/composite-voice/actions/workflows/ci.yml/badge.svg)](https://github.com/lukeocodes/composite-voice/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> A lightweight, provider-agnostic browser SDK for building AI voice agents. Wire together any Speech-to-Text, Language Model, and Text-to-Speech provider behind one unified interface — swap any of them with a one-line change.

```
User Speech → STT Provider → LLM Provider → TTS Provider → Audio Output
```

---

## Why CompositeVoice?

Building a voice agent from scratch means solving a dozen hard problems simultaneously: microphone management, real-time audio streaming, WebSocket reconnections, turn-taking logic, state machines, and stitching together multiple provider SDKs with incompatible APIs.

CompositeVoice handles all of that so you can focus on what your agent *actually does*.

```typescript
// Everything below — microphone management, WebSocket reconnections,
// turn-taking, state machines, audio streaming — handled automatically.
const agent = new CompositeVoice({
  stt: new NativeSTT({ language: 'en-US' }),
  llm: new AnthropicLLM({ apiKey, model: 'claude-haiku-4-5', systemPrompt }),
  tts: new NativeTTS(),
});

await agent.initialize();
await agent.startListening();
```

**Provider-agnostic by design.** Swap Deepgram for the browser's built-in Web Speech API, or Claude for GPT, with a one-line change. No provider lock-in.

**Type-safe throughout.** Every event, config option, and provider method is typed. TypeScript autocomplete works end-to-end.

**Batteries included.** Turn-taking logic, conversation history, an eager LLM pipeline, and a server-side proxy pattern ship out of the box.

**Zero runtime dependencies.** Provider SDKs are optional peer dependencies — install only what you use.

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

Install only the provider SDKs you need — all are optional peer dependencies:

```bash
pnpm add @anthropic-ai/sdk    # Anthropic Claude LLM
pnpm add @deepgram/sdk         # Deepgram STT + TTS
pnpm add openai                # OpenAI GPT
pnpm add ws                    # Server-side proxy (WebSocket support)
```

---

## Quick start

### Simplest possible agent (one API key)

Uses the browser's built-in Web Speech API and SpeechSynthesis — only an Anthropic key required. Works in Chrome and Edge out of the box.

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new NativeSTT({ language: 'en-US' }),
  llm: new AnthropicLLM({
    apiKey: 'your-anthropic-key',
    model: 'claude-haiku-4-5',
    systemPrompt: 'You are a helpful voice assistant. Keep responses brief.',
    maxTokens: 200,
  }),
  tts: new NativeTTS(),
});

await agent.initialize();

agent.on('transcription.final', (e) => console.log('You:', e.text));
agent.on('llm.chunk', (e) => process.stdout.write(e.chunk));
agent.on('agent.stateChange', (e) => console.log('State:', e.state));

await agent.startListening();
```

See [Example 00](./examples/00-native-anthropic-native/) for a runnable demo with full UI.

### Best-in-class setup (Deepgram + Anthropic)

Real-time WebSocket STT, the fastest Claude model, and streaming TTS at 24 kHz — the recommended production configuration:

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
    model: 'claude-haiku-4-5',
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

See [Example 01](./examples/01-deepgram-anthropic-deepgram/) for the full runnable demo.

---

## Providers

### Speech-to-Text (STT)

| Provider | Transport | Notes |
|----------|-----------|-------|
| `NativeSTT` | Browser Web Speech API | No API key. `managedAudio = true` — the browser controls the mic directly. Chrome/Edge only. |
| `DeepgramSTT` | WebSocket | Deepgram nova-3 real-time streaming. Requires `@deepgram/sdk`. Works in all modern browsers. |

**`NativeSTT` config:**

```typescript
new NativeSTT({
  language: 'en-US',       // BCP-47 language tag
  continuous: true,         // keep recognising between pauses
  interimResults: true,     // emit partial results while speaking
  startTimeout: 5000,       // ms to wait for first result before error
})
```

**`DeepgramSTT` config:**

```typescript
new DeepgramSTT({
  apiKey: 'your-key',       // or use proxyUrl for server-side key injection
  language: 'en-US',
  options: {
    model: 'nova-3',         // or 'flux-general-en' for v2 preflight events
    smartFormat: true,
    punctuation: true,
    interimResults: true,
    endpointing: 300,        // ms of silence before speech_final fires
    vadEvents: true,
  },
})
```

### Language Models (LLM)

| Provider | Notes |
|----------|-------|
| `AnthropicLLM` | Claude models. Requires `@anthropic-ai/sdk`. Streaming enabled by default. |
| `OpenAILLM` | GPT models. Requires `openai`. |

**`AnthropicLLM` config:**

```typescript
new AnthropicLLM({
  apiKey: 'your-key',        // or use proxyUrl
  model: 'claude-haiku-4-5',
  systemPrompt: 'You are a helpful voice assistant.',
  maxTokens: 200,
  temperature: 0.7,
  stream: true,              // default: true
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
  rate: 1.0,            // speech rate (0.1–10)
  pitch: 1.0,           // voice pitch (0–2)
  volume: 1.0,          // volume (0–1)
  preferLocal: true,    // prefer on-device voices over cloud voices
})
```

**`DeepgramTTS` config:**

```typescript
new DeepgramTTS({
  apiKey: 'your-key',   // or use proxyUrl
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
  // Required: one of each provider type
  stt: sttProvider,
  llm: llmProvider,
  tts: ttsProvider,

  // Conversation memory (off by default)
  conversationHistory: {
    enabled: true,
    maxTurns: 10,      // 0 = unlimited; each turn = one user+assistant pair
  },

  // Eager/speculative LLM generation (requires Deepgram v2 STT)
  eagerLLM: {
    enabled: true,
    cancelOnTextChange: true,   // restart LLM if preflight text was wrong
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
    level: 'info',     // 'debug' | 'info' | 'warn' | 'error'
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
agent.on('event.name', (event) => { ... });   // subscribe
agent.off('event.name', handler);              // unsubscribe
agent.once('event.name', handler);             // one-time listener
```

### Agent events

| Event | Payload | Description |
|-------|---------|-------------|
| `agent.ready` | `{ state }` | SDK fully initialized and ready to listen |
| `agent.stateChange` | `{ state, previousState }` | Agent moved to a new state |
| `agent.error` | `{ error }` | System-level error |

### Transcription events

| Event | Payload | Description |
|-------|---------|-------------|
| `transcription.start` | — | Transcription session opened |
| `transcription.interim` | `{ text, isFinal }` | Partial transcript — updates as you speak |
| `transcription.final` | `{ text, isFinal }` | Confirmed transcript segment |
| `transcription.speechFinal` | `{ text, speechFinal }` | Full utterance ended — LLM is triggered |
| `transcription.preflight` | `{ text, isPreflight }` | Early end-of-turn prediction (Deepgram v2 only) |
| `transcription.error` | `{ error }` | Transcription error |

### LLM events

| Event | Payload | Description |
|-------|---------|-------------|
| `llm.start` | `{ prompt }` | LLM generation started |
| `llm.chunk` | `{ chunk }` | Text token received from the model |
| `llm.complete` | `{ text }` | Full response assembled |
| `llm.error` | `{ error }` | LLM error |

### TTS events

| Event | Payload | Description |
|-------|---------|-------------|
| `tts.start` | `{ text }` | Synthesis started |
| `tts.audio` | `{ chunk }` | Audio chunk ready for playback |
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

The agent moves through a well-defined set of states managed by a state machine:

```
idle → ready → listening → thinking → speaking → listening → ...
```

| State | Description |
|-------|-------------|
| `idle` | Not initialized |
| `ready` | Initialized, waiting to start listening |
| `listening` | Actively capturing audio and transcribing |
| `thinking` | LLM is generating a response |
| `speaking` | TTS audio is playing to the user |
| `error` | Recoverable error — call `startListening()` to retry |

```typescript
agent.on('agent.stateChange', ({ state, previousState }) => {
  console.log(`${previousState} → ${state}`);
});
```

---

## Conversation history

Enable multi-turn memory so the LLM remembers previous exchanges within a session:

```typescript
const agent = new CompositeVoice({
  stt, llm, tts,
  conversationHistory: {
    enabled: true,
    maxTurns: 10,   // keep last 10 user+assistant pairs; 0 = unlimited
  },
});
```

Each completed turn is appended to an internal history array and included in subsequent LLM calls:

```
You:  "My name is Sam."
AI:   "Nice to meet you, Sam!"
You:  "What's my name?"
AI:   "Your name is Sam."   ← the LLM remembered
```

Access and manage history at runtime:

```typescript
const history = agent.getHistory();   // LLMMessage[]
agent.clearHistory();                 // start fresh without reinitializing
```

See [Example 02](./examples/02-conversation-history/) for a full demo with a chat-thread UI.

---

## Eager LLM pipeline

With Deepgram v2 models (e.g. `flux-general-en`), the SDK can begin LLM generation *before* the user finishes speaking, using an early `preflight` end-of-turn signal. The result is noticeably lower perceived latency.

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

How it works:

```
preflight fires  →  LLM starts (speculative)
speech_final arrives
        ↓
  text unchanged?  →  LLM keeps streaming uninterrupted
  text changed?    →  LLM cancelled, restarts with correct text
```

See [Example 03](./examples/03-eager-pipeline/) for a demo with real-time pipeline timing visualization.

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
| `auto` (default) | Pauses for `NativeSTT`; does not pause for `DeepgramSTT` (relies on echo cancellation) |
| `conservative` | Always pause the mic during TTS playback |
| `aggressive` | Never pause the mic (for hardware echo cancellation setups) |
| `detect` | Attempt to detect echo cancellation support at runtime |

---

## Server-side proxy

Keep API keys out of the browser entirely. The proxy middleware forwards browser requests to providers and injects credentials server-side. **The browser bundle contains zero secrets.**

### Express

```typescript
import express from 'express';
import { createServer } from 'http';
import { createExpressProxy } from '@lukeocodes/composite-voice/proxy';

const app = express();
const server = createServer(app);

const proxy = createExpressProxy({
  deepgramApiKey:  process.env.DEEPGRAM_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  pathPrefix: '/proxy',
});

app.use(proxy.middleware);
proxy.attachWebSocket(server);   // required for Deepgram WebSocket connections

app.use(express.static('dist'));
server.listen(3004);
```

### Next.js App Router

```typescript
// app/proxy/[...path]/route.ts
import { createNextJsProxy } from '@lukeocodes/composite-voice/proxy';

const proxy = createNextJsProxy({
  deepgramApiKey:  process.env.DEEPGRAM_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
});

export const GET  = proxy.handler;
export const POST = proxy.handler;
```

### Plain Node.js

```typescript
import { createServer } from 'http';
import { createNodeProxy } from '@lukeocodes/composite-voice/proxy';

const proxy = createNodeProxy({
  deepgramApiKey:  process.env.DEEPGRAM_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  pathPrefix: '/proxy',
});

const server = createServer(proxy.handler);
proxy.attachWebSocket(server);
server.listen(3004);
```

### Browser side

Use `proxyUrl` instead of `apiKey` in any provider config:

```typescript
const stt = new DeepgramSTT({
  proxyUrl: `${window.location.origin}/proxy/deepgram`,
  options: { model: 'nova-3', ... },
});

const llm = new AnthropicLLM({
  proxyUrl: `${window.location.origin}/proxy/anthropic`,
  model: 'claude-haiku-4-5',
});

const tts = new DeepgramTTS({
  proxyUrl: `${window.location.origin}/proxy/deepgram`,
  options: { model: 'aura-2-thalia-en', ... },
});
```

See [Example 04](./examples/04-proxy-server/) for a complete production-ready setup with both Vite dev proxy and a runnable Express server.

---

## Custom providers

Extend the abstract base classes to add any provider. The SDK will wire it into the pipeline automatically.

```typescript
import { BaseSTTProvider } from '@lukeocodes/composite-voice';

class MySTT extends BaseSTTProvider {
  protected async onInitialize(): Promise<void> {
    // connect to your service
  }

  protected async onDispose(): Promise<void> {
    // clean up connections and resources
  }

  async startCapture(): Promise<void> {
    // stream audio to your service and emit events:
    this.emit('transcription.interim', { text, isFinal: false });
    this.emit('transcription.final', { text, isFinal: true });
    this.emit('transcription.speechFinal', { text, speechFinal: true });
  }

  async stopCapture(): Promise<void> {
    // stop the audio stream
  }
}
```

| Base class | Use for |
|------------|---------|
| `BaseSTTProvider` | Any speech-to-text provider |
| `LiveSTTProvider` | WebSocket-based real-time STT |
| `RestSTTProvider` | Request/response STT |
| `BaseLLMProvider` | Any language model |
| `BaseTTSProvider` | Any text-to-speech provider |
| `LiveTTSProvider` | WebSocket-based streaming TTS |
| `RestTTSProvider` | Request/response TTS |

See [CONTRIBUTING.md](./CONTRIBUTING.md#adding-a-provider) for the full implementation checklist, and the existing providers in `src/providers/` as reference implementations.

---

## Examples

Five standalone Vite apps in [`examples/`](./examples/), designed to be explored in order. Each adds one new concept:

| # | Directory | Stack | API keys needed |
|---|-----------|-------|-----------------|
| 00 | [`00-native-anthropic-native`](./examples/00-native-anthropic-native/) | NativeSTT + Anthropic + NativeTTS | Anthropic only |
| 01 | [`01-deepgram-anthropic-deepgram`](./examples/01-deepgram-anthropic-deepgram/) | DeepgramSTT + Anthropic + DeepgramTTS | Deepgram + Anthropic |
| 02 | [`02-conversation-history`](./examples/02-conversation-history/) | NativeSTT + Anthropic + NativeTTS + history | Anthropic only |
| 03 | [`03-eager-pipeline`](./examples/03-eager-pipeline/) | DeepgramSTT + Anthropic + DeepgramTTS + eager LLM | Deepgram + Anthropic |
| 04 | [`04-proxy-server`](./examples/04-proxy-server/) | All providers via server proxy | Server-side only |

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

`NativeSTT` depends on the [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API), which is only fully supported in Chromium-based browsers. All Deepgram providers work across browsers via WebSocket.

---

## Contributing

Contributions are welcome — bug reports, documentation improvements, new providers, and feature requests all appreciated.

**Quick links:**
- [CONTRIBUTING.md](./CONTRIBUTING.md) — development setup, workflow, and conventions
- [GitHub Issues](https://github.com/lukeocodes/composite-voice/issues) — bugs and feature requests
- [GitHub Discussions](https://github.com/lukeocodes/composite-voice/discussions) — questions, ideas, show and tell
- [Security Policy](./SECURITY.md) — how to report vulnerabilities privately

---

## License

MIT © [Luke Oliff](https://github.com/lukeocodes)
