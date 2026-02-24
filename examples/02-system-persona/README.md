# Example 02 — System Persona

Demonstrates persona selection with pre-built system prompts. Every commercial voice agent needs a brand voice — this example shows how to switch between distinct AI personalities.

| | Provider | What it uses | Browser support |
|-|----------|--------------|-----------------|
| **STT** | `NativeSTT` | Web Speech API | Chrome, Edge |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming | All |
| **TTS** | `NativeTTS` | SpeechSynthesis API | All modern browsers |

---

## What you'll learn

- How `systemPrompt` shapes the AI's personality and response style
- How to create distinct brand voices with different system prompts
- How to reinitialize the agent with new configuration at runtime
- Why system prompts are the most impactful tuning lever for voice agents

---

## Prerequisites

- **Node.js** 18 or later and **pnpm**
- **Chrome or Edge** — required for NativeSTT
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/02-system-persona/sample.env examples/02-system-persona/.env
```

Open `.env` and add your key:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Run

```bash
pnpm example:02-system-persona:dev
```

Open [http://localhost:3002](http://localhost:3002) in Chrome or Edge.

1. Select a persona from the cards
2. Click **Initialize** — the agent starts with that persona's system prompt
3. Click **Start** and speak — notice how the AI's personality changes
4. Select a different persona — the agent reinitializes with the new voice

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [01 — Conversation History](../01-conversation-history/) | Multi-turn memory with persona |
| [20 — Deepgram Pipeline](../20-deepgram-pipeline/) | Higher quality STT/TTS |
| [10 — Proxy Server](../10-proxy-server/) | Production deployment |
