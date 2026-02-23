# CompositeVoice Examples

Five standalone Vite applications, each demonstrating a different aspect of the SDK. They're designed to be explored in order — each one introduces a new concept and builds on the previous.

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

The fastest path to a working voice agent: browser-native speech recognition, Anthropic for intelligence, browser-native speech synthesis. Only one API key needed.

```
Microphone → Web Speech API → AnthropicLLM → SpeechSynthesis → Speakers
```

- Only one API key (Anthropic)
- Free STT and TTS — browser built-ins only
- Chrome and Edge only (Web Speech API limitation)
- **Start here**

```bash
pnpm example:00-native-anthropic-native:dev   # http://localhost:3000
```

---

### 01 — Best-in-class (Deepgram + Anthropic)

**[examples/01-deepgram-anthropic-deepgram/](./01-deepgram-anthropic-deepgram/)**

The recommended production configuration: real-time WebSocket STT, the fastest Claude model, and streaming TTS at 24 kHz. All three providers stream simultaneously.

```
Microphone → DeepgramSTT (nova-3, WS) → AnthropicLLM → DeepgramTTS (aura-2, WS) → Speakers
```

- Real-time transcript streaming via WebSocket
- 24 kHz TTS for natural-sounding speech
- Works in Chrome, Edge, and Firefox
- Deepgram free tier — no credit card required

```bash
pnpm example:01-deepgram-anthropic-deepgram:dev   # http://localhost:3001
```

---

### 02 — Conversation history

**[examples/02-conversation-history/](./02-conversation-history/)**

Enables multi-turn memory so the LLM remembers earlier exchanges within a session. Demonstrates the `conversationHistory` config, the `getHistory()` and `clearHistory()` APIs, and how to display a chat thread in the UI.

```
Microphone → NativeSTT → AnthropicLLM (with history[]) → NativeTTS → Speakers
```

- `conversationHistory.enabled = true` with `maxTurns: 10`
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
- `eagerLLM.enabled` and `cancelOnTextChange` demonstrated
- Requires Deepgram + Anthropic

```bash
pnpm example:03-eager-pipeline:dev   # http://localhost:3003
```

---

### 04 — Server-side proxy

**[examples/04-proxy-server/](./04-proxy-server/)**

Keeps API keys completely out of the browser bundle. A server-side proxy sits between the browser and the providers, injecting credentials before forwarding each request. The browser contains zero secrets.

```
Browser ──[no keys]──▶ Express proxy ──[keys injected]──▶ Deepgram / Anthropic
```

- `proxyUrl` used instead of `apiKey` in all provider configs
- Vite dev proxy for development; `createExpressProxy` for production
- `server.ts` is a complete, runnable production example
- Deepgram + Anthropic keys stay on the server

```bash
pnpm example:04-proxy-server:dev   # http://localhost:3004
```

---

## Workspace structure

Each example is an independent Vite application in the pnpm workspace. They reference the root SDK package via the `workspace:*` protocol:

```json
{
  "dependencies": {
    "@lukeocodes/composite-voice": "workspace:*"
  }
}
```

The Vite config in each example resolves `@lukeocodes/composite-voice` to the local `../../dist/index.mjs`, so you always need to run `pnpm build` before starting an example. For active development, run `pnpm dev` (SDK watch mode) in one terminal and the example dev server in another.

---

## Troubleshooting

**"Cannot find module '@lukeocodes/composite-voice'"**

Build the SDK first:

```bash
pnpm build
```

**"Module not found" or dependency errors**

Install workspace dependencies:

```bash
pnpm install
```

**Microphone not working**

- Grant microphone permission when the browser asks, or click the lock icon in the address bar
- HTTPS is required for microphone access in production; `localhost` is always permitted
- For `NativeSTT` (examples 00 and 02): Chrome and Edge only — Web Speech API is not supported in Firefox or Safari

---

## Adding a new example

1. Create a directory: `examples/my-example/`
2. Add `package.json` with `"@lukeocodes/composite-voice": "workspace:*"` in `dependencies`
3. Add a `vite.config.js` that resolves the SDK to `../../dist/index.mjs`
4. Add dev/build/preview scripts to the root `package.json`
5. Run `pnpm install` to register the new workspace package
6. Write a `README.md` that explains what the example demonstrates, how to run it, and what someone will learn from it
