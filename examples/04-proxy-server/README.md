# Example 04 — Server-Side Proxy

Demonstrates how to keep API keys completely out of the browser. A server-side proxy sits between the browser and the AI providers, injecting credentials before forwarding each request. The browser bundle contains zero secrets.

| | Provider | Via |
|-|----------|-----|
| **STT** | `DeepgramSTT` — nova-3 | Proxy (`proxyUrl` instead of `apiKey`) |
| **LLM** | `AnthropicLLM` — claude-haiku-4-6 | Proxy |
| **TTS** | `DeepgramTTS` — aura-2-thalia-en | Proxy |

---

## Why use a proxy?

Embedding API keys directly in a browser bundle means anyone who opens DevTools can copy them. This pattern solves the problem:

1. API keys live in server-side environment variables only
2. The browser connects to the same origin (`/proxy/...`) — no CORS issues
3. The proxy forwards requests to the real providers with keys injected
4. Works in production with any Node.js server

---

## How it works

### Development

Vite's built-in dev proxy handles forwarding and key injection:

```
Browser → http://localhost:3004/proxy/anthropic/* → https://api.anthropic.com/*  (key added)
Browser → ws://localhost:3004/proxy/deepgram/*   → wss://api.deepgram.com/*     (key added)
```

Providers use `proxyUrl` instead of `apiKey`:

```js
const stt = new DeepgramSTT({
  proxyUrl: `${window.location.origin}/proxy/deepgram`,
  options: { model: 'nova-3', ... },
});

const llm = new AnthropicLLM({
  proxyUrl: `${window.location.origin}/proxy/anthropic`,
  model: 'claude-haiku-4-6',
});
```

### Production

Replace the Vite dev proxy with `createExpressProxy` from `@lukeocodes/composite-voice/proxy`. See `server.ts` in this directory — it's a complete, runnable production example:

```typescript
import { createExpressProxy } from '@lukeocodes/composite-voice/proxy';

const proxy = createExpressProxy({
  deepgramApiKey:  process.env.DEEPGRAM_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  pathPrefix: '/proxy',
});

app.use(proxy.middleware);
proxy.attachWebSocket(server); // required for Deepgram WebSocket connections
```

Adapters are also available for Next.js App Router (`createNextJsProxy`) and plain Node.js `http.Server` (`createNodeProxy`). See `src/proxy/` in the SDK for details.

---

## Prerequisites

- Node.js 18+
- pnpm
- A [Deepgram API key](https://console.deepgram.com/) — free tier available
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

All commands run from the **repo root**:

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Build the SDK
pnpm build

# 3. Create your env file
cp examples/04-proxy-server/sample.env examples/04-proxy-server/.env
```

Edit `examples/04-proxy-server/.env`:

```env
DEEPGRAM_API_KEY=your-deepgram-api-key-here
ANTHROPIC_API_KEY=your-anthropic-api-key-here
```

> **Important:** These env vars do **not** use the `VITE_` prefix. They are read server-side only and are never injected into the browser bundle. This is the whole point.

---

## Run (development)

```bash
pnpm example:04-proxy-server:dev
```

Open [http://localhost:3004](http://localhost:3004) in Chrome or Edge.

To verify that no keys are in the bundle, open DevTools → Sources and search for your API key string — it won't be there.

---

## Run (production)

Build the front end first, then start the Express server:

```bash
# Build the browser app
pnpm example:04-proxy-server:build

# Start the Express proxy server
cd examples/04-proxy-server && npx tsx server.ts
```

The server listens on port 3004, serves the static build, and proxies all `/proxy/*` requests.

---

## Architecture

```
Browser ──[no keys]──▶ /proxy/deepgram   ──[key injected]──▶ wss://api.deepgram.com
Browser ──[no keys]──▶ /proxy/anthropic  ──[key injected]──▶ https://api.anthropic.com
```

---

## Troubleshooting

**404 on /proxy/* endpoints**

The Vite dev server proxy is only active while `pnpm dev` is running. In production, the Express server in `server.ts` handles these routes.

**WebSocket proxy not working**

WebSocket forwarding requires `proxy.attachWebSocket(server)` in the Express setup. Check `server.ts` and make sure this line is included.

**Keys still visible in DevTools**

Check that env vars do not have the `VITE_` prefix. Any `VITE_` variable is automatically injected into the browser bundle by Vite.

---

## Browser support

| Browser | Status |
|---------|--------|
| Chrome / Edge | Full support (recommended) |
| Firefox | Works; Web Audio API behaviour may differ slightly |
| Safari | Limited — WebSocket-based AudioWorklet support is restricted |
