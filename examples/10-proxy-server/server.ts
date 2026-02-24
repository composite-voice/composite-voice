/**
 * Example: CompositeVoice proxy server (Express)
 *
 * This server demonstrates how to use `createExpressProxy` from
 * `@lukeocodes/composite-voice/proxy` in a production Node.js deployment.
 *
 * In development, Vite's built-in proxy (configured in vite.config.js) replaces
 * this server.  Use this file as a starting point for your production server.
 *
 * Run with:
 *   npx tsx server.ts
 *   # or: node --import tsx/esm server.ts
 *
 * Required env vars (copy sample.env → .env):
 *   DEEPGRAM_API_KEY=...
 *   ANTHROPIC_API_KEY=...
 *   OPENAI_API_KEY=...   (optional)
 */

import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createExpressProxy } from '@lukeocodes/composite-voice/proxy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3010);

const app = express();
app.use(express.json());

// ── Proxy middleware ─────────────────────────────────────────────────────────
//
// API keys are read from environment variables here — server-side only.
// The browser never sees them.  Provider configs use `proxyUrl` instead.

const proxy = createExpressProxy({
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  pathPrefix: '/proxy',
  // Uncomment to allow cross-origin access (e.g. separate front-end server):
  // cors: { origins: ['http://localhost:5173'] },
});

app.use(proxy.middleware);

// ── Static file serving ──────────────────────────────────────────────────────
//
// Serve the Vite production build.  Run `pnpm build` first to generate dist/.

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));

// ── HTTP server + WebSocket proxy attachment ─────────────────────────────────

const server = createServer(app);

// Attach WebSocket proxying (Deepgram STT / TTS) to the raw HTTP server.
// This must be called AFTER createServer but BEFORE server.listen().
proxy.attachWebSocket(server);

server.listen(PORT, () => {
  console.log(`CompositeVoice proxy server running at http://localhost:${PORT}`);
  console.log(`  Deepgram proxy: ws://localhost:${PORT}/proxy/deepgram`);
  console.log(`  Anthropic proxy: http://localhost:${PORT}/proxy/anthropic`);
  if (process.env.OPENAI_API_KEY) {
    console.log(`  OpenAI proxy: http://localhost:${PORT}/proxy/openai`);
  }
});
