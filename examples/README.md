# CompositeVoice Examples

Five standalone Vite apps that each demonstrate a distinct capability of the SDK. Work through them in order for a progressive learning path, or jump straight to the one that matches your use case.

---

## At a glance

| # | Example | Stack | What it introduces | API keys | Port |
|---|---------|-------|--------------------|----------|------|
| [00](./00-native-anthropic-native/) | Native STT + Anthropic + Native TTS | NativeSTT · AnthropicLLM · NativeTTS | The minimum viable setup — free STT and TTS, one API key | Anthropic only | 3000 |
| [01](./01-deepgram-anthropic-deepgram/) | Deepgram + Anthropic + Deepgram | DeepgramSTT · AnthropicLLM · DeepgramTTS | Production WebSocket pipeline, real-time streaming, cross-browser | Deepgram + Anthropic | 3001 |
| [02](./02-conversation-history/) | Conversation History | + `conversationHistory` | Multi-turn memory — the AI remembers earlier exchanges | Anthropic only | 3002 |
| [03](./03-eager-pipeline/) | Eager Pipeline | + `eagerLLM` | Speculative generation — LLM starts before user finishes speaking | Deepgram + Anthropic | 3003 |
| [04](./04-proxy-server/) | Server-Side Proxy | + proxy server | API keys stay on the server — zero secrets in the browser bundle | Server-side only | 3004 |

---

## Prerequisites

- **Node.js** 18 or later
- **pnpm** — `npm install -g pnpm`
- **Chrome or Edge** for examples 00 and 02 (Web Speech API limitation — Firefox does not support `NativeSTT`)
- API keys for the providers you need:
  - [Anthropic](https://console.anthropic.com/) — required for examples 00, 01, 02, 03 (client-side), 04 (server-side)
  - [Deepgram](https://console.deepgram.com/) — required for examples 01, 03 (client-side), 04 (server-side). Free tier available, no credit card required.

---

## Quick start

From the repo root, install and build once:

```bash
pnpm install && pnpm build
```

> The examples import the compiled SDK from `dist/`. This build step is required before running any example. For active SDK development, run `pnpm dev` in a second terminal so `dist/` rebuilds on every save.

Copy the env template for the example you want, fill in your keys, and start the dev server:

```bash
# Example 00 — only needs an Anthropic key
cp examples/00-native-anthropic-native/sample.env examples/00-native-anthropic-native/.env
# edit .env and add ANTHROPIC_API_KEY=sk-ant-...
pnpm example:00-native-anthropic-native:dev    # → http://localhost:3000
```

All five dev commands:

```bash
pnpm example:00-native-anthropic-native:dev      # → http://localhost:3000
pnpm example:01-deepgram-anthropic-deepgram:dev  # → http://localhost:3001
pnpm example:02-conversation-history:dev         # → http://localhost:3002
pnpm example:03-eager-pipeline:dev               # → http://localhost:3003
pnpm example:04-proxy-server:dev                 # → http://localhost:3004
```

---

## What each example teaches

### 00 — Native STT + Anthropic + Native TTS

The simplest possible voice agent. Browser-native speech recognition (Web Speech API), Claude for intelligence, and browser-native speech synthesis (SpeechSynthesis). One API key. No WebSockets.

This is where to start if you want to understand how CompositeVoice wires providers together — the `idle → ready → listening → thinking → speaking` state machine, the event system, and the basic turn-taking lifecycle.

**Best for:** First demo, learning the SDK, Chrome/Edge users who want zero setup friction.

### 01 — Deepgram + Anthropic + Deepgram

The recommended production configuration. Real-time WebSocket STT via Deepgram nova-3, Claude, and 24 kHz streaming TTS. Works in Chrome, Edge, and Firefox.

Swapping providers is one constructor change per provider — the core CompositeVoice setup is identical to example 00.

**Best for:** Production apps, Firefox support, better accuracy, more natural speech quality.

### 02 — Conversation History

Adds multi-turn memory so the agent remembers what was said earlier in the session. Demonstrates the `conversationHistory` configuration, `getHistory()`, and `clearHistory()` — plus a chat-thread UI that renders the full conversation alongside the voice interaction.

**Best for:** Q&A agents, assistants that track tasks, any use case that requires context across turns.

### 03 — Eager Pipeline

Demonstrates speculative LLM generation. With Deepgram v2 models, the SDK fires a `preflight` event slightly before `speech_final`. The SDK uses this to start the LLM early — if the final transcript matches, the response continues uninterrupted; if it differs, generation restarts correctly.

A real-time event timeline in the UI makes the pipeline timing visible.

**Best for:** Production apps where reducing perceived latency matters.

### 04 — Server-Side Proxy

Keeps API keys completely off the client. An Express server injects credentials before forwarding requests to the AI providers. The browser uses `proxyUrl` instead of `apiKey` in every provider config — no secrets in the bundle.

Includes a complete `server.ts` using `createExpressProxy` from the SDK's proxy module.

**Best for:** Any deployment where you must not expose API keys to end users.

---

## Scripts reference

| Command | What it does | Port |
|---------|--------------|------|
| `pnpm example:00-native-anthropic-native:dev` | Dev server for example 00 | 3000 |
| `pnpm example:00-native-anthropic-native:build` | Production build | — |
| `pnpm example:00-native-anthropic-native:preview` | Preview production build | 3000 |
| `pnpm example:01-deepgram-anthropic-deepgram:dev` | Dev server for example 01 | 3001 |
| `pnpm example:01-deepgram-anthropic-deepgram:build` | Production build | — |
| `pnpm example:01-deepgram-anthropic-deepgram:preview` | Preview production build | 3001 |
| `pnpm example:02-conversation-history:dev` | Dev server for example 02 | 3002 |
| `pnpm example:02-conversation-history:build` | Production build | — |
| `pnpm example:03-eager-pipeline:dev` | Dev server for example 03 | 3003 |
| `pnpm example:03-eager-pipeline:build` | Production build | — |
| `pnpm example:04-proxy-server:dev` | Dev server for example 04 | 3004 |
| `pnpm example:04-proxy-server:build` | Production build | — |

---

## Getting API keys

**Anthropic** — all examples:

1. Sign up at [console.anthropic.com](https://console.anthropic.com/) and generate a key
2. Add it to the example's `.env`: `ANTHROPIC_API_KEY=sk-ant-...`

**Deepgram** — examples 01, 03, and 04:

1. Sign up free at [console.deepgram.com](https://console.deepgram.com/) — no credit card required
2. Generate a key and add it to the example's `.env`: `DEEPGRAM_API_KEY=...`

> All examples use Vite's dev proxy to inject API keys server-side — no secrets are bundled into the browser. See example 04 for an in-depth look at the proxy architecture.

---

## Troubleshooting

**"Cannot find module '@lukeocodes/composite-voice'" or blank page**

The SDK must be compiled before examples can import it:

```bash
pnpm build
```

For active development, run both in separate terminals:

```bash
# Terminal 1 — recompiles SDK on every save
pnpm dev

# Terminal 2 — serves the example
pnpm example:00-native-anthropic-native:dev
```

**Microphone permission not prompted or denied**

- Click any button on the page before speaking — browsers require a user gesture to grant mic access
- If previously denied, click the lock icon in the address bar and reset the permission
- Microphone access requires `localhost` or HTTPS

**NativeSTT does nothing (examples 00 and 02)**

The Web Speech API is only fully supported in Chrome and Edge. Switch to example 01 for Firefox support.

**API key error at startup**

Copy the example's `sample.env` to `.env` in the same directory and fill in the keys:

```bash
cp examples/00-native-anthropic-native/sample.env examples/00-native-anthropic-native/.env
```

---

## Further reading

- [Main README](../README.md) — complete SDK reference: all providers, configuration, events, and the proxy API
- [CONTRIBUTING.md](../CONTRIBUTING.md) — how to add a new provider, run the test suite, and submit a pull request
