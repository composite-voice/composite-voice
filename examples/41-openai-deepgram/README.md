# Example 41 — OpenAI + Deepgram

Full production stack combining OpenAI's LLM with Deepgram's STT and TTS. Proves the SDK's mix-and-match provider architecture.

| | Provider | Transport | Browser support |
|-|----------|-----------|-----------------|
| **STT** | `DeepgramSTT` — nova-3 | WebSocket | All modern browsers |
| **LLM** | `OpenAILLM` — gpt-4o-mini | HTTP streaming | All |
| **TTS** | `DeepgramTTS` — aura-2-thalia-en | WebSocket, 24 kHz | All modern browsers |

---

## What you'll learn

- How to mix providers from different vendors in a single pipeline
- That the SDK abstracts provider differences behind a common interface
- How OpenAI streaming works with Deepgram WebSocket providers
- The production-ready combination of best-in-class providers

---

## Prerequisites

- **Node.js** 18 or later and **pnpm**
- An [OpenAI API key](https://platform.openai.com/)
- A [Deepgram API key](https://console.deepgram.com/)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/41-openai-deepgram/sample.env examples/41-openai-deepgram/.env
```

---

## Run

```bash
pnpm example:41-openai-deepgram:dev
```

Open [http://localhost:3041](http://localhost:3041).

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [40 — OpenAI Pipeline](../40-openai-pipeline/) | OpenAI with native STT/TTS |
| [20 — Deepgram Pipeline](../20-deepgram-pipeline/) | Deepgram with Anthropic LLM |
| [24 — Deepgram Conversation History](../24-deepgram-conversation-history/) | Add multi-turn memory |
