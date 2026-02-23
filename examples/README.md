# CompositeVoice Examples

Five standalone Vite apps, each introducing one new concept and building on the previous. Work through them in order, or jump to the one that matches your use case.

## Quick start

```bash
# From the repo root
pnpm install && pnpm build

# Run any example
pnpm example:00-native-anthropic-native:dev    # → http://localhost:3000
```

---

## The examples

| # | Stack | New concept | API keys | Port |
|---|-------|-------------|----------|------|
| [00](#00--simplest-voice-agent) | NativeSTT + Anthropic + NativeTTS | Minimal setup | Anthropic only | 3000 |
| [01](#01--deepgram--anthropic--deepgram) | DeepgramSTT + Anthropic + DeepgramTTS | WebSocket pipeline | Deepgram + Anthropic | 3001 |
| [02](#02--conversation-history) | + memory | `conversationHistory` | Anthropic only | 3002 |
| [03](#03--eager-pipeline) | + speculation | Preflight LLM generation | Deepgram + Anthropic | 3003 |
| [04](#04--server-side-proxy) | + security | `proxyUrl`, server-side keys | Server-side only | 3004 |

---

### 00 — Simplest voice agent

**[examples/00-native-anthropic-native/](./00-native-anthropic-native/)**

The fastest path to a working voice agent: browser-native speech recognition, Anthropic for intelligence, browser-native speech synthesis. One API key, no WebSockets.

```
Microphone → Web Speech API → AnthropicLLM → SpeechSynthesis → Speakers
```

- Free STT and TTS — browser built-ins only
- One API key (Anthropic)
- Chrome and Edge only (Web Speech API limitation)
- **Start here**

```bash
pnpm example:00-native-anthropic-native:dev   # http://localhost:3000
```

---

### 01 — Deepgram + Anthropic + Deepgram

**[examples/01-deepgram-anthropic-deepgram/](./01-deepgram-anthropic-deepgram/)**

The recommended production configuration: real-time WebSocket STT, Claude, and 24 kHz streaming TTS. Works in Firefox.

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

Enables multi-turn memory so the LLM remembers earlier exchanges within a session. Demonstrates the `conversationHistory` config, the `getHistory()` and `clearHistory()` APIs, and a chat-thread UI.

```
Microphone → NativeSTT → AnthropicLLM (with history[]) → NativeTTS → Speakers
```

- `conversationHistory.enabled = true` with `maxTurns: 10`
- Full conversation thread in the UI
- Only one API key (Anthropic)

```bash
pnpm example:02-conversation-history:dev   # http://localhost:3002
```

---

### 03 — Eager pipeline

**[examples/03-eager-pipeline/](./03-eager-pipeline/)**

Demonstrates the speculative LLM pipeline: the SDK starts generating a response before the user has finished speaking, using Deepgram's early `preflight` end-of-turn signal. Real-time pipeline timing is visualized in the UI.

```
Deepgram preflight → LLM starts (speculative)
Deepgram speech_final → LLM continues (text unchanged) | cancels + restarts (text changed)
                                         ↓
                           DeepgramTTS → Speakers
```

- `eagerLLM.enabled = true` and `cancelOnTextChange` demonstrated
- Real-time event timeline in the UI
- Requires Deepgram + Anthropic

```bash
pnpm example:03-eager-pipeline:dev   # http://localhost:3003
```

---

### 04 — Server-side proxy

**[examples/04-proxy-server/](./04-proxy-server/)**

Keeps API keys completely out of the browser bundle. A server-side proxy sits between the browser and the providers, injecting credentials before forwarding each request.

```
Browser ──[no keys]──▶ Express proxy ──[keys injected]──▶ Deepgram / Anthropic
```

- `proxyUrl` used instead of `apiKey` in all provider configs
- Vite dev proxy for development; `createExpressProxy` for production
- `server.ts` is a complete, runnable production example
- API keys never appear in the browser bundle

```bash
pnpm example:04-proxy-server:dev   # http://localhost:3004
```

---

## How the examples are structured

Each example is an independent Vite app in a pnpm workspace. They reference the root SDK package via the `workspace:*` protocol:

```json
{
  "dependencies": {
    "@lukeocodes/composite-voice": "workspace:*"
  }
}
```

The Vite config in each example resolves `@lukeocodes/composite-voice` to `../../dist/index.mjs`, so you always need to run `pnpm build` before starting an example. For active development, run `pnpm dev` (SDK watch mode) in one terminal and the example dev server in another.

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

- Grant microphone permission when the browser prompts, or click the lock icon in the address bar
- HTTPS is required for microphone access in production; `localhost` is always permitted
- For `NativeSTT` (examples 00 and 02): Chrome and Edge only

---

## Adding a new example

1. Create a directory: `examples/my-example/`
2. Add `package.json` with `"@lukeocodes/composite-voice": "workspace:*"` in `dependencies`
3. Add a `vite.config.js` that resolves the SDK to `../../dist/index.mjs`
4. Add dev/build/preview scripts to the root `package.json`
5. Run `pnpm install` to register the new workspace package
6. Write a `README.md` explaining what the example demonstrates and what someone will learn from it
