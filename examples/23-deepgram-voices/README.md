# Example 23 — Deepgram Voices

Voice gallery for Deepgram Aura 2 — preview and select from available TTS voices. Essential for choosing the right brand voice.

| | Provider | Transport | Browser support |
|-|----------|-----------|-----------------|
| **STT** | `DeepgramSTT` — nova-3 | WebSocket | All modern browsers |
| **LLM** | `AnthropicLLM` — claude-haiku-4-5 | HTTP streaming | All |
| **TTS** | `DeepgramTTS` — selectable Aura 2 voice | WebSocket, 24 kHz | All modern browsers |

---

## What you'll learn

- The range of Deepgram Aura 2 voices available
- How to switch TTS voices at runtime
- How voice selection affects user experience and brand perception
- How to reinitialize the agent with a new TTS configuration

---

## Prerequisites

- **Node.js** 18 or later and **pnpm**
- A [Deepgram API key](https://console.deepgram.com/)
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/23-deepgram-voices/sample.env examples/23-deepgram-voices/.env
```

---

## Run

```bash
pnpm example:23-deepgram-voices:dev
```

Open [http://localhost:3023](http://localhost:3023).

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [22 — Deepgram Options](../22-deepgram-options/) | STT tuning |
| [24 — Deepgram Conversation History](../24-deepgram-conversation-history/) | Complete production agent |
| [02 — System Persona](../02-system-persona/) | Pair voice with personality |
