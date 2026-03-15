/**
 * Example 40: Express proxy with full security configuration.
 *
 * Demonstrates every security option available in CompositeVoiceProxyConfig:
 *   - rateLimit: max requests per IP per window
 *   - maxBodySize: reject oversized HTTP payloads (413)
 *   - maxWsMessageSize: close WebSocket on oversized messages (1009)
 *   - authenticate: custom auth function (bearer token example)
 *   - cors: allowed origins
 *
 * Run with:
 *   PORT=3041 node --env-file=.env --import tsx/esm server.ts
 */

import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createExpressProxy } from '@lukeocodes/composite-voice/proxy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3041);

const app = express();
app.use(express.json());

// ── Proxy middleware with security config ────────────────────────────────────
//
// All API keys are server-side only. The browser never sees them.
//
// Security options are all optional — omit any you don't need.
// This example enables everything for demonstration purposes.

const proxy = createExpressProxy({
  // Provider API keys (only providers with keys get routes)
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,

  // Route prefix — all proxy routes start with this path
  pathPrefix: '/proxy',

  // CORS — allow the Vite dev server and the proxy's own origin
  cors: {
    origins: ['http://localhost:3040', 'http://localhost:3041'],
  },

  // Security — all fields are optional
  security: {
    // Rate limiting: 100 requests per minute per IP
    rateLimit: {
      maxRequests: 100,
      windowMs: 60_000,
    },

    // Max HTTP body size: 1 MB
    maxBodySize: 1_048_576,

    // Max WebSocket message size: 512 KB
    maxWsMessageSize: 524_288,

    // Custom authentication: check for a bearer token
    // In production, validate against your auth system (JWT, session, etc.)
    authenticate: (req) => {
      // For this example, accept any request (no token required).
      // Uncomment the lines below to require a bearer token:
      //
      // const auth = req.headers['authorization'];
      // if (typeof auth !== 'string') return false;
      // return auth === `Bearer ${process.env.PROXY_SECRET}`;

      return true;
    },
  },
});

app.use(proxy.middleware);

// ── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Static file serving (production) ─────────────────────────────────────────

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));

// ── HTTP server + WebSocket proxy attachment ─────────────────────────────────

const server = createServer(app);

// Attach WebSocket proxying (Deepgram STT/TTS, ElevenLabs, Cartesia)
// Must be called AFTER createServer but BEFORE server.listen().
proxy.attachWebSocket(server);

server.listen(PORT, () => {
  console.log(`\nCompositeVoice Express proxy running at http://localhost:${PORT}`);
  console.log(`\nRegistered proxy routes:`);
  if (process.env.DEEPGRAM_API_KEY) {
    console.log(`  Deepgram:  ws://localhost:${PORT}/proxy/deepgram`);
  }
  if (process.env.ANTHROPIC_API_KEY) {
    console.log(`  Anthropic: http://localhost:${PORT}/proxy/anthropic`);
  }
  if (process.env.OPENAI_API_KEY) {
    console.log(`  OpenAI:    http://localhost:${PORT}/proxy/openai`);
  }
  console.log(`\nSecurity config:`);
  console.log(`  Rate limit:     100 req/min per IP`);
  console.log(`  Max body size:  1 MB`);
  console.log(`  Max WS message: 512 KB`);
  console.log(`  Authentication: enabled (accept all)\n`);
});
