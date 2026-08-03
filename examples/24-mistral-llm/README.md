# Example 24 — Mistral LLM

Focused demonstration of the MistralLLM provider with NativeSTT and NativeTTS. Mistral models are known for strong multilingual support and efficient performance.

| Role | Provider | What it uses | Browser support |
|------|----------|--------------|-----------------|
| **Input + STT** | `NativeSTT` | Web Speech API | Chrome, Edge |
| **LLM** | `MistralLLM` | Mistral models via proxy | All |
| **TTS + Output** | `NativeTTS` | SpeechSynthesis API | All modern browsers |

---

## What you'll learn

- How to configure MistralLLM with model and temperature
- Differences between Mistral Small, Medium, Large, and Mixtral 8x22B
- Mistral's strong multilingual capabilities for voice agents

---

## Prerequisites

- **Node.js** 18 or later and **pnpm**
- **Chrome or Edge**
- A [Mistral API key](https://console.mistral.ai/)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/24-mistral-llm/sample.env .env
# Edit .env and add your MISTRAL_API_KEY
```

---

## Run

```bash
pnpm --filter composite-voice-example-24-mistral-llm dev
```

Open [http://localhost:3024](http://localhost:3024) in Chrome or Edge.

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [23 — Gemini LLM](../23-gemini-llm/) | Compare with Google Gemini |
| [22 — Groq LLM](../22-groq-llm/) | Ultra-fast inference with Groq |
| [26 — OpenAI-Compatible](../26-openai-compatible/) | Use any compatible endpoint |
