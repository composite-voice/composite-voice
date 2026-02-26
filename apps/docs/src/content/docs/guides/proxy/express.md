---
title: Express Proxy
description: Set up the CompositeVoice server proxy with Express to keep API keys off the client.
order: 1
---

Use the Express adapter when your backend runs Express 4/5, Connect, Polka, or Restify. It supports both HTTP and WebSocket proxying.

## Prerequisites

- Node.js 18+
- An Express application (or any Connect-compatible framework)
- At least one provider API key (Deepgram, Anthropic, OpenAI, etc.)

## Install dependencies

```bash
npm install express @lukeocodes/composite-voice
```

If you use TypeScript, also add the dev dependency:

```bash
npm install -D tsx
```

## Create the server

Create a file called `server.ts` at your project root:

```typescript
import express from 'express';
import { createServer } from 'http';
import { createExpressProxy } from '@lukeocodes/composite-voice/proxy';

const app = express();
app.use(express.json());

const proxy = createExpressProxy({
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  pathPrefix: '/api/proxy',
  cors: { origins: ['http://localhost:5173'] },
});

// Mount HTTP middleware (handles REST and SSE requests)
app.use(proxy.middleware);

// Create the raw HTTP server so we can attach WebSocket handling
const server = createServer(app);
proxy.attachWebSocket(server);

server.listen(3000, () => {
  console.log('Proxy running at http://localhost:3000');
});
```

Include only the API keys for providers you use. The proxy skips unconfigured providers.

## Environment variables

Create a `.env` file:

```
DEEPGRAM_API_KEY=your-deepgram-key
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key
```

Load it with `dotenv` or pass the variables when starting the process:

```bash
npx tsx --env-file .env server.ts
```

## WebSocket support

Express supports WebSocket upgrades through the underlying `http.Server`. The `attachWebSocket` method listens for the `upgrade` event and relays frames to WebSocket providers:

| Provider | Transport | Route |
|----------|-----------|-------|
| Deepgram STT/TTS | WebSocket | `/api/proxy/deepgram` |
| ElevenLabs TTS | WebSocket | `/api/proxy/elevenlabs` |
| Cartesia TTS | WebSocket | `/api/proxy/cartesia` |
| AssemblyAI STT | WebSocket | `/api/proxy/assemblyai` |
| Anthropic LLM | HTTP | `/api/proxy/anthropic` |
| OpenAI LLM/TTS | HTTP | `/api/proxy/openai` |

You must call `createServer(app)` and pass that server to `attachWebSocket`. Calling `app.listen()` directly returns a server too, but attaching WebSocket handling first avoids a race condition:

```typescript
// Preferred order
const server = createServer(app);
proxy.attachWebSocket(server);
server.listen(3000);
```

## Client-side configuration

Point each provider at the proxy URL instead of supplying an API key:

```typescript
import { CompositeVoice, DeepgramSTT, AnthropicLLM, DeepgramTTS } from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  stt: new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
  llm: new AnthropicLLM({ proxyUrl: '/api/proxy/anthropic' }),
  tts: new DeepgramTTS({ proxyUrl: '/api/proxy/deepgram' }),
});
```

The browser never sees API keys. The proxy injects them server-side.

## CORS configuration

If the frontend and backend run on different origins, list the allowed origins:

```typescript
const proxy = createExpressProxy({
  // ...api keys
  cors: {
    origins: [
      'http://localhost:5173',      // Vite dev server
      'https://myapp.example.com',  // production
    ],
  },
});
```

Set `origins: ['*']` during development to allow any origin. In production, list explicit origins.

## Production tips

- **Rate limiting.** Add `express-rate-limit` before the proxy middleware to prevent abuse.
- **Error handling.** The middleware calls `next(err)` on upstream failures. Add an Express error handler to return structured error responses.
- **Static serving.** Serve your built frontend from the same Express app to avoid CORS entirely.
- **Process manager.** Run with PM2 or systemd for automatic restarts.
- **Health checks.** Mount a `/health` route before the proxy middleware for load-balancer probes.

## Further reading

- [Example: Express proxy server](https://github.com/lukeocodes/composite-voice/tree/main/examples/10-proxy-server)
- [Server Proxy overview](/advanced/server-proxy)
