/**
 * Example 42: Plain Node.js HTTP server with createNodeProxy.
 *
 * Demonstrates the most flexible proxy adapter — works with any Node.js
 * framework or no framework at all. Shows:
 *   - handleRequest: HTTP request forwarding for REST/SSE providers
 *   - attachWebSocket: WebSocket upgrade for streaming providers
 *   - Security: rate limiting, authentication, max body/WS message size
 *   - Static file serving for production
 *
 * Run with:
 *   PORT=3044 node --env-file=.env --import tsx/esm server.ts
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createNodeProxy } from '@lukeocodes/composite-voice/proxy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3044);

// ── Create the proxy ─────────────────────────────────────────────────────────
//
// createNodeProxy returns two things:
//   - handleRequest: a standard (req, res) handler for HTTP forwarding
//   - attachWebSocket: attaches to the server's 'upgrade' event for WS

const proxy = createNodeProxy({
  // Provider API keys — server-side only
  speechmaticsApiKey: process.env.SPEECHMATICS_API_KEY,
  speechifyApiKey: process.env.SPEECHIFY_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,
  cartesiaApiKey: process.env.CARTESIA_API_KEY,

  pathPrefix: '/proxy',

  cors: {
    origins: ['http://localhost:3043', 'http://localhost:3044'],
  },

  security: {
    rateLimit: {
      maxRequests: 100,
      windowMs: 60_000,
    },
    maxBodySize: 1_048_576,
    maxWsMessageSize: 524_288,
    authenticate: (req) => {
      // Accept all requests for this demo.
      // In production, validate JWT, session cookie, or bearer token here.
      return true;
    },
  },
});

// ── MIME types for static serving ────────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ── HTTP server ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = req.url ?? '/';

  // Let the proxy handle /proxy/* routes
  if (url.startsWith('/proxy')) {
    await proxy.handleRequest(req, res);
    return;
  }

  // Health check
  if (url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  // Static file serving (production — serve built Vite output)
  const distPath = path.join(__dirname, 'dist');
  let filePath = path.join(distPath, url === '/' ? 'index.html' : url);

  // Security: prevent directory traversal
  if (!filePath.startsWith(distPath)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);

    res.writeHead(200, { 'content-type': contentType });
    res.end(content);
  } catch {
    // SPA fallback — serve index.html for client-side routing
    try {
      const index = fs.readFileSync(path.join(distPath, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(index);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  }
});

// ── WebSocket upgrade attachment ─────────────────────────────────────────────
//
// This enables full WebSocket proxying for all streaming providers:
//   - Speechmatics (STT)
//   - ElevenLabs (STT + TTS)
//   - AssemblyAI (STT)
//   - Cartesia (TTS)

proxy.attachWebSocket(server);

// ── Start ────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`\nCompositeVoice Node.js proxy running at http://localhost:${PORT}`);
  console.log(`\nRegistered proxy routes:`);

  const providers = [
    { key: 'SPEECHMATICS_API_KEY', name: 'Speechmatics', protocol: 'ws' },
    { key: 'SPEECHIFY_API_KEY', name: 'Speechify', protocol: 'http' },
    { key: 'ANTHROPIC_API_KEY', name: 'Anthropic', protocol: 'http' },
    { key: 'OPENAI_API_KEY', name: 'OpenAI', protocol: 'http' },
    { key: 'ELEVENLABS_API_KEY', name: 'ElevenLabs', protocol: 'ws' },
    { key: 'CARTESIA_API_KEY', name: 'Cartesia', protocol: 'ws' },
  ];

  for (const p of providers) {
    if (process.env[p.key]) {
      const prefix = p.protocol === 'ws' ? 'ws' : 'http';
      console.log(`  ${p.name.padEnd(12)} ${prefix}://localhost:${PORT}/proxy/${p.name.toLowerCase()}`);
    }
  }

  console.log(`\nSecurity: rate limit (100/min), maxBody (1MB), maxWS (512KB), auth (accept all)\n`);
});
