# Example 04 — Server-Side Proxy

Demonstrates how to keep API keys completely out of the browser bundle. A server-side proxy sits between the browser and the AI providers, injecting credentials server-side before forwarding each request. The browser bundle contains zero secrets.

| | Provider | Via |
|-|----------|-----|
| **STT** | `DeepgramSTT` — nova-3 | Proxy (`proxyUrl` instead of `apiKey`) |
| **LLM** | `AnthropicLLM` — claude-haiku-4-5 | Proxy |
| **TTS** | `DeepgramTTS` — aura-2-thalia-en | Proxy |

---

## Why use a proxy?

Embedding API keys directly in a browser bundle is a security risk. Anyone who opens DevTools → Sources can copy your keys and use them to run up your bill. This pattern eliminates that risk entirely:

1. **API keys never leave the server.** They live in environment variables, loaded at server startup.
2. **The browser connects to your own origin** (`/proxy/...`) — no CORS issues, no keys visible in network requests.
3. **The proxy forwards requests** to the real providers with credentials injected just before sending.
4. **Works in any Node.js environment** — Express, Next.js, plain `http.Server`, or any other framework.

---

## How it works

### Development mode

In development, Vite's built-in dev proxy handles forwarding. The Vite config reads your API keys from the `.env` file and injects them as request headers before forwarding:

```
Browser → http://localhost:3004/proxy/anthropic/* → https://api.anthropic.com/*  (key injected)
Browser → ws://localhost:3004/proxy/deepgram/*   → wss://api.deepgram.com/*     (key injected)
```

Providers use `proxyUrl` instead of `apiKey`:

```javascript
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

### Production mode

Replace the Vite dev proxy with `createExpressProxy` from `@lukeocodes/composite-voice/proxy`. See `server.ts` in this directory — it's a complete, runnable production server:

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
proxy.attachWebSocket(server);  // required for Deepgram WebSocket connections

// Serve the built front end
app.use(express.static('dist'));

server.listen(3004);
```

Other adapters are available for **Next.js App Router** (`createNextJsProxy`) and plain Node.js `http.Server` (`createNodeProxy`). See `src/proxy/` in the SDK source for details.

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

# 3. Copy the sample env file
cp examples/04-proxy-server/sample.env examples/04-proxy-server/.env
```

Edit `examples/04-proxy-server/.env`:

```env
DEEPGRAM_API_KEY=your-deepgram-api-key-here
ANTHROPIC_API_KEY=your-anthropic-api-key-here
```

> **Important:** These env vars do **not** use the `VITE_` prefix. Variables prefixed with `VITE_` are automatically bundled into the browser build by Vite — that's exactly what we're trying to avoid. Without the prefix, they stay server-side only.

---

## Run (development)

```bash
pnpm example:04-proxy-server:dev
```

Open [http://localhost:3004](http://localhost:3004) in Chrome or Edge.

**Verify that no keys are in the bundle:** Open DevTools → Sources, then search (Ctrl+F or Cmd+F) for your API key string. It won't be there.

---

## Run (production)

Build the front end, then start the Express server:

```bash
# 1. Build the browser app
pnpm example:04-proxy-server:build

# 2. Start the Express proxy server
cd examples/04-proxy-server
npx tsx server.ts
```

The server listens on port 3004, serves the static files from `dist/`, and proxies all `/proxy/*` requests with credentials injected.

---

## Architecture

```
Development:
Browser ──[no keys]──▶ Vite dev server ──[key injected by vite.config.js]──▶ Deepgram / Anthropic

Production:
Browser ──[no keys]──▶ /proxy/deepgram  ──[key injected by createExpressProxy]──▶ wss://api.deepgram.com
Browser ──[no keys]──▶ /proxy/anthropic ──[key injected by createExpressProxy]──▶ https://api.anthropic.com
```

---

## Security considerations

When deploying this pattern to production:

- Load keys from environment variables only — never hard-code them in source files
- Run the proxy behind HTTPS — keys are injected as HTTP headers which are plaintext over HTTP
- Set spending limits and rate limits on your Deepgram and Anthropic dashboards
- Scope your API keys to the minimum permissions required
- Consider adding origin checks or rate limiting to the proxy itself to prevent abuse

See [SECURITY.md](../../SECURITY.md) for the full proxy security checklist.

---

## Troubleshooting

**404 on `/proxy/*` endpoints**

- In development, the Vite dev server proxy is only active while `pnpm dev` is running
- In production, ensure the Express server from `server.ts` is running and listening on the correct port

**WebSocket connections fail**

WebSocket forwarding requires `proxy.attachWebSocket(server)` to be called with the HTTP server instance, not the Express app. Check `server.ts` and ensure this call is present.

**Keys still visible in DevTools**

Check that your env vars in `.env` do **not** have the `VITE_` prefix. Any variable with that prefix is automatically exposed to the browser bundle.

**WebSocket proxy not working in production**

Ensure your production environment supports WebSocket upgrades. If you're behind a load balancer or reverse proxy (e.g. nginx), configure it to pass WebSocket upgrades through.

---

## What to try next

Once you have the proxy pattern working, you can combine it with features from earlier examples:

- Add `conversationHistory` (from Example 02) to the proxy-backed setup
- Enable the `eagerLLM` pipeline (from Example 03) — it works with proxy URLs too

---

## Browser support

| Browser | Status |
|---------|--------|
| Chrome / Edge | Full support — recommended |
| Firefox | Works — Deepgram providers don't require Web Speech API |
| Safari | Limited — WebSocket-based AudioWorklet support varies by version |
