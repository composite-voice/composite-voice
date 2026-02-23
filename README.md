# CompositeVoice

[![npm version](https://badge.fury.io/js/%40lukeocodes%2Fcomposite-voice.svg)](https://www.npmjs.com/package/@lukeocodes/composite-voice)
[![CI](https://github.com/lukeocodes/composite-voice/actions/workflows/ci.yml/badge.svg)](https://github.com/lukeocodes/composite-voice/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

**A browser SDK for building AI voice agents — wire together any STT, LLM, and TTS provider behind one unified interface.**

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new NativeSTT(),
  llm: new AnthropicLLM({ apiKey: 'sk-ant-...', model: 'claude-haiku-4-5-20251001' }),
  tts: new NativeTTS(),
});

await agent.initialize();
await agent.startListening();
// Microphone capture, transcription, LLM streaming, TTS playback — all handled.
```

---

## Why CompositeVoice?

Building a voice agent from scratch means solving many hard problems simultaneously: microphone capture, WebSocket reconnection, turn-taking logic, interleaving STT/LLM/TTS lifecycles, and stitching together provider SDKs that share nothing in common. It is easy to spend weeks before your first working demo.

CompositeVoice handles the plumbing. You declare the pipeline; the SDK runs it.

| Feature                         | What it means for you                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Provider-agnostic**           | Deepgram, Anthropic, OpenAI, or browser built-ins — mix and match freely. Swapping a provider is one constructor change.     |
| **Type-safe throughout**        | Every event payload, config option, and provider interface is fully typed. TypeScript autocomplete works end-to-end.         |
| **Zero mandatory dependencies** | Provider SDKs are optional peer dependencies — install only what you actually use.                                           |
| **Event-driven**                | Subscribe to any stage of the pipeline: individual transcription words, LLM tokens, TTS audio chunks, and state transitions. |
| **Conversation memory**         | Multi-turn history that grows and trims automatically, included in every LLM call.                                           |
| **Eager LLM generation**        | Start generating a response before the user finishes speaking — cuts perceived latency noticeably.                           |
| **Server-side proxy**           | Keep API keys completely off the client. Proxy middleware included for Express, Next.js, and plain Node.js.                  |
| **Extensible**                  | Abstract base classes make it straightforward to add any STT, LLM, or TTS service.                                           |

---

## Table of contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
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
- [Community](#community)
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

Node.js 18 or later is required.

Provider SDKs are optional peer dependencies — install only what you use:

```bash
pnpm add @anthropic-ai/sdk    # AnthropicLLM (>=0.67.0)
pnpm add @deepgram/sdk        # DeepgramSTT + DeepgramTTS (>=4.11.2)
pnpm add openai               # OpenAILLM (>=6.5.0)
pnpm add ws                   # server-side proxy WebSocket support, Node.js only (>=8.0.0)
```

---

## Quick start

### Simplest setup — one API key, free STT and TTS

Uses the browser's built-in Web Speech API and SpeechSynthesis. Requires only an Anthropic key. Works in Chrome and Edge with no additional dependencies.

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

Real-time WebSocket STT, Claude, and 24 kHz streaming TTS. Works in all modern browsers including Firefox.

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
    options: {
      model: 'nova-3',
      smartFormat: true,
      interimResults: true,
      endpointing: 300,
    },
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

## How it works

Every voice agent follows the same pipeline:

```
Microphone
    ↓
STT provider  (NativeSTT or DeepgramSTT)
    ↓  transcription.speechFinal — user finished speaking
LLM provider  (AnthropicLLM or OpenAILLM)
    ↓  llm.chunk — token by token
TTS provider  (NativeTTS or DeepgramTTS)
    ↓
Speakers
    ↓  returns to listening automatically
```

The agent state machine moves through well-defined states — `idle → ready → listening → thinking → speaking` — emitting events at every transition. Your UI subscribes to these events; the SDK manages the lifecycle.

---

## Providers

### Speech-to-Text (STT)

| Provider      | Transport      | Browser support     | Peer dependency |
| ------------- | -------------- | ------------------- | --------------- |
| `NativeSTT`   | Web Speech API | Chrome, Edge        | None            |
| `DeepgramSTT` | WebSocket      | All modern browsers | `@deepgram/sdk` |

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
  apiKey: 'your-key', // omit and use proxyUrl for server-side key injection
  language: 'en-US',
  options: {
    model: 'nova-3', // nova-3 = best accuracy; flux-general-en = enables preflight/eager LLM
    smartFormat: true,
    punctuation: true,
    interimResults: true,
    endpointing: 300, // ms of silence before speech_final fires
    vadEvents: true,
  },
});
```

### Language Models (LLM)

| Provider       | Transport      | Peer dependency     | Notes                              |
| -------------- | -------------- | ------------------- | ---------------------------------- |
| `AnthropicLLM` | HTTP streaming | `@anthropic-ai/sdk` | Claude models. Streams by default. |
| `OpenAILLM`    | HTTP           | `openai`            | GPT models.                        |

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

### Text-to-Speech (TTS)

| Provider      | Transport           | Browser support     | Peer dependency |
| ------------- | ------------------- | ------------------- | --------------- |
| `NativeTTS`   | SpeechSynthesis API | All modern browsers | None            |
| `DeepgramTTS` | WebSocket           | All modern browsers | `@deepgram/sdk` |

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
    maxTurns: 10, // 0 = unlimited; each turn = one user + assistant exchange
  },

  // Eager/speculative LLM generation (requires Deepgram v2 STT)
  eagerLLM: {
    enabled: true,
    cancelOnTextChange: true, // restart generation if the preflight transcript was wrong
  },

  // Turn-taking: whether to pause the mic during TTS playback
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

  // WebSocket reconnection (applies to Deepgram providers)
  reconnection: {
    maxAttempts: 5,
    initialDelay: 1000, // ms before first retry
    maxDelay: 30000, // cap on retry interval
    backoffMultiplier: 2, // exponential backoff factor
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

| Event               | Payload                    | Description                                  |
| ------------------- | -------------------------- | -------------------------------------------- |
| `agent.ready`       | `{ state }`                | SDK initialized and ready to start listening |
| `agent.stateChange` | `{ state, previousState }` | Agent moved to a new state                   |
| `agent.error`       | `{ error }`                | System-level error                           |

### Transcription events

| Event                       | Payload                 | Description                                                          |
| --------------------------- | ----------------------- | -------------------------------------------------------------------- |
| `transcription.start`       | —                       | Transcription session opened                                         |
| `transcription.interim`     | `{ text, isFinal }`     | Partial transcript — updates word by word while the user is speaking |
| `transcription.final`       | `{ text, isFinal }`     | Confirmed transcript segment                                         |
| `transcription.speechFinal` | `{ text, speechFinal }` | Full utterance ended — triggers the LLM                              |
| `transcription.preflight`   | `{ text, isPreflight }` | Early end-of-turn signal (Deepgram v2 models only)                   |
| `transcription.error`       | `{ error }`             | Transcription error                                                  |

### LLM events

| Event          | Payload      | Description                        |
| -------------- | ------------ | ---------------------------------- |
| `llm.start`    | `{ prompt }` | LLM generation started             |
| `llm.chunk`    | `{ chunk }`  | Text token received from the model |
| `llm.complete` | `{ text }`   | Full response assembled            |
| `llm.error`    | `{ error }`  | LLM error                          |

### TTS events

| Event          | Payload        | Description                    |
| -------------- | -------------- | ------------------------------ |
| `tts.start`    | `{ text }`     | Synthesis started              |
| `tts.audio`    | `{ chunk }`    | Audio chunk ready for playback |
| `tts.metadata` | `{ metadata }` | Audio format metadata          |
| `tts.complete` | —              | Playback finished              |
| `tts.error`    | `{ error }`    | TTS error                      |

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

The agent moves through a well-defined state machine. Every transition emits an `agent.stateChange` event so your UI can always reflect what the agent is doing.

```
idle → ready → listening → thinking → speaking
                    ^                     |
                    |_____________________|
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
  console.log(`${previousState} → ${state}`);
});
```

The `error` state is recoverable. The agent does not shut down on errors — it waits for you to call `startListening()` again, which lets you add your own retry UI or backoff logic.

---

## Conversation history

Enable multi-turn memory so the LLM remembers previous exchanges within a session. Without this, each user utterance is sent to the LLM in isolation.

```typescript
const agent = new CompositeVoice({
  stt,
  llm,
  tts,
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

See [Example 02](./examples/02-conversation-history/) for a demo with a full chat-thread UI.

---

## Eager LLM pipeline

With Deepgram v2 models (e.g. `flux-general-en`), the SDK can begin LLM generation before the user finishes speaking. Deepgram emits a `preflight` event — an early end-of-turn prediction — which the SDK uses to speculatively start the LLM. If the final transcript matches the preflight, the response continues uninterrupted. If it differs, generation restarts with the correct text.

**Enabling eager LLM:**

```typescript
const agent = new CompositeVoice({
  stt: new DeepgramSTT({
    apiKey: 'your-key',
    options: { model: 'flux-general-en', interimResults: true, endpointing: 300 },
  }),
  llm,
  tts,
  eagerLLM: {
    enabled: true,
    cancelOnTextChange: true, // restart if the preflight text was wrong
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

The result is noticeably lower perceived latency on natural speech patterns where the end of an utterance is predictable. See [Example 03](./examples/03-eager-pipeline/) for a demo with real-time pipeline timing.

---

## Turn-taking

Turn-taking controls whether the microphone is paused while the AI is speaking. The right strategy depends on whether your audio setup provides echo cancellation.

```typescript
const agent = new CompositeVoice({
  stt,
  llm,
  tts,
  turnTaking: { strategy: 'auto' },
});
```

| Strategy         | Behaviour                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `auto` (default) | Pauses the mic for `NativeSTT` (no echo cancellation); leaves it open for `DeepgramSTT` (relies on hardware echo cancellation). |
| `conservative`   | Always pauses the mic during TTS playback. Safe choice if you are unsure about echo cancellation.                               |
| `aggressive`     | Never pauses. Only suitable with reliable hardware echo cancellation.                                                           |
| `detect`         | Attempts to detect echo cancellation support at runtime before choosing a strategy.                                             |

---

## Server-side proxy

Keep API keys completely out of the browser. The proxy middleware forwards browser requests to provider APIs and injects credentials server-side. Your deployed client bundle contains zero secrets.

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

const agent = new CompositeVoice({ stt, llm, tts });
```

See [Example 04](./examples/04-proxy-server/) for a complete production-ready setup.

---

## Custom providers

All built-in providers implement abstract base classes. You can plug in any STT, LLM, or TTS service by extending the appropriate base class and emitting the expected events.

### Base classes

| Base class        | Use for                                    |
| ----------------- | ------------------------------------------ |
| `BaseSTTProvider` | Any speech-to-text provider                |
| `LiveSTTProvider` | WebSocket-based real-time STT              |
| `RestSTTProvider` | Request/response STT (batch transcription) |
| `BaseLLMProvider` | Any language model                         |
| `BaseTTSProvider` | Any text-to-speech provider                |
| `LiveTTSProvider` | WebSocket-based streaming TTS              |
| `RestTTSProvider` | Request/response TTS                       |

### STT provider skeleton

```typescript
import { BaseSTTProvider } from '@lukeocodes/composite-voice';

class MySTT extends BaseSTTProvider {
  protected async onInitialize(): Promise<void> {
    // Connect to your STT service, set up any clients or state.
  }

  protected async onDispose(): Promise<void> {
    // Clean up connections and resources.
  }

  async startCapture(): Promise<void> {
    // Stream audio from the microphone to your service, then emit:
    this.emit('transcription.interim', { text, isFinal: false });
    this.emit('transcription.final', { text, isFinal: true });
    this.emit('transcription.speechFinal', { text, speechFinal: true });
  }

  async stopCapture(): Promise<void> {
    // Flush and close the stream.
  }
}
```

### LLM provider skeleton

```typescript
import { BaseLLMProvider, LLMMessage } from '@lukeocodes/composite-voice';

class MyLLM extends BaseLLMProvider {
  protected async onInitialize(): Promise<void> {
    // Set up your LLM client.
  }

  async generate(prompt: string, history: LLMMessage[]): Promise<void> {
    this.emit('llm.start', { prompt });
    // Stream tokens from your model, then emit:
    this.emit('llm.chunk', { chunk: token });
    this.emit('llm.complete', { text: fullResponse });
  }
}
```

### TTS provider skeleton

```typescript
import { BaseTTSProvider } from '@lukeocodes/composite-voice';

class MyTTS extends BaseTTSProvider {
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

For a full implementation guide, see [CONTRIBUTING.md](./CONTRIBUTING.md#adding-a-provider). The built-in providers in `src/providers/` are the best reference implementations.

---

## Examples

Five standalone Vite apps in [`examples/`](./examples/), each introducing one new concept. They are designed to be read in order — each builds on the previous one.

| #                                                | Stack                                 | What it demonstrates                                      | API keys needed      | Port |
| ------------------------------------------------ | ------------------------------------- | --------------------------------------------------------- | -------------------- | ---- |
| [00](./examples/00-native-anthropic-native/)     | NativeSTT + Anthropic + NativeTTS     | Minimum viable setup — free STT and TTS, one API key      | Anthropic            | 3000 |
| [01](./examples/01-deepgram-anthropic-deepgram/) | DeepgramSTT + Anthropic + DeepgramTTS | Production WebSocket pipeline, real-time streaming        | Deepgram + Anthropic | 3001 |
| [02](./examples/02-conversation-history/)        | + `conversationHistory`               | Multi-turn memory, `getHistory()`, `clearHistory()`       | Anthropic            | 3002 |
| [03](./examples/03-eager-pipeline/)              | + `eagerLLM`                          | Speculative generation, preflight events, pipeline timing | Deepgram + Anthropic | 3003 |
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

`NativeSTT` depends on the [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API), which is only fully supported in Chromium-based browsers. `NativeSTT` is unreliable in Safari. All Deepgram providers use WebSocket connections and work across all modern browsers.

For cross-browser production deployments, use `DeepgramSTT` and `DeepgramTTS`.

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
