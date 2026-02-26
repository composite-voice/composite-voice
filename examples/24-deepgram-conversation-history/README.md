# Example 24 — Deepgram Conversation History

The "complete production agent" — Deepgram's high-quality STT and TTS combined with multi-turn conversation history. This is the stack most production voice agents should start with.

| | Provider | Transport | Browser support |
|-|----------|-----------|-----------------|
| **STT** | `DeepgramSTT` — nova-3 | WebSocket, real-time | All modern browsers |
| **LLM** | `AnthropicLLM` with `conversationHistory` | HTTP streaming | All |
| **TTS** | `DeepgramTTS` — aura-2-thalia-en | WebSocket, 24 kHz | All modern browsers |

---

## What you'll learn

- How to combine Deepgram providers with conversation history
- Why this combination is the recommended production starting point
- How multi-turn context works with high-quality STT (better transcription → better context)
- How to build a chat-style UI with streaming responses

---

## Prerequisites

- **Node.js** 18 or later and **pnpm**
- A [Deepgram API key](https://console.deepgram.com/) — free tier available
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/24-deepgram-conversation-history/sample.env examples/24-deepgram-conversation-history/.env
```

---

## Run

```bash
pnpm example:24-deepgram-conversation-history:dev
```

Open [http://localhost:3024](http://localhost:3024).

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [21 — Eager Pipeline](../21-eager-pipeline/) | Lower latency with DeepgramFlux + speculative LLM |
| [10 — Proxy Server](../10-proxy-server/) | Production deployment |
| [22 — Deepgram Options](../22-deepgram-options/) | STT tuning panel |
