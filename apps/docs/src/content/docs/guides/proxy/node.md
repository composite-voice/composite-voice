---
title: Node.js Proxy
description: Set up the CompositeVoice server proxy with plain Node.js HTTP for maximum flexibility.
order: 3
---

Use the Node.js adapter when you need full control over the HTTP server or your framework is not Express. It works with `http.createServer`, Fastify (raw mode), Koa, Hapi, or any framework that exposes the underlying `http.Server`. It supports both HTTP and WebSocket proxying.

## Prerequisites

- Node.js 18+
- At least one provider API key

## Install dependencies

```bash
npm install @lukeocodes/composite-voice
```

No additional server framework is required. The adapter uses only the built-in `http` module.

## Create the server

Create a file called `server.ts`:

```typescript
import { createServer } from 'http';
import { createNodeProxy } from '@lukeocodes/composite-voice/proxy';

const proxy = createNodeProxy({
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  pathPrefix: '/api/proxy',
  cors: { origins: ['http://localhost:5173'] },
});

const server = createServer(proxy.handleRequest);
proxy.attachWebSocket(server);

server.listen(3000, () => {
  console.log('Proxy running at http://localhost:3000');
});
```

Pass `proxy.handleRequest` directly to `createServer`. For non-proxy routes, the handler returns silently -- add your own routing logic around it if needed:

```typescript
const server = createServer(async (req, res) => {
  // Handle proxy routes
  await proxy.handleRequest(req, res);
  if (res.writableEnded) return;

  // Handle other routes
  if (req.url === '/health') {
    res.writeHead(200);
    res.end('ok');
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});
```

## Environment variables

Create a `.env` file:

```
DEEPGRAM_API_KEY=your-deepgram-key
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key
```

Load it when starting the process:

```bash
npx tsx --env-file .env server.ts
```

## WebSocket support

The Node.js adapter supports WebSocket upgrades through `attachWebSocket`. Call it after creating the server:

```typescript
const server = createServer(proxy.handleRequest);
proxy.attachWebSocket(server);
server.listen(3000);
```

`attachWebSocket` listens for the `upgrade` event on the HTTP server and relays WebSocket frames to upstream providers.

| Provider | Transport | Route |
|----------|-----------|-------|
| Deepgram STT/TTS | WebSocket | `/api/proxy/deepgram` |
| ElevenLabs TTS | WebSocket | `/api/proxy/elevenlabs` |
| Cartesia TTS | WebSocket | `/api/proxy/cartesia` |
| AssemblyAI STT | WebSocket | `/api/proxy/assemblyai` |
| Anthropic LLM | HTTP | `/api/proxy/anthropic` |
| OpenAI LLM/TTS | HTTP | `/api/proxy/openai` |
| Groq LLM | HTTP | `/api/proxy/groq` |
| Mistral LLM | HTTP | `/api/proxy/mistral` |
| Gemini LLM | HTTP | `/api/proxy/gemini` |

This makes the Node.js adapter a good choice for self-hosted Next.js deployments that need WebSocket providers. Use `createNodeProxy` on a custom server instead of the Next.js adapter to get full WebSocket support.

## Client-side configuration

Point each provider at the proxy URL:

```typescript
import { CompositeVoice, DeepgramSTT, AnthropicLLM, DeepgramTTS } from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  stt: new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
  llm: new AnthropicLLM({ proxyUrl: '/api/proxy/anthropic' }),
  tts: new DeepgramTTS({ proxyUrl: '/api/proxy/deepgram' }),
});
```

If the proxy runs on a different origin, use the full URL:

```typescript
const stt = new DeepgramSTT({ proxyUrl: 'https://proxy.example.com/api/proxy/deepgram' });
```

## CORS configuration

Set allowed origins when the frontend and proxy run on different origins:

```typescript
const proxy = createNodeProxy({
  // ...api keys
  cors: {
    origins: [
      'http://localhost:5173',
      'https://myapp.example.com',
    ],
  },
});
```

Omit the `cors` option when the frontend is served from the same origin. The proxy handles `OPTIONS` preflight requests automatically.

## Production tips

- **No framework overhead.** The Node.js adapter adds no dependencies beyond the built-in `http` module. This keeps the deployment lean.
- **Custom server for Next.js.** When deploying Next.js outside Vercel and you need WebSocket providers, create a custom server that combines `next()` request handling with `createNodeProxy` for proxy routes.
- **Graceful shutdown.** Listen for `SIGTERM` and call `server.close()` to drain active connections before exiting.
- **TLS termination.** Use a reverse proxy like nginx or a cloud load balancer for HTTPS. The Node.js proxy handles plain HTTP.
- **Containerization.** This adapter works well in Docker. Expose port 3000 and set API keys through container environment variables.

## Further reading

- [Express adapter](/guides/proxy/express) -- if you prefer Express middleware
- [Next.js adapter](/guides/proxy/nextjs) -- for HTTP-only Next.js deployments
- [Server Proxy overview](/advanced/server-proxy)
