# Example 20 — Anthropic LLM

Focused demonstration of the AnthropicLLM provider with NativeSTT and NativeTTS. Configure model selection (Haiku/Sonnet/Opus), temperature, max tokens, system prompt, and streaming toggle.

| Role | Provider | What it uses | Browser support |
|------|----------|--------------|-----------------|
| **Input + STT** | `NativeSTT` | Web Speech API | Chrome, Edge |
| **LLM** | `AnthropicLLM` | Claude models via proxy | All |
| **TTS + Output** | `NativeTTS` | SpeechSynthesis API | All modern browsers |

---

## What you'll learn

- How to configure AnthropicLLM with model, temperature, maxTokens, and systemPrompt
- The cost/quality/latency tradeoff between Haiku, Sonnet, and Opus
- How to toggle between streaming and non-streaming responses
- How the Vite proxy secures your Anthropic API key

---

## Prerequisites

- **Node.js** 18 or later and **pnpm**
- **Chrome or Edge**
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/20-anthropic-llm/sample.env .env
# Edit .env and add your ANTHROPIC_API_KEY
```

---

## Run

```bash
pnpm --filter composite-voice-example-20-anthropic-llm dev
```

Open [http://localhost:3020](http://localhost:3020) in Chrome or Edge.

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [21 — OpenAI LLM](../21-openai-llm/) | Compare with OpenAI models |
| [22 — Groq LLM](../22-groq-llm/) | Ultra-fast inference with Groq |
| [25 — WebLLM](../25-webllm/) | Run models entirely in the browser |
