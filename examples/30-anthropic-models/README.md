# Example 30 — Anthropic Models

Side-by-side comparison of Claude models — Haiku, Sonnet, and Opus. See how model choice affects response quality, latency, and cost.

| | Provider | What it uses | Browser support |
|-|----------|--------------|-----------------|
| **STT** | `NativeSTT` | Web Speech API | Chrome, Edge |
| **LLM** | `AnthropicLLM` | Selectable Claude model | All |
| **TTS** | `NativeTTS` | SpeechSynthesis API | All modern browsers |

---

## What you'll learn

- The cost/quality/latency tradeoff between Claude models
- How to switch models at runtime
- How model choice affects response time and quality for voice agents
- When to use Haiku (fast, cheap) vs Sonnet (balanced) vs Opus (highest quality)

---

## Prerequisites

- **Node.js** 18 or later and **pnpm**
- **Chrome or Edge**
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/30-anthropic-models/sample.env examples/30-anthropic-models/.env
```

---

## Run

```bash
pnpm example:30-anthropic-models:dev
```

Open [http://localhost:3030](http://localhost:3030) in Chrome or Edge.

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [31 — Streaming Config](../31-anthropic-streaming-config/) | Temperature and token tuning |
| [40 — OpenAI Pipeline](../40-openai-pipeline/) | Compare with OpenAI models |
| [02 — System Persona](../02-system-persona/) | Pair model with persona |
