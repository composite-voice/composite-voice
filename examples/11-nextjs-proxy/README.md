# Example 11 — Next.js Proxy

Demonstrates the `createNextJsProxy` adapter for deploying CompositeVoice with Next.js App Router. API keys stay server-side — the proxy runs as a Next.js API route.

| | Provider | Via | Browser support |
|-|----------|-----|-----------------|
| **STT** | `NativeSTT` | Browser built-in | Chrome, Edge |
| **LLM** | `AnthropicLLM` | `/api/proxy/anthropic` | All |
| **TTS** | `NativeTTS` | Browser built-in | All modern browsers |

> **Note:** WebSocket proxying (Deepgram) requires a custom Next.js server — the standard Vercel runtime does not support WebSocket upgrades. This example demonstrates HTTP proxying only.

---

## What you'll learn

- How to use `createNextJsProxy` in a Next.js App Router catch-all route
- How the proxy adapter works with Next.js server components and API routes
- The difference between HTTP proxying (works on Vercel) and WebSocket proxying (needs custom server)
- How to use CompositeVoice in a React client component

---

## Prerequisites

- **Node.js** 18 or later and **pnpm**
- **Chrome or Edge**
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/11-nextjs-proxy/sample.env examples/11-nextjs-proxy/.env
```

---

## Run

```bash
pnpm example:11-nextjs-proxy:dev
```

Open [http://localhost:3011](http://localhost:3011) in Chrome or Edge.

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [10 — Express Proxy](../10-proxy-server/) | Express proxy with WebSocket support |
| [20 — Deepgram Pipeline](../20-deepgram-pipeline/) | WebSocket STT/TTS (needs custom Next.js server) |
