# Example 40 — Express Proxy

Production-ready Express proxy with the full security configuration: rate limiting, max body size, WebSocket message limits, custom authentication, and CORS. Shows every option available in `CompositeVoiceProxyConfig.security`.

| Component | Details |
|-----------|---------|
| **Server** | Express + `createExpressProxy` |
| **Client port** | 3040 (Vite) |
| **Server port** | 3041 (Express) |
| **Security** | Rate limit, max body, max WS message, auth, CORS |

---

## What you'll learn

- How to use `createExpressProxy` with the full `security` configuration
- How `rateLimit` restricts requests per IP per time window (429 on excess)
- How `maxBodySize` rejects oversized HTTP payloads (413 Payload Too Large)
- How `maxWsMessageSize` closes WebSocket connections on oversized messages (code 1009)
- How `authenticate` enables custom auth (bearer token, JWT, session, etc.)
- How `cors.origins` controls cross-origin access

---

## Security options demonstrated

| Option | Value | Effect |
|--------|-------|--------|
| `rateLimit.maxRequests` | 100 | Max 100 requests per window per IP |
| `rateLimit.windowMs` | 60000 | 1-minute sliding window |
| `maxBodySize` | 1048576 | Reject HTTP bodies over 1 MB |
| `maxWsMessageSize` | 524288 | Close WS on messages over 512 KB |
| `authenticate` | Custom function | Bearer token validation (example) |
| `cors.origins` | `['http://localhost:3040']` | Allow Vite dev server origin |

---

## Prerequisites

- **Node.js** 18+ and **pnpm**
- **Chrome or Edge**
- An [Anthropic API key](https://console.anthropic.com/)
- Optionally: [Deepgram](https://console.deepgram.com/) and [OpenAI](https://platform.openai.com/) keys

---

## Setup

```bash
pnpm install && pnpm build
cp examples/40-express-proxy/sample.env examples/40-express-proxy/.env
```

Fill in your keys in `.env`.

---

## Run

```bash
pnpm example:40-express-proxy:dev
```

This starts both the Express proxy (port 3041) and the Vite dev server (port 3040) using `concurrently`. Open [http://localhost:3040](http://localhost:3040).

---

## Production deployment

```bash
# Build the frontend
pnpm example:40-express-proxy:build

# Start the Express server (serves both API proxy and static files)
cd examples/40-express-proxy
npx tsx server.ts
```

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [41 — Next.js Proxy](../41-nextjs-proxy/) | Next.js App Router proxy |
| [42 — Node Proxy](../42-node-proxy/) | Plain Node.js HTTP server proxy |
