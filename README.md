# CompositeVoice

[![npm version](https://badge.fury.io/js/%40lukeocodes%2Fcomposite-voice.svg)](https://www.npmjs.com/package/@lukeocodes/composite-voice)
[![CI](https://github.com/lukeocodes/composite-voice/actions/workflows/ci.yml/badge.svg)](https://github.com/lukeocodes/composite-voice/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**A browser SDK for building AI voice agents.** Wire together any combination of Speech-to-Text, Language Model, and Text-to-Speech providers behind one unified interface — and swap any of them out with a single line of code.

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new NativeSTT(),
  llm: new AnthropicLLM({ apiKey, model: 'claude-haiku-4-5-20251001' }),
  tts: new NativeTTS(),
});

await agent.initialize();
await agent.startListening();
// Microphone capture, turn-taking, state machine, streaming — all handled.
```

---

## Why CompositeVoice?

Building a voice agent from scratch means solving a lot of hard problems simultaneously: microphone capture, WebSocket reconnection, turn-taking logic, interleaving STT/LLM/TTS lifecycles, and stitching together provider SDKs that share nothing in common. It's easy to spend weeks before your first "hello world."

CompositeVoice handles the plumbing. You declare the pipeline; the SDK runs it.

- **Provider-agnostic.** Deepgram, Anthropic, OpenAI, or browser built-ins — mix and match freely. Swapping a provider is one constructor change.
- **Type-safe throughout.** Every event payload, config option, and provider interface is fully typed. TypeScript autocomplete works end-to-end.
- **Zero mandatory dependencies.** Provider SDKs are optional peer dependencies — install only what you actually use.
- **Event-driven.** Subscribe to any stage of the pipeline: individual transcription words, LLM tokens, TTS audio chunks, and state transitions.
- **Conversation memory.** Multi-turn history that grows and trims automatically, included in every LLM call.
- **Eager LLM generation.** Start generating a response before the user finishes speaking, cutting perceived latency.
- **Server-side proxy.** Keep API keys off the client entirely — proxy middleware included for Express, Next.js, and plain Node.js.
- **Extensible.** Abstract base classes make it straightforward to add new providers for any STT, LLM, or TTS service.

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

Provider SDKs are optional peer dependencies — install only what you use:

```bash
pnpm add @anthropic-ai/sdk    # AnthropicLLM
pnpm add @deepgram/sdk        # DeepgramSTT + DeepgramTTS
pnpm add openai               # OpenAILLM
pnpm add ws                   # server-side proxy WebSocket support (Node.js only)
```

---

## Quick start

### Simplest setup — one API key, free STT and TTS

Uses the browser's built-in Web Speech API and SpeechSynthesis. Only requires an Anthropic key. Works in Chrome and Edge.

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new NativeSTT({ language: 'en-US' }),
  llm: new AnthropicLLM({
    apiKey: 'sk-ant-...',
    model: 'claude-haiku-4-5-20251001',
    systemPrompt: 'You are a helpful voice assistant. Keep responses brief.',
    maxTokens: 200,
  }),
  tts: new NativeTTS(),
});

agent.on('transcription.final', (e) => console.log('You said:', e.text));
agent.on('llm.chunk', (e) => process.stdout.write(e.chunk));
agent.on('agent.stateChange', (e) => console.log('State:', e.state));

await agent.initialize();
await agent.startListening();
```

See [Example 00](./examples/00-native-anthropic-native/) for a full runnable demo with UI.

### Production setup — Deepgram + Anthropic

Real-time WebSocket STT, Claude, and 24 kHz streaming TTS. Works in Firefox too.

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
    options: { model: 'nova-3', smartFormat: true, interimResults: true, endpointing: 300 },
  }),
  llm: new AnthropicLLM({
    apiKey: 'your-anthropic-key',
    model: 'claude-haiku-4-5-20251001',
    systemPrompt: 'You are a helpful voice assistant. Keep responses brief.',
    maxTokens: 200,
  }),
  tts: new DeepgramTTS({
    apiKey: 'your-deepgram-key',
    options: { model: 'aura-2-thalia-en', encoding: 'linear16', sampleRate: 24000 },
  }),
});

await agent.initialize();
await agent.startListening();
```

See [Example 01](./examples/01-deepgram-anthropic-deepgram/) for the full runnable demo.

---

## Providers

### Speech-to-Text (STT)

| Provider      | Transport      | Notes                                                               |
| ------------- | -------------- | ------------------------------------------------------------------- |
| `NativeSTT`   | Web Speech API | No API key. Chrome and Edge only.                                   |
| `DeepgramSTT` | WebSocket      | Real-time streaming. Requires `@deepgram/sdk`. All modern browsers. |

**`NativeSTT` options:**

```typescript
new NativeSTT({
  language: 'en-US', // BCP-47 language tag
  continuous: true, // keep listening between pauses
  interimResults: true, // emit partial results while speaking
  startTimeout: 5000, // ms before erroring if no audio detected
});
```

**`DeepgramSTT` options:**

```typescript
new DeepgramSTT({
  apiKey: 'your-key', // or proxyUrl for server-side key injection
  language: 'en-US',
  options: {
    model: 'nova-3', // nova-3 = best accuracy; flux-general-en = enables preflight
    smartFormat: true,
    punctuation: true,
    interimResults: true,
    endpointing: 300, // ms of silence before speech_final fires
    vadEvents: true,
  },
});
```

### Language Models (LLM)

| Provider       | Notes                                                              |
| -------------- | ------------------------------------------------------------------ |
| `AnthropicLLM` | Claude models. Requires `@anthropic-ai/sdk`. Streaming by default. |
| `OpenAILLM`    | GPT models. Requires `openai`.                                     |

**`AnthropicLLM` options:**

```typescript
new AnthropicLLM({
  apiKey: 'your-key', // or proxyUrl
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
  apiKey: 'your-key', // or proxyUrl
  model: 'gpt-4o-mini',
  systemPrompt: 'You are a helpful voice assistant.',
  maxTokens: 200,
  temperature: 0.7,
});
```

### Text-to-Speech (TTS)

| Provider      | Transport           | Notes                                          |
| ------------- | ------------------- | ---------------------------------------------- |
| `NativeTTS`   | SpeechSynthesis API | No API key. Chrome, Edge, Firefox, and Safari. |
| `DeepgramTTS` | WebSocket           | 24 kHz streaming. Requires `@deepgram/sdk`.    |

**`NativeTTS` options:**

```typescript
new NativeTTS({
  rate: 1.0, // speech rate (0.1–10)
  pitch: 1.0, // voice pitch (0–2)
  volume: 1.0, // volume (0–1)
  preferLocal: true, // prefer on-device voices over cloud voices
});
```

**`DeepgramTTS` options:**

```typescript
new DeepgramTTS({
  apiKey: 'your-key', // or proxyUrl
  options: {
    model: 'aura-2-thalia-en',
    encoding: 'linear16',
    sampleRate: 24000,
  },
});
```

---

## Configuration

Full `CompositeVoice` configuration reference:

```typescript
const agent = new CompositeVoice({
  // Required: one provider of each type
  stt: sttProvider,
  llm: llmProvider,
  tts: ttsProvider,

  // Conversation memory (disabled by default)
  conversationHistory: {
    enabled: true,
    maxTurns: 10, // 0 = unlimited; each turn = one user+assistant pair
  },

  // Eager/speculative LLM generation (requires Deepgram v2 STT)
  eagerLLM: {
    enabled: true,
    cancelOnTextChange: true, // restart if preflight transcript was wrong
  },

  // Turn-taking: when to pause the mic during TTS playback
  turnTaking: {
    strategy: 'auto', // 'auto' | 'conservative' | 'aggressive' | 'detect'
  },

  // Audio capture settings
  audio: {
    sampleRate: 16000,
    channels: 1,
  },

  // Logging
  logging: {
    enabled: true,
    level: 'info', // 'debug' | 'info' | 'warn' | 'error'
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

Subscribe to any part of the voice pipeline with a type-safe event system:

```typescript
agent.on('event.name', handler); // subscribe
agent.off('event.name', handler); // unsubscribe
agent.once('event.name', handler); // fire once then auto-unsubscribe
```

### Agent events

| Event               | Payload                    | Description                                  |
| ------------------- | -------------------------- | -------------------------------------------- |
| `agent.ready`       | `{ state }`                | SDK initialized and ready to start listening |
| `agent.stateChange` | `{ state, previousState }` | Agent moved to a new state                   |
| `agent.error`       | `{ error }`                | System-level error                           |

### Transcription events

| Event                       | Payload                 | Description                                 |
| --------------------------- | ----------------------- | ------------------------------------------- |
| `transcription.start`       | —                       | Transcription session opened                |
| `transcription.interim`     | `{ text, isFinal }`     | Partial transcript — updates word by word   |
| `transcription.final`       | `{ text, isFinal }`     | Confirmed transcript segment                |
| `transcription.speechFinal` | `{ text, speechFinal }` | Full utterance ended — triggers the LLM     |
| `transcription.preflight`   | `{ text, isPreflight }` | Early end-of-turn signal (Deepgram v2 only) |
| `transcription.error`       | `{ error }`             | Transcription error                         |

### LLM events

| Event          | Payload      | Description             |
| -------------- | ------------ | ----------------------- |
| `llm.start`    | `{ prompt }` | LLM generation started  |
| `llm.chunk`    | `{ chunk }`  | Text token received     |
| `llm.complete` | `{ text }`   | Full response assembled |
| `llm.error`    | `{ error }`  | LLM error               |

### TTS events

| Event          | Payload        | Description           |
| -------------- | -------------- | --------------------- |
| `tts.start`    | `{ text }`     | Synthesis started     |
| `tts.audio`    | `{ chunk }`    | Audio chunk ready     |
| `tts.metadata` | `{ metadata }` | Audio format metadata |
| `tts.complete` | —              | Playback finished     |
| `tts.error`    | `{ error }`    | TTS error             |

### Audio events

| Event                  | Payload     | Description            |
| ---------------------- | ----------- | ---------------------- |
| `audio.capture.start`  | —           | Microphone opened      |
| `audio.capture.stop`   | —           | Microphone closed      |
| `audio.capture.error`  | `{ error }` | Capture failure        |
| `audio.playback.start` | —           | Audio playback started |
| `audio.playback.end`   | —           | Audio playback ended   |
| `audio.playback.error` | `{ error }` | Playback failure       |

---

## Agent states

The agent moves through a well-defined state machine:

```
idle → ready → listening → thinking → speaking → listening → ...
```

| State       | Description                                          |
| ----------- | ---------------------------------------------------- |
| `idle`      | Not initialized                                      |
| `ready`     | Initialized, waiting to start                        |
| `listening` | Capturing audio and transcribing                     |
| `thinking`  | LLM is generating a response                         |
| `speaking`  | TTS audio is playing                                 |
| `error`     | Recoverable error — call `startListening()` to retry |

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
  stt,
  llm,
  tts,
  conversationHistory: {
    enabled: true,
    maxTurns: 10, // keep last 10 user+assistant pairs; 0 = unlimited
  },
});
```

Each completed turn is automatically appended and included in the next LLM call:

```
You:  "My name is Sam."
AI:   "Nice to meet you, Sam!"
You:  "What's my name?"
AI:   "Your name is Sam."   ← LLM remembers
```

Access and manage history programmatically:

```typescript
const history = agent.getHistory(); // LLMMessage[]
agent.clearHistory(); // start fresh without reinitializing
```

See [Example 02](./examples/02-conversation-history/) for a demo with a full chat-thread UI.

---

## Eager LLM pipeline

With Deepgram v2 models (e.g. `flux-general-en`), the SDK can start LLM generation _before_ the user finishes speaking, using an early `preflight` end-of-turn signal. This reduces perceived latency noticeably.

```typescript
const agent = new CompositeVoice({
  stt: new DeepgramSTT({ apiKey, options: { model: 'flux-general-en', ... } }),
  llm, tts,
  eagerLLM: {
    enabled: true,
    cancelOnTextChange: true,  // restart if the preflight text was wrong
  },
});
```

How it works:

```
preflight fires  →  LLM starts (speculative)
speech_final arrives
        ↓
  text unchanged?  →  LLM continues streaming uninterrupted
  text changed?    →  LLM cancelled, restarts with correct text
```

See [Example 03](./examples/03-eager-pipeline/) for a demo with real-time pipeline timing.

---

## Turn-taking

Control whether the microphone is paused while the AI is speaking:

```typescript
const agent = new CompositeVoice({
  stt,
  llm,
  tts,
  turnTaking: { strategy: 'auto' },
});
```

| Strategy         | Behaviour                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `auto` (default) | Pauses mic for `NativeSTT` (no echo cancellation); does not pause for `DeepgramSTT` (relies on hardware echo cancellation) |
| `conservative`   | Always pause the mic during TTS playback                                                                                   |
| `aggressive`     | Never pause — use only with hardware echo cancellation                                                                     |
| `detect`         | Attempt to detect echo cancellation support at runtime                                                                     |

---

## Server-side proxy

Keep API keys completely out of the browser. The proxy middleware forwards browser requests to providers and injects credentials server-side. The browser bundle contains zero secrets.

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
  pathPrefix: '/proxy',
});

app.use(proxy.middleware);
proxy.attachWebSocket(server); // required for Deepgram WebSocket connections

app.use(express.static('dist'));
server.listen(3004);
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
server.listen(3004);
```

### Browser side

Replace `apiKey` with `proxyUrl` in any provider config:

```typescript
const stt = new DeepgramSTT({
  proxyUrl: `${window.location.origin}/proxy/deepgram`,
  options: { model: 'nova-3', ... },
});

const llm = new AnthropicLLM({
  proxyUrl: `${window.location.origin}/proxy/anthropic`,
  model: 'claude-haiku-4-5-20251001',
});

const tts = new DeepgramTTS({
  proxyUrl: `${window.location.origin}/proxy/deepgram`,
  options: { model: 'aura-2-thalia-en', ... },
});
```

See [Example 04](./examples/04-proxy-server/) for a complete production-ready setup.

---

## Custom providers

Extend the abstract base classes to plug in any provider:

```typescript
import { BaseSTTProvider } from '@lukeocodes/composite-voice';

class MySTT extends BaseSTTProvider {
  protected async onInitialize(): Promise<void> {
    // connect to your service
  }

  protected async onDispose(): Promise<void> {
    // clean up resources
  }

  async startCapture(): Promise<void> {
    // stream audio and emit events:
    this.emit('transcription.interim', { text, isFinal: false });
    this.emit('transcription.final', { text, isFinal: true });
    this.emit('transcription.speechFinal', { text, speechFinal: true });
  }

  async stopCapture(): Promise<void> {
    // stop the stream
  }
}
```

| Base class        | Use for                                    |
| ----------------- | ------------------------------------------ |
| `BaseSTTProvider` | Any speech-to-text provider                |
| `LiveSTTProvider` | WebSocket-based real-time STT              |
| `RestSTTProvider` | Request/response STT (batch transcription) |
| `BaseLLMProvider` | Any language model                         |
| `BaseTTSProvider` | Any text-to-speech provider                |
| `LiveTTSProvider` | WebSocket-based streaming TTS              |
| `RestTTSProvider` | Request/response TTS                       |

See [CONTRIBUTING.md](./CONTRIBUTING.md#adding-a-provider) for the full implementation guide and the existing providers in `src/providers/` as reference implementations.

---

## Examples

Five standalone Vite apps in [`examples/`](./examples/), each introducing one new concept:

| #                                                | Stack                                 | What it shows                                             | API keys             | Port |
| ------------------------------------------------ | ------------------------------------- | --------------------------------------------------------- | -------------------- | ---- |
| [00](./examples/00-native-anthropic-native/)     | NativeSTT + Anthropic + NativeTTS     | Minimum viable setup — free STT and TTS                   | Anthropic            | 3000 |
| [01](./examples/01-deepgram-anthropic-deepgram/) | DeepgramSTT + Anthropic + DeepgramTTS | Production WebSocket pipeline                             | Deepgram + Anthropic | 3001 |
| [02](./examples/02-conversation-history/)        | + conversation memory                 | Multi-turn history, `getHistory()`, `clearHistory()`      | Anthropic            | 3002 |
| [03](./examples/03-eager-pipeline/)              | + eager LLM                           | Speculative generation, preflight events, pipeline timing | Deepgram + Anthropic | 3003 |
| [04](./examples/04-proxy-server/)                | + server proxy                        | API keys stay on the server, `proxyUrl` in the browser    | Server-side only     | 3004 |

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

| Browser       | NativeSTT     | DeepgramSTT | NativeTTS | DeepgramTTS |
| ------------- | ------------- | ----------- | --------- | ----------- |
| Chrome / Edge | Full          | Full        | Full      | Full        |
| Firefox       | Not supported | Full        | Full      | Full        |
| Safari        | Limited       | Full        | Full      | Full        |

`NativeSTT` depends on the [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API), which is only fully supported in Chromium-based browsers. All Deepgram providers work across browsers via WebSocket.

---

## Contributing

Contributions are welcome — new providers, bug fixes, documentation improvements, and feature requests alike. Every contribution matters, and there are meaningful options at every experience level.

- [CONTRIBUTING.md](./CONTRIBUTING.md) — development setup, workflow, and conventions
- [GitHub Issues](https://github.com/lukeocodes/composite-voice/issues) — bug reports and feature requests
- [GitHub Discussions](https://github.com/lukeocodes/composite-voice/discussions) — questions, ideas, and show & tell
- [Security Policy](./SECURITY.md) — how to report vulnerabilities privately

---

## License

MIT © [Luke Oliff](https://github.com/lukeocodes)
