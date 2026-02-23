# Example 04 — Server-Side Proxy

Keeps API keys completely out of the browser bundle. A server-side proxy sits between the browser and the AI providers, injecting credentials before forwarding each request. **The browser contains zero secrets.**

| | Provider | Via |
|-|----------|-----|
| **STT** | `DeepgramSTT` — nova-3 | Proxy (`proxyUrl` instead of `apiKey`) |
| **LLM** | `AnthropicLLM` — claude-haiku-4-6 | Proxy |
| **TTS** | `DeepgramTTS` — aura-2-thalia-en | Proxy |

---

## What you'll learn

- Why embedding API keys in browser bundles is a security risk
- How the `proxyUrl` option works in provider configuration
- How `createExpressProxy` intercepts requests and injects credentials server-side
- Why env vars must **not** use the `VITE_` prefix if they need to stay server-side only
- The difference between development (Vite dev proxy) and production (Express server)

---

## Why use a proxy?

Any API key embedded directly in a browser bundle is visible to anyone who opens DevTools → Sources. They can copy the key and use it to run up your bill.

This pattern eliminates that risk:

1. **API keys never leave the server** — they live in environment variables, loaded at startup
2. **The browser connects to your own origin** (`/proxy/...`) — no CORS issues, no keys visible
3. **The proxy injects credentials** just before forwarding to the real provider
4. **Works anywhere Node.js runs** — Express, Next.js, plain `http.Server`

---

## Prerequisites

- Node.js 18+
- pnpm
- A [Deepgram API key](https://console.deepgram.com/) — free tier, no credit card
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

All commands from the **repo root**:

```bash
# 1. Install dependencies
pnpm install

# 2. Build the SDK
pnpm build

# 3. Copy the env template and add your keys
cp examples/04-proxy-server/sample.env examples/04-proxy-server/.env
```

Edit `.env`:

```env
DEEPGRAM_API_KEY=your-deepgram-key-here
ANTHROPIC_API_KEY=your-anthropic-key-here
```

> **Important:** These env vars do **not** use the `VITE_` prefix. Variables with that prefix are automatically bundled into the browser build by Vite — that's exactly what we're avoiding. Without the prefix, they stay server-side only.

---

## Run (development)

```bash
pnpm example:04-proxy-server:dev
```

Open [http://localhost:3004](http://localhost:3004) in Chrome or Edge.

**Verify no keys are in the browser:** Open DevTools → Sources, press Ctrl+F (Cmd+F on Mac), and search for your API key. You won't find it.

In development, the Vite dev server handles key injection via `vite.config.js`. Keys are read from `.env` and injected as request headers when forwarding to Deepgram and Anthropic — never appearing in the browser bundle.

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

The server listens on port 3004, serves static files from `dist/`, and proxies all `/proxy/*` requests with credentials injected by `createExpressProxy`.

---

## How it works

### Development

```
Browser ──[no keys]──▶ Vite dev server ──[key injected]──▶ Deepgram / Anthropic
```

### Production

```
Browser ──[no keys]──▶ /proxy/deepgram  ──[key injected]──▶ wss://api.deepgram.com
Browser ──[no keys]──▶ /proxy/anthropic ──[key injected]──▶ https://api.anthropic.com
```

### Browser code (zero API keys)

```javascript
const stt = new DeepgramSTT({
  proxyUrl: `${window.location.origin}/proxy/deepgram`,
  options: { model: 'nova-3', interimResults: true, endpointing: 300 },
});

const llm = new AnthropicLLM({
  proxyUrl: `${window.location.origin}/proxy/anthropic`,
  model: 'claude-haiku-4-6',
  systemPrompt: 'You are a helpful voice assistant.',
  maxTokens: 200,
});

const tts = new DeepgramTTS({
  proxyUrl: `${window.location.origin}/proxy/deepgram`,
  options: { model: 'aura-2-thalia-en', encoding: 'linear16', sampleRate: 24000 },
});
```

### Production server (`server.ts`)

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

app.use(express.static('dist'));
server.listen(3004);
```

Other adapters available in the SDK:
- **Next.js App Router** — `createNextJsProxy` from `@lukeocodes/composite-voice/proxy`
- **Plain Node.js** — `createNodeProxy` from `@lukeocodes/composite-voice/proxy`

---

## Security checklist

When deploying to production:

- [ ] API keys loaded from environment variables only — never hard-coded in source
- [ ] Server runs behind HTTPS — credentials are injected as HTTP headers (plaintext over plain HTTP)
- [ ] Spending limits set on your Deepgram and Anthropic dashboards
- [ ] API keys scoped to minimum required permissions
- [ ] Rate limiting applied at the proxy or reverse proxy level
- [ ] If proxy and front end are on different origins, CORS configured appropriately

See [SECURITY.md](../../SECURITY.md) for the complete security policy.

---

## Troubleshooting

**404 on `/proxy/*` endpoints**

- Development: the Vite dev proxy is only active while `pnpm dev` is running
- Production: ensure `server.ts` is running and listening on the correct port

**WebSocket connections fail in production**

`proxy.attachWebSocket(server)` must be called with the HTTP `server` instance, **not** the Express `app`. Check `server.ts` and confirm this call is present.

If you're behind a load balancer or nginx, configure it to pass WebSocket upgrade headers through.

**Keys still visible in DevTools**

Check that env vars in `.env` do **not** have the `VITE_` prefix. Any `VITE_*` variable is automatically exposed to the browser bundle by Vite by design.

**"Cannot find module '@lukeocodes/composite-voice'"**

```bash
pnpm build
```

---

## What to try next

The proxy pattern works with everything from earlier examples:

- Add `conversationHistory` (from Example 02) — works exactly the same with `proxyUrl`
- Enable the `eagerLLM` pipeline (from Example 03) — works with `proxyUrl` too
- Try the Next.js or plain Node.js proxy adapter in `src/proxy/adapters/`

---

## Browser support

| Browser | Status |
|---------|--------|
| Chrome / Edge | Full support — recommended |
| Firefox | Works — Deepgram providers don't require Web Speech API |
| Safari | Limited — WebSocket AudioWorklet support varies by Safari version |
