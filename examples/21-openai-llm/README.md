# Example 21 — OpenAI LLM

Focused demonstration of the OpenAILLM provider with NativeSTT and NativeTTS. Configure model selection, temperature, max tokens, and system prompt.

| Role | Provider | What it uses | Browser support |
|------|----------|--------------|-----------------|
| **Input + STT** | `NativeSTT` | Web Speech API | Chrome, Edge |
| **LLM** | `OpenAILLM` | GPT models via proxy | All |
| **TTS + Output** | `NativeTTS` | SpeechSynthesis API | All modern browsers |

---

## What you'll learn

- How to configure OpenAILLM with model, temperature, maxTokens, and systemPrompt
- Differences between GPT-4o Mini, GPT-4o, GPT-4 Turbo, and GPT-3.5 Turbo
- How the Vite proxy secures your OpenAI API key

---

## Prerequisites

- **Node.js** 18 or later and **pnpm**
- **Chrome or Edge**
- An [OpenAI API key](https://platform.openai.com/api-keys)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/21-openai-llm/sample.env .env
# Edit .env and add your OPENAI_API_KEY
```

---

## Run

```bash
pnpm --filter composite-voice-example-21-openai-llm dev
```

Open [http://localhost:3021](http://localhost:3021) in Chrome or Edge.

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [20 — Anthropic LLM](../20-anthropic-llm/) | Compare with Claude models |
| [22 — Groq LLM](../22-groq-llm/) | Ultra-fast inference with Groq |
| [26 — OpenAI-Compatible](../26-openai-compatible/) | Use any OpenAI-compatible endpoint |
