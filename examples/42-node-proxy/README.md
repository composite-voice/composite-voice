# Example 42 — Node Proxy

Plain Node.js HTTP server with `createNodeProxy` -- the most flexible proxy adapter. No framework required. Demonstrates `handleRequest` for HTTP forwarding and `attachWebSocket` for full WebSocket provider support.

| Component | Details |
|-----------|---------|
| **Server** | `http.createServer` + `createNodeProxy` |
| **Client port** | 3043 (Vite) |
| **Server port** | 3044 (Node.js) |
| **WebSocket** | Full support via `attachWebSocket` |
| **Security** | Rate limit, max body, max WS message, auth, CORS |

---

## What you'll learn

- How to use `createNodeProxy` with a plain `http.createServer`
- How `handleRequest` forwards HTTP requests (REST/SSE providers)
- How `attachWebSocket` handles WebSocket upgrades for streaming providers
- How the Node adapter supports all providers including Deepgram, ElevenLabs, and Cartesia
- How to serve static files alongside the proxy (production deployment)

---

## `createNodeProxy` API

```typescript
const proxy = createNodeProxy(config);

// HTTP request handler — pass to http.createServer or use in any framework
proxy.handleRequest(req, res);

// WebSocket upgrade — attach to the HTTP server instance
proxy.attachWebSocket(server);
```

---

## Supported providers

| Provider | Protocol | Route |
|----------|----------|-------|
| Deepgram | WebSocket | `/proxy/deepgram` |
| Anthropic | HTTP | `/proxy/anthropic` |
| OpenAI | HTTP | `/proxy/openai` |
| ElevenLabs | WebSocket | `/proxy/elevenlabs` |
| Cartesia | WebSocket | `/proxy/cartesia` |

Only providers with configured API keys have routes registered.

---

## Prerequisites

- **Node.js** 18+ and **pnpm**
- **Chrome or Edge**
- An [Anthropic API key](https://console.anthropic.com/)
- Optionally: keys for Deepgram, OpenAI, ElevenLabs, Cartesia

---

## Setup

```bash
pnpm install && pnpm build
cp examples/42-node-proxy/sample.env examples/42-node-proxy/.env
```

Fill in your keys in `.env`.

---

## Run

```bash
pnpm example:42-node-proxy:dev
```

This starts both the Node.js proxy (port 3044) and the Vite dev server (port 3043) using `concurrently`. Open [http://localhost:3043](http://localhost:3043).

---

## Production deployment

```bash
# Build the frontend
pnpm example:42-node-proxy:build

# Start the Node.js server (serves proxy + static files)
cd examples/42-node-proxy
npx tsx server.ts
```

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [40 — Express Proxy](../40-express-proxy/) | Express proxy with middleware pattern |
| [41 — Next.js Proxy](../41-nextjs-proxy/) | Next.js App Router proxy |
