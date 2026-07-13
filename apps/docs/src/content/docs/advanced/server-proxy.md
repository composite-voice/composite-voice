---
title: Server Proxy
description: Keep API keys secure with Express, Next.js, and Node.js proxy adapters.
order: 2
---

### Why use a proxy
Browser JavaScript is public. Any API key embedded in client-side code can be extracted and abused. The CompositeVoice server proxy injects API keys on the server, so credentials never reach the browser.

```
Browser                          Server                         Provider
  │                                │                               │
  │── POST /api/proxy/anthropic ──→│                               │
  │   (no API key)                 │── POST api.anthropic.com ────→│
  │                                │   (API key injected)          │
  │←── streamed response ─────────│←── streamed response ─────────│
```

For WebSocket providers ([Deepgram](/guides/stt/deepgram-stt), [ElevenLabs](/guides/tts/elevenlabs-tts), [Cartesia](/guides/tts/cartesia-tts), [AssemblyAI](/guides/stt/assemblyai-stt)), the proxy upgrades the connection and relays frames bidirectionally:

```
Browser                          Server                         Provider
  │                                │                               │
  │── WS /api/proxy/deepgram ────→│                               │
  │   (no API key)                 │── WS api.deepgram.com ──────→│
  │                                │   (API key in URL)           │
  │←─── frames ──────────────────→│←─── frames ─────────────────→│
```

### Installation
The proxy is included in the main package:
```typescript
import { createExpressProxy } from '@lukeocodes/composite-voice/proxy';
```

### Configuration
```typescript
const proxy = createExpressProxy({
  // Provider API keys (include only the providers you use)
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  groqApiKey: process.env.GROQ_API_KEY,
  mistralApiKey: process.env.MISTRAL_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
  cartesiaApiKey: process.env.CARTESIA_API_KEY,
  speechifyApiKey: process.env.SPEECHIFY_API_KEY,
  murfApiKey: process.env.MURF_API_KEY,
  lmntApiKey: process.env.LMNT_API_KEY,
  smallestApiKey: process.env.SMALLEST_API_KEY,
  rimeApiKey: process.env.RIME_API_KEY,
  minimaxApiKey: process.env.MINIMAX_API_KEY,
  sonioxApiKey: process.env.SONIOX_API_KEY,
  gladiaApiKey: process.env.GLADIA_API_KEY,
  assemblyaiApiKey: process.env.ASSEMBLYAI_API_KEY,

  // Route prefix (default: '/api/proxy')
  pathPrefix: '/api/proxy',

  // CORS origins (default: none)
  cors: {
    origins: ['http://localhost:3000'],
  },
});
```

### Express adapter
```typescript
import express from 'express';
import { createServer } from 'http';
import { createExpressProxy } from '@lukeocodes/composite-voice/proxy';

const app = express();
const server = createServer(app);

const proxy = createExpressProxy({
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
});

// Mount HTTP routes
app.use(proxy.middleware);

// Enable WebSocket upgrades (required for Deepgram, ElevenLabs, Cartesia, AssemblyAI)
proxy.attachWebSocket(server);

server.listen(3000);
```

Compatible with Express 4/5, Connect, Polka, and Restify.

### Next.js adapter
Create a catch-all API route at `app/api/proxy/[...path]/route.ts`:

```typescript
import { createNextJsProxy } from '@lukeocodes/composite-voice/proxy';

const proxy = createNextJsProxy({
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
});

export const { GET, POST, PUT, DELETE, PATCH, OPTIONS } = proxy;
```

**Note:** Vercel's serverless runtime does not support WebSocket upgrades. For WebSocket providers ([Deepgram](/guides/stt/deepgram-stt) STT/TTS, [ElevenLabs](/guides/tts/elevenlabs-tts), [Cartesia](/guides/tts/cartesia-tts), [AssemblyAI](/guides/stt/assemblyai-stt)), deploy with the Node.js adapter on a platform that supports WebSockets, or use the `createNodeProxy` adapter on a self-hosted server.

### Node.js adapter
Works with any framework that exposes `http.Server`:

```typescript
import { createServer } from 'http';
import { createNodeProxy } from '@lukeocodes/composite-voice/proxy';

const proxy = createNodeProxy({
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
});

const server = createServer(proxy.handleRequest);
proxy.attachWebSocket(server);

server.listen(3000);
```

Compatible with Fastify (raw mode), Koa, Hapi, and any Node.js HTTP framework.

### Route table
The proxy automatically creates routes based on which API keys you provide:

| Key provided | HTTP route | WebSocket route | Provider |
|-------------|------------|-----------------|----------|
| `deepgramApiKey` | — | `/api/proxy/deepgram` | Deepgram STT + TTS |
| `anthropicApiKey` | `/api/proxy/anthropic` | — | Anthropic LLM |
| `openaiApiKey` | `/api/proxy/openai` | — | OpenAI LLM + TTS |
| `groqApiKey` | `/api/proxy/groq` | — | Groq LLM |
| `mistralApiKey` | `/api/proxy/mistral` | — | Mistral LLM |
| `geminiApiKey` | `/api/proxy/gemini` | — | Gemini LLM |
| `elevenLabsApiKey` | — | `/api/proxy/elevenlabs` | ElevenLabs TTS |
| `cartesiaApiKey` | — | `/api/proxy/cartesia` | Cartesia TTS |
| `speechifyApiKey` | `/api/proxy/speechify` | — | Speechify TTS |
| `murfApiKey` | `/api/proxy/murf` | — | Murf TTS |
| `lmntApiKey` | `/api/proxy/lmnt` | — | LMNT TTS |
| `smallestApiKey` | `/api/proxy/smallest` | — | Smallest.ai TTS |
| `rimeApiKey` | `/api/proxy/rime` | — | Rime TTS |
| `minimaxApiKey` | `/api/proxy/minimax` | — | MiniMax TTS |
| `sonioxApiKey` | — | `/api/proxy/soniox` | Soniox STT |
| `gladiaApiKey` | `/api/proxy/gladia` | — | Gladia STT (session init) |
| `assemblyaiApiKey` | — | `/api/proxy/assemblyai` | AssemblyAI STT |

HTTP routes forward REST requests. WebSocket routes relay frames bidirectionally.

### Client configuration
On the client, point providers at the proxy URL instead of using API keys:

```typescript
// Instead of:
const stt = new DeepgramSTT({ apiKey: 'dg-...' });  // DON'T DO THIS

// Use:
const stt = new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' });  // keys stay server-side
```

### CORS
If your frontend and backend run on different origins, configure CORS:

```typescript
const proxy = createExpressProxy({
  // ...keys
  cors: {
    origins: [
      'http://localhost:5173',        // Vite dev server
      'https://myapp.example.com',    // production
    ],
  },
});
```
