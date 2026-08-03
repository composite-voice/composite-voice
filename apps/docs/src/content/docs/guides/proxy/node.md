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
pnpm add composite-voice
```

No additional server framework is required. The adapter uses only the built-in `http` module.

## Create the server

Create a file called `server.ts`:

```typescript
import { createServer } from 'http';
import { createNodeProxy } from 'composite-voice/proxy';

const proxy = createNodeProxy({
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  deepgramAgentApiKey: process.env.DEEPGRAM_AGENT_API_KEY, // falls back to deepgramApiKey if not set
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
DEEPGRAM_AGENT_API_KEY=your-deepgram-agent-key  # optional, falls back to DEEPGRAM_API_KEY
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
| Deepgram Agent | WebSocket | `/api/proxy/deepgram-agent` |
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
import { CompositeVoice, MicrophoneInput, DeepgramSTT, AnthropicLLM, DeepgramTTS, BrowserAudioOutput } from 'composite-voice';

const voice = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
    new AnthropicLLM({ proxyUrl: '/api/proxy/anthropic' }),
    new DeepgramTTS({ proxyUrl: '/api/proxy/deepgram' }),
    new BrowserAudioOutput(),
  ],
});
```

If the proxy runs on a different origin, use the full URL:

```typescript
const stt = new DeepgramSTT({ proxyUrl: 'https://proxy.example.com/api/proxy/deepgram' });
```

### DeepgramAgent

The Deepgram Agent provider connects through its own proxy route (`deepgram-agent`) because it targets a different upstream host (`wss://agent.deepgram.com`):

```typescript
import { CompositeVoice, DeepgramAgent, BrowserAudioOutput } from 'composite-voice';

const voice = new CompositeVoice({
  providers: [
    new DeepgramAgent({
      proxyUrl: '/api/proxy/deepgram-agent',
      think: {
        provider: { type: 'open_ai', model: 'gpt-4o' },
        prompt: 'You are a helpful voice assistant.',
      },
    }),
    new BrowserAudioOutput(),
  ],
});
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

## Security

The proxy supports a built-in `security` configuration with rate limiting, body size limits, WebSocket message size limits, and custom authentication:

```typescript
const proxy = createNodeProxy({
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  pathPrefix: '/api/proxy',
  security: {
    maxBodySize: 1_000_000,          // 1 MB max request body
    maxWsMessageSize: 500_000,       // 500 KB max WebSocket message
    rateLimit: {
      maxRequests: 100,              // 100 requests per window per IP
      windowMs: 60_000,              // 1-minute window
    },
    authenticate: (req) => {
      return req.headers['x-api-key'] === process.env.APP_SECRET;
    },
  },
});
```

| Option | Type | Default | Description |
|---|---|---|---|
| `security.maxBodySize` | `number` | `undefined` | Max HTTP request body in bytes (413 if exceeded) |
| `security.maxWsMessageSize` | `number` | `undefined` | Max WebSocket message in bytes (closes with 1009 if exceeded) |
| `security.rateLimit.maxRequests` | `number` | -- | Max requests per window per IP |
| `security.rateLimit.windowMs` | `number` | `60000` | Rate limit window in milliseconds |
| `security.authenticate` | `function` | `undefined` | Custom auth function; return `false` to reject with 401 |

## Further reading

- [Express adapter](/guides/proxy/express) -- if you prefer Express middleware
- [Next.js adapter](/guides/proxy/nextjs) -- for HTTP-only Next.js deployments
- [Server Proxy overview](/advanced/server-proxy)
