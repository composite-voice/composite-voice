# Example 22 — Deepgram Options

Interactive configuration panel for tuning `DeepgramSTT` (V1/Nova) settings. Change model, language, endpointing, and more — then hear the difference in real time.

| | Provider | Transport |
|-|----------|-----------|
| **STT** | `DeepgramSTT` — configurable V1 models | WebSocket |
| **LLM** | `AnthropicLLM` — claude-haiku-4-5 | HTTP streaming |
| **TTS** | `DeepgramTTS` — aura-2-thalia-en | WebSocket |

> This example tunes `DeepgramSTT` (V1/Nova) options. For the V2 eager pipeline with preflight signals, see [Example 21 — Eager Pipeline](../21-eager-pipeline/) which uses `DeepgramFlux`.

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
| [21 — Eager Pipeline](../21-eager-pipeline/) | Speculative LLM with DeepgramFlux |
