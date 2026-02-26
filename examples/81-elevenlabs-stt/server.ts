/**
 * Example: ElevenLabs STT proxy server (Express)
 *
 * This server demonstrates how to use `createExpressProxy` from
 * `@lukeocodes/composite-voice/proxy` to proxy ElevenLabs STT WebSocket
 * connections in a production Node.js deployment.
 *
 * In development, Vite's built-in proxy (configured in vite.config.js) replaces
 * this server.  Use this file as a starting point for your production server.
 *
 * Run with:
 *   npx tsx server.ts
 *
 * Required env vars (copy sample.env → .env):
 *   ELEVENLABS_API_KEY=...
 */

import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createExpressProxy } from '@lukeocodes/composite-voice/proxy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3081);

const app = express();

// ── Proxy middleware ─────────────────────────────────────────────────────────
//
// The ElevenLabs API key is read from an environment variable here — server-side
// only.  The browser never sees it.  The ElevenLabsSTT provider uses `proxyUrl`
// instead of `apiKey`, and the proxy injects the `xi-api-key` header on each
// WebSocket upgrade request.

const proxy = createExpressProxy({
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,
  pathPrefix: '/proxy',
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

// Attach WebSocket proxying (ElevenLabs STT) to the raw HTTP server.
// This must be called AFTER createServer but BEFORE server.listen().
proxy.attachWebSocket(server);

server.listen(PORT, () => {
  console.log(`ElevenLabs STT proxy server running at http://localhost:${PORT}`);
  console.log(`  ElevenLabs proxy: ws://localhost:${PORT}/proxy/elevenlabs`);
});
