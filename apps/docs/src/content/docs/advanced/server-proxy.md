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
  revaiApiKey: process.env.REVAI_API_KEY,
  assemblyaiApiKey: process.env.ASSEMBLYAI_API_KEY,
  speechmaticsApiKey: process.env.SPEECHMATICS_API_KEY,
  fishAudioApiKey: process.env.FISH_AUDIO_API_KEY,
  googleCloudApiKey: process.env.GOOGLE_CLOUD_API_KEY,
  azureSpeechApiKey: process.env.AZURE_SPEECH_KEY,
  azureSpeechRegion: process.env.AZURE_SPEECH_REGION, // e.g. 'eastus' — required for the Azure routes

  // AWS credentials (Amazon Polly TTS + Amazon Transcribe STT)
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,   // optional (STS/Cognito)
    region: process.env.AWS_REGION ?? 'us-east-1',
  },

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
| `openaiApiKey` | `/api/proxy/openai` | `/api/proxy/openai-realtime` | OpenAI LLM + TTS + Realtime STT |
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
| `revaiApiKey` | — | `/api/proxy/revai` | Rev AI STT |
| `assemblyaiApiKey` | — | `/api/proxy/assemblyai` | AssemblyAI STT |
| `speechmaticsApiKey` | — | `/api/proxy/speechmatics` | Speechmatics STT |
| `fishAudioApiKey` | `/api/proxy/fishaudio` | — | Fish Audio TTS |
| `googleCloudApiKey` | `/api/proxy/google-tts` + `/api/proxy/google-stt` | — | Google Cloud TTS + STT |
| `azureSpeechApiKey` + `azureSpeechRegion` | `/api/proxy/azure-tts` | `/api/proxy/azure-stt` | Azure Speech TTS + STT |
| `aws` | `/api/proxy/polly` | `/api/proxy/transcribe` | Amazon Polly TTS / Amazon Transcribe STT |

HTTP routes forward REST requests. WebSocket routes relay frames bidirectionally. Fish Audio's msgpack-encoded request bodies are opaque binary to the proxy and are forwarded untouched.

Most providers authenticate with injected headers. Rev AI is the exception: its streaming WebSocket only accepts an `access_token` query parameter, so the proxy appends the token to the upstream URL server-side instead — overriding any client-supplied value. Either way, the credential never reaches the browser.

**Note:** `googleCloudApiKey` registers two HTTP routes from one key because Google Cloud Text-to-Speech (`texttospeech.googleapis.com`) and Speech-to-Text (`speech.googleapis.com`) live on different hosts; the proxy injects the `X-goog-api-key` header on both. This key is separate from `geminiApiKey`, which proxies the Gemini LLM API.

### AWS request signing

AWS authenticates with Signature Version 4, which signs the host, path, query string, and body — so the proxy cannot simply inject a static header the way it does for API-key providers. When you configure `aws`, the proxy signs upstream traffic itself:

- **Polly (HTTP):** each forwarded request gets a SigV4 `Authorization` header computed over the exact upstream URL and body.
- **Transcribe (WebSocket):** at connect time the proxy computes a SigV4-**presigned** upstream URL (`X-Amz-*` query parameters, 5-minute validity) that includes the transcription parameters (`language-code`, `sample-rate`, ...) sent by the browser.

The browser sends unsigned requests to the proxy and never sees AWS credentials:

```typescript
const tts = new PollyTTS({ proxyUrl: '/api/proxy/polly', voiceId: 'Joanna' });
const stt = new TranscribeSTT({ proxyUrl: '/api/proxy/transcribe', languageCode: 'en-US' });
```

Use an IAM identity limited to `polly:SynthesizeSpeech` and `transcribe:StartStreamTranscription`.

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
