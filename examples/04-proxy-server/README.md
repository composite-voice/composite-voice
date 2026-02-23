# Example 04 — Server-Side Proxy

Keeps API keys completely out of the browser. A server-side proxy sits between the browser and the AI providers, injecting credentials before forwarding each request. The deployed browser bundle contains zero secrets.

| | Provider | Via | Browser support |
|-|----------|-----|-----------------|
| **STT** | `DeepgramSTT` — nova-3 | `proxyUrl` instead of `apiKey` | All modern browsers |
| **LLM** | `AnthropicLLM` — claude-haiku-4-5-20251001 | `proxyUrl` instead of `apiKey` | All |
| **TTS** | `DeepgramTTS` — aura-2-thalia-en | `proxyUrl` instead of `apiKey` | All modern browsers |

---

## What you'll learn

- Why embedding API keys in browser bundles is a security risk — they're visible in DevTools to anyone
- How the `proxyUrl` option replaces `apiKey` in every provider config
- How `createExpressProxy` intercepts browser requests and injects credentials server-side
- Why env vars must **not** use the `VITE_` prefix to remain server-side only
- The difference between the Vite dev proxy (development) and the Express proxy (production)

---

## Why this matters

Any API key in a browser bundle is readable by anyone who opens DevTools → Sources. They can copy it and run up your bill instantly. There's no language-level way to hide it in the browser.

This proxy pattern eliminates the risk entirely:

1. **Keys never leave the server** — loaded from environment variables at startup, never sent to the browser
2. **Browser connects to your own origin** — requests go to `/proxy/...`, no third-party URLs, no CORS issues
3. **Proxy injects credentials** — adds the real API key header just before forwarding to the provider
4. **Works anywhere Node.js runs** — Express, Next.js, plain `http.Server`

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
cp examples/04-proxy-server/sample.env examples/04-proxy-server/.env
```

Open `.env` and fill in your keys:

```env
DEEPGRAM_API_KEY=your-deepgram-key-here
ANTHROPIC_API_KEY=sk-ant-...
```

> **Important:** These env vars do **not** use the `VITE_` prefix. Any variable prefixed with `VITE_` is automatically bundled into the browser build by Vite — exactly what we're avoiding here. Without the prefix, the values remain server-side only.

---

## Run (development)

```bash
pnpm example:04-proxy-server:dev
```

Open [http://localhost:3004](http://localhost:3004).

In development, the Vite dev server handles key injection via `vite.config.js`. Keys are read from `.env` and injected as request headers when forwarding to Deepgram and Anthropic — they never appear in the browser bundle.

**Verify no keys are in the browser:** Open DevTools → Sources, press Ctrl+F (Cmd+F on Mac), and search for your API key. You won't find it.

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

The Express server listens on port 3004, serves static files from `dist/`, and proxies all `/proxy/*` requests with credentials injected by `createExpressProxy`.

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
import { CompositeVoice, DeepgramSTT, AnthropicLLM, DeepgramTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new DeepgramSTT({
    proxyUrl: `${window.location.origin}/proxy/deepgram`,  // ← no apiKey
    options: { model: 'nova-3', interimResults: true, endpointing: 300 },
  }),
  llm: new AnthropicLLM({
    proxyUrl: `${window.location.origin}/proxy/anthropic`,  // ← no apiKey
    model: 'claude-haiku-4-5-20251001',
    systemPrompt: 'You are a helpful voice assistant.',
    maxTokens: 200,
  }),
  tts: new DeepgramTTS({
    proxyUrl: `${window.location.origin}/proxy/deepgram`,  // ← no apiKey
    options: { model: 'aura-2-thalia-en', encoding: 'linear16', sampleRate: 24000 },
  }),
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
proxy.attachWebSocket(server);   // required for Deepgram WebSocket connections

app.use(express.static('dist'));
server.listen(3004);
```

Other adapters available from `@lukeocodes/composite-voice/proxy`:

- **Next.js App Router** — `createNextJsProxy`
- **Plain Node.js** — `createNodeProxy`

---

## Production security checklist

Before deploying the proxy to production, verify all of the following:

- [ ] API keys loaded from environment variables only — never hard-coded in source files or config
- [ ] Server runs behind HTTPS — credentials are injected as headers and are transmitted in plaintext over unencrypted connections
- [ ] Spending limits configured on Deepgram and Anthropic dashboards — caps financial impact if the proxy is abused
- [ ] API keys scoped to minimum required permissions
- [ ] API usage monitored with alerts for unexpected spikes
- [ ] Rate limiting applied at the proxy or reverse proxy level
- [ ] CORS configured to restrict which origins can make requests to the proxy
- [ ] Proxy not publicly accessible except through your front end

---

## Troubleshooting

**404 on `/proxy/*` endpoints**

- Development: the Vite dev proxy is only active while `pnpm dev` is running
- Production: ensure `server.ts` is running and listening on the correct port

**WebSocket connections fail in production**

`proxy.attachWebSocket(server)` must be called with the `http.Server` instance, **not** the Express `app`. Double-check `server.ts` — this call must be present.

If running behind nginx or a load balancer, configure it to forward WebSocket upgrade headers.

**API key still visible in DevTools**

Ensure env vars in `.env` do **not** have the `VITE_` prefix. Any `VITE_*` variable is automatically exposed to the browser bundle by Vite by design.

**"Cannot find module '@lukeocodes/composite-voice'"**

```bash
pnpm build
```

---

## What to try next

The proxy pattern works with everything from earlier examples:

- Add `conversationHistory` from Example 02 — works identically with `proxyUrl`
- Enable the `eagerLLM` pipeline from Example 03 — works with `proxyUrl` too
- Try the Next.js or plain Node.js proxy adapters — see `src/proxy/adapters/`

See the [proxy security documentation](../../SECURITY.md) for the complete security policy.

---

## Browser support

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome / Edge | Recommended | WebSocket and AudioWorklet fully supported |
| Firefox | Works | Deepgram WebSocket providers don't require Web Speech API |
| Safari | Limited | WebSocket AudioWorklet support varies by Safari version |
