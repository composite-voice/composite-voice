# Example 02 — Secure API Keys

Demonstrates the Express proxy pattern for keeping API keys server-side. The browser never sees real credentials — it connects through a proxy that injects keys before forwarding requests to Deepgram and Anthropic.

| | Provider | Via | Browser support |
|-|----------|-----|-----------------|
| **STT** | `DeepgramSTT` — nova-3 | `proxyUrl` (no `apiKey`) | All modern browsers |
| **LLM** | `AnthropicLLM` — claude-haiku-4-5 | `proxyUrl` (no `apiKey`) | All |
| **TTS** | `DeepgramTTS` — aura-2 | `proxyUrl` (no `apiKey`) | All modern browsers |

---

## What you'll learn

- Why API keys in browser bundles are a security risk — they're visible in DevTools to anyone
- How `createExpressProxy` from `@lukeocodes/composite-voice/proxy` works
- How `proxyUrl` replaces `apiKey` in every provider config
- Running a separate Express proxy server alongside Vite with `concurrently`
- Why env vars must **not** use the `VITE_` prefix to remain server-side only

---

## Architecture

This example runs **two processes** in parallel:

```
Express proxy (port 3001)          Vite dev server (port 3002)
  - Loads API keys from .env         - Serves the React app
  - Injects keys into headers        - No proxy config needed
  - Forwards to Deepgram / Anthropic - Browser connects to :3001 directly
```

```
Browser ──[no keys]──▶ Express proxy (3001) ──[key injected]──▶ Deepgram / Anthropic
```

---

## Prerequisites

- **Node.js** 18 or later and **pnpm** (`npm install -g pnpm`)
- A [Deepgram API key](https://console.deepgram.com/) — free tier, no credit card required
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

Run all commands from the **repo root**:

```bash
# 1. Install dependencies and build the SDK
pnpm install && pnpm build

# 2. Copy the env template
cp examples/02-secure-api-keys/sample.env examples/02-secure-api-keys/.env
```

Open `.env` and fill in your keys:

```env
ANTHROPIC_API_KEY=sk-ant-...
DEEPGRAM_API_KEY=your-deepgram-key-here
```

> **Important:** These env vars do **not** use the `VITE_` prefix. Any variable prefixed with `VITE_` is automatically bundled into the browser build by Vite — exactly what we're avoiding here.

---

## Run

```bash
pnpm --filter @lukeocodes/cv-example-02-secure-api-keys dev
```

This starts both the Express proxy on [http://localhost:3001](http://localhost:3001) and the Vite dev server on [http://localhost:3002](http://localhost:3002).

Open [http://localhost:3002](http://localhost:3002).

1. Click **Initialize** — connects providers through the proxy and requests microphone permission
2. Click **Start Listening** — the agent begins listening via Deepgram
3. Speak — your words appear as you talk, Claude's response streams back
4. Click **Stop** when done

---

## How it works

### Express proxy (`server.ts`)

```typescript
import express from 'express';
import { createExpressProxy } from '@lukeocodes/composite-voice/proxy';

const app = express();
const proxy = createExpressProxy({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  cors: { origins: ['http://localhost:3002'] },
});

app.use(proxy.middleware);

const server = app.listen(3001, () => {
  proxy.attachWebSocket(server);
  console.log('Proxy server running on http://localhost:3001');
});
```

### Browser code (zero API keys)

```tsx
const PROXY = 'http://localhost:3001';

const voice = new CompositeVoice({
  providers: [
    new DeepgramSTT({ proxyUrl: `${PROXY}/proxy/deepgram` }),
    new AnthropicLLM({ proxyUrl: `${PROXY}/proxy/anthropic`, model: 'claude-haiku-4-5' }),
    new DeepgramTTS({ proxyUrl: `${PROXY}/proxy/deepgram` }),
  ],
});
```

The `proxyUrl` option tells each provider to route through the Express proxy instead of connecting directly. The proxy reads API keys from environment variables and injects them into upstream requests.

---

## Verify keys are not in the browser

1. Open DevTools in Chrome/Edge
2. Go to **Sources** tab
3. Search for your API key string — you will not find it
4. Check the **Network** tab — requests go to `localhost:3001/proxy/*`, not directly to `api.deepgram.com` or `api.anthropic.com`

---

## Troubleshooting

**"CORS error" in the console**

The Express proxy is configured with `cors: { origins: ['http://localhost:3002'] }`. Make sure both servers are running and the Vite server is on port 3002.

**WebSocket connections fail**

`proxy.attachWebSocket(server)` must be called with the `http.Server` instance returned by `app.listen()`. This enables WebSocket proxying for Deepgram STT and TTS.

**"Cannot find module '@lukeocodes/composite-voice'"**

The SDK must be built before examples can import it:

```bash
pnpm build
```

**API key still visible in DevTools**

Ensure env vars in `.env` do **not** have the `VITE_` prefix. Any `VITE_*` variable is automatically exposed to the browser bundle by Vite.

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [10 — Proxy Server](../10-proxy-server/) | Full production proxy with Vite forwarding and static file serving |
| [01 — Conversation History](../01-conversation-history/) | Multi-turn memory so the AI remembers earlier exchanges |
| [20 — Deepgram Pipeline](../20-deepgram-pipeline/) | WebSocket STT/TTS with more Deepgram options |

---

## Browser support

Deepgram providers use WebSocket connections — they do not depend on the Web Speech API. Audio capture uses the MediaStream API and audio playback uses the Web Audio API.

| Browser | Microphone capture | Audio playback | Notes |
|---------|-------------------|----------------|-------|
| Chrome / Edge | Full support | Full support | Recommended |
| Firefox | Full support | Full support | Works |
| Safari | Full support | Varies by version | AudioWorklet support depends on Safari version |
