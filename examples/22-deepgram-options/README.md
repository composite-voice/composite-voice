# Example 22 — Deepgram Options

Interactive configuration panel for tuning Deepgram STT settings. Change model, language, endpointing, and more — then hear the difference in real time.

| | Provider | Transport | Browser support |
|-|----------|-----------|-----------------|
| **STT** | `DeepgramSTT` — configurable | WebSocket, real-time | All modern browsers |
| **LLM** | `AnthropicLLM` — claude-haiku-4-6 | HTTP streaming | All |
| **TTS** | `DeepgramTTS` — aura-2-thalia-en | WebSocket, 24 kHz | All modern browsers |

---

## What you'll learn

- How different Deepgram models affect accuracy and latency
- How `endpointing` controls when speech_final fires (responsiveness vs. accuracy)
- How `smartFormat` and `punctuation` affect transcript quality
- How to reinitialize the agent with new configuration at runtime

---

## Prerequisites

- **Node.js** 18 or later and **pnpm**
- A [Deepgram API key](https://console.deepgram.com/)
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/22-deepgram-options/sample.env examples/22-deepgram-options/.env
```

---

## Run

```bash
pnpm example:22-deepgram-options:dev
```

Open [http://localhost:3022](http://localhost:3022).

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [23 — Deepgram Voices](../23-deepgram-voices/) | TTS voice gallery |
| [24 — Deepgram Conversation History](../24-deepgram-conversation-history/) | Multi-turn with Deepgram |
| [21 — Eager Pipeline](../21-eager-pipeline/) | Speculative LLM |
