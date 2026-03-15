---
title: Next.js Proxy
description: Set up the CompositeVoice server proxy as a Next.js App Router catch-all route.
order: 2
---

Use the Next.js adapter when your application already runs on Next.js 13+ with the App Router. It handles HTTP providers (Anthropic, OpenAI, Groq, Mistral, Gemini) out of the box on any deployment platform, including Vercel.

## Prerequisites

- Next.js 13 or later with the App Router enabled
- At least one HTTP provider API key

## Install dependencies

```bash
npm install @lukeocodes/composite-voice
```

No extra server packages are needed -- the adapter works with the built-in Next.js runtime.

## Create the route handler

Create a catch-all API route at `app/api/proxy/[...path]/route.ts`:

```typescript
import { createNextJsProxy } from '@lukeocodes/composite-voice/proxy';

const { GET, POST, PUT, DELETE, PATCH, OPTIONS } = createNextJsProxy({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  groqApiKey: process.env.GROQ_API_KEY,
  pathPrefix: '/api/proxy',
  cors: { origins: ['http://localhost:3000'] },
});

export { GET, POST, PUT, DELETE, PATCH, OPTIONS };
```

The `pathPrefix` must match the file path. A route at `app/api/proxy/[...path]/route.ts` uses `pathPrefix: '/api/proxy'`.

## Environment variables

Add your keys to `.env.local`:

```
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key
GROQ_API_KEY=your-groq-key
```

Next.js loads `.env.local` automatically. Server-side route handlers can read `process.env` without additional setup.

## Start the dev server

```bash
npx next dev
```

Test the proxy with curl:

```bash
curl -X POST http://localhost:3000/api/proxy/anthropic/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":50,"messages":[{"role":"user","content":"Hello"}]}'
```

## WebSocket support

**The Next.js adapter does not support WebSocket proxying.** Vercel's serverless and edge runtimes cannot handle WebSocket upgrades. This means WebSocket providers -- Deepgram, ElevenLabs, Cartesia, and AssemblyAI -- will not work through this adapter.

| Provider | Transport | Next.js adapter |
|----------|-----------|-----------------|
| Anthropic | HTTP | Supported |
| OpenAI | HTTP | Supported |
| Groq | HTTP | Supported |
| Mistral | HTTP | Supported |
| Gemini | HTTP | Supported |
| Deepgram | WebSocket | Not supported |
| ElevenLabs | WebSocket | Not supported |
| Cartesia | WebSocket | Not supported |
| AssemblyAI | WebSocket | Not supported |

**If you need WebSocket providers**, deploy a separate Node.js server using the [Node.js adapter](/guides/proxy/node) or the [Express adapter](/guides/proxy/express) and point your WebSocket providers at that server. You can keep the Next.js adapter for HTTP providers.

For self-hosted Next.js deployments (not Vercel), use a custom server with `createNodeProxy` to handle both HTTP and WebSocket traffic.

## Client-side configuration

Point HTTP providers at the proxy URL:

```typescript
import { CompositeVoice, AnthropicLLM, NativeSTT, NativeTTS } from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  providers: [
    new NativeSTT(),
    new AnthropicLLM({ proxyUrl: '/api/proxy/anthropic' }),
    new NativeTTS(),
  ],
});
```

Relative URLs work when the frontend and proxy share the same Next.js app.

## CORS configuration

When the frontend and API route share the same Next.js origin, you do not need CORS. For cross-origin requests (e.g., a separate frontend app), set the allowed origins:

```typescript
const { GET, POST, PUT, DELETE, PATCH, OPTIONS } = createNextJsProxy({
  // ...api keys
  cors: {
    origins: ['https://myapp.example.com'],
  },
});
```

The `OPTIONS` export handles preflight requests automatically.

## Production tips

- **Environment variables.** Use Vercel's environment variable UI or your hosting provider's secret management. Never commit `.env.local`.
- **Edge runtime.** The adapter uses `fetch` internally and works with both the Node.js and Edge runtimes. Add `export const runtime = 'edge';` to the route file if your deployment benefits from edge execution.
- **Rate limiting.** Use the built-in `security.rateLimit` option (see below), Next.js middleware (`middleware.ts`), or Vercel's built-in rate limiting to protect the proxy route.
- **Monitoring.** Log upstream errors in the route handler to catch provider outages early.

## Security

The proxy supports a built-in `security` configuration with rate limiting, body size limits, and custom authentication:

```typescript
const { GET, POST, PUT, DELETE, PATCH, OPTIONS } = createNextJsProxy({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  pathPrefix: '/api/proxy',
  security: {
    maxBodySize: 1_000_000,          // 1 MB max request body
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
| `security.rateLimit.maxRequests` | `number` | -- | Max requests per window per IP |
| `security.rateLimit.windowMs` | `number` | `60000` | Rate limit window in milliseconds |
| `security.authenticate` | `function` | `undefined` | Custom auth function; return `false` to reject with 401 |

## Further reading

- [Example: Next.js proxy](https://github.com/lukeocodes/composite-voice/tree/main/examples/11-nextjs-proxy)
- [Server Proxy overview](/advanced/server-proxy)
- [Node.js adapter](/guides/proxy/node) -- for WebSocket provider support
