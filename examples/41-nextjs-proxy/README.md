# Example 41 — Next.js Proxy

Next.js App Router proxy using `createNextJsProxy` with security configuration. Demonstrates how to set up a catch-all API route that forwards HTTP requests to provider APIs with credentials injected server-side.

| Component | Details |
|-----------|---------|
| **Framework** | Next.js 15 App Router |
| **Port** | 3042 |
| **Proxy route** | `app/api/proxy/[...path]/route.ts` |
| **Security** | Rate limit (60/min), max body (512 KB) |

---

## What you'll learn

- How to use `createNextJsProxy` in a Next.js App Router catch-all route
- How the proxy adapter exports standard HTTP method handlers (GET, POST, PUT, DELETE, OPTIONS)
- How security configuration (rate limiting, max body size) works with Next.js
- The limitation: WebSocket proxying requires a custom server (not supported on Vercel)

---

## Project structure

```
41-nextjs-proxy/
  app/
    api/proxy/[...path]/route.ts  <-- Proxy catch-all route
    layout.tsx                     <-- Root layout
    page.tsx                       <-- Client component with voice agent
  next.config.js
  tsconfig.json
  package.json
  sample.env
```

---

## Prerequisites

- **Node.js** 18+ and **pnpm**
- **Chrome or Edge**
- An [Anthropic API key](https://console.anthropic.com/)
- Optionally: an [OpenAI API key](https://platform.openai.com/)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/41-nextjs-proxy/sample.env examples/41-nextjs-proxy/.env
```

Fill in your keys in `.env`.

---

## Run

```bash
pnpm example:41-nextjs-proxy:dev
```

Open [http://localhost:3042](http://localhost:3042) in Chrome or Edge.

---

## WebSocket limitation

Next.js API routes run as serverless functions on platforms like Vercel. Serverless functions do not support WebSocket upgrades. This means:

- HTTP proxying (Anthropic, OpenAI, Groq, Mistral, Gemini) works on all platforms
- REST providers (Anthropic, OpenAI, Speechify) proxy fine on the standard runtime
- WebSocket proxying (Speechmatics, Deepgram, ElevenLabs, AssemblyAI, Cartesia) requires a custom Next.js server or a separate WebSocket server

For WebSocket support, see [Example 40 (Express Proxy)](../40-express-proxy/) or [Example 42 (Node Proxy)](../42-node-proxy/).

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [40 — Express Proxy](../40-express-proxy/) | Express proxy with WebSocket + full security |
| [42 — Node Proxy](../42-node-proxy/) | Plain Node.js proxy with WebSocket |
