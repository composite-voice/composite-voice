# CompositeVoice Examples

Five standalone Vite applications, each demonstrating a different aspect of the SDK. They are designed to be explored in order — each one builds on the concepts introduced by the previous.

## Quick start

```bash
# From the repo root
pnpm install
pnpm build

# Run any example
pnpm example:00-native-anthropic-native:dev    # → http://localhost:3000
```

---

## The examples at a glance

| # | Directory | Stack | API keys | Port |
|---|-----------|-------|----------|------|
| [00](#00--simplest-voice-agent) | `00-native-anthropic-native` | NativeSTT + Anthropic + NativeTTS | Anthropic only | 3000 |
| [01](#01--best-in-class-deepgram--anthropic) | `01-deepgram-anthropic-deepgram` | DeepgramSTT + Anthropic + DeepgramTTS | Deepgram + Anthropic | 3001 |
| [02](#02--conversation-history) | `02-conversation-history` | NativeSTT + Anthropic + NativeTTS + memory | Anthropic only | 3002 |
| [03](#03--eager-pipeline) | `03-eager-pipeline` | DeepgramSTT + Anthropic + DeepgramTTS + eager LLM | Deepgram + Anthropic | 3003 |
| [04](#04--server-side-proxy) | `04-proxy-server` | All providers via server proxy | Server-side only | 3004 |

---

### 00 — Simplest voice agent

**[examples/00-native-anthropic-native/](./00-native-anthropic-native/)**

The fastest path to a working voice agent: browser-native speech recognition, Anthropic for intelligence, browser-native speech synthesis. No Deepgram account needed — just one API key.

```
Microphone → Web Speech API → AnthropicLLM → SpeechSynthesis → Speakers
```

- Only one API key (Anthropic)
- Works in Chrome and Edge
- Start here before adding paid speech providers

```bash
pnpm example:00-native-anthropic-native:dev   # http://localhost:3000
```

---

### 01 — Best-in-class (Deepgram + Anthropic)

**[examples/01-deepgram-anthropic-deepgram/](./01-deepgram-anthropic-deepgram/)**

Production-quality voice agent using Deepgram's real-time WebSocket STT and streaming TTS at 24 kHz, paired with Anthropic's fastest Claude model.

```
Microphone → DeepgramSTT (nova-3, WS) → AnthropicLLM → DeepgramTTS (aura-2, WS) → Speakers
```

- Real-time transcript streaming via WebSocket
- 24 kHz streaming TTS for natural playback
- Works in Chrome, Edge, and Firefox

```bash
pnpm example:01-deepgram-anthropic-deepgram:dev   # http://localhost:3001
```

---

### 02 — Conversation history

**[examples/02-conversation-history/](./02-conversation-history/)**

Enables multi-turn memory so the LLM remembers earlier exchanges. Shows how `conversationHistory` works and how to display a full chat thread in the UI.

```
Microphone → NativeSTT → AnthropicLLM (with history[]) → NativeTTS → Speakers
```

- Full conversation thread displayed in the UI
- `agent.getHistory()` and `agent.clearHistory()` demonstrated
- Only one API key (Anthropic)

```bash
pnpm example:02-conversation-history:dev   # http://localhost:3002
```

---

### 03 — Eager pipeline

**[examples/03-eager-pipeline/](./03-eager-pipeline/)**

Demonstrates the speculative LLM pipeline: the SDK starts generating a response before the user has finished speaking, using Deepgram's early `preflight` end-of-turn signal. The result is noticeably lower perceived latency.

```
Deepgram preflight  → LLM starts (speculative)
Deepgram speech_final → LLM continues (text unchanged) | cancels and restarts (text changed)
                                          ↓
                            DeepgramTTS → Speakers
```

- Real-time pipeline timing visualized in the UI
- `eagerLLM.enabled` and `cancelOnTextChange` configuration
- Requires Deepgram + Anthropic

```bash
pnpm example:03-eager-pipeline:dev   # http://localhost:3003
```

---

### 04 — Server-side proxy

**[examples/04-proxy-server/](./04-proxy-server/)**

Keeps API keys completely out of the browser. A server-side proxy sits between the browser and the providers, injecting credentials before forwarding each request. The browser bundle contains zero secrets.

```
Browser ──[no keys]──▶ Express proxy ──[keys injected]──▶ Deepgram / Anthropic
```

- `proxyUrl` used instead of `apiKey` in all provider configs
- Vite dev proxy for development; `createExpressProxy` for production
- `server.ts` is a complete, runnable production example

```bash
pnpm example:04-proxy-server:dev   # http://localhost:3004
```

---

## How the workspace is structured

Each example is an independent **Vite application** inside the Nx monorepo. They depend on the root SDK package via the `workspace:*` protocol:

```json
{
  "dependencies": {
    "@lukeocodes/composite-voice": "workspace:*"
  }
}
```

The Vite config resolves `@lukeocodes/composite-voice` directly to the local `dist/` folder, so you always need to run `pnpm build` first. After that, running `pnpm dev` in the root alongside an example dev server gives you live rebuilds.

---

## Troubleshooting

**"Cannot find module '@lukeocodes/composite-voice'"**

The SDK hasn't been built yet:

```bash
pnpm build
```

**"Module not found" or dependency errors**

Install workspace dependencies:

```bash
pnpm install
```

**Microphone not working**

- Grant microphone permission when your browser asks (or check the address bar lock icon)
- HTTPS is required for microphone access in production; `localhost` is always allowed
- For `NativeSTT`: Chrome and Edge only — Web Speech API is not supported in Firefox or Safari

**Nx cache issues**

```bash
pnpm exec nx reset
```

---

## Adding a new example

1. Create a directory: `examples/my-example/`
2. Add `package.json` with `@lukeocodes/composite-voice: "workspace:*"` in dependencies
3. Add `project.json` with Nx targets (copy from an existing example)
4. Add a `vite.config.js` that resolves the SDK to `../../dist/index.mjs`
5. Add dev/build/preview scripts to the root `package.json`
6. Run `pnpm install`
7. Write a `README.md` explaining what the example demonstrates and how to run it
